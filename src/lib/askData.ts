// Local sales summarizer + canned Q&A for the Ask panel.
// Pure functions over already-fetched report rows: answers common questions
// instantly with zero LLM cost. Open-ended questions fall through (null) and
// the caller routes them to the OpenRouter proxy via aiClient.

export interface SummaryRow {
    order_id: string;
    customer_name: string;
    customer_type: string;
    product_name: string;
    quantity: number;
    returned_qty: number;
    sub_total: number;
    refund_amount: number;
    payment_type: string;
}

export interface RankedEntry {
    name: string;
    total: number;
    qty: number;
}

export interface SalesSummary {
    rangeLabel: string;
    rowCount: number;
    totalSales: number;
    totalOrders: number;
    avgOrderValue: number;
    itemsSold: number;
    totalRefunds: number;
    topCustomers: RankedEntry[];
    topProducts: RankedEntry[];
    byCustomerType: { type: string; total: number; orders: number }[];
}

const money = (n: number) => `GHc ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildSalesSummary(rows: SummaryRow[], rangeLabel: string, topN = 5): SalesSummary {
    const byCustomer = new Map<string, RankedEntry>();
    const byProduct = new Map<string, RankedEntry>();
    const byType = new Map<string, { total: number; orders: Set<string> }>();
    let totalSales = 0;
    let itemsSold = 0;
    let totalRefunds = 0;
    const orders = new Set<string>();

    for (const r of rows) {
        orders.add(r.order_id);
        totalSales += r.sub_total;
        itemsSold += Math.max(0, r.quantity - r.returned_qty);
        totalRefunds += r.refund_amount || 0;

        const c = byCustomer.get(r.customer_name) ?? { name: r.customer_name, total: 0, qty: 0 };
        c.total += r.sub_total;
        c.qty += Math.max(0, r.quantity - r.returned_qty);
        byCustomer.set(r.customer_name, c);

        const p = byProduct.get(r.product_name) ?? { name: r.product_name, total: 0, qty: 0 };
        p.total += r.sub_total;
        p.qty += Math.max(0, r.quantity - r.returned_qty);
        byProduct.set(r.product_name, p);

        const t = byType.get(r.customer_type) ?? { total: 0, orders: new Set<string>() };
        t.total += r.sub_total;
        t.orders.add(r.order_id);
        byType.set(r.customer_type, t);
    }

    const rank = (m: Map<string, RankedEntry>) =>
        [...m.values()].sort((a, b) => b.total - a.total).slice(0, topN);

    return {
        rangeLabel,
        rowCount: rows.length,
        totalSales,
        totalOrders: orders.size,
        avgOrderValue: orders.size > 0 ? totalSales / orders.size : 0,
        itemsSold,
        totalRefunds,
        topCustomers: rank(byCustomer),
        topProducts: rank(byProduct),
        byCustomerType: [...byType.entries()].map(([type, v]) => ({ type, total: v.total, orders: v.orders.size })),
    };
}

/**
 * Answer common questions deterministically. Returns null when the question
 * doesn't match a known intent — the caller should then try the LLM proxy.
 */
export function answerLocally(question: string, summary: SalesSummary): string | null {
    const q = question.toLowerCase();
    if (summary.rowCount === 0) {
        return `No sales in ${summary.rangeLabel} for the current filters, so there's nothing to summarize. Widen the date range or clear filters.`;
    }

    const topLine = (entries: RankedEntry[]) =>
        entries.map((e, i) => `${i + 1}. ${e.name} — ${money(e.total)} (${e.qty.toLocaleString()} units)`).join("\n");

    if (/top customer|best customer|biggest customer|largest customer/.test(q)) {
        return `Top customers for ${summary.rangeLabel}:\n${topLine(summary.topCustomers)}`;
    }
    if (/top product|best.?sell|best product|most sold|popular product/.test(q)) {
        return `Top products for ${summary.rangeLabel}:\n${topLine(summary.topProducts)}`;
    }
    if (/average|avg|mean/.test(q)) {
        return `Average order value for ${summary.rangeLabel} is ${money(summary.avgOrderValue)} across ${summary.totalOrders} order(s).`;
    }
    if (/refund|return/.test(q)) {
        return `Refunds for ${summary.rangeLabel} total ${money(summary.totalRefunds)}.`;
    }
    if (/how many orders|order count|number of orders/.test(q)) {
        return `${summary.totalOrders} order(s) in ${summary.rangeLabel}.`;
    }
    if (/items sold|units sold|quantity sold|how much.*sold/.test(q)) {
        return `${summary.itemsSold.toLocaleString()} units sold in ${summary.rangeLabel}.`;
    }
    if (/total|revenue|sales.*(much|total)|how.*doing/.test(q)) {
        const typeLines = summary.byCustomerType.map((t) => `• ${t.type}: ${money(t.total)} (${t.orders} orders)`).join("\n");
        return `Total sales for ${summary.rangeLabel}: ${money(summary.totalSales)} across ${summary.totalOrders} order(s).\n${typeLines}`;
    }
    return null;
}
