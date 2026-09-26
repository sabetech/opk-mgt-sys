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
    sale_posted: boolean
    empties_posted: boolean
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

    // 3. Own still-pending field sales for this date (posted sold rows live
    // in vse_movements above — only sales whose SALE side is unposted still
    // reserve car stock, hence the sale_posted flag rather than the
    // combined posted_to_summary)
    if (userId) {
        const pendingHeaders = await pb.collection("vse_field_sales").getFullList({
            filter: `created_by = "${userId}" && ${day} && sale_posted = false`,
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

/** VSE edit while not counted: quantities reset the edited dimension only. */
export async function updateFieldSale(
    saleId: string,
    input: { emptiesReceived?: number; items?: FieldSaleItemInput[] }
) {
    const role = pb.authStore.model?.role || ''
    if (role !== 'vse' && role !== 'admin') {
        throw new Error('Only the VSE (or an admin) can edit a field sale')
    }

    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.sale_posted && sale.empties_posted) throw new Error('Counted sales cannot be edited')

    // Items feed both the sold rows and the empties pro-rata split, so they
    // lock once EITHER side has posted.
    if (input.items !== undefined) {
        if (sale.sale_posted || sale.empties_posted) {
            throw new Error('Sale items are locked once either side is counted — ask a manager to reject first')
        }
        if (input.items.length === 0) throw new Error('Add at least one product')
        if (input.items.some((i) => i.quantity <= 0)) throw new Error('Quantities must be greater than 0')

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
        await pb.collection('vse_field_sales').update(saleId, {
            sale_status: 'pending',
            sale_reject_reason: '',
        })
    }

    if (input.emptiesReceived !== undefined) {
        if (sale.empties_posted) throw new Error('Empties are already counted and cannot be edited')
        if (input.emptiesReceived < 0) throw new Error('Empties received cannot be negative')
        await pb.collection('vse_field_sales').update(saleId, {
            empties_received: input.emptiesReceived,
            empties_status: 'pending',
            empties_reject_reason: '',
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
    // Each side posts independently — no waiting on the other dimension.
    return dimension === 'sale' ? tryPostSaleSide(saleId) : tryPostEmptiesSide(saleId)
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

export interface EmptiesShareLine {
    productId: string
    quantity: number
    returnable: boolean
}

/**
 * Distributes a lump empties_received total pro-rata across the returnable
 * lines (largest-remainder rounding). Pure function — shared by posting and
 * by readers that need to reconstruct the per-product split.
 * Returns productId -> empties qty (sums exactly to emptiesTotal when any
 * returnable line exists, else {}).
 */
export function distributeEmptiesProRata(
    emptiesTotal: number,
    lines: EmptiesShareLine[]
): Record<string, number> {
    const result: Record<string, number> = {}
    if (!emptiesTotal || emptiesTotal <= 0) return result
    const returnableLines = lines.filter((l) => l.returnable && (l.quantity || 0) > 0)
    const returnableQty = returnableLines.reduce((sum, l) => sum + (l.quantity || 0), 0)
    if (returnableQty <= 0) return result
    const shares = returnableLines.map((line) => {
        const exact = (emptiesTotal * (line.quantity || 0)) / returnableQty
        return { line, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
    })
    const leftover = emptiesTotal - shares.reduce((sum, s) => sum + s.floor, 0)
    shares.sort((a, b) => b.frac - a.frac)
    for (let idx = 0; idx < shares.length; idx++) {
        const qty = shares[idx].floor + (idx < leftover ? 1 : 0)
        if (qty <= 0) continue
        const pid = shares[idx].line.productId
        result[pid] = (result[pid] || 0) + qty
    }
    return result
}

/**
 * Reconstructs the per-product empties already posted into `vse_movements`
 * for a VSE on one date (posted field sales only — same split the posting
 * path wrote). Lets readers back empties posts out of `returned` tallies.
 */
export async function fetchPostedEmptiesByProduct(
    vseCustomerId: string,
    date: Date | string
): Promise<Record<string, number>> {
    const result: Record<string, number> = {}
    if (!vseCustomerId || !date) return result
    const day = dayFilter("date", date)
    interface PostedSaleHeader {
        id: string
        empties_received?: number | null
    }
    interface PostedSaleItem {
        sale_id?: string | null
        product_id?: string | null
        quantity?: number | null
        expand?: { product_id?: { returnable?: boolean | null } | null } | null
    }
    let headers: PostedSaleHeader[] = []
    try {
        headers = await pb.collection("vse_field_sales").getFullList({
            filter: `${day} && vse_customer_id = "${vseCustomerId}" && empties_posted = true`,
            fields: "id, empties_received",
        })
    } catch {
        return result
    }
    if (headers.length === 0) return result
    const items = await pb.collection("vse_field_sale_items").getFullList({
        filter: headers.map((h) => `sale_id = "${h.id}"`).join(" || "),
        expand: "product_id",
    })
    const itemsBySale: Record<string, PostedSaleItem[]> = {}
    for (const item of items) {
        if (!item.sale_id) continue
        ;(itemsBySale[item.sale_id] = itemsBySale[item.sale_id] || []).push(item)
    }
    for (const header of headers) {
        const lines: EmptiesShareLine[] = (itemsBySale[header.id] || [])
            .filter((item): item is PostedSaleItem & { product_id: string } => !!item.product_id)
            .map((item) => ({
                productId: item.product_id,
                quantity: item.quantity || 0,
                returnable: item.expand?.product_id?.returnable === true,
            }))
        const split = distributeEmptiesProRata(header.empties_received || 0, lines)
        for (const [pid, qty] of Object.entries(split)) {
            result[pid] = (result[pid] || 0) + qty
        }
    }
    return result
}

/**
 * Each approval posts its own side to the Loadout Summary immediately —
 * sale approval never waits on empties and vice versa. Stock is NOT touched
 * (it left the warehouse at loadout) and no customer ledger entries are
 * written — only `vse_movements` tally rows. Exactly-once per side via the
 * sale_posted / empties_posted flags; posted_to_summary flips once both
 * sides are in.
 */
async function markFullyPostedIfDone(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId, {
        fields: 'id, sale_posted, empties_posted, posted_to_summary',
    })
    if (sale.sale_posted && sale.empties_posted && !sale.posted_to_summary) {
        await pb.collection('vse_field_sales').update(saleId, { posted_to_summary: true })
        return true
    }
    return !!sale.posted_to_summary
}

export async function tryPostSaleSide(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.sale_status !== 'approved') return false
    if (sale.sale_posted) return markFullyPostedIfDone(saleId)

    const items = await pb.collection('vse_field_sale_items').getFullList({
        filter: `sale_id = "${saleId}"`,
    })
    if (items.length === 0) throw new Error('Sale has no line items')

    const dateStr = String(sale.date).slice(0, 10)
    const vseId = sale.vse_customer_id

    // Sold rows: exact per-product quantities
    for (const item of items) {
        if (!item.product_id) continue
        await pb.collection('vse_movements').create({
            date: dateStr,
            vse_id: vseId,
            product_id: item.product_id,
            quantity: item.quantity,
            movement_type: 'sold',
        })
    }

    await pb.collection('vse_field_sales').update(saleId, { sale_posted: true })
    await markFullyPostedIfDone(saleId)
    return true
}

export async function tryPostEmptiesSide(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.empties_status !== 'approved') return false
    if (sale.empties_posted) return markFullyPostedIfDone(saleId)

    const items = await pb.collection('vse_field_sale_items').getFullList({
        filter: `sale_id = "${saleId}"`,
        expand: 'product_id',
    })

    const dateStr = String(sale.date).slice(0, 10)
    const vseId = sale.vse_customer_id

    // Returned rows: empties_received is a single number, so distribute it
    // pro-rata across the returnable lines (largest-remainder rounding).
    const split = distributeEmptiesProRata(
        sale.empties_received || 0,
        items
            .filter((item) => item.product_id)
            .map((item) => ({
                productId: item.product_id,
                quantity: item.quantity || 0,
                returnable: item.expand?.product_id?.returnable === true,
            }))
    )
    for (const [productId, qty] of Object.entries(split)) {
        await pb.collection('vse_movements').create({
            date: dateStr,
            vse_id: vseId,
            product_id: productId,
            quantity: qty,
            movement_type: 'returned',
        })
    }

    await pb.collection('vse_field_sales').update(saleId, { empties_posted: true })
    await markFullyPostedIfDone(saleId)
    return true
}

/**
 * Legacy combined entry point (kept for the retry-posting action): posts
 * whichever approved-but-unposted side(s) remain. Returns true once both
 * sides are counted.
 */
export async function tryValidateAndPost(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId, {
        fields: 'id, sale_status, empties_status, sale_posted, empties_posted, posted_to_summary',
    })
    if (sale.sale_status === 'approved' && !sale.sale_posted) {
        await tryPostSaleSide(saleId)
    }
    if (sale.empties_status === 'approved' && !sale.empties_posted) {
        await tryPostEmptiesSide(saleId)
    }
    const done = await pb.collection('vse_field_sales').getOne(saleId, {
        fields: 'id, posted_to_summary',
    })
    return !!done.posted_to_summary
}
