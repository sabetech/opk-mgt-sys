import { pb } from "@/lib/pocketbase"
import { moveYardStock } from "@/lib/emptiesStock"

export interface ReturnLineItem {
    productId: string
    quantity: number
}

export interface HeldDepositRow {
    id: string
    quantity: number
    refunded_qty: number
    amount_per_crate: number
    total_amount: number
    status: string
    created: string
}

export interface SubmitCustomerReturnInput {
    /**
     * Idempotency key: one logical submission = one key, reused across
     * retries of the same attempt so a second call resumes instead of
     * duplicating the ledger.
     */
    clientRef: string
    customerId: string
    /** YYYY-MM-DD */
    date: string
    items: ReturnLineItem[]
    /** Refund target in crates for this attempt (min(returnQty, heldCrates)). */
    refundQty: number
    refundMethod: string
    applyRefund: boolean
}

export interface SubmitCustomerReturnResult {
    logId: string
    /** True when an existing empties_log for this key was reused. */
    resumed: boolean
    /** Crates refunded during THIS run (excludes earlier-attempt progress). */
    refundedCrates: number
    refundedAmount: number
    /** Yard tally failed and needs manual reconciliation. */
    yardFailed: boolean
}

export interface EmptiesReturnLog {
    id: string
    date?: string
    customer_id?: string
    activity?: string
    total_quantity?: number
    client_ref?: string
    source?: string
    refund_qty?: number | null
    refund_amount?: number | null
    yard_applied?: boolean
}

export function generateReturnRef(): string {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `CER-${dateStr}-${randomSuffix}`
}

export async function findReturnByRef(clientRef: string): Promise<EmptiesReturnLog | null> {
    try {
        return await pb.collection("empties_log").getFirstListItem(`client_ref = "${clientRef}"`)
    } catch (err) {
        const status = (err as { status?: number })?.status
        if (status === 404) return null
        if (status === 400) {
            // Unknown filter field = the schema patch has not been applied.
            throw new Error(
                "empties_log is missing the idempotency fields — run `node scripts/setup-pocketbase.js` and reload."
            )
        }
        throw err
    }
}

/**
 * Soft cross-session duplicate check (same customer/date/quantity recorded
 * recently under a different key). Best-effort: any failure returns null
 * and never blocks the submission.
 */
export async function findRecentDuplicateReturn(params: {
    customerId: string
    date: string
    totalQuantity: number
    excludeClientRef: string
    withinMinutes?: number
}): Promise<{ id: string; created: string } | null> {
    const since = new Date(Date.now() - (params.withinMinutes ?? 15) * 60_000)
        .toISOString()
        .replace("T", " ")
    try {
        // Day-scoped filter only: some hosts reject server-side work on the
        // system `created` field, so recency is filtered client-side here.
        // Voided entries stay on the ledger for audit but no longer count
        // as duplicates — re-recording after a void is legitimate.
        const rows: { id: string; created: string; total_quantity: number; client_ref?: string }[] =
            await pb.collection("empties_log").getFullList({
                filter: `activity = "customer_empties_return" && customer_id = "${params.customerId}" && date = "${params.date}" && voided_at = ""`,
                fields: "id, created, total_quantity, client_ref",
            })
        const match = rows.find(
            (r) =>
                r.total_quantity === params.totalQuantity &&
                String(r.created) >= since &&
                r.client_ref !== params.excludeClientRef
        )
        return match ? { id: match.id, created: match.created } : null
    } catch {
        return null
    }
}

/** Current refundable deposit rows, oldest first (FIFO). */
export async function fetchHeldDeposits(customerId: string): Promise<HeldDepositRow[]> {
    const data = await pb.collection("crate_deposits").getFullList({
        filter: `customer_id = "${customerId}" && (status = "held" || status = "partial")`,
        fields: "id, quantity, refunded_qty, amount_per_crate, total_amount, status, created",
    })
    // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
    data.sort((a, b) => String(a.created).localeCompare(String(b.created)))
    return data.map((d) => ({
        id: d.id,
        quantity: d.quantity || 0,
        refunded_qty: d.refunded_qty || 0,
        amount_per_crate: d.amount_per_crate || 0,
        total_amount: d.total_amount || 0,
        status: d.status,
        created: d.created,
    }))
}

/**
 * Idempotent submission of a customer empties return.
 *
 * The header is keyed by `client_ref`: re-submitting the same key resumes
 * the attempt instead of creating a second ledger record. Line items are
 * repaired by delete+recreate (safe because the key binds to an unchanged
 * payload), FIFO refunds persist per-attempt progress on the log so a retry
 * never re-refunds, and the yard tally is skipped once flagged.
 *
 * Failure ordering: deposit rows are fetched before any write, so the only
 * thrown failures happen before money moves; the header is then rolled back
 * best-effort (never when refunds already progressed). Refund-row and yard
 * failures stay non-fatal — the ledger above them is the source of truth.
 */
export async function submitCustomerReturn(
    input: SubmitCustomerReturnInput
): Promise<SubmitCustomerReturnResult> {
    if (!input.clientRef) throw new Error("Missing idempotency key")
    if (!input.customerId || !input.date) {
        throw new Error("Please fill in all required fields (Customer, Date, and at least one item).")
    }
    if (input.items.length === 0) throw new Error("Add at least one product")
    if (input.items.some((i) => !i.productId || i.quantity <= 0)) {
        throw new Error("Quantities must be greater than 0")
    }

    const totalQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0)

    // 1. Fresh deposit rows BEFORE any write: a failure here leaves nothing
    // behind, and retries never refund from stale refunded_qty values.
    const targetRefundQty = input.applyRefund ? Math.max(0, input.refundQty) : 0
    const heldDeposits = targetRefundQty > 0 ? await fetchHeldDeposits(input.customerId) : []

    // 2. Get-or-create the header under the idempotency key.
    const found = await findReturnByRef(input.clientRef)
    let resumed = found !== null
    let log: EmptiesReturnLog
    if (found) {
        log = found
    } else {
        try {
            log = await pb.collection("empties_log").create({
                date: input.date,
                customer_id: input.customerId,
                activity: "customer_empties_return",
                total_quantity: totalQuantity,
                client_ref: input.clientRef,
                // Writer attribution: only return_page entries are voidable
                // (see emptiesVoid.ts).
                source: "return_page",
            })
        } catch (err) {
            // Unique-key race: an earlier attempt with this key won — resume it.
            const existing = await findReturnByRef(input.clientRef)
            if (!existing) throw err
            log = existing
            resumed = true
        }
    }

    // 3. Line items: delete+recreate repairs any partial insert idempotently.
    try {
        const existingDetails = await pb.collection("empties_log_detail").getFullList({
            filter: `log_id = "${log.id}"`,
            fields: "id",
        })
        for (const detail of existingDetails) {
            await pb.collection("empties_log_detail").delete(detail.id)
        }
        for (const item of input.items) {
            await pb.collection("empties_log_detail").create({
                log_id: log.id,
                product_id: item.productId,
                quantity: item.quantity,
            })
        }
        // Resumed attempts may carry a stale total_quantity on the header —
        // balances read that field, so keep it in step with the repaired lines.
        if ((log.total_quantity || 0) !== totalQuantity) {
            log = await pb.collection("empties_log").update(log.id, {
                total_quantity: totalQuantity,
            })
        }
    } catch (err) {
        // Compensating rollback: an orphan header would inflate the customer
        // balance. Never delete once refunds progressed — money moved.
        if ((log.refund_qty ?? 0) <= 0) {
            try {
                await pb.collection("empties_log").delete(log.id)
            } catch {
                // ignore rollback errors — the key still resumes cleanly
            }
        }
        throw err
    }

    // 4. Cash-out refundable crate deposits FIFO. Crates are fungible across
    // SKUs, so the oldest held rows go first at their frozen per-crate
    // amounts. Progress is persisted per attempt so a retry continues where
    // it stopped instead of double-refunding. Row failures stay non-fatal.
    let refundedCrates = 0
    let refundedAmount = 0
    const baseRefundQty = log.refund_qty || 0
    const baseRefundAmount = log.refund_amount || 0
    let remaining = Math.max(0, targetRefundQty - baseRefundQty)
    if (remaining > 0) {
        for (const dep of heldDeposits) {
            if (remaining <= 0) break
            const available = Math.max(0, dep.quantity - dep.refunded_qty)
            if (available <= 0) continue
            const alloc = Math.min(available, remaining)
            const newRefunded = dep.refunded_qty + alloc
            const fullyRefunded = newRefunded >= dep.quantity
            try {
                await pb.collection("crate_deposits").update(dep.id, {
                    refunded_qty: newRefunded,
                    status: fullyRefunded ? "refunded" : "partial",
                    ...(fullyRefunded
                        ? {
                              refunded_at: new Date().toISOString(),
                              refund_log_id: log.id,
                              refund_method: input.refundMethod,
                          }
                        : {}),
                })
            } catch (refundError) {
                console.error("Failed to refund crate deposit row:", refundError)
                break
            }
            refundedCrates += alloc
            refundedAmount += alloc * (dep.amount_per_crate || 0)
            remaining -= alloc
            try {
                log = await pb.collection("empties_log").update(log.id, {
                    refund_qty: baseRefundQty + refundedCrates,
                    refund_amount: baseRefundAmount + refundedAmount,
                })
            } catch (progressError) {
                console.error("Failed to persist refund progress on empties_log:", progressError)
            }
        }
    }

    // 5. Yard stock: physical empties arrived (ground +) and left the trade
    // pool (trade −, unclamped). Skipped when a prior attempt already
    // applied it; a tally failure warns without rolling back the ledger.
    let yardFailed = false
    if (!log.yard_applied) {
        try {
            await moveYardStock(
                input.items.map((item) => ({
                    productId: item.productId,
                    groundDelta: item.quantity,
                    tradeDelta: -item.quantity,
                }))
            )
            try {
                log = await pb.collection("empties_log").update(log.id, { yard_applied: true })
            } catch (flagError) {
                console.error("Failed to flag yard stock applied on empties_log:", flagError)
            }
        } catch (yardError) {
            console.error("Failed to update yard stock (return recorded):", yardError)
            yardFailed = true
        }
    }

    return {
        logId: log.id,
        resumed,
        refundedCrates,
        refundedAmount,
        yardFailed,
    }
}
