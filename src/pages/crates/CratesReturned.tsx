import React, { useState, useEffect } from "react"
import { Calendar as CalendarIcon, Edit, Trash2, ChevronDown, ChevronUp, Loader2, Package } from "lucide-react"
import type { Range, RangeKeyDict } from "react-date-range"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
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
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

interface ProductBreakdown {
    productName: string
    quantity: number
}

interface CrateReturn {
    id: number
    date: string
    quantityReturned: number
    vehicleNumber: string
    returnedBy: string
    products: ProductBreakdown[]
}

export default function CratesReturned() {
    const { profile } = useAuth()
    const [returns, setReturns] = useState<CrateReturn[]>([])
    const [totalStock, setTotalStock] = useState(0)
    const [loading, setLoading] = useState(true)
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
            endDate: new Date(),
            key: 'selection'
        }
    ])
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

    const fetchData = async () => {
        setLoading(true)
        try {
            const startDate = dateRange[0].startDate?.toISOString().split('T')[0]
            const endDate = dateRange[0].endDate?.toISOString().split('T')[0]

            // 1. Fetch Returns (empties_log)
            let query = supabase
                .from('empties_log')
                .select(`
                    id,
                    date,
                    total_quantity,
                    vehicle_no,
                    returned_by,
                    empties_log_detail (
                        quantity,
                        products (sku_name)
                    )
                `)
                .eq('activity', 'empties_to_supplier')
                .order('date', { ascending: false })

            if (startDate) query = query.gte('date', startDate)
            if (endDate) query = query.lte('date', endDate)

            const { data: logsData, error: logsError } = await query

            if (logsError) throw logsError

            const transformedReturns: CrateReturn[] = (logsData || []).map(log => ({
                id: log.id,
                date: log.date,
                quantityReturned: log.total_quantity,
                vehicleNumber: log.vehicle_no || "N/A",
                returnedBy: log.returned_by || "N/A",
                products: (log.empties_log_detail as any[] || []).map(detail => ({
                    productName: detail.products?.sku_name || "Unknown",
                    quantity: detail.quantity
                }))
            }))

            setReturns(transformedReturns)

            // 2. Fetch Total Stock (for the "Crates Remaining" stat)
            const { data: stockData, error: stockError } = await supabase
                .from('warehouse_stock')
                .select('quantity')

            if (stockError) throw stockError
            const total = stockData.reduce((sum, item) => sum + item.quantity, 0)
            setTotalStock(total)

        } catch (error: any) {
            console.error("Error fetching data:", error)
            toast.error("Failed to load records")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [dateRange])

    const toggleRow = (id: number) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const handleEdit = (_id: number) => {
        toast.info("Edit functionality coming soon")
    }

    const handleDelete = async (id: number) => {
        if (!confirm(`Are you sure you want to delete return record #${id}?`)) return

        try {
            const { error } = await supabase
                .from('empties_log')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success("Record deleted")
            fetchData()
        } catch (error: any) {
            console.error("Error deleting record:", error)
            toast.error(error.message || "Failed to delete")
        }
    }

    const handleDateRangeChange = (ranges: RangeKeyDict) => {
        setDateRange([ranges.selection as Range])
    }

    // Stats
    const totalReturned = returns.reduce((sum, r) => sum + r.quantityReturned, 0)
    const cratesRemaining = totalStock

    const selectedRange = dateRange[0]
    const hasDateRange = selectedRange && selectedRange.startDate && selectedRange.endDate

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Crates Returned</h2>
                <p className="text-muted-foreground">
                    Track crates returned by customers to OPK
                </p>
            </div>

            {/* Date Range Selector */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Select Date Range</label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full md:w-[300px] justify-start text-left font-normal",
                                !hasDateRange && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {hasDateRange ? (
                                <>
                                    {selectedRange.startDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} -{" "}
                                    {selectedRange.endDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </>
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <DateRangePicker
                            value={dateRange}
                            onChange={handleDateRangeChange}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Crates Returned
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReturned.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            In selected period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Crates Remaining
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cratesRemaining.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Current inventory
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
                            <TableHead>Quantity Returned</TableHead>
                            <TableHead>Vehicle Number</TableHead>
                            <TableHead>Returned By</TableHead>
                            {profile?.role !== 'auditor' && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-40 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">Loading records...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : returns.length > 0 ? (
                            returns.map((returnRecord) => (
                                <React.Fragment key={returnRecord.id}>
                                    <TableRow
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => toggleRow(returnRecord.id)}
                                    >
                                        <TableCell>
                                            {expandedRows.has(returnRecord.id) ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {new Date(returnRecord.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Package className="h-3 w-3 text-muted-foreground" />
                                                {returnRecord.quantityReturned}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm lowercase">
                                            {returnRecord.vehicleNumber}
                                        </TableCell>
                                        <TableCell>{returnRecord.returnedBy}</TableCell>
                                        {profile?.role !== 'auditor' && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleEdit(returnRecord.id)
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-danger hover:text-danger hover:bg-red-50"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDelete(returnRecord.id)
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                    {expandedRows.has(returnRecord.id) && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="bg-muted/30 p-0 overflow-hidden">
                                                <div className="p-4 animate-in slide-in-from-top-2">
                                                    <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                        <Package className="h-3 w-3" />
                                                        Product Breakdown
                                                    </h4>
                                                    <div className="rounded-md border bg-background shadow-sm overflow-hidden">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow className="bg-muted/50">
                                                                    <TableHead className="h-9">Product Name</TableHead>
                                                                    <TableHead className="text-right h-9">Quantity</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {returnRecord.products.map((product, idx) => (
                                                                    <TableRow key={idx}>
                                                                        <TableCell className="py-2 text-sm font-medium">
                                                                            {product.productName}
                                                                        </TableCell>
                                                                        <TableCell className="text-right py-2 font-bold font-mono">
                                                                            {product.quantity}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                                    No records found for the selected period.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
