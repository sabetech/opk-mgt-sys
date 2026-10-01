import { pb, dayFilter } from "@/lib/pocketbase"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { format } from "date-fns"
import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronRight,
    Package,
    ArrowUpRight,
    ArrowDownLeft,
    XCircle,
    Gift,
    RefreshCcw,
    Undo2,
    TrendingUp,
    TrendingDown,
    Loader2
} from "lucide-react"

import { cn } from "@/lib/utils"
import { summarizeProductLogs, type InventoryMovementType, type InventoryTransaction } from "@/lib/inventoryLog"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// Types
type Transaction = InventoryTransaction

type ProductInventory = {
    id: string
    name: string
    openingStock: number
    totalReceived: number
    vsesSent: number
    totalSold: number
    reverted: number
    vsesReturned: number
    breakages: number
    promoStock: number
    reimbursement: number
    customerReturns: number
    adjustmentsNet: number
    closingStock: number
    transactions: Transaction[]
}

/** Explicit-sign number: +5 / -5 / 0 (toLocaleString never emits "+"). */
function fmtSigned(value: number): string {
    const rounded = Math.round(value * 100) / 100
    return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}`
}

export default function InventoryLog() {
    const [date, setDate] = useState<Date>(new Date()) // Default to today
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [inventoryData, setInventoryData] = useState<ProductInventory[]>([])

    useEffect(() => {
        fetchData()
    }, [date])

    const fetchData = async () => {
        setLoading(true)
        try {
            const dateStr = date.toISOString().split('T')[0]

            // 1. Fetch all products
            const products = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name',
                fields: 'id, sku_name'
            })

            // 2. Fetch logs for the selected date
            // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
            const logs = await pb.collection('inventory_logs').getFullList({
                filter: dayFilter('date', dateStr),
            })
            logs.sort((a, b) => String(a.created).localeCompare(String(b.created)))

            // 3. Live warehouse quantities so closing/opening are real stock
            // figures, not just the day's net movement.
            const stockRows = await pb.collection('warehouse_stock').getFullList({
                fields: 'product_id, quantity',
            })
            const liveQty = new Map<string, number>()
            for (const s of stockRows) {
                if (s.product_id) liveQty.set(s.product_id, s.quantity || 0)
            }

            // 4. Process data
            const processedData: ProductInventory[] = (products || []).map((product) => {
                const productLogs = (logs || []).filter((l) => l.product_id === product.id)
                const summary = summarizeProductLogs(productLogs.map((l) => ({
                    id: l.id,
                    product_id: l.product_id,
                    type: l.type,
                    quantity: l.quantity || 0,
                    description: l.description,
                    created: l.created,
                })))

                // True closing = live warehouse stock; opening backs out the
                // day's signed net. (The old code summed only the day's logs
                // from zero and mislabeled the result as closing stock.)
                const closingStock = liveQty.get(product.id) ?? 0
                const openingStock = closingStock - summary.dayNet

                return {
                    id: product.id.toString(),
                    name: product.sku_name,
                    openingStock,
                    totalReceived: summary.totalReceived,
                    vsesSent: summary.vsesSent,
                    totalSold: summary.totalSold,
                    reverted: summary.reverted,
                    vsesReturned: summary.vsesReturned,
                    breakages: summary.breakages,
                    promoStock: summary.promoStock,
                    reimbursement: summary.reimbursement,
                    customerReturns: summary.customerReturns,
                    adjustmentsNet: summary.adjustmentsNet,
                    closingStock,
                    transactions: summary.transactions
                }
            })

            setInventoryData(processedData)
        } catch (error) {
            console.error('Error fetching inventory logs:', error)
            toast.error('Failed to load inventory log')
        } finally {
            setLoading(false)
        }
    }

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const filteredData = inventoryData.filter(product => product.transactions.length > 0)

    // Calculate Totals
    const totalOpeningStock = filteredData.reduce((acc, item) => acc + item.openingStock, 0)
    const totalClosingStock = filteredData.reduce((acc, item) => acc + item.closingStock, 0)
    const totalReverted = filteredData.reduce((acc, item) => acc + item.reverted, 0)

    const getTransactionIcon = (type: Transaction['type']) => {
        switch (type) {
            case 'supplier_receipt': return <ArrowDownLeft className="h-4 w-4 text-green-500" />
            case 'vse_return': return <ArrowDownLeft className="h-4 w-4 text-teal-500" />
            case 'customer_return': return <Undo2 className="h-4 w-4 text-blue-500" />
            case 'adjustment_increase': return <TrendingUp className="h-4 w-4 text-green-500" />
            case 'adjustment_decrease': return <TrendingDown className="h-4 w-4 text-red-500" />
            case 'promo_reimbursement': return <RefreshCcw className="h-4 w-4 text-blue-500" />
            case 'opening_stock': return <Package className="h-4 w-4 text-gray-500" />
            case 'breakage': return <XCircle className="h-4 w-4 text-red-500" />
            case 'promo_out': return <Gift className="h-4 w-4 text-purple-500" />
            default: return <ArrowUpRight className="h-4 w-4 text-gray-400" />
        }
    }

    return (
        <div className="space-y-6 relative">
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-lg min-h-[400px]">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Loading activity logs...</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Inventory Transactions Log</h2>
                <p className="text-muted-foreground">
                    Detailed view of inventory movements for each product.
                </p>
            </div>

            <div className="flex flex-col gap-4">
                {/* 1. Date Filter - Left Aligned */}
                <div className="flex justify-start">
                    <div className="flex flex-col space-y-2">
                        <span className="text-sm font-medium">Filter by Date</span>
                        <div className="flex items-center gap-2">
                            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-[240px] justify-start text-left font-normal",
                                            !date && "text-muted-foreground"
                                        )}
                                        onClick={() => setCalendarOpen(true)}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <DatePicker
                                        value={date}
                                        onChange={(newDate) => {
                                            setDate(newDate || new Date())
                                            setCalendarOpen(false)
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                            {date && (
                                <Button variant="ghost" onClick={() => setDate(new Date())}>
                                    Today
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Stats Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Opening Stock Value</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalOpeningStock.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Total units at start of day</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Closing Stock Value</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalClosingStock.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground">Total units at end of day</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* 3. Main Table */}
            <div className="rounded-md border bg-white dark:bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="min-w-[200px]">Product</TableHead>
                            <TableHead className="text-right">Opening Stock</TableHead>
                            <TableHead className="text-right text-green-600">Received</TableHead>
                            <TableHead className="text-right text-orange-600">VSEs Sent</TableHead>
                            <TableHead className="text-right">Total Sold</TableHead>
                            <TableHead className="text-right text-blue-600">VSEs Returned</TableHead>
                            <TableHead className="text-right text-blue-600">Returns</TableHead>
                            <TableHead className="text-right">Adjustments</TableHead>
                            <TableHead className="text-right text-red-600">Breakages</TableHead>
                            <TableHead className="text-right text-purple-600">Promo</TableHead>
                            <TableHead className="text-right text-green-600">Reimbursement</TableHead>
                            <TableHead className="text-right font-bold">Closing Stock</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 && !loading ? (
                            <TableRow>
                                <TableCell colSpan={13} className="h-24 text-center">
                                    No products found or no activity for this date.
                                </TableCell>
                            </TableRow>
                        ) : filteredData.map((product) => (
                            <div key={product.id} className="contents">
                                <TableRow
                                    className={cn("cursor-pointer hover:bg-muted/50 transition-colors border-b", expandedRows.has(product.id) && "bg-muted/30")}
                                    onClick={() => toggleRow(product.id)}
                                >
                                    <TableCell>
                                        {expandedRows.has(product.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </TableCell>
                                    <TableCell className="font-medium">{product.name}</TableCell>
                                    <TableCell className="text-right font-mono">{product.openingStock}</TableCell>
                                    <TableCell className="text-right font-mono text-green-600">+{product.totalReceived}</TableCell>
                                    <TableCell className="text-right font-mono text-orange-600">-{product.vsesSent}</TableCell>
                                    <TableCell className="text-right font-mono" title={product.reverted > 0 ? `Includes ${product.reverted} reverted (cancelled sales)` : undefined}>{fmtSigned(product.totalSold)}{product.reverted > 0 ? "*" : ""}</TableCell>
                                    <TableCell className="text-right font-mono text-blue-600">+{product.vsesReturned}</TableCell>
                                    <TableCell className="text-right font-mono text-blue-600">+{product.customerReturns}</TableCell>
                                    <TableCell className="text-right font-mono">{fmtSigned(product.adjustmentsNet)}</TableCell>
                                    <TableCell className="text-right font-mono text-red-600">-{product.breakages}</TableCell>
                                    <TableCell className="text-right font-mono text-purple-600">-{product.promoStock}</TableCell>
                                    <TableCell className="text-right font-mono text-green-600">+{product.reimbursement}</TableCell>
                                    <TableCell className="text-right font-mono font-bold bg-muted/20">{product.closingStock}</TableCell>
                                </TableRow>

                                {expandedRows.has(product.id) && (
                                    <TableRow className="bg-muted/10 hover:bg-muted/10 ring-1 ring-inset ring-muted/50">
                                        <TableCell colSpan={13} className="p-0">
                                            <div className="p-6 bg-slate-50 dark:bg-slate-900/50">
                                                <h4 className="mb-4 text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                                    <RefreshCcw className="h-4 w-4" />
                                                    Transaction History for {product.name}
                                                </h4>
                                                <div className="rounded-md border bg-background max-w-4xl">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-[100px]">Time</TableHead>
                                                                <TableHead className="w-[50px]"></TableHead>
                                                                <TableHead>Description</TableHead>
                                                                <TableHead className="text-right">Quantity</TableHead>
                                                                <TableHead className="text-right">Day Net</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {product.transactions.length === 0 ? (
                                                                <TableRow>
                                                                    <TableCell colSpan={5} className="h-12 text-center text-muted-foreground">
                                                                        No transactions recorded today.
                                                                    </TableCell>
                                                                </TableRow>
                                                            ) : product.transactions.map((tx) => (
                                                                <TableRow key={tx.id}>
                                                                    <TableCell className="font-mono text-xs text-muted-foreground">{tx.time}</TableCell>
                                                                    <TableCell>
                                                                        {getTransactionIcon(tx.type)}
                                                                    </TableCell>
                                                                    <TableCell className="capitalize">{tx.description}</TableCell>
                                                                    <TableCell className={cn(
                                                                        "text-right font-medium",
                                                                        tx.quantity > 0 ? "text-green-600" : "text-red-600"
                                                                    )}>
                                                                        {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-mono font-bold">{tx.balance}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </div>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {totalReverted > 0 && (
                <p className="text-xs text-muted-foreground italic">
                    * Total Sold is net of {totalReverted.toLocaleString()} reverted unit(s) from cancelled sales.
                </p>
            )}
        </div>
    )
}
