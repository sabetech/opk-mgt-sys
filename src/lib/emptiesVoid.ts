import { pb, getFullListInBatches } from "@/lib/pocketbase"
import { moveYardStock, type YardMove } from "@/lib/emptiesStock"

/**
 * Soft-void for customer empties returns recorded on the Return Empty
 * Crates page (empties_log.activity = customer_empties_return,
 * source = return_page).
 *
 * A voided row stays in empties_log for audit but is excluded from every
 * balance, guard, and report read (they filter on voided_at = ""). At void
 * time the yard tally is inverted (ground −qty, trade +qty); crate deposit
 * refunds already paid out are NOT unwindable, so those returns cannot be
 * voided at all.
 *
 * House convention (emptiesStock.ts): the ledger write is the source of
 * truth; the yard tally is best-effort and never rolls it back.
 */

export type VoidBlockCode =
    | 'WRONG_ACTIVITY'
    | 'NOT_RETURN_PAGE'
    | 'ALREADY_VOIDED'
    | 'REFUND_PAID'
    | 'GROUND_INSUFFICIENT'

export interface VoidableDetail {
    productId: string
    quantity: number
}

export interface VoidCheckInput {
    activity: string
    source?: string | null
    voidedAt?: string | null
    /** Deposit cash-out stamped on the log at refund time (refund_qty). */
    refundQty?: number | null
    /** True when any crate_deposits row has refund_log_id = this log. */
    refundLinked?: boolean
    details: VoidableDetail[]
    /** productId -> current quantity_on_ground on the empties tally. */
    groundByProduct: Record<string, number>
}

export type VoidCheckResult =
    | { ok: true }
    | { ok: false; code: VoidBlockCode; message: string; offendingProducts?: string[] }

export class VoidBlockedError extends Error {
    code: VoidBlockCode
    offendingProducts?: string[]
    constructor(result: Extract<VoidCheckResult, { ok: false }>) {
        super(result.message)
        this.name = 'VoidBlockedError'
        this.code = result.code
        this.offendingProducts = result.offendingProducts
    }
}

/**
 * Pure eligibility check — no I/O. Order matters: attribution first (cheapest
 * to explain), then money, then physical stock.
 */
export function evaluateVoidRequest(input: VoidCheckInput): VoidCheckResult {
    if (input.activity !== 'customer_empties_return') {
        return {
            ok: false,
            code: 'WRONG_ACTIVITY',
            message: 'Only customer empties returns can be voided.',
        }
    }
    if (input.source !== 'return_page') {
        return {
            ok: false,
            code: 'NOT_RETURN_PAGE',
            message: 'This entry was not recorded on the Return Empty Crates page and cannot be voided here.',
        }
    }
    if (input.voidedAt) {
        return {
            ok: false,
            code: 'ALREADY_VOIDED',
            message: 'This return has already been voided.',
        }
    }
    if ((input.refundQty || 0) > 0 || input.refundLinked) {
        return {
            ok: false,
            code: 'REFUND_PAID',
            message: 'A crate deposit refund was paid out on this return — handle the cash first; refunds cannot be reversed by voiding.',
        }
    }
    const offending = input.details
        .filter((d) => (input.groundByProduct[d.productId] || 0) < d.quantity)
        .map((d) => d.productId)
    if (offending.length > 0) {
        return {
            ok: false,
            code: 'GROUND_INSUFFICIENT',
            message: 'Not enough empties on the yard to reverse this return — some crates already left the yard (e.g. shipped to the supplier).',
            offendingProducts: offending,
        }
    }
    return { ok: true }
}

export interface VoidSummary {
    /** Crates removed from the customer's live balance (always negative). */
    balanceDelta: number
    /** Inverse moves applied (or intended) on the yard tally. */
    yardMoves: YardMove[]
    /** False when the ledger was voided but the tally update failed. */
    yardApplied: boolean
}

/**
 * Voids a return: pre-checks eligibility, stamps the void on the ledger,
 * then best-effort inverts the yard tally. Throws VoidBlockedError when a
 * guard fails — nothing is written in that case.
 */
export async function voidEmptiesReturn(
    logId: string,
    opts: { reason: string; userId: string }
): Promise<VoidSummary> {
    const reason = (opts.reason || '').trim()
    if (!reason) {
        throw new Error('A reason is required to void a return.')
    }

    const header = await pb.collection('empties_log').getOne(logId, {
        fields: 'id, activity, source, voided_at, refund_qty, total_quantity',
    })

    const detailRows: { product_id: string; quantity: number }[] = await pb
        .collection('empties_log_detail')
        .getFullList({
            filter: `log_id = "${logId}"`,
            fields: 'product_id, quantity',
        })
    const details: VoidableDetail[] = detailRows.map((d) => ({
        productId: d.product_id,
        quantity: d.quantity || 0,
    }))

    // Refund linkage: refund_qty is stamped on the log at refund time; the
    // refund_log_id back-link catches fully-refunded deposit rows even if
    // the stamp failed. Older DBs may lack the relation — treat as unlinked.
    let refundLinked = false
    try {
        const linked = await pb.collection('crate_deposits').getFullList({
            filter: `refund_log_id = "${logId}"`,
            fields: 'id',
        })
        refundLinked = linked.length > 0
    } catch {
        refundLinked = false
    }

    const productIds = [...new Set(details.map((d) => d.productId).filter(Boolean))]
    const groundRows = await getFullListInBatches('empties', 'product_id', productIds, {
        fields: 'product_id, quantity_on_ground',
    })
    const groundByProduct: Record<string, number> = {}
    for (const row of groundRows) {
        // Duplicate product rows keep the first, matching moveYardStock.
        if (row.product_id && !(row.product_id in groundByProduct)) {
            groundByProduct[row.product_id] = row.quantity_on_ground || 0
        }
    }

    const check = evaluateVoidRequest({
        activity: header.activity,
        source: header.source,
        voidedAt: header.voided_at,
        refundQty: header.refund_qty,
        refundLinked,
        details,
        groundByProduct,
    })
    if (!check.ok) {
        throw new VoidBlockedError(check)
    }

    // 1. Ledger: source of truth — mark voided.
    await pb.collection('empties_log').update(logId, {
        voided_at: new Date().toISOString(),
        void_reason: reason,
        voided_by: opts.userId,
    })

    // 2. Yard tally: inverse of the creation move (ground −, trade +).
    //    Best-effort — a failure warns without un-voiding.
    const yardMoves: YardMove[] = details.map((d) => ({
        productId: d.productId,
        groundDelta: -d.quantity,
        tradeDelta: d.quantity,
    }))
    let yardApplied = true
    try {
        await moveYardStock(yardMoves)
    } catch (yardError) {
        console.error('Failed to update yard stock (return voided):', yardError)
        yardApplied = false
    }

    return {
        balanceDelta: -(header.total_quantity || 0),
        yardMoves,
        yardApplied,
    }
}
