import { pb, dayFilter } from "@/lib/pocketbase"

export type FieldSaleStatus = "pending" | "approved" | "rejected"
export type FieldSaleDimension = "sale" | "empties"

export interface FieldSaleItemInput {
    productId: string
    quantity: number
    unitPrice: number
}

export interface FieldSaleRecord {
    id: string
    date: string
    reference: string
    vse_customer_id: string
    created_by: string
    empties_received: number
    sale_status: FieldSaleStatus
    empties_status: FieldSaleStatus
    posted_to_summary: boolean
}

export const generateFieldSaleReference = () => {
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `VF-${dateStr}-${randomSuffix}`
}

export interface VseCarLine {
    productId: string
    name: string
    code: string
    returnable: boolean
    given: number
    sold: number
    returned: number
    pending: number
    remaining: number
}

/**
 * "In the car" stock for a VSE on one date: approved loadouts minus
 * validated sold/returned movements minus the VSE's own still-pending
 * field-sale lines (optionally excluding one sale being edited).
 * Only products with given > 0 are returned.
 */
export async function fetchVseCarStock(
    vseCustomerId: string,
    date: Date | string,
    userId: string,
    excludeSaleId?: string
): Promise<Record<string, VseCarLine>> {
    const result: Record<string, VseCarLine> = {}
    if (!vseCustomerId || !date) return result

    const day = dayFilter("date", date)

    // 1. Approved loadouts for this VSE + date -> given per product
    const loadouts = await pb.collection("loadouts").getFullList({
        filter: `${day} && vse_id = "${vseCustomerId}" && status = "approved"`,
        fields: "id",
    })
    const loadoutIds = loadouts.map((l) => l.id)
    if (loadoutIds.length > 0) {
        const items = await pb.collection("loadout_items").getFullList({
            filter: loadoutIds.map((id) => `loadout_id = "${id}"`).join(" || "),
            expand: "product_id",
        })
        for (const item of items) {
            const rel = item.expand?.product_id
            if (!item.product_id) continue
            const line = result[item.product_id] || {
                productId: item.product_id,
                name: rel?.sku_name || "Unknown",
                code: rel?.product_code || rel?.code_name || "",
                returnable: rel?.returnable === true,
                given: 0,
                sold: 0,
                returned: 0,
                pending: 0,
                remaining: 0,
            }
            line.given += item.quantity || 0
            result[item.product_id] = line
        }
    }
    if (Object.keys(result).length === 0) return result

    // 2. Validated movements (sold + unsold returns) for this VSE + date
    const movements = await pb.collection("vse_movements").getFullList({
        filter: `${day} && vse_id = "${vseCustomerId}"`,
        fields: "product_id, quantity, movement_type",
    })
    for (const m of movements) {
        const line = result[m.product_id]
        if (!line) continue
        if (m.movement_type === "sold") line.sold += m.quantity || 0
        else if (m.movement_type === "returned") line.returned += m.quantity || 0
    }

    // 3. Own still-pending field sales for this date (already validated ones
    // are posted into vse_movements above — exclude them to avoid double count)
    if (userId) {
        const pendingHeaders = await pb.collection("vse_field_sales").getFullList({
            filter: `created_by = "${userId}" && ${day} && posted_to_summary = false`,
            fields: "id",
        })
        const pendingIds = pendingHeaders
            .map((h) => h.id)
            .filter((id) => id !== excludeSaleId)
        if (pendingIds.length > 0) {
            const pendingItems = await pb.collection("vse_field_sale_items").getFullList({
                filter: pendingIds.map((id) => `sale_id = "${id}"`).join(" || "),
                fields: "sale_id, product_id, quantity",
            })
            for (const item of pendingItems) {
                const line = result[item.product_id]
                if (!line) continue
                line.pending += item.quantity || 0
            }
        }
    }

    for (const line of Object.values(result)) {
        line.remaining = line.given - line.sold - line.returned - line.pending
    }
    return result
}

interface CreateFieldSaleInput {
    date: string
    vseCustomerId: string
    createdBy: string
    emptiesReceived: number
    items: FieldSaleItemInput[]
}

export async function createFieldSale(input: CreateFieldSaleInput) {
    const role = pb.authStore.model?.role || ''
    if (role !== 'vse' && role !== 'admin') {
        throw new Error('Only a VSE login can record a field sale')
    }
    if (input.items.length === 0) throw new Error('Add at least one product')
    if (input.items.some((i) => i.quantity <= 0)) throw new Error('Quantities must be greater than 0')
    if (input.emptiesReceived < 0) throw new Error('Empties received cannot be negative')

    const header = await pb.collection('vse_field_sales').create({
        date: input.date,
        vse_customer_id: input.vseCustomerId,
        created_by: input.createdBy,
        reference: generateFieldSaleReference(),
        empties_received: input.emptiesReceived,
        sale_status: 'pending',
        empties_status: 'pending',
        posted_to_summary: false,
    })

    try {
        for (const item of input.items) {
            await pb.collection('vse_field_sale_items').create({
                sale_id: header.id,
                product_id: item.productId,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                sub_total: item.quantity * item.unitPrice,
            })
        }
    } catch (err) {
        // Best-effort rollback of the header if item creation fails
        try {
            await pb.collection('vse_field_sales').delete(header.id)
        } catch {
            // ignore rollback errors
        }
        throw err
    }

    return header
}

/** VSE edit while not validated: new quantities reset both approvals. */
export async function updateFieldSale(
    saleId: string,
    input: { emptiesReceived: number; items: FieldSaleItemInput[] }
) {
    const role = pb.authStore.model?.role || ''
    if (role !== 'vse' && role !== 'admin') {
        throw new Error('Only the VSE (or an admin) can edit a field sale')
    }
    if (input.items.length === 0) throw new Error('Add at least one product')
    if (input.items.some((i) => i.quantity <= 0)) throw new Error('Quantities must be greater than 0')
    if (input.emptiesReceived < 0) throw new Error('Empties received cannot be negative')

    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.posted_to_summary) throw new Error('Validated sales cannot be edited')

    await pb.collection('vse_field_sales').update(saleId, {
        empties_received: input.emptiesReceived,
        sale_status: 'pending',
        empties_status: 'pending',
        sale_reject_reason: '',
        empties_reject_reason: '',
    })

    const existing = await pb.collection('vse_field_sale_items').getFullList({
        filter: `sale_id = "${saleId}"`,
        fields: 'id',
    })
    for (const row of existing) {
        await pb.collection('vse_field_sale_items').delete(row.id)
    }
    for (const item of input.items) {
        await pb.collection('vse_field_sale_items').create({
            sale_id: saleId,
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            sub_total: item.quantity * item.unitPrice,
        })
    }
}

async function setDimensionStatus(
    saleId: string,
    dimension: FieldSaleDimension,
    status: FieldSaleStatus,
    reviewerName: string,
    rejectReason?: string
) {
    const prefix = dimension === 'sale' ? 'sale' : 'empties'
    await pb.collection('vse_field_sales').update(saleId, {
        [`${prefix}_status`]: status,
        [`${prefix}_reviewed_by`]: reviewerName,
        [`${prefix}_reviewed_at`]: new Date().toISOString(),
        [`${prefix}_reject_reason`]: status === 'rejected' ? (rejectReason || '') : '',
    })
}

export async function approveFieldSaleDimension(saleId: string, dimension: FieldSaleDimension, reviewerName: string): Promise<boolean> {
    const role = pb.authStore.model?.role || ''
    const allowed = role === 'admin' || (dimension === 'sale' && role === 'account_manager') || (dimension === 'empties' && role === 'empties_manager')
    if (!allowed) {
        throw new Error(`Only ${dimension === 'sale' ? 'an account manager' : 'an empties manager'} (or admin) can approve this`)
    }
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    const current = (dimension === 'sale' ? sale.sale_status : sale.empties_status) as FieldSaleStatus
    if (current !== 'pending') throw new Error(`Record is already ${current}`)
    await setDimensionStatus(saleId, dimension, 'approved', reviewerName)
    return tryValidateAndPost(saleId)
}

export async function rejectFieldSaleDimension(
    saleId: string,
    dimension: FieldSaleDimension,
    reviewerName: string,
    reason: string
) {
    if (!reason.trim()) throw new Error('A reason is required to reject')
    const role = pb.authStore.model?.role || ''
    const allowed = role === 'admin' || (dimension === 'sale' && role === 'account_manager') || (dimension === 'empties' && role === 'empties_manager')
    if (!allowed) {
        throw new Error(`Only ${dimension === 'sale' ? 'an account manager' : 'an empties manager'} (or admin) can reject this`)
    }
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    const current = (dimension === 'sale' ? sale.sale_status : sale.empties_status) as FieldSaleStatus
    if (current !== 'pending') throw new Error(`Record is already ${current}`)
    await setDimensionStatus(saleId, dimension, 'rejected', reviewerName, reason.trim())
}

/**
 * Validates a fully-approved sale by posting it to the Loadout Summary.
 * Stock is NOT touched (it left the warehouse at loadout) and no customer
 * ledger entries are written — only `vse_movements` tally rows.
 * Exactly-once via the posted_to_summary flag.
 */
export async function tryValidateAndPost(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.sale_status !== 'approved' || sale.empties_status !== 'approved') return false
    if (sale.posted_to_summary) return true

    const items = await pb.collection('vse_field_sale_items').getFullList({
        filter: `sale_id = "${saleId}"`,
        expand: 'product_id',
    })
    if (items.length === 0) throw new Error('Sale has no line items')

    const dateStr = String(sale.date).slice(0, 10)
    const vseId = sale.vse_customer_id

    // Sold rows: exact per-product quantities
    for (const item of items) {
        await pb.collection('vse_movements').create({
            date: dateStr,
            vse_id: vseId,
            product_id: item.product_id,
            quantity: item.quantity,
            movement_type: 'sold',
        })
    }

    // Returned rows: empties_received is a single number, so distribute it
    // pro-rata across the returnable lines (largest-remainder rounding).
    const emptiesTotal = sale.empties_received || 0
    if (emptiesTotal > 0) {
        const returnableLines = items.filter((item) => item.expand?.product_id?.returnable === true)
        const returnableQty = returnableLines.reduce((sum: number, item) => sum + (item.quantity || 0), 0)
        if (returnableQty > 0) {
            const shares = returnableLines.map((item) => {
                const exact = (emptiesTotal * (item.quantity || 0)) / returnableQty
                return { item, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
            })
            let leftover = emptiesTotal - shares.reduce((sum, s) => sum + s.floor, 0)
            shares.sort((a, b) => b.frac - a.frac)
            for (let idx = 0; idx < shares.length; idx++) {
                const qty = shares[idx].floor + (idx < leftover ? 1 : 0)
                if (qty <= 0) continue
                await pb.collection('vse_movements').create({
                    date: dateStr,
                    vse_id: vseId,
                    product_id: shares[idx].item.product_id,
                    quantity: qty,
                    movement_type: 'returned',
                })
            }
        }
    }

    await pb.collection('vse_field_sales').update(saleId, { posted_to_summary: true })
    return true
}
