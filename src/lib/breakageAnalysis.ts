// Breakage pattern mining: topic classification + Pareto aggregation.
// Pure functions — no PocketBase, no LLM. Keyword map first; the OpenRouter
// proxy can be layered later for free-text topic labeling if needed.

export type BreakageTopic =
    | "transit"
    | "offloading"
    | "stacking"
    | "spillage"
    | "handling"
    | "defect"
    | "other";

export const BREAKAGE_TOPICS: BreakageTopic[] = [
    "transit",
    "offloading",
    "stacking",
    "spillage",
    "handling",
    "defect",
    "other",
];

const KEYWORDS: { topic: Exclude<BreakageTopic, "other">; patterns: RegExp[] }[] = [
    { topic: "transit", patterns: [/transit/i, /truck/i, /transport/i, /delivery/i, /road/i, /vse/i, /en route/i] },
    { topic: "offloading", patterns: [/offload/i, /unload/i, /loading/i, /load(ing)?\s/i] },
    { topic: "stacking", patterns: [/stack/i, /pallet/i, /pile/i, /collapse/i, /fell from/i, /toppl/i] },
    { topic: "spillage", patterns: [/spill/i, /leak/i, /burst/i, /pour/i] },
    { topic: "handling", patterns: [/handling/i, /dropped/i, /mishandl/i, /accident/i, /careless/i, /broke/i, /broken/i] },
    { topic: "defect", patterns: [/defect/i, /faulty/i, /hole/i, /crack/i, /factory/i, /manufactur/i, /expired/i, /spoil/i] },
];

/** Classify a free-text reason into a topic bucket. Empty/unknown -> "other". */
export function classifyBreakageTopic(reason: string | null | undefined): BreakageTopic {
    const text = (reason || "").trim();
    if (!text) return "other";
    for (const { topic, patterns } of KEYWORDS) {
        if (patterns.some((re) => re.test(text))) return topic;
    }
    return "other";
}

export interface BreakageEvent {
    productId?: string;
    productName: string;
    productCode?: string | null;
    quantity: number;
    reason: string;
    date: string;
}

export interface RankedItem {
    key: string;
    label: string;
    sub?: string;
    quantity: number;
    share: number;
}

/** Generic Pareto ranking over breakage events. */
export function pareto(
    events: BreakageEvent[],
    bucket: (e: BreakageEvent) => { key: string; label: string; sub?: string },
    topN = 5,
): RankedItem[] {
    const totals = new Map<string, { label: string; sub?: string; quantity: number }>();
    let grand = 0;
    for (const e of events) {
        const { key, label: name, sub } = bucket(e);
        const row = totals.get(key) ?? { label: name, sub, quantity: 0 };
        row.quantity += e.quantity;
        totals.set(key, row);
        grand += e.quantity;
    }
    return [...totals.entries()]
        .map(([key, row]) => ({ key, label: row.label, sub: row.sub, quantity: row.quantity, share: grand > 0 ? row.quantity / grand : 0 }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, topN);
}

export interface BreakageAnalysis {
    totalQty: number;
    eventCount: number;
    byProduct: RankedItem[];
    byTopic: RankedItem[];
    byWeekday: RankedItem[];
    topProductShare: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function analyzeBreakages(events: BreakageEvent[], topN = 5): BreakageAnalysis {
    const totalQty = events.reduce((s, e) => s + e.quantity, 0);
    const byProduct = pareto(
        events,
        (e) => ({ key: e.productName, label: e.productName, sub: e.productCode || undefined }),
        topN,
    );
    const byTopic = pareto(
        events,
        (e) => {
            const t = classifyBreakageTopic(e.reason);
            return { key: t, label: t.charAt(0).toUpperCase() + t.slice(1) };
        },
        BREAKAGE_TOPICS.length,
    );
    const byWeekday = pareto(
        events,
        (e) => {
            const d = new Date(e.date).getDay();
            const name = WEEKDAYS[Number.isNaN(d) ? 0 : d];
            return { key: name, label: name };
        },
        7,
    );
    return {
        totalQty,
        eventCount: events.length,
        byProduct,
        byTopic,
        byWeekday,
        topProductShare: byProduct[0]?.share ?? 0,
    };
}
