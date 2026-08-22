import { useState, useEffect } from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, ArrowUp, ArrowDown } from "lucide-react"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { pb } from "@/lib/pocketbase"
import { toast } from "sonner"

const REASON_LABELS: Record<string, string> = {
    supplier_discounted: "Supplier Discounted Stock Adjustment",
    stock_correction: "Stock Correction",
    breakages: "Breakages/Hole in cases/defects",
    expired: "Expired Products",
    protocol_request: "Protocol Requests",
}

interface AdjustmentRecord {
    id: string
    date: string
    type: "adjustment_increase" | "adjustment_decrease"
    productName: string
    productCode: string
    quantity: number
    reason: string
    reference: string
    notes: string
    adjustedBy: string
}

export default function AdjustmentsLog() {
    const [records, setRecords] = useState<AdjustmentRecord[]>([])
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

            const filter = `(type = "adjustment_increase" || type = "adjustment_decrease") && date >= "${startOfDay}" && date <= "${endOfDay}"`

            const data = await pb.collection("inventory_logs").getFullList({
                filter,
                sort: "-date",
                expand: "product_id",
                fields: "id, date, type, product_id, quantity, reason, reference, notes, adjusted_by, expand",
            })

            const transformed: AdjustmentRecord[] = data.map((log) => {
                const product = log.expand?.product_id
                return {
                    id: log.id,
                    date: log.date,
                    type: log.type as "adjustment_increase" | "adjustment_decrease",
                    productName: product?.sku_name || "Unknown",
                    productCode: product?.code_name || "N/A",
                    quantity: log.quantity,
                    reason: log.reason,
                    reference: log.reference || "N/A",
                    notes: log.notes || "",
                    adjustedBy: log.adjusted_by || "N/A",
                }
            })

            setRecords(transformed)
        } catch (error: any) {
            console.error("Error fetching adjustments:", error)
            toast.error("Failed to load adjustments")
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

    const totalIncreases = records
        .filter((r) => r.type === "adjustment_increase")
        .reduce((sum, r) => sum + r.quantity, 0)

    const totalDecreases = records
        .filter((r) => r.type === "adjustment_decrease")
        .reduce((sum, r) => sum + r.quantity, 0)

    const netChange = totalIncreases - totalDecreases

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">
                    Adjustments Log
                </h2>
                <p className="text-muted-foreground">
                    View all stock adjustments by date
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
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Increases
                        </CardTitle>
                        <ArrowUp className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            +{totalIncreases.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(selectedDate, "MMM d, yyyy")}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Decreases
                        </CardTitle>
                        <ArrowDown className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            -{totalDecreases.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(selectedDate, "MMM d, yyyy")}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Net Change
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            netChange >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                            {netChange >= 0 ? "+" : ""}{netChange.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {records.length} adjustment(s)
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
                            <TableHead>Reference</TableHead>
                            <TableHead>Direction</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Adjusted By</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="h-40 text-center"
                                >
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">
                                            Loading adjustments...
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : records.length > 0 ? (
                            records.map((record) => (
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
                                    <TableCell className="font-mono text-sm">
                                        {record.reference}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={record.type === "adjustment_increase" ? "default" : "destructive"}
                                            className={cn(
                                                record.type === "adjustment_increase" && "bg-green-100 text-green-800 border-green-200"
                                            )}
                                        >
                                            {record.type === "adjustment_increase" ? (
                                                <span className="flex items-center gap-1">
                                                    <ArrowUp className="h-3 w-3" /> Increase
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1">
                                                    <ArrowDown className="h-3 w-3" /> Decrease
                                                </span>
                                            )}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium">{record.productName}</div>
                                            <div className="text-xs text-muted-foreground">{record.productCode}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-bold font-mono">
                                        <span className={record.type === "adjustment_increase" ? "text-green-600" : "text-red-600"}>
                                            {record.type === "adjustment_increase" ? "+" : "-"}{record.quantity}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {REASON_LABELS[record.reason] || record.reason}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {record.adjustedBy}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="h-32 text-center text-muted-foreground italic"
                                >
                                    No adjustments recorded on {format(selectedDate, "MMM d, yyyy")}.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {/* Expanded Notes */}
                {records.map(
                    (record) =>
                        expandedRows.has(record.id) &&
                        record.notes && (
                            <div
                                key={`expand-${record.id}`}
                                className="border-t bg-muted/30 p-4"
                            >
                                <h4 className="font-bold mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                                    Notes
                                </h4>
                                <p className="text-sm text-muted-foreground bg-background p-3 rounded-md border">
                                    {record.notes}
                                </p>
                            </div>
                        )
                )}
            </div>
        </div>
    )
}
