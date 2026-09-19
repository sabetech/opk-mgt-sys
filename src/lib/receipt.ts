export interface ReceiptItem {
    productName: string
    skuCode: string
    quantity: number
    /** Base unit price (before surcharge) */
    price: number
    /** Per-unit surcharge applied (0 when none) */
    surcharge: number
    /** Line total (quantity * (price + surcharge)) */
    total: number
}

export interface CompletedSale {
    orderNumber: number
    dateTime: Date
    customerName: string
    customerType?: string | null
    paymentType: string
    servedBy?: string | null
    items: ReceiptItem[]
    totalQuantity: number
    grandTotal: number
    /** Refundable crate deposit (cash-out when empties are returned) */
    crateDepositQty?: number
    crateDepositTotal?: number
    crateDepositUnitAmount?: number
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function formatMoney(value: number): string {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Builds a standalone HTML document sized for 58/80mm Epson thermal
 * receipt printers (e.g. TM-T20/TM-T88 series roll paper).
 */
export function buildSaleReceiptHtml(sale: CompletedSale): string {
    const itemRows = sale.items
        .map((item, index) => {
            const unitPrice = item.price + item.surcharge
            const surchargeNote =
                item.surcharge > 0
                    ? `<div class="muted">incl. GHc ${formatMoney(item.surcharge)} surcharge</div>`
                    : ""
            return `<tr>
                <td class="item">${index + 1}. ${escapeHtml(item.productName)}<div class="muted">${escapeHtml(item.skuCode)}</div>${surchargeNote}</td>
            </tr>
            <tr>
                <td class="line"><span>${item.quantity} x ${formatMoney(unitPrice)}</span><span>${formatMoney(item.total)}</span></td>
            </tr>`
        })
        .join("")

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Receipt #${sale.orderNumber}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
    width: 72mm;
    margin: 0 auto;
    padding: 2mm 1mm 6mm;
    font-family: "Courier New", Courier, monospace;
    font-size: 12px;
    line-height: 1.45;
    color: #000;
}
.center { text-align: center; }
.company { font-size: 15px; font-weight: bold; }
.divider { border-top: 1px dashed #000; margin: 6px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 1px 0; vertical-align: top; word-wrap: break-word; }
.item { font-weight: bold; }
.muted { font-weight: normal; font-size: 11px; }
.line { display: flex; justify-content: space-between; gap: 8px; }
.totals { display: flex; justify-content: space-between; gap: 8px; font-weight: bold; }
.grand { font-size: 15px; }
.meta { display: flex; justify-content: space-between; gap: 8px; }
@media print {
    body { width: 72mm; margin: 0 auto; }
}
</style></head><body>
<div class="center company">OPPONG KYEKYEKU<br />DISTRIBUTION LTD</div>
<div class="center">*** SALES RECEIPT ***</div>
<div class="divider"></div>
<div class="meta"><span>Order No:</span><span><strong>#${sale.orderNumber}</strong></span></div>
<div class="meta"><span>Date:</span><span>${formatDateTime(sale.dateTime)}</span></div>
<div class="meta"><span>Customer:</span><span><strong>${escapeHtml(sale.customerName)}</strong></span></div>
${sale.customerType ? `<div class="meta"><span>Cust. Type:</span><span>${escapeHtml(sale.customerType)}</span></div>` : ""}
<div class="meta"><span>Payment:</span><span>${escapeHtml(sale.paymentType.replace(/_/g, " "))}</span></div>
${sale.servedBy ? `<div class="meta"><span>Served by:</span><span>${escapeHtml(sale.servedBy)}</span></div>` : ""}
<div class="divider"></div>
<table><tbody>${itemRows}</tbody></table>
<div class="divider"></div>
<div class="totals"><span>Total Qty:</span><span>${sale.totalQuantity}</span></div>
${(sale.crateDepositQty ?? 0) > 0 ? `<div class="totals"><span>Crate deposit (${sale.crateDepositQty} x ${formatMoney(sale.crateDepositUnitAmount ?? 0)}):</span><span>GHc ${formatMoney(sale.crateDepositTotal ?? 0)}</span></div><div class="muted center">Refundable in cash when empties are returned</div>` : ""}
<div class="totals grand"><span>TOTAL:</span><span>GHc ${formatMoney(sale.grandTotal)}</span></div>
<div class="divider"></div>
<div class="center">Thank you for your patronage!</div>
</body></html>`
}

export interface ProformaInvoice {
    /** Client-side reference only (e.g. PF-20260919-A3F9). Never persisted. */
    reference: string
    dateTime: Date
    customerName: string
    customerType?: string | null
    paymentType: string
    servedBy?: string | null
    items: ReceiptItem[]
    totalQuantity: number
    subtotal: number
    crateDepositQty?: number
    crateDepositTotal?: number
    crateDepositUnitAmount?: number
    grandTotal: number
}

/** Client-side proforma reference. Never touches the orders sequence. */
export function generateProformaReference(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0")
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `PF-${stamp}-${suffix}`
}

/**
 * Builds a standalone A4 proforma invoice document (quote only: it records
 * nothing, changes no stock, and must never be confused with a sale).
 */
export function buildProformaHtml(proforma: ProformaInvoice): string {
    const itemRows = proforma.items
        .map((item, index) => {
            const unitPrice = item.price + item.surcharge
            const surchargeNote =
                item.surcharge > 0
                    ? `<div class="muted">incl. GHc ${formatMoney(item.surcharge)} surcharge</div>`
                    : ""
            return `<tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHtml(item.productName)}<div class="muted">${escapeHtml(item.skuCode)}</div>${surchargeNote}</td>
                <td class="right">${item.quantity}</td>
                <td class="right">GHc ${formatMoney(unitPrice)}</td>
                <td class="right">GHc ${formatMoney(item.total)}</td>
            </tr>`
        })
        .join("")

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Proforma ${escapeHtml(proforma.reference)}</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
.company { font-size: 18px; font-weight: bold; }
h2 { margin: 4px 0; font-size: 22px; }
.notice { border: 2px solid #000; padding: 8px; margin: 12px 0; text-align: center; font-weight: bold; font-size: 13px; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0; }
.meta-grid div { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #ccc; padding: 2px 0; }
.muted { color: #555; font-size: 11px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.right { text-align: right; }
.center { text-align: center; }
.totals { margin-top: 12px; margin-left: auto; width: 60%; }
.totals div { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; }
.grand { font-size: 16px; font-weight: bold; border-top: 2px solid #000; margin-top: 4px; padding-top: 6px; }
.footer { margin-top: 24px; text-align: center; color: #444; }
@media print { body { margin: 0; } }
</style></head><body>
<div class="company">OPPONG KYEKYEKU DISTRIBUTION LTD</div>
<h2>Proforma Invoice</h2>
<div class="notice">QUOTE ONLY — NOT A SALE<br />NO STOCK OR PAYMENT RECORDED</div>
<div class="meta-grid">
<div><span>Ref No:</span><span><strong>${escapeHtml(proforma.reference)}</strong></span></div>
<div><span>Date:</span><span>${formatDateTime(proforma.dateTime)}</span></div>
<div><span>Customer:</span><span><strong>${escapeHtml(proforma.customerName)}</strong></span></div>
${proforma.customerType ? `<div><span>Cust. Type:</span><span>${escapeHtml(proforma.customerType)}</span></div>` : ""}
<div><span>Payment:</span><span>${escapeHtml(proforma.paymentType.replace(/_/g, " "))}</span></div>
${proforma.servedBy ? `<div><span>Served by:</span><span>${escapeHtml(proforma.servedBy)}</span></div>` : ""}
</div>
<table><thead><tr>
<th class="center">#</th><th>Product</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Line Total</th>
</tr></thead><tbody>${itemRows || `<tr><td colspan="5" class="center">No items.</td></tr>`}</tbody></table>
<div class="totals">
<div><span>Total Qty:</span><span>${proforma.totalQuantity}</span></div>
<div><span>Subtotal:</span><span>GHc ${formatMoney(proforma.subtotal)}</span></div>
${(proforma.crateDepositQty ?? 0) > 0 ? `<div><span>Crate deposit (${proforma.crateDepositQty} x ${formatMoney(proforma.crateDepositUnitAmount ?? 0)}):</span><span>GHc ${formatMoney(proforma.crateDepositTotal ?? 0)}</span></div>` : ""}
<div class="grand"><span>TOTAL:</span><span>GHc ${formatMoney(proforma.grandTotal)}</span></div>
</div>
<div class="footer">Thank you for your patronage!</div>
</body></html>`
}

export interface StockLevelRow {
    skuCode: string
    productName: string
    quantity: number
    retailPrice: number | null
}

/**
 * Builds a standalone A4 HTML document listing current stock levels.
 * Columns: SKU Code | Product Name | Stock Level | Retail Price.
 */
export function buildStockLevelsHtml(rows: StockLevelRow[], generatedAt: Date = new Date()): string {
    const sorted = [...rows].sort((a, b) => a.productName.localeCompare(b.productName))
    const bodyRows = sorted
        .map(
            (row, index) => `<tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHtml(row.skuCode)}</td>
                <td>${escapeHtml(row.productName)}</td>
                <td class="right">${row.quantity}</td>
                <td class="right">GHc ${formatMoney(row.retailPrice ?? 0)}</td>
            </tr>`
        )
        .join("")

    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Current Stock Levels</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
h2 { margin: 0 0 4px; font-size: 18px; }
.company { font-size: 15px; font-weight: bold; }
.subtitle { color: #444; margin-bottom: 16px; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.right { text-align: right; }
.center { text-align: center; }
.total { margin-top: 10px; font-weight: bold; }
@media print { body { margin: 0; } }
</style></head><body>
<div class="company">OPPONG KYEKYEKU DISTRIBUTION LTD</div>
<h2>Current Stock Levels</h2>
<div class="subtitle">Generated: ${formatDateTime(generatedAt)} | Items: ${sorted.length}</div>
<table><thead><tr>
<th class="center">#</th><th>SKU Code</th><th>Product Name</th><th class="right">Stock Level</th><th class="right">Retail Price</th>
</tr></thead><tbody>${bodyRows || `<tr><td colspan="5" class="center">No products found.</td></tr>`}</tbody></table>
</body></html>`
}

/**
 * Prints the given receipt HTML via a hidden iframe so the surrounding
 * React app state is preserved (no body-swap / reload hacks).
 */
export function printReceiptHtml(html: string, title = "Receipt"): void {
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.title = title
    document.body.appendChild(iframe)

    const cleanup = () => {
        window.setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        }, 1000)
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) {
        cleanup()
        const printWindow = window.open("", "_blank", "width=320,height=600")
        if (printWindow) {
            printWindow.document.write(html)
            printWindow.document.close()
            printWindow.focus()
            printWindow.print()
            printWindow.close()
        }
        return
    }

    doc.open()
    doc.write(html)
    doc.close()
    iframe.onload = () => {
        try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
        } finally {
            cleanup()
        }
    }
    // Fallback in case onload already fired synchronously
    window.setTimeout(() => {
        try {
            if (document.body.contains(iframe)) {
                iframe.contentWindow?.focus()
                iframe.contentWindow?.print()
            }
        } catch {
            // ignore; user can retry from the still-open dialog
        }
    }, 750)
}
