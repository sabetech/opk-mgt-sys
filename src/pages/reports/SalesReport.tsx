import { useState, useEffect, useMemo } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Search,
    Calendar,
    ChevronDown,
    Download,
    Printer,
    //FileText,
    Users,
    Package,
    ClipboardList,
} from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
    DialogFooter,
} from "@/components/ui/dialog"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { RangeKeyDict, Range } from "react-date-range"

import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { toast } from "sonner"

interface SaleRow {
    id: string
    order_id: string
    order_number: number
    date_time: string
    payment_type: string
    amount_tendered: number
    customer_name: string
    customer_type: string
    created_by_name: string
    product_id: string
    product_name: string
    product_code: string
    quantity: number
    returned_qty: number
    refund_amount: number
    unit_price: number
    sub_total: number
    order_total: number
}

const ITEMS_PER_PAGE = 50

export default function SalesReport() {
    const [rows, setRows] = useState<SaleRow[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
            endDate: new Date(),
            key: 'selection'
        }
    ])
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
    const [filterCustomerType, setFilterCustomerType] = useState("all")
    const [filterCustomer, setFilterCustomer] = useState("all")
    const [filterProduct, setFilterProduct] = useState("all")
    const [printOpen, setPrintOpen] = useState(false)

    const fetchReport = async () => {
        setLoading(true)
        try {
            const startDate = dateRange[0].startDate?.toISOString() || ""
            const endDate = dateRange[0].endDate
                ? new Date(dateRange[0].endDate.getTime() + 86400000).toISOString()
                : ""

            const dateFilter = startDate && endDate
                ? `(date_time >= "${startDate}" && date_time < "${endDate}")`
                : ""

            const statusFilter = 'status = "approved"'
            const filter = [dateFilter, statusFilter].filter(Boolean).join(' && ')

            // Fetch approved orders in date range with customer + type + created_by
            const ordersData = await pb.collection('orders').getFullList({
                filter,
                sort: '-date_time',
                expand: 'customer_id.type_id,created_by',
                $autoCancel: false,
            })

            if (ordersData.length === 0) {
                setRows([])
                return
            }

            // Fetch sale items for all orders with product expand
            const orderIds = ordersData.map((o) => o.id)
            const salesData = await pb.collection('sales').getFullList({
                filter: orderIds.map((oid) => `order_id = "${oid}"`).join(' || '),
                expand: 'product_id',
                $autoCancel: false,
            })

            // Fetch return records for all orders in range
            const returnsData = await pb.collection('returns').getFullList({
                filter: orderIds.map((oid) => `order_id = "${oid}"`).join(' || '),
                $autoCancel: false,
            })

            // Build returns lookup: "order_id|product_id" → { qty, refund }
            const returnsMap: Record<string, { qty: number; refund: number }> = {}
            for (const ret of returnsData) {
                const key = `${ret.order_id}|${ret.product_id}`
                if (!returnsMap[key]) returnsMap[key] = { qty: 0, refund: 0 }
                returnsMap[key].qty += ret.quantity || 0
                returnsMap[key].refund += ret.refund_amount || 0
            }

            // Build rows
            const rows: SaleRow[] = []
            for (const sale of salesData) {
                const order = ordersData.find((o) => o.id === sale.order_id)
                if (!order) continue
                const customer = order.expand?.customer_id
                const customerType = customer?.expand?.type_id
                const product = sale.expand?.product_id

                const retKey = `${order.id}|${sale.product_id}`
                const ret = returnsMap[retKey] || { qty: 0, refund: 0 }
                const returnedQty = ret.qty
                const refundAmount = ret.refund
                const netSubTotal = Math.max(0, (sale.sub_total || 0) - refundAmount)

                rows.push({
                    id: sale.id,
                    order_id: order.id,
                    order_number: order.order_number,
                    date_time: order.date_time,
                    payment_type: order.payment_type,
                    amount_tendered: order.amount_tendered || 0,
                    customer_name: customer?.name || "Walk-in",
                    customer_type: customerType?.name || "—",
                    created_by_name: order.expand?.created_by?.name || "—",
                    product_id: sale.product_id,
                    product_name: product?.sku_name || "Unknown",
                    product_code: product?.code_name || "—",
                    quantity: sale.quantity,
                    returned_qty: returnedQty,
                    refund_amount: refundAmount,
                    unit_price: sale.unit_price,
                    sub_total: netSubTotal,
                    order_total: order.total_amount,
                })
            }

            setRows(rows)
        } catch (err) {
            console.error("Error fetching sales report:", err)
            toast.error("Failed to load sales report")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchReport()
    }, [dateRange])

    // Extract unique values for filter dropdowns
    const customerTypes = useMemo(() => {
        const set = new Set(rows.map((r) => r.customer_type).filter((v) => v !== "—"))
        return Array.from(set).sort()
    }, [rows])

    const customerNames = useMemo(() => {
        const set = new Set(rows.map((r) => r.customer_name))
        return Array.from(set).sort()
    }, [rows])

    const productNames = useMemo(() => {
        const set = new Set(rows.map((r) => r.product_name))
        return Array.from(set).sort()
    }, [rows])

    // Apply filters
    const filteredRows = rows.filter((row) => {
        const matchesSearch =
            row.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            row.order_number.toString().includes(searchTerm)

        const matchesType = filterCustomerType === "all" || row.customer_type === filterCustomerType
        const matchesCustomer = filterCustomer === "all" || row.customer_name === filterCustomer
        const matchesProduct = filterProduct === "all" || row.product_name === filterProduct

        return matchesSearch && matchesType && matchesCustomer && matchesProduct
    })

    // Summary stats
    const totalSales = filteredRows.reduce((sum, r) => sum + r.sub_total, 0)
    const totalItems = filteredRows.reduce((sum, r) => sum + Math.max(0, r.quantity - r.returned_qty), 0)
    const totalOrders = new Set(filteredRows.map((r) => r.order_id)).size
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0

    // Pagination
    const totalItems_count = filteredRows.length
    const totalPages = Math.ceil(totalItems_count / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems_count)
    const paginatedRows = filteredRows.slice(startIndex, endIndex)

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, filterCustomerType, filterCustomer, filterProduct, dateRange])

    const formatDateRangeDisplay = () => {
        const selectedRange = dateRange[0]
        if (!selectedRange?.startDate) return "Select date range"
        const start = new Date(selectedRange.startDate).toLocaleDateString()
        if (!selectedRange?.endDate) return start
        const end = new Date(selectedRange.endDate).toLocaleDateString()
        return start === end ? start : `${start} - ${end}`
    }

    const exportCSV = () => {
        const headers = ["Date", "Order #", "Customer", "Customer Type", "Product", "Code", "Qty", "Returned", "Unit Price", "Sub Total", "Payment"]
        const csvRows = filteredRows.map((r) => [
            format(new Date(r.date_time), 'yyyy-MM-dd HH:mm'),
            r.order_number,
            r.customer_name,
            r.customer_type,
            r.product_name,
            r.product_code,
            r.quantity,
            r.returned_qty || 0,
            r.unit_price.toFixed(2),
            r.sub_total.toFixed(2),
            r.payment_type,
        ])
        const csv = [headers, ...csvRows].map((row) => row.join(",")).join("\n")
        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const dateRangeLabel = formatDateRangeDisplay()

    const openPrintWindow = (html: string) => {
        const originalHtml = document.body.innerHTML
        document.body.innerHTML = html
        window.print()
        document.body.innerHTML = originalHtml
        window.location.reload()
    }

    const printByCustomer = () => {
        // Group by customer -> date -> orders
        const byCustomer: Record<string, Record<string, Record<string, SaleRow[]>>> = {}
        for (const row of filteredRows) {
            const cust = row.customer_name
            const dateKey = format(new Date(row.date_time), 'yyyy-MM-dd')
            const orderKey = row.order_id
            if (!byCustomer[cust]) byCustomer[cust] = {}
            if (!byCustomer[cust][dateKey]) byCustomer[cust][dateKey] = {}
            if (!byCustomer[cust][dateKey][orderKey]) byCustomer[cust][dateKey][orderKey] = []
            byCustomer[cust][dateKey][orderKey].push(row)
        }

        const customers = Object.keys(byCustomer).sort()
        let grandTotal = 0
        let bodyRows = ""

        for (const cust of customers) {
            const dates = byCustomer[cust]
            const custTotal = Object.values(dates).reduce((dSum, orders) =>
                dSum + Object.values(orders).reduce((oSum, items) =>
                    oSum + items.reduce((iSum, r) => iSum + r.sub_total, 0), 0), 0)
            grandTotal += custTotal

            bodyRows += `<tr class="customer-header"><td colspan="7"><strong>${cust}</strong></td></tr>`

            const dateKeys = Object.keys(dates).sort()
            for (const dateKey of dateKeys) {
                const orders = dates[dateKey]
                const orderKeys = Object.keys(orders).sort()

                bodyRows += `<tr class="date-row"><td colspan="7">${format(new Date(dateKey), 'EEEE, MMM dd, yyyy')}</td></tr>`

                for (const ok of orderKeys) {
                    const items = orders[ok]
                    const first = items[0]
                    const amountPaid = first.amount_tendered || first.order_total

                    // First item with order info
                    bodyRows += `<tr>
                        <td></td>
                        <td>${first.product_name}</td>
                        <td class="right">${first.unit_price.toFixed(2)}</td>
                        <td class="center">${Math.max(0, first.quantity - first.returned_qty)}</td>
                        <td class="right">${first.sub_total.toFixed(2)}</td>
                        <td class="right">${amountPaid.toFixed(2)}</td>
                        <td class="center">#${first.order_number}</td>
                    </tr>`
                    // Remaining items
                    for (let i = 1; i < items.length; i++) {
                        const r = items[i]
                        bodyRows += `<tr>
                            <td></td>
                            <td>${r.product_name}</td>
                            <td class="right">${r.unit_price.toFixed(2)}</td>
                            <td class="center">${Math.max(0, r.quantity - r.returned_qty)}</td>
                            <td class="right">${r.sub_total.toFixed(2)}</td>
                            <td></td>
                            <td></td>
                        </tr>`
                    }
                }
            }
            bodyRows += `<tr class="subtotal-row"><td colspan="4"><strong>${cust} Subtotal</strong></td><td class="right"><strong>GH₵ ${custTotal.toFixed(2)}</strong></td><td colspan="2"></td></tr>`
        }

        const html = `<!DOCTYPE html><html><head><title>Sales Report - By Customer</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
            h2 { margin-bottom: 4px; }
            .subtitle { color: #666; margin-bottom: 16px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .right { text-align: right; }
            .center { text-align: center; }
            .customer-header td { background: #d4edda; font-size: 13px; padding: 8px; }
            .date-row td { background: #e8e8e8; font-style: italic; font-size: 11px; }
            .subtotal-row td { background: #f9f9f9; }
            .grand-total { text-align: right; font-size: 14px; font-weight: bold; margin-top: 8px; }
            @media print { body { margin: 10px; } }
        </style></head><body>
        <h2>Sales Report by Customer</h2>
        <div class="subtitle">${dateRangeLabel} | Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}</div>
        <table><thead><tr>
            <th>Date</th><th>Product</th><th class="right">Unit Price</th><th class="center">Qty</th>
            <th class="right">Total Price</th><th class="right">Amount Paid</th><th class="center">Order #</th>
        </tr></thead><tbody>${bodyRows}</tbody></table>
        <div class="grand-total">Grand Total: GH₵ ${grandTotal.toFixed(2)}</div>
        </body></html>`

        openPrintWindow(html)
    }

    const printByProduct = () => {
        const byProduct: Record<string, { name: string; code: string; qty: number; unitPrice: number; total: number }> = {}
        for (const row of filteredRows) {
            const key = row.product_id
            if (!byProduct[key]) {
                byProduct[key] = { name: row.product_name, code: row.product_code, qty: 0, unitPrice: row.unit_price, total: 0 }
            }
            byProduct[key].qty += Math.max(0, row.quantity - row.returned_qty)
            byProduct[key].total += row.sub_total
        }

        const products = Object.values(byProduct).sort((a, b) => a.name.localeCompare(b.name))
        const totalQty = products.reduce((s, p) => s + p.qty, 0)
        const totalAmount = products.reduce((s, p) => s + p.total, 0)

        let bodyRows = ""
        for (const p of products) {
            bodyRows += `<tr>
                <td>${p.name}</td>
                <td class="right">${p.unitPrice.toFixed(2)}</td>
                <td class="center">${p.qty}</td>
                <td class="right">${p.total.toFixed(2)}</td>
            </tr>`
        }

        const html = `<!DOCTYPE html><html><head><title>Sales Report - By Product</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
            h2 { margin-bottom: 4px; }
            .subtitle { color: #666; margin-bottom: 16px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .right { text-align: right; }
            .center { text-align: center; }
            .total-row td { background: #e8e8e8; font-weight: bold; }
            @media print { body { margin: 10px; } }
        </style></head><body>
        <h2>Sales Report by Product</h2>
        <div class="subtitle">${dateRangeLabel} | Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}</div>
        <table><thead><tr>
            <th>Product</th><th class="right">Retail Price</th><th class="center">Qty Sold</th><th class="right">Total Amount</th>
        </tr></thead><tbody>${bodyRows}
        <tr class="total-row"><td><strong>Total</strong></td><td></td><td class="center"><strong>${totalQty}</strong></td><td class="right"><strong>GH₵ ${totalAmount.toFixed(2)}</strong></td></tr>
        </tbody></table>
        </body></html>`

        openPrintWindow(html)
    }

    const printByOrder = () => {
        // Group by order
        const byOrder: Record<string, SaleRow[]> = {}
        for (const row of filteredRows) {
            const key = row.order_id
            if (!byOrder[key]) byOrder[key] = []
            byOrder[key].push(row)
        }

        const orderIds = Object.keys(byOrder).sort((a, b) => {
            const dateA = byOrder[a][0].date_time
            const dateB = byOrder[b][0].date_time
            return new Date(dateB).getTime() - new Date(dateA).getTime()
        })

        let bodyRows = ""
        let grandTotal = 0
        let grandQty = 0

        for (const oid of orderIds) {
            const items = byOrder[oid]
            //const first = items[0]
            const orderTotal = items.reduce((s, r) => s + r.sub_total, 0)
            grandTotal += orderTotal

            for (const r of items) {
                grandQty += Math.max(0, r.quantity - r.returned_qty)
                bodyRows += `<tr>
                    <td>${format(new Date(r.date_time), 'MMM dd, yyyy HH:mm')}</td>
                    <td>${r.product_name}</td>
                    <td class="center">${Math.max(0, r.quantity - r.returned_qty)}</td>
                    <td class="right">${r.unit_price.toFixed(2)}</td>
                    <td class="right">${r.sub_total.toFixed(2)}</td>
                </tr>`
            }
        }

        const html = `<!DOCTYPE html><html><head><title>Sales Report - By Order</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
            h2 { margin-bottom: 4px; }
            .subtitle { color: #666; margin-bottom: 16px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .right { text-align: right; }
            .center { text-align: center; }
            .grand-total { text-align: right; font-size: 14px; font-weight: bold; margin-top: 8px; }
            @media print { body { margin: 10px; } }
        </style></head><body>
        <h2>Sales Report by Order</h2>
        <div class="subtitle">${dateRangeLabel} | Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}</div>
        <table><thead><tr>
            <th>Date</th><th>Product</th><th class="center">Qty</th><th class="right">Retail Price</th><th class="right">Total Amount</th>
        </tr></thead><tbody>${bodyRows}
        <tr class="total-row"><td colspan="2"><strong>Total</strong></td><td class="center"><strong>${grandQty}</strong></td><td></td><td class="right"><strong>GH₵ ${grandTotal.toFixed(2)}</strong></td></tr>
        </tbody></table>
        <div class="grand-total">Grand Total: GH₵ ${grandTotal.toFixed(2)}</div>
        </body></html>`

        openPrintWindow(html)
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Sales Report</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <p>Loading report...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Sales Report</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setPrintOpen(true)} className="gap-2">
                        <Printer className="h-4 w-4" />
                        Print Report
                    </Button>
                    <Button variant="outline" onClick={exportCSV} className="gap-2">
                        <Download className="h-4 w-4" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Total Sales</p>
                    <p className="text-2xl font-bold">GH₵ {totalSales.toFixed(2)}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Total Orders</p>
                    <p className="text-2xl font-bold">{totalOrders}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Items Sold</p>
                    <p className="text-2xl font-bold">{totalItems}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Avg Order Value</p>
                    <p className="text-2xl font-bold">GH₵ {avgOrderValue.toFixed(2)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
                {/* Search */}
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Date Range */}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full md:w-auto justify-start text-left font-normal">
                            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                            {formatDateRangeDisplay()}
                            <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <DateRangePicker
                            value={dateRange}
                            onChange={(ranges: RangeKeyDict) => {
                                const { selection } = ranges
                                setDateRange([selection])
                            }}
                        />
                    </PopoverContent>
                </Popover>

                {/* Customer Type Filter */}
                <div className="w-full md:w-48">
                    <Select value={filterCustomerType} onValueChange={setFilterCustomerType}>
                        <SelectTrigger>
                            <SelectValue placeholder="Customer Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {customerTypes.map((ct) => (
                                <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Customer Filter */}
                <div className="w-full md:w-48">
                    <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                        <SelectTrigger>
                            <SelectValue placeholder="Customer" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Customers</SelectItem>
                            {customerNames.map((cn) => (
                                <SelectItem key={cn} value={cn}>{cn}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Product Filter */}
                <div className="w-full md:w-48">
                    <Select value={filterProduct} onValueChange={setFilterProduct}>
                        <SelectTrigger>
                            <SelectValue placeholder="Product" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Products</SelectItem>
                            {productNames.map((pn) => (
                                <SelectItem key={pn} value={pn}>{pn}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Report Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-center">Qty</TableHead>
                            <TableHead className="text-center">Returned</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                            <TableHead>Payment</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.length > 0 ? (
                            paginatedRows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="text-sm">
                                        {format(new Date(row.date_time), 'MMM dd, yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">#{row.order_number}</TableCell>
                                    <TableCell className="font-medium">{row.customer_name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs">{row.customer_type}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm">{row.product_name}</span>
                                            <span className="text-xs text-muted-foreground font-mono">{row.product_code}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{row.quantity}</TableCell>
                                    <TableCell className="text-center text-red-600">{row.returned_qty || "—"}</TableCell>
                                    <TableCell className="text-right">GH₵ {row.unit_price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-medium">GH₵ {row.sub_total.toFixed(2)}</TableCell>
                                    <TableCell className="capitalize text-sm">{row.payment_type?.replace('_', ' ')}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={10} className="h-24 text-center">
                                    No sales data found for the selected filters.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1} to {endIndex} of {totalItems_count} rows
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <span className="text-sm">Page {currentPage} of {totalPages}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
            {/* Print Options Modal */}
            <Dialog open={printOpen} onOpenChange={setPrintOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Printer className="h-5 w-5" />
                            Print Sales Report
                        </DialogTitle>
                        <DialogDescription>
                            Choose a report format. Filters are applied to all reports.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <button
                            onClick={() => { printByCustomer(); setPrintOpen(false) }}
                            className="w-full flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                        >
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                                <Users className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold">By Customer</p>
                                <p className="text-sm text-muted-foreground">Grouped by customer, with date, products, and order details</p>
                            </div>
                        </button>
                        <button
                            onClick={() => { printByProduct(); setPrintOpen(false) }}
                            className="w-full flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                        >
                            <div className="bg-green-100 p-2 rounded-lg text-green-700">
                                <Package className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold">By Product</p>
                                <p className="text-sm text-muted-foreground">Aggregated quantities and totals per product</p>
                            </div>
                        </button>
                        <button
                            onClick={() => { printByOrder(); setPrintOpen(false) }}
                            className="w-full flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                        >
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-700">
                                <ClipboardList className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-semibold">By Order</p>
                                <p className="text-sm text-muted-foreground">Listed by order with date, product, qty, and totals</p>
                            </div>
                        </button>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
