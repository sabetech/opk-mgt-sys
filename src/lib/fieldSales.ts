import { pb, dayFilter, getFullListInBatches } from "@/lib/pocketbase"
import { generateOrderNumber } from "@/lib/orderNumber"

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
    order_id?: string | null
}

export interface AggregatedOrderLine {
    productId: string
    quantity: number
    unitPrice: number
    subTotal: number
}

/**
 * Pure aggregation: sums field-sale lines by product. Totals are summed
 * directly (not qty × price) so mixed unit prices stay exact.
 */
export function aggregateFieldSaleItems(
    lines: { productId: string; quantity: number; unitPrice: number; subTotal?: number }[]
): AggregatedOrderLine[] {
    const byProduct = new Map<string, AggregatedOrderLine>()
    for (const line of lines) {
        if (!line.productId || (line.quantity || 0) <= 0) continue
        const sub = line.subTotal ?? (line.quantity || 0) * (line.unitPrice || 0)
        const existing = byProduct.get(line.productId)
        if (existing) {
            existing.quantity += line.quantity || 0
            existing.subTotal += sub
        } else {
            byProduct.set(line.productId, {
                productId: line.productId,
                quantity: line.quantity || 0,
                unitPrice: line.unitPrice || 0,
                subTotal: sub,
            })
        }
    }
    // Keep a representative unit price (last wins is fine — totals rule).
    return [...byProduct.values()]
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

    // Items feed both the aggregated pending order and the empties pro-rata
    // split, so they lock once EITHER side has posted OR the sale side is
    // approved into the pending VSE order (cashier has yet to collect cash).
    if (input.items !== undefined) {
        if (sale.sale_posted || sale.empties_posted || sale.sale_status === 'approved' || (sale as unknown as FieldSaleRecord).order_id) {
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
    // Sale approval feeds the day's aggregated pending VSE order (cashier
    // collects cash); empties approval posts its tally rows immediately.
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
    // A sale rejected after sibling sales were approved must drop out of
    // the day's aggregated pending order so the cashier total stays exact.
    if (dimension === 'sale') {
        try { await removeSaleFromDayOrder(saleId) } catch { /* best effort */ }
    }
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
 * Empties approval posts its side to the Loadout Summary immediately; sale
 * approval feeds the day's aggregated pending VSE order instead (cashier
 * approval writes the sold tallies). Stock is NOT touched (it left the
 * warehouse at loadout) and no customer ledger entries are written — only
 * `vse_movements` tally rows. Exactly-once per side via the sale_posted /
 * empties_posted flags; posted_to_summary flips once both sides are in
 * (sale side counts after cashier approval).
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

interface VseDayOrderLookup {
    orderTypeId: string
    pending: { id: string }[]
    /** Pending orders that have field-sale links (auto-aggregated orders). */
    linkedIds: Set<string>
}

/** Pending `vse` orders for one VSE + day plus which ones carry field sales. */
async function findVseDayOrders(vseId: string, day: string): Promise<VseDayOrderLookup> {
    const orderType = await pb.collection('order_types').getFirstListItem('name = "vse"', { fields: 'id' })
    let pending: { id: string }[] = []
    try {
        pending = await pb.collection('orders').getFullList({
            filter: `customer_id = "${vseId}" && order_type_id = "${orderType.id}" && status = "pending" && ${dayFilter('date_time', day)}`,
            fields: 'id, created',
        })
        // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
        pending.sort((a, b) => String((a as { created?: string }).created || '').localeCompare(String((b as { created?: string }).created || '')))
    } catch {
        pending = []
    }
    const linkedIds = new Set<string>()
    if (pending.length > 0) {
        try {
            const links = await getFullListInBatches(
                'vse_field_sales', 'order_id',
                pending.map((o) => o.id),
                { fields: 'id, order_id' }
            )
            for (const l of links) {
                if (l.order_id) linkedIds.add(String(l.order_id))
            }
        } catch { /* no links resolvable — treat all as manual */ }
    }
    return { orderTypeId: orderType.id, pending, linkedIds }
}

async function createVseDayOrder(vseId: string, day: string, orderTypeId: string, total: number): Promise<string> {
    // NOTE: total_amount is a required number field and PocketBase rejects
    // numeric 0 on required numbers ("Cannot be blank"), so the order must
    // be created with its real total — never 0-then-update.
    if (!(total > 0)) throw new Error('Cannot create a VSE order with a zero total — check product prices')
    const orderNumber = await generateOrderNumber()
    const reviewerId = pb.authStore.model?.id || ''
    const created = await pb.collection('orders').create({
        customer_id: vseId,
        order_number: orderNumber,
        total_amount: total,
        payment_type: 'cash',
        order_type_id: orderTypeId,
        status: 'pending',
        date_time: new Date(`${day}T12:00:00`).toISOString(),
        // Omit when signed out: '' is not a valid users relation record.
        ...(reviewerId ? { created_by: reviewerId } : {}),
    })
    return created.id
}

interface DayOrderLine {
    id: string
    product_id: string
    quantity: number
    unit_price: number
    sub_total: number
    source?: string | null
}

async function fetchDayOrderLines(orderId: string): Promise<DayOrderLine[]> {
    try {
        return await pb.collection('sales').getFullList({
            filter: `order_id = "${orderId}"`,
            fields: 'id, product_id, quantity, unit_price, sub_total, source',
        })
    } catch {
        return []
    }
}

/**
 * One pending `orders` row (type `vse`) per VSE per day. All sale-approved,
 * not-yet-counted field sales for that VSE + date are aggregated into it
 * (one line per product) so the cashier collects one cash total and
 * approves once; staff-recorded manual lines on the same order are
 * preserved across rebuilds. `vse_movements sold` rows are deferred to
 * cashier approval (see OrderDetails) — this function only builds/refreshes
 * the order. Idempotent: rebuilds field lines from the full approved set
 * every time, so concurrent approvals converge.
 *
 * Already-counted sales (`sale_posted = true`, e.g. approved under the old
 * immediate-posting flow) are never swept in — that would double-count on
 * cashier approval.
 *
 * Returns the order id, or null when nothing approved remains (the order is
 * kept only if manual lines live on it, else deleted).
 */
export async function upsertVseDayOrder(vseId: string, dateStr: string): Promise<string | null> {
    const day = String(dateStr).slice(0, 10)
    if (!vseId || !day) return null

    const { orderTypeId, pending, linkedIds } = await findVseDayOrders(vseId, day)

    // All sale-approved, not-yet-counted field sales (source of truth).
    let approved: { id: string; order_id?: string | null }[] = []
    try {
        approved = await pb.collection('vse_field_sales').getFullList({
            filter: `${dayFilter('date', day)} && vse_customer_id = "${vseId}" && sale_status = "approved" && sale_posted = false`,
            fields: 'id, order_id',
        })
    } catch {
        approved = []
    }
    const approvedIds = new Set(approved.map((s) => s.id))

    // Single day order: prefer the linked (auto) one, else reuse any other
    // pending day order (manual lines merge in), else create.
    let targetId: string | null = pending.find((o) => linkedIds.has(o.id))?.id
        ?? pending[0]?.id ?? null

    if (approved.length === 0) {
        // Nothing to aggregate: clear stale links; keep the order only while
        // manual lines live on it, else delete it.
        if (targetId) {
            try {
                const stale = await pb.collection('vse_field_sales').getFullList({
                    filter: `order_id = "${targetId}"`,
                    fields: 'id',
                })
                for (const row of stale) {
                    try { await pb.collection('vse_field_sales').update(row.id, { order_id: null }) } catch { /* ignore */ }
                }
                const remaining = await fetchDayOrderLines(targetId)
                const manualTotal = remaining
                    .filter((l) => (l.source || '') !== 'field')
                    .reduce((sum, l) => sum + (l.sub_total || 0), 0)
                if (remaining.length === 0 || manualTotal <= 0) {
                    const fieldish = remaining.filter((l) => (l.source || '') === 'field' || linkedIds.has(targetId as string))
                    for (const row of fieldish) {
                        try { await pb.collection('sales').delete(row.id) } catch { /* ignore */ }
                    }
                    const left = await fetchDayOrderLines(targetId as string)
                    if (left.length === 0) {
                        try { await pb.collection('orders').delete(targetId as string) } catch { /* ignore */ }
                    } else {
                        const t = left.reduce((sum, l) => sum + (l.sub_total || 0), 0)
                        try { await pb.collection('orders').update(targetId as string, { total_amount: t }) } catch { /* ignore */ }
                    }
                } else {
                    try { await pb.collection('orders').update(targetId, { total_amount: manualTotal }) } catch { /* ignore */ }
                }
            } catch { /* best effort */ }
        }
        return null
    }

    // Aggregate items across every approved sale.
    const items = await getFullListInBatches(
        'vse_field_sale_items', 'sale_id',
        approved.map((s) => s.id),
        {}
    )
    const aggregated = aggregateFieldSaleItems(
        items.filter((it) => it.product_id).map((it) => ({
            productId: String(it.product_id),
            quantity: it.quantity || 0,
            unitPrice: it.unit_price || 0,
            subTotal: it.sub_total ?? (it.quantity || 0) * (it.unit_price || 0),
        }))
    )
    if (aggregated.length === 0) throw new Error('Sale has no line items')
    const fieldTotal = aggregated.reduce((sum, l) => sum + l.subTotal, 0)

    if (!targetId) {
        targetId = await createVseDayOrder(vseId, day, orderTypeId, fieldTotal)
    }
    const orderId = targetId as string
    const hasLinks = linkedIds.has(orderId)

    // Rebuild field lines only — manual lines stay untouched.
    const existing = await fetchDayOrderLines(orderId)
    let manualTotal = 0
    for (const row of existing) {
        const isField = (row.source || '') === 'field' || (!(row.source) && hasLinks)
        if (isField) {
            try { await pb.collection('sales').delete(row.id) } catch { /* ignore */ }
        } else {
            manualTotal += row.sub_total || 0
        }
    }
    for (const line of aggregated) {
        await pb.collection('sales').create({
            order_id: orderId,
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.quantity > 0 ? line.subTotal / line.quantity : line.unitPrice,
            sub_total: line.subTotal,
            discount: 0,
            source: 'field',
        })
    }
    await pb.collection('orders').update(orderId, { total_amount: fieldTotal + manualTotal })

    // Point every approved sale at the order; clear links on sales that
    // left the approved set (e.g. rejected after approval).
    for (const sale of approved) {
        if (String(sale.order_id || '') !== orderId) {
            try { await pb.collection('vse_field_sales').update(sale.id, { order_id: orderId }) } catch { /* ignore */ }
        }
    }
    try {
        const staleLinks = await pb.collection('vse_field_sales').getFullList({
            filter: `order_id = "${orderId}"`,
            fields: 'id, sale_status',
        })
        for (const row of staleLinks) {
            if (!approvedIds.has(row.id)) {
                try { await pb.collection('vse_field_sales').update(row.id, { order_id: null }) } catch { /* ignore */ }
            }
        }
    } catch { /* best effort */ }

    return orderId
}

/**
 * Staff-recorded (manual) VSE lines merge into the same single day order:
 * existing manual lines for the same product grow, new products append.
 * Field-aggregated lines are never touched. Returns the day order id.
 */
export async function appendManualLinesToDayOrder(
    vseId: string,
    dateStr: string,
    lines: { productId: string; quantity: number; unitPrice: number }[]
): Promise<string> {
    const day = String(dateStr).slice(0, 10)
    if (!vseId || !day) throw new Error('VSE and date are required')
    const clean = lines.filter((l) => l.productId && (l.quantity || 0) > 0)
    if (clean.length === 0) throw new Error('Add at least one product')

    const { orderTypeId, pending, linkedIds } = await findVseDayOrders(vseId, day)
    const existingId = pending.find((o) => linkedIds.has(o.id))?.id ?? pending[0]?.id ?? null
    const incomingTotal = clean.reduce((sum, l) => sum + (l.quantity || 0) * (l.unitPrice || 0), 0)
    const orderId = existingId ?? await createVseDayOrder(vseId, day, orderTypeId, incomingTotal)

    const existing = await fetchDayOrderLines(orderId)
    // Untagged legacy rows: field lines on linked (auto) orders, manual
    // lines elsewhere — mirrors the upsert partition rule.
    const orderHasLinks = linkedIds.has(orderId)
    const isManualRow = (r: DayOrderLine) =>
        (r.source || '') === 'manual' || (!r.source && !orderHasLinks)
    // Merge with existing manual lines by product (shared pure helper —
    // same math as the field aggregation), then rewrite manual lines.
    const merged = aggregateFieldSaleItems([
        ...existing
            .filter((r) => isManualRow(r) && r.product_id)
            .map((r) => ({
                productId: String(r.product_id),
                quantity: r.quantity || 0,
                unitPrice: r.unit_price || 0,
                subTotal: r.sub_total ?? (r.quantity || 0) * (r.unit_price || 0),
            })),
        ...clean.map((l) => ({
            productId: String(l.productId),
            quantity: l.quantity || 0,
            unitPrice: l.unitPrice || 0,
            subTotal: (l.quantity || 0) * (l.unitPrice || 0),
        })),
    ])
    for (const row of existing) {
        if (isManualRow(row)) {
            try { await pb.collection('sales').delete(row.id) } catch { /* ignore */ }
        }
    }
    for (const line of merged) {
        await pb.collection('sales').create({
            order_id: orderId,
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.quantity > 0 ? line.subTotal / line.quantity : line.unitPrice,
            sub_total: line.subTotal,
            discount: 0,
            source: 'manual',
        })
    }
    const refreshed = await fetchDayOrderLines(orderId)
    const total = refreshed.reduce((sum, l) => sum + (l.sub_total || 0), 0)
    await pb.collection('orders').update(orderId, { total_amount: total })
    return orderId
}

/**
 * Account-manager approval no longer writes `vse_movements` — it feeds the
 * sale into the day's aggregated pending VSE order. `sale_posted` stays
 * false until the cashier approves the order (which writes the movements),
 * so car-stock reservation and VSE edit locks keep working.
 */
export async function tryPostSaleSide(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId)
    if (sale.sale_status !== 'approved') return false
    // Already counted (e.g. approved under the old immediate-posting flow):
    // never re-aggregate — that would double-count on cashier approval.
    if (sale.sale_posted) return markFullyPostedIfDone(saleId)

    const items = await pb.collection('vse_field_sale_items').getFullList({
        filter: `sale_id = "${saleId}"`,
    })
    if (items.length === 0) throw new Error('Sale has no line items')

    const dateStr = String(sale.date).slice(0, 10)
    const vseId = typeof sale.vse_customer_id === 'string'
        ? sale.vse_customer_id
        : sale.vse_customer_id?.id || sale.vse_customer_id
    if (!vseId) throw new Error('Sale has no VSE attached')

    await upsertVseDayOrder(String(vseId), dateStr)
    return true
}

/**
 * Detach a sale from its aggregated order (reject path) and rebuild the
 * day order without it. The order is deleted only when neither approved
 * field sales nor manual lines remain on it.
 */
export async function removeSaleFromDayOrder(saleId: string): Promise<void> {
    let sale: { vse_customer_id?: unknown; date?: unknown; order_id?: unknown } | null = null
    try {
        sale = await pb.collection('vse_field_sales').getOne(saleId, {
            fields: 'id, vse_customer_id, date, order_id',
        })
    } catch {
        return
    }
    if (!sale) return
    const vseId = typeof sale.vse_customer_id === 'string'
        ? sale.vse_customer_id
        : (sale.vse_customer_id as { id?: string } | undefined)?.id || ''
    const day = String(sale.date || '').slice(0, 10)
    try { await pb.collection('vse_field_sales').update(saleId, { order_id: null }) } catch { /* ignore */ }
    if (vseId && day) {
        try { await upsertVseDayOrder(String(vseId), day) } catch { /* ignore */ }
    }
}

/**
 * Cashier approval finalizes the sale side: flags every field sale linked
 * to this order as `sale_posted`, flipping `posted_to_summary` where the
 * empties side is already in. `vse_movements sold` rows themselves are
 * written by the OrderDetails approval loop. Safe to call for manual VSE
 * orders too (no linked sales → no-op). Falls back to VSE + day matching
 * for orders created before the `order_id` link field existed.
 */
export async function markFieldSalesCashierPosted(orderId: string): Promise<number> {
    let linked: { id: string; sale_posted?: boolean; empties_posted?: boolean }[] = []
    try {
        linked = await pb.collection('vse_field_sales').getFullList({
            filter: `order_id = "${orderId}"`,
            fields: 'id, sale_posted, empties_posted, posted_to_summary',
        })
    } catch {
        linked = []
    }
    if (linked.length === 0) {
        // Back-compat: aggregate orders created before `order_id` existed.
        try {
            const order = await pb.collection('orders').getOne(orderId, { fields: 'id, customer_id, date_time' })
            const vseId = typeof order.customer_id === 'string' ? order.customer_id : order.customer_id?.id || ''
            const day = String(order.date_time || '').slice(0, 10)
            if (vseId && day) {
                linked = await pb.collection('vse_field_sales').getFullList({
                    filter: `${dayFilter('date', day)} && vse_customer_id = "${vseId}" && sale_status = "approved" && sale_posted = false`,
                    fields: 'id, sale_posted, empties_posted, posted_to_summary',
                })
            }
        } catch {
            return 0
        }
    }
    let patched = 0
    for (const row of linked) {
        if (row.sale_posted) continue
        const patch: Record<string, boolean> = { sale_posted: true }
        if (row.empties_posted) patch.posted_to_summary = true
        try {
            await pb.collection('vse_field_sales').update(row.id, patch)
            patched += 1
        } catch { /* ignore */ }
    }
    return patched
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
 * Combined entry point (kept for the retry-posting action): the sale side
 * feeds the day's aggregated pending order, the empties side posts its
 * tally rows. Returns true once both sides are counted (sale side counts
 * as counted only after the cashier approves the order).
 */
export async function tryValidateAndPost(saleId: string): Promise<boolean> {
    const sale = await pb.collection('vse_field_sales').getOne(saleId, {
        fields: 'id, sale_status, empties_status, sale_posted, empties_posted, posted_to_summary, order_id',
    })
    if (sale.sale_status === 'approved' && !sale.sale_posted && !sale.order_id) {
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
