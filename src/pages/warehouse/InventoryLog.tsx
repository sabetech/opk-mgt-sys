import { useState } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Package, ArrowUpRight, ArrowDownLeft, XCircle, Gift, RefreshCcw } from "lucide-react"

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
    type: 'opening' | 'received' | 'sent_vse' | 'sold' | 'returned_vse' | 'breakage' | 'promo' | 'reimbursement'
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

// Mock Data Generation
const MOCK_INVENTORY: ProductInventory[] = [
    {
        id: "p1",
        name: "ABC Golden Lag 300ml RET 24*1",
        openingStock: 200,
        totalReceived: 50,
        vsesSent: 100,
        totalSold: 13, // 5 + 8
        vsesReturned: 0,
        breakages: 2,
        promoStock: 10,
        reimbursement: 10,
        closingStock: 135, // 200 + 50 - 100 - 13 - 2 - 10 + 10 = 135
        transactions: [
            { id: "t1", time: "08:00 AM", description: "Opening Stock", type: "opening", quantity: 200, balance: 200 },
            { id: "t2", time: "09:00 AM", description: "Received from Supplier", type: "received", quantity: 50, balance: 250 },
            { id: "t3", time: "10:00 AM", description: "Dispatched via VSEs", type: "sent_vse", quantity: -100, balance: 150 },
            { id: "t4", time: "10:14 AM", description: "Sold directly to Retailer", type: "sold", quantity: -5, balance: 145 },
            { id: "t5", time: "10:15 AM", description: "Breakages Reported", type: "breakage", quantity: -2, balance: 143 },
            { id: "t6", time: "10:30 AM", description: "Sold directly to Retailer", type: "sold", quantity: -8, balance: 135 },
            { id: "t7", time: "10:35 AM", description: "Set aside as Promo Stock", type: "promo", quantity: -10, balance: 125 },
            { id: "t8", time: "11:00 AM", description: "Reimbursement from Guinness Ghana", type: "reimbursement", quantity: 10, balance: 135 },
        ]
    },
    {
        id: "p2",
        name: "Guinness Foreign Extra Stout 330ml",
        openingStock: 500,
        totalReceived: 200,
        vsesSent: 300,
        totalSold: 50,
        vsesReturned: 20,
        breakages: 5,
        promoStock: 0,
        reimbursement: 0,
        closingStock: 365,
        transactions: [
            { id: "t1", time: "08:00 AM", description: "Opening Stock", type: "opening", quantity: 500, balance: 500 },
            { id: "t2", time: "09:30 AM", description: "Received from Supplier", type: "received", quantity: 200, balance: 700 },
            { id: "t3", time: "10:00 AM", description: "Dispatched via VSEs", type: "sent_vse", quantity: -300, balance: 400 },
            { id: "t4", time: "12:00 PM", description: "Returns from VSE", type: "returned_vse", quantity: 20, balance: 420 },
            { id: "t5", time: "02:00 PM", description: "Bulk Sale", type: "sold", quantity: -50, balance: 370 },
            { id: "t6", time: "04:00 PM", description: "Breakages in Warehouse", type: "breakage", quantity: -5, balance: 365 },
        ]
    }
]

export default function InventoryLog() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const filteredData = date ? MOCK_INVENTORY : MOCK_INVENTORY // Mock logic: ideally filter by date

    // Calculate Totals
    const totalOpeningStock = filteredData.reduce((acc, item) => acc + item.openingStock, 0)
    const totalClosingStock = filteredData.reduce((acc, item) => acc + item.closingStock, 0)

    const getTransactionIcon = (type: Transaction['type']) => {
        switch (type) {
            case 'received': return <ArrowDownLeft className="h-4 w-4 text-green-500" />
            case 'reimbursement': return <RefreshCcw className="h-4 w-4 text-blue-500" />
            case 'returned_vse': return <ArrowDownLeft className="h-4 w-4 text-orange-500" />
            case 'opening': return <Package className="h-4 w-4 text-gray-500" />
            case 'breakage': return <XCircle className="h-4 w-4 text-red-500" />
            case 'promo': return <Gift className="h-4 w-4 text-purple-500" />
            default: return <ArrowUpRight className="h-4 w-4 text-gray-400" />
        }
    }

    return (
        <div className="space-y-6">
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
                                            setDate(newDate)
                                            setCalendarOpen(false)
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                            {date && (
                                <Button variant="ghost" onClick={() => setDate(undefined)}>
                                    Clear
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
                        {filteredData.map((product) => (
                            <>
                                <TableRow
                                    key={product.id}
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
                                                            {product.transactions.map((tx) => (
                                                                <TableRow key={tx.id}>
                                                                    <TableCell className="font-mono text-xs text-muted-foreground">{tx.time}</TableCell>
                                                                    <TableCell>
                                                                        {getTransactionIcon(tx.type)}
                                                                    </TableCell>
                                                                    <TableCell>{tx.description}</TableCell>
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
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
