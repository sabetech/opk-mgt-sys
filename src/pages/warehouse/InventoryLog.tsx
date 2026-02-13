import { supabase } from "@/lib/supabase"
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
    Loader2
} from "lucide-react"

import { cn } from "@/lib/utils"
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
type Transaction = {
    id: string
    time: string
    description: string
    type: 'supplier_receipt' | 'vse_loadout' | 'retail_sale' | 'wholesale_sale' | 'breakage' | 'promo_out' | 'promo_reimbursement' | 'opening_stock'
    quantity: number
    balance: number
}

type ProductInventory = {
    id: string
    name: string
    openingStock: number
    totalReceived: number
    vsesSent: number
    totalSold: number
    vsesReturned: number
    breakages: number
    promoStock: number
    reimbursement: number
    closingStock: number
    transactions: Transaction[]
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
            const { data: products, error: prodError } = await supabase
                .from('products')
                .select('id, sku_name')
                .is('deleted_at', null)
                .order('sku_name', { ascending: true })

            if (prodError) throw prodError

            // 2. Fetch logs for the selected date
            const { data: logs, error: logsError } = await supabase
                .from('inventory_logs')
                .select('*')
                .eq('date', dateStr)
                .order('created_at', { ascending: true })

            if (logsError) throw logsError

            // 3. Process data
            const processedData: ProductInventory[] = (products || []).map(product => {
                const productLogs = (logs || []).filter((l: any) => l.product_id === product.id)

                let openingStock = 0
                let totalReceived = 0
                let vsesSent = 0
                let totalSold = 0
                let vsesReturned = 0
                let breakages = 0
                let promoStock = 0
                let reimbursement = 0

                const transactions: Transaction[] = []
                let runningBalance = 0

                productLogs.forEach((log: any) => {
                    const qty = log.quantity
                    runningBalance += qty

                    if (log.type === 'opening_stock') openingStock += qty
                    else if (log.type === 'supplier_receipt') totalReceived += qty
                    else if (log.type === 'vse_loadout') vsesSent += Math.abs(qty)
                    else if (log.type === 'retail_sale' || log.type === 'wholesale_sale') totalSold += Math.abs(qty)
                    else if (log.type === 'breakage') breakages += Math.abs(qty)
                    else if (log.type === 'promo_out') promoStock += Math.abs(qty)
                    else if (log.type === 'promo_reimbursement') reimbursement += qty

                    transactions.push({
                        id: log.id.toString(),
                        time: format(new Date(log.created_at), "hh:mm a"),
                        description: log.description || log.type.replace(/_/g, ' '),
                        type: log.type as Transaction['type'],
                        quantity: qty,
                        balance: runningBalance
                    })
                })

                return {
                    id: product.id.toString(),
                    name: product.sku_name,
                    openingStock,
                    totalReceived,
                    vsesSent,
                    totalSold,
                    vsesReturned,
                    breakages,
                    promoStock,
                    reimbursement,
                    closingStock: runningBalance,
                    transactions
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

    const getTransactionIcon = (type: Transaction['type']) => {
        switch (type) {
            case 'supplier_receipt': return <ArrowDownLeft className="h-4 w-4 text-green-500" />
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
                            <TableHead className="text-right text-red-600">Breakages</TableHead>
                            <TableHead className="text-right text-purple-600">Promo</TableHead>
                            <TableHead className="text-right text-green-600">Reimbursement</TableHead>
                            <TableHead className="text-right font-bold">Closing Stock</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length === 0 && !loading ? (
                            <TableRow>
                                <TableCell colSpan={11} className="h-24 text-center">
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
                                    <TableCell className="text-right font-mono">-{product.totalSold}</TableCell>
                                    <TableCell className="text-right font-mono text-blue-600">+{product.vsesReturned}</TableCell>
                                    <TableCell className="text-right font-mono text-red-600">-{product.breakages}</TableCell>
                                    <TableCell className="text-right font-mono text-purple-600">-{product.promoStock}</TableCell>
                                    <TableCell className="text-right font-mono text-green-600">+{product.reimbursement}</TableCell>
                                    <TableCell className="text-right font-mono font-bold bg-muted/20">{product.closingStock}</TableCell>
                                </TableRow>

                                {expandedRows.has(product.id) && (
                                    <TableRow className="bg-muted/10 hover:bg-muted/10 ring-1 ring-inset ring-muted/50">
                                        <TableCell colSpan={11} className="p-0">
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
                                                                <TableHead className="text-right">Balance</TableHead>
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
        </div>
    )
}
