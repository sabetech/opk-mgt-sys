import { useState, useEffect } from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, Package, Download } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { RangeKeyDict, Range } from "react-date-range"
import { Calendar } from "@/components/ui/calendar"
import { pb, dayFilter, startOfDay, endOfDay } from "@/lib/pocketbase"
import { toast } from "sonner"

interface ProductBreakdown {
    productName: string
    quantity: number
}

interface TruckReload {
    id: string
    date: string
    totalQuantity: number
    vehicleNumber: string
    driverName: string
    products: ProductBreakdown[]
}

export default function TruckReloadsToGGBL() {
    const [reloadRecords, setReloadRecords] = useState<TruckReload[]>([])
    const [totalStock, setTotalStock] = useState(0)
    const [dailyReceived, setDailyReceived] = useState(0)
    const [allTimeBalance, setAllTimeBalance] = useState(0)
    const [loading, setLoading] = useState(true)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [calendarOpen, setCalendarOpen] = useState(false)

    // CSV export modal (date range)
    const [exportOpen, setExportOpen] = useState(false)
    const [exportRange, setExportRange] = useState<Range[]>([
        { startDate: new Date(), endDate: new Date(), key: "selection" },
    ])
    const [exporting, setExporting] = useState(false)

    const fetchData = async () => {
        setLoading(true)
        try {
            const dateStr = format(selectedDate, "yyyy-MM-dd")
            const startOfDay = `${dateStr} 00:00:00.000Z`
            const endOfDay = `${dateStr} 23:59:59.999Z`

            // Fetch empties sent to supplier on selected date
            let filter = 'activity = "empties_to_supplier"'
            filter += ` && date >= "${startOfDay}" && date <= "${endOfDay}"`

            const logsData = await pb.collection("empties_log").getFullList({
                filter,
                sort: "-date",
                fields: "id, date, total_quantity, vehicle_no, returned_by",
            })

            // Fetch details for each log
            const logIds = logsData.map((log) => log.id)
            const detailData =
                logIds.length > 0
                    ? await pb.collection("empties_log_detail").getFullList({
                          filter: logIds.map(id => `log_id = "${id}"`).join(" || "),
                          expand: "product_id",
                      })
                    : []

            // Map details by log_id
            const detailsByLog: Record<string, ProductBreakdown[]> = {}
            for (const detail of detailData) {
                const rel = detail.expand?.product_id
                const entry: ProductBreakdown = {
                    quantity: detail.quantity,
                    productName: rel?.sku_name || "Unknown",
                }
                if (!detailsByLog[detail.log_id]) {
                    detailsByLog[detail.log_id] = []
                }
                detailsByLog[detail.log_id].push(entry)
            }

            const transformed: TruckReload[] = logsData.map((log) => ({
                id: log.id,
                date: log.date,
                totalQuantity: log.total_quantity,
                vehicleNumber: log.vehicle_no || "N/A",
                driverName: log.returned_by || "N/A",
                products: detailsByLog[log.id] || [],
            }))

            setReloadRecords(transformed)

            // Returnable products received from GGBL on the selected date.
            // Balance = empties sent back - returnables brought in. Negative
            // means OPK owes GGBL empties; positive means a surplus was sent.
            const receivablesData = await pb
                .collection("inventory_receivables")
                .getFullList({
                    filter: dayFilter("date", selectedDate),
                    fields: "id",
                })
            const receivableIds = receivablesData.map((r) => r.id)
            let receivedToday = 0
            if (receivableIds.length > 0) {
                const receivableItems = await pb
                    .collection("inventory_receivable_items")
                    .getFullList({
                        filter: receivableIds
                            .map((id) => `receivable_id = "${id}"`)
                            .join(" || "),
                        expand: "product_id",
                    })
                receivedToday = receivableItems.reduce(
                    (sum: number, item) =>
                        sum +
                        (item.expand?.product_id?.returnable
                            ? item.qty || 0
                            : 0),
                    0
                )
            }
            setDailyReceived(receivedToday)

            // All-time balance (date-independent)
            const [allSentLogs, returnableProducts] = await Promise.all([
                pb.collection("empties_log").getFullList({
                    filter: 'activity = "empties_to_supplier"',
                    fields: "total_quantity",
                }),
                pb.collection("products").getFullList({
                    filter: "returnable = true",
                    fields: "id",
                }),
            ])
            const allTimeSent = allSentLogs.reduce(
                (sum: number, log) => sum + (log.total_quantity || 0),
                0
            )
            const returnableIds = returnableProducts.map((p) => p.id)
            let allTimeReceived = 0
            if (returnableIds.length > 0) {
                const allReturnableItems = await pb
                    .collection("inventory_receivable_items")
                    .getFullList({
                        filter: `product_id in ("${returnableIds.join('","')}")`,
                        fields: "qty",
                    })
                allTimeReceived = allReturnableItems.reduce(
                    (sum: number, item) => sum + (item.qty || 0),
                    0
                )
            }
            setAllTimeBalance(allTimeSent - allTimeReceived)

            // Fetch total warehouse stock
            const stockData = await pb
                .collection("warehouse_stock")
                .getFullList({ fields: "quantity" })
            const total = stockData.reduce(
                (sum: number, item) => sum + (item.quantity || 0),
                0
            )
            setTotalStock(total)
        } catch (error: any) {
            console.error("Error fetching truck reloads:", error)
            toast.error("Failed to load truck reloads")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [selectedDate])

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const csvEscape = (value: string | number | null | undefined): string => {
        const s = value === null || value === undefined ? "" : String(value)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const openExportDialog = () => {
        setExportRange([{ startDate: new Date(), endDate: new Date(), key: "selection" }])
        setExportOpen(true)
    }

    const handleExportCsv = async () => {
        const start = exportRange[0]?.startDate
        const end = exportRange[0]?.endDate
        if (!start || !end) {
            toast.error("Please select a start and end date.")
            return
        }

        setExporting(true)
        try {
            const filter =
                `activity = "empties_to_supplier" && date >= "${startOfDay(start)}" && date <= "${endOfDay(end)}"`
            const logsData = await pb.collection("empties_log").getFullList({
                filter,
                sort: "-date",
                fields: "id, date, total_quantity, vehicle_no, returned_by",
            })

            if (logsData.length === 0) {
                toast.error("No records in the selected date range.")
                return
            }

            const logIds = logsData.map((log) => log.id)
            const detailData = await pb.collection("empties_log_detail").getFullList({
                filter: logIds.map((id) => `log_id = "${id}"`).join(" || "),
                expand: "product_id",
            })

            const detailsByLog: Record<string, ProductBreakdown[]> = {}
            for (const detail of detailData) {
                const rel = detail.expand?.product_id
                const entry: ProductBreakdown = {
                    quantity: detail.quantity,
                    productName: rel?.sku_name || "Unknown",
                }
                if (!detailsByLog[detail.log_id]) {
                    detailsByLog[detail.log_id] = []
                }
                detailsByLog[detail.log_id].push(entry)
            }

            const headers = ["Date", "Product", "Quantity", "Total Qty", "Vehicle #", "Driver Name"]
            const csvRows: (string | number)[][] = []
            for (const log of logsData) {
                const base = [
                    format(new Date(log.date), "yyyy-MM-dd"),
                ]
                const tail = [log.total_quantity, log.vehicle_no || "N/A", log.returned_by || "N/A"]
                const products = detailsByLog[log.id] || []
                if (products.length === 0) {
                    csvRows.push([...base, "", ...tail])
                } else {
                    for (const p of products) {
                        csvRows.push([...base, p.productName, p.quantity, ...tail])
                    }
                }
            }

            const csv = [headers, ...csvRows]
                .map((row) => row.map(csvEscape).join(","))
                .join("\n")
            const blob = new Blob([csv], { type: "text/csv" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `truck-reloads-to-ggbl-${format(new Date(start), "yyyy-MM-dd")}-to-${format(new Date(end), "yyyy-MM-dd")}.csv`
            a.click()
            URL.revokeObjectURL(url)
            setExportOpen(false)
            toast.success(`Exported ${csvRows.length} row(s).`)
        } catch (error) {
            console.error("Error exporting truck reloads:", error)
            toast.error("Failed to export truck reloads")
        } finally {
            setExporting(false)
        }
    }

    const totalSent = reloadRecords.reduce(
        (sum, r) => sum + r.totalQuantity,
        0
    )

    const dailyBalance = totalSent - dailyReceived
    const formatSigned = (value: number) =>
        value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">
                    Truck Reloads to GGBL
                </h2>
                <p className="text-muted-foreground">
                    View empties sent to GGBL supplier by date
                </p>
            </div>

            {/* Date Filter */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Select Date</label>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full md:w-[240px] justify-start text-left font-normal"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(selectedDate, "PPP")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(date) => {
                                    if (date) {
                                        setSelectedDate(date)
                                        setCalendarOpen(false)
                                    }
                                }}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <Button variant="outline" onClick={openExportDialog} className="gap-2">
                    <Download className="h-4 w-4" /> Export CSV
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Empties Sent
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalSent.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(selectedDate, "MMM d, yyyy")}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Warehouse Stock
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalStock.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Current inventory
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Empties Balance (GGBL)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div
                            className={cn(
                                "text-2xl font-bold",
                                dailyBalance < 0 && "text-red-600",
                                dailyBalance > 0 && "text-green-600"
                            )}
                        >
                            {formatSigned(dailyBalance)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(selectedDate, "MMM d, yyyy")} · All-time:{" "}
                            {formatSigned(allTimeBalance)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Total Qty</TableHead>
                            <TableHead>Vehicle #</TableHead>
                            <TableHead>Driver Name</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-40 text-center"
                                >
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Loading records...
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : reloadRecords.length > 0 ? (
                            reloadRecords.map((record) => (
                                <TableRow
                                    key={record.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleRow(record.id)}
                                >
                                    <TableCell>
                                        {expandedRows.has(record.id) ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {format(
                                            new Date(record.date),
                                            "MMM d, yyyy"
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Package className="h-3 w-3 text-muted-foreground" />
                                            {record.totalQuantity}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm uppercase">
                                        {record.vehicleNumber}
                                    </TableCell>
                                    <TableCell>{record.driverName}</TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-muted-foreground italic"
                                >
                                    No trucks sent to GGBL on{" "}
                                    {format(selectedDate, "MMM d, yyyy")}.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Expanded Product Breakdown */}
                {reloadRecords.map(
                    (record) =>
                        expandedRows.has(record.id) && (
                            <div
                                key={`expand-${record.id}`}
                                className="border-t bg-muted/30 p-4"
                            >
                                <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                    <Package className="h-3 w-3" />
                                    Product Breakdown
                                </h4>
                                <div className="rounded-md border bg-background shadow-sm overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50">
                                                <TableHead className="h-9">
                                                    Product Name
                                                </TableHead>
                                                <TableHead className="text-right h-9">
                                                    Quantity
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {record.products.map(
                                                (product, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell className="py-2 text-sm font-medium">
                                                            {product.productName}
                                                        </TableCell>
                                                        <TableCell className="text-right py-2 font-bold font-mono">
                                                            {product.quantity}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        )
                )}
            </div>

            {/* Export CSV (date range) */}
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5" />
                            Export Truck Reloads to GGBL
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        <span className="text-sm font-medium">Date Range</span>
                        <DateRangePicker
                            value={exportRange}
                            onChange={(ranges: RangeKeyDict) => {
                                const selection = ranges.selection
                                if (selection?.startDate && selection?.endDate) {
                                    setExportRange([selection])
                                }
                            }}
                        />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleExportCsv}
                            disabled={exporting}
                            className="bg-amber-700 hover:bg-amber-800 gap-2"
                        >
                            {exporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" /> Exporting...
                                </>
                            ) : (
                                <>
                                    <Download className="h-4 w-4" /> Export CSV
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
