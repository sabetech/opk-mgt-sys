import { pb, getFullListInBatches } from "@/lib/pocketbase"

export interface YardStock {
    ground: number
    trade: number
}

export interface YardMove {
    productId: string
    /** Delta for empties physically in the yard (customer returns arrive). */
    groundDelta: number
    /** Delta for empties out with customers (sales go out, returns come back). */
    tradeDelta: number
}

export interface GroundPosition {
    productId: string
    /** Reconstructed on-ground qty at the start of the period. */
    opening: number
    /** Customer returns received during the period (ground inflow). */
    received: number
    /** Reconstructed on-ground qty at the end of the period. */
    closing: number
}

/**
 * Reconstructs on-ground positions for a period from the live tally.
 * Ground moves ONLY on customer returns (+qty each), so:
 *   opening(from) = live − returns on/after from
 *   closing(to)   = live − returns after to
 * (One-off baseline corrections, e.g. the backfill, predate the movement
 * history and are not backed out — positions before such a correction are
 * approximate.)
 */
export function groundPositions(
    liveGround: Record<string, number>,
    returnsSinceFrom: Record<string, number>,
    returnsAfterTo: Record<string, number>
): GroundPosition[] {
    const ids = new Set([
        ...Object.keys(liveGround),
        ...Object.keys(returnsSinceFrom),
        ...Object.keys(returnsAfterTo),
    ])
    return [...ids].map((productId) => {
        const live = liveGround[productId] || 0
        const received = returnsSinceFrom[productId] || 0
        const afterTo = returnsAfterTo[productId] || 0
        return {
            productId,
            opening: live - received,
            received: received - afterTo,
            closing: live - afterTo,
        }
    })
}

/**
 * Pure yard-stock math. Plain addition on both legs — deliberately NO
 * clamping: quantity_in_trade is the sum of empties with customers, so a
 * negative is a real reconciliation signal (unrecorded inflow), not a value
 * to hide. Ground and full-goods stock (warehouse_stock) never interact.
 */
export function applyYardMove(current: YardStock, move: { groundDelta: number; tradeDelta: number }): YardStock {
    return {
        ground: (current.ground || 0) + (move.groundDelta || 0),
        trade: (current.trade || 0) + (move.tradeDelta || 0),
    }
}

/**
 * Applies yard moves to the `empties` tally collection. One bulk read of
 * the affected rows, then a single parallel update wave ($autoCancel:false
 * so the SDK doesn't abort same-collection writes as duplicates). Missing
 * rows are created — a missing row means a zero baseline, so only the
 * ground leg floors at creation while trade keeps its computed (possibly
 * negative) value.
 *
 * Best-effort by design: callers record the empties_log ledger first and
 * must not roll it back on a tally failure — they surface a warning and
 * reconcile manually.
 */
export async function moveYardStock(moves: YardMove[]): Promise<void> {
    const clean = moves.filter((m) => m.productId && (m.groundDelta !== 0 || m.tradeDelta !== 0))
    if (clean.length === 0) return

    const productIds = [...new Set(clean.map((m) => m.productId))]
    const rows = await getFullListInBatches('empties', 'product_id', productIds, {
        fields: 'id, product_id, quantity_on_ground, quantity_in_trade',
    })
    const byProduct = new Map<string, { id: string; quantity_on_ground: number; quantity_in_trade: number }>()
    for (const row of rows) {
        if (row.product_id && !byProduct.has(row.product_id)) {
            byProduct.set(row.product_id, {
                id: row.id,
                quantity_on_ground: row.quantity_on_ground || 0,
                quantity_in_trade: row.quantity_in_trade || 0,
            })
        }
    }

    await Promise.all(
        clean.map(async (move) => {
            const existing = byProduct.get(move.productId)
            if (existing) {
                const next = applyYardMove(
                    { ground: existing.quantity_on_ground, trade: existing.quantity_in_trade },
                    move
                )
                await pb.collection('empties').update(existing.id, {
                    quantity_on_ground: next.ground,
                    quantity_in_trade: next.trade,
                }, { $autoCancel: false })
            } else {
                await pb.collection('empties').create({
                    product_id: move.productId,
                    quantity_on_ground: Math.max(0, move.groundDelta),
                    quantity_in_trade: move.tradeDelta,
                }, { $autoCancel: false })
            }
        })
    )
}
