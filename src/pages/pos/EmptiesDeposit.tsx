import { useState, useEffect } from "react"
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
import { Search, Calendar, ChevronDown, Download } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { RangeKeyDict, Range } from "react-date-range"
import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { toast } from "sonner"

interface RawDeposit {
    id: string
    quantity?: number
    refunded_qty?: number
    amount_per_crate?: number
    status: string
    created: string
    expand?: {
        customer_id?: { name?: string } | null
        order_id?: { date_time?: string; order_number?: number } | null
    }
}

interface DepositRow {
    id: string
    customer_name: string
    purchase_date: string
    order_number: number | null
    crates_held: number
    refundable_amount: number
    status: string
}

const ITEMS_PER_PAGE = 50

export default function EmptiesDeposit() {
    const [rows, setRows] = useState<DepositRow[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [dateRange, setDateRange] = useState<Range[]>([
        { startDate: undefined, endDate: undefined, key: "selection" },
    ])
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

    const fetchDeposits = async () => {
        setLoading(true)
        try {
            const data = await pb.collection("crate_deposits").getFullList({
                filter: '(status = "held" || status = "partial")',
                expand: "customer_id,order_id",
                $autoCancel: false,
            })

            const mapped: DepositRow[] = data.map((row) => {
                const d = row as unknown as RawDeposit
                const order = d.expand?.order_id
                return {
                    id: d.id,
                    customer_name: d.expand?.customer_id?.name || "Walk-in",
                    purchase_date: order?.date_time || d.created,
                    order_number: order?.order_number ?? null,
                    crates_held: Math.max(0, (d.quantity || 0) - (d.refunded_qty || 0)),
                    refundable_amount:
                        Math.max(0, (d.quantity || 0) - (d.refunded_qty || 0)) *
                        (d.amount_per_crate || 0),
                    status: d.status,
                }
            })

            // Server-side sort by date is unreliable on some hosts — sort locally
            mapped.sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)))
            setRows(mapped)
        } catch (err) {
            console.error("Error fetching empties deposits:", err)
            // Collection may not exist yet on older DBs — no refundable deposits
            setRows([])
            if ((err as { status?: number })?.status !== 404) toast.error("Failed to load empties deposits")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDeposits()
    }, [])

    const filteredRows = rows.filter((row) => {
        const matchesSearch =
            row.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (row.order_number != null && row.order_number.toString().includes(searchTerm))

        const startDate = dateRange[0].startDate
        const endDate = dateRange[0].endDate
        if (startDate) {
            const start = new Date(startDate)
            start.setHours(0, 0, 0, 0)
            if (new Date(row.purchase_date) < start) return false
        }
        if (endDate) {
            const end = new Date(endDate)
            end.setHours(23, 59, 59, 999)
            if (new Date(row.purchase_date) > end) return false
        }

        return matchesSearch
    })

    // Summary stats
    const totalRefundable = filteredRows.reduce((sum, r) => sum + r.refundable_amount, 0)
    const totalCrates = filteredRows.reduce((sum, r) => sum + r.crates_held, 0)
    const totalCustomers = new Set(filteredRows.map((r) => r.customer_name)).size

    // Pagination
    const totalItems = filteredRows.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedRows = filteredRows.slice(startIndex, endIndex)

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, dateRange])

    const formatDateRangeDisplay = () => {
        const selectedRange = dateRange[0]
        if (!selectedRange?.startDate) return "All dates"
        const start = new Date(selectedRange.startDate).toLocaleDateString()
        if (!selectedRange?.endDate) return `From ${start}`
        const end = new Date(selectedRange.endDate).toLocaleDateString()
        return start === end ? start : `${start} - ${end}`
    }

    const exportCSV = () => {
        const headers = ["Customer", "Purchase Date", "Order #", "Crates Held", "Refundable Amount", "Status"]
        const csvRows = filteredRows.map((r) => [
            r.customer_name,
            format(new Date(r.purchase_date), "yyyy-MM-dd HH:mm"),
            r.order_number != null ? `#${r.order_number}` : "",
            r.crates_held,
            r.refundable_amount.toFixed(2),
            r.status,
        ])
        const csv = [headers, ...csvRows].map((row) => row.join(",")).join("\n")
        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `empties-deposits-${format(new Date(), "yyyy-MM-dd")}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Empties Deposit</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <p>Loading deposits...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Empties Deposit</h2>
                    <p className="text-sm text-muted-foreground">
                        Refundable deposits held from customers without empties
                    </p>
                </div>
                <Button variant="outline" onClick={exportCSV} className="gap-2">
                    <Download className="h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Total Refundable</p>
                    <p className="text-2xl font-bold">GH₵ {totalRefundable.toFixed(2)}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Crates Held</p>
                    <p className="text-2xl font-bold">{totalCrates}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Customers</p>
                    <p className="text-2xl font-bold">{totalCustomers}</p>
                </div>
                <div className="rounded-md border bg-white dark:bg-card p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Deposits</p>
                    <p className="text-2xl font-bold">{filteredRows.length}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search customer or order..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

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
            </div>

            {/* Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Purchase Date</TableHead>
                            <TableHead>Order</TableHead>
                            <TableHead className="text-center">Crates Held</TableHead>
                            <TableHead className="text-right">Refundable Amount</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedRows.length > 0 ? (
                            paginatedRows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">{row.customer_name}</TableCell>
                                    <TableCell className="text-sm">
                                        {format(new Date(row.purchase_date), "MMM dd, yyyy HH:mm")}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {row.order_number != null ? `#${row.order_number}` : "—"}
                                    </TableCell>
                                    <TableCell className="text-center">{row.crates_held}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        GH₵ {row.refundable_amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                row.status === "partial"
                                                    ? "text-blue-700 border-blue-300 capitalize"
                                                    : "text-amber-700 border-amber-300 capitalize"
                                            }
                                        >
                                            {row.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    No outstanding empties deposits for the selected filters.
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
                        Showing {startIndex + 1} to {endIndex} of {totalItems} rows
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <span className="text-sm">Page {currentPage} of {totalPages}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
