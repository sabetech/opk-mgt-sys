import { pb } from "@/lib/pocketbase"

export type AdjustmentDirection = "increase" | "decrease"
export type AdjustmentStatus = "pending" | "approved" | "rejected"

export interface AdjustmentRequestItem {
    productId: string
    quantity: number
}

export interface AdjustmentRequestRecord {
    id: string
    date: string
    reference: string
    direction: AdjustmentDirection
    reason: string
    notes: string
    status: AdjustmentStatus
    requested_by: string
    requested_by_id?: string
    reviewed_by?: string
    reviewed_at?: string
    reject_reason?: string
    created?: string
}

export const ADJUSTMENT_REASON_LABELS: Record<string, string> = {
    supplier_discounted: "Supplier Discounted Stock Adjustment",
    stock_correction: "Stock Correction",
    breakages: "Breakages/Hole in cases/defects",
    expired: "Expired Products",
    protocol_request: "Protocol Requests",
}

export const generateAdjustmentId = () => {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `ADJ-${dateStr}-${randomSuffix}`
}

export async function getPendingAdjustmentCount(): Promise<number> {
    const res = await pb.collection('stock_adjustment_requests').getList(1, 1, {
        filter: 'status = "pending"',
        fields: 'id',
        $autoCancel: false,
    })
    return res.totalItems ?? 0
}

interface CreateAdjustmentRequestInput {
    date: string
    direction: AdjustmentDirection
    reason: string
    reference: string
    notes?: string
    items: AdjustmentRequestItem[]
    requestedBy: string
    requestedById?: string
}

export async function createAdjustmentRequest(input: CreateAdjustmentRequestInput) {
    if (input.items.length === 0) throw new Error('Add at least one product')
    if (input.items.some((i) => i.quantity <= 0)) throw new Error('Quantities must be greater than 0')

    const request = await pb.collection('stock_adjustment_requests').create({
        date: input.date,
        reference: input.reference,
        direction: input.direction,
        reason: input.reason,
        notes: input.notes || null,
        status: 'pending',
        requested_by: input.requestedBy,
        requested_by_id: input.requestedById || null,
    })

    try {
        for (const item of input.items) {
            await pb.collection('stock_adjustment_items').create({
                request_id: request.id,
                product_id: item.productId,
                quantity: item.quantity,
            })
        }
    } catch (err) {
        // Best-effort rollback of the header if item creation fails
        try {
            await pb.collection('stock_adjustment_requests').delete(request.id)
        } catch {
            // ignore rollback errors
        }
        throw err
    }

    return request
}

/**
 * Approves a pending request. This is the ONLY place that mutates
 * warehouse_stock / inventory_logs for adjustments.
 */
export async function approveAdjustmentRequest(requestId: string, reviewerName: string) {
    const request = await pb.collection('stock_adjustment_requests').getOne(requestId)

    if (request.status !== 'pending') {
        throw new Error(`Request is already ${request.status}`)
    }

    const direction = request.direction as AdjustmentDirection
    const items = await pb.collection('stock_adjustment_items').getFullList({
        filter: `request_id = "${requestId}"`,
    })

    if (items.length === 0) throw new Error('Request has no line items')

    // Re-validate availability for decreases at approval time
    for (const item of items) {
        const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id?.id
        const stockRecord = await pb
            .collection('warehouse_stock')
            .getFirstListItem(`product_id = "${productId}"`, { fields: 'id, quantity' })
            .catch((err) => {
                if (err?.status === 404) return null
                throw err
            })

        if (direction === 'decrease') {
            const currentQty = stockRecord?.quantity || 0
            if (currentQty < item.quantity) {
                throw new Error(
                    `Insufficient stock for approval. Product stock: ${currentQty}, requested: ${item.quantity}`
                )
            }
        }
    }

    const logType = direction === 'increase' ? 'adjustment_increase' : 'adjustment_decrease'

    for (const item of items) {
        const productId = typeof item.product_id === 'string' ? item.product_id : item.product_id?.id

        await pb.collection('inventory_logs').create({
            product_id: productId,
            type: logType,
            quantity: item.quantity,
            reason: request.reason,
            reference: request.reference || null,
            notes: request.notes || null,
            date: request.date,
            adjusted_by: request.requested_by,
        })

        const stockRecord = await pb
            .collection('warehouse_stock')
            .getFirstListItem(`product_id = "${productId}"`, { fields: 'id, quantity' })
            .catch((err) => {
                if (err?.status === 404) return null
                throw err
            })

        if (stockRecord) {
            const newQty =
                direction === 'increase'
                    ? (stockRecord.quantity || 0) + item.quantity
                    : (stockRecord.quantity || 0) - item.quantity
            await pb.collection('warehouse_stock').update(stockRecord.id, {
                quantity: Math.max(0, newQty),
            })
        } else if (direction === 'increase') {
            await pb.collection('warehouse_stock').create({
                product_id: productId,
                quantity: item.quantity,
            })
        }
    }

    await pb.collection('stock_adjustment_requests').update(requestId, {
        status: 'approved',
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
    })
}

export async function rejectAdjustmentRequest(
    requestId: string,
    reviewerName: string,
    rejectReason?: string
) {
    const request = await pb.collection('stock_adjustment_requests').getOne(requestId)
    if (request.status !== 'pending') {
        throw new Error(`Request is already ${request.status}`)
    }

    await pb.collection('stock_adjustment_requests').update(requestId, {
        status: 'rejected',
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
        reject_reason: rejectReason || null,
    })
}
