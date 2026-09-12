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
<div class="totals grand"><span>TOTAL:</span><span>GHc ${formatMoney(sale.grandTotal)}</span></div>
<div class="divider"></div>
<div class="center">Thank you for your patronage!</div>
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
