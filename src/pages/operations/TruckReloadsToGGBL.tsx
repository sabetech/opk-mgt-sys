import { useState, useEffect } from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, Package } from "lucide-react"
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
import { Calendar } from "@/components/ui/calendar"
import { pb, dayFilter } from "@/lib/pocketbase"
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
        </div>
    )
}
