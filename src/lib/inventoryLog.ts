import { format } from "date-fns"

export type InventoryMovementType =
    | 'supplier_receipt'
    | 'vse_loadout'
    | 'vse_return'
    | 'retail_sale'
    | 'wholesale_sale'
    | 'breakage'
    | 'promo_out'
    | 'promo_reimbursement'
    | 'opening_stock'
    | 'adjustment_increase'
    | 'adjustment_decrease'
    | 'customer_return'

export interface InventoryLogRow {
    id: string | number
    product_id: string
    type: string
    quantity: number
    description?: string | null
    created?: string
}

export interface InventoryTransaction {
    id: string
    time: string
    description: string
    type: InventoryMovementType
    /** Signed effect on stock (negative = out, positive = in). */
    quantity: number
    /** Intra-day running total after this transaction. */
    balance: number
}

export interface ProductDaySummary {
    totalReceived: number
    vsesSent: number
    /** Signed: sales (−) net of same-type cancel reversals (+). */
    totalSold: number
    /** Positive-qty sale-type logs (cancelled sales) folded into totalSold. */
    reverted: number
    vsesReturned: number
    breakages: number
    promoStock: number
    reimbursement: number
    customerReturns: number
    /** Signed: increases (+) net of decreases (−). */
    adjustmentsNet: number
    /** Signed day net across every log type (bucketed or not). */
    dayNet: number
    transactions: InventoryTransaction[]
}

/**
 * Signed stock effect of one log row. Every writer stores true-signed
 * quantities EXCEPT adjustment_decrease, which stores an unsigned
 * magnitude (see lib/adjustments + AdjustmentsLog's by-type display) —
 * so it is negated here. Unknown/future types pass through signed so the
 * day net stays exact even when no column claims them.
 */
export function signedQuantity(log: Pick<InventoryLogRow, 'type' | 'quantity'>): number {
    const q = log.quantity || 0
    if (q === 0) return 0
    if (log.type === 'adjustment_decrease') return -Math.abs(q)
    return q
}

/** Buckets one product's day logs. Pure — shared by the page and tests. */
export function summarizeProductLogs(logs: InventoryLogRow[]): ProductDaySummary {
    const summary: ProductDaySummary = {
        totalReceived: 0,
        vsesSent: 0,
        totalSold: 0,
        reverted: 0,
        vsesReturned: 0,
        breakages: 0,
        promoStock: 0,
        reimbursement: 0,
        customerReturns: 0,
        adjustmentsNet: 0,
        dayNet: 0,
        transactions: [],
    }
    let running = 0
    for (const log of logs) {
        const qty = signedQuantity(log)
        running += qty
        summary.dayNet += qty

        switch (log.type) {
            case 'supplier_receipt':
                summary.totalReceived += qty
                break
            case 'vse_loadout':
                summary.vsesSent += Math.abs(qty)
                break
            case 'vse_return':
                summary.vsesReturned += qty
                break
            case 'retail_sale':
            case 'wholesale_sale':
                summary.totalSold += qty
                if (qty > 0) summary.reverted += qty
                break
            case 'breakage':
                summary.breakages += Math.abs(qty)
                break
            case 'promo_out':
                summary.promoStock += Math.abs(qty)
                break
            case 'promo_reimbursement':
                summary.reimbursement += qty
                break
            case 'customer_return':
                summary.customerReturns += qty
                break
            case 'adjustment_increase':
                summary.adjustmentsNet += Math.abs(qty)
                break
            case 'adjustment_decrease':
                summary.adjustmentsNet -= Math.abs(qty)
                break
            default:
                break
        }

        summary.transactions.push({
            id: String(log.id),
            time: log.created ? format(new Date(log.created), "hh:mm a") : "",
            description: log.description || String(log.type).replace(/_/g, ' '),
            type: log.type as InventoryMovementType,
            quantity: qty,
            balance: running,
        })
    }
    return summary
}
