import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Package, Loader2, Maximize2 } from "lucide-react"

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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import React from "react"

// Types based on DB schema
interface ProductItem {
    id: number
    qty: number
    products: {
        sku_name: string
    }
}

interface ReceivableRecord {
    id: number
    date: string
    purchase_order_number: string
    received_by: string
    delivered_by: string
    vehicle_no: string
    num_of_pallets: number
    num_of_pcs: number
    purchase_order_img_url: string | null
    inventory_receivable_items: ProductItem[]
}

export default function ReceivablesLog() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

    // Data State
    const [receivables, setReceivables] = useState<ReceivableRecord[]>([])
    const [loading, setLoading] = useState(true)

    // Image Viewer State
    const [viewerImage, setViewerImage] = useState<string | null>(null)
    const [isViewerOpen, setIsViewerOpen] = useState(false)

    useEffect(() => {
        fetchReceivables()
    }, [])

    const fetchReceivables = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('inventory_receivables')
                .select(`
                    *,
                    inventory_receivable_items (
                        id,
                        qty,
                        products (
                            sku_name
                        )
                    )
                `)
                .order('date', { ascending: false })

            if (error) throw error
            setReceivables(data as any || [])
        } catch (error) {
            console.error('Error fetching receivables:', error)
            toast.error('Failed to load receivables log')
        } finally {
            setLoading(false)
        }
    }

    const toggleRow = (id: number) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const openViewer = (url: string) => {
        setViewerImage(url)
        setIsViewerOpen(true)
    }

    // Filter logic
    const filteredData = date
        ? receivables.filter(item => item.date === format(date, 'yyyy-MM-dd'))
        : receivables

    const totalProducts = filteredData.reduce((acc, order) => {
        return acc + order.inventory_receivable_items.reduce((pAcc, p) => pAcc + p.qty, 0)
    }, 0)

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground font-medium">Loading records...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Receivables Log</h2>
                <p className="text-muted-foreground">
                    Track products received from GGBL using Purchase Orders.
                </p>
            </div>

            {/* Controls & Stats */}
            <div className="flex flex-col gap-4">
                {/* Date Filter */}
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

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Products Received
                            </CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{totalProducts}</div>
                            <p className="text-xs text-muted-foreground">
                                From GGBL {date ? `on ${format(date, 'PPP')}` : '(All Time)'}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Received By</TableHead>
                            <TableHead className="text-right">Total Qty</TableHead>
                            <TableHead className="text-right">PO Image</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredData.length > 0 ? (
                            filteredData.map((order) => (
                                <React.Fragment key={order.id}>
                                    <TableRow
                                        className={cn("cursor-pointer hover:bg-muted/50 transition-colors", expandedRows.has(order.id) && "bg-muted/50")}
                                        onClick={() => toggleRow(order.id)}
                                    >
                                        <TableCell>
                                            {expandedRows.has(order.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </TableCell>
                                        <TableCell className="font-medium">{order.purchase_order_number}</TableCell>
                                        <TableCell>{format(new Date(order.date), "dd MMM yyyy")}</TableCell>
                                        <TableCell>{order.received_by}</TableCell>
                                        <TableCell className="text-right">
                                            {order.inventory_receivable_items.reduce((acc, p) => acc + p.qty, 0)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {order.purchase_order_img_url ? (
                                                <div
                                                    className="inline-block relative group cursor-zoom-in"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openViewer(order.purchase_order_img_url!)
                                                    }}
                                                >
                                                    <img
                                                        src={order.purchase_order_img_url}
                                                        alt="PO Thumbnail"
                                                        className="h-10 w-10 object-cover rounded border border-muted group-hover:opacity-80 transition-opacity"
                                                    />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Maximize2 className="h-4 w-4 text-white drop-shadow-md" />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs italic">No Image</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    {expandedRows.has(order.id) && (
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            <TableCell colSpan={6} className="p-0">
                                                <div className="p-4 pl-12 bg-muted/30">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                        <div className="text-xs">
                                                            <span className="text-muted-foreground block">Delivered By:</span>
                                                            <span className="font-semibold">{order.delivered_by}</span>
                                                        </div>
                                                        <div className="text-xs">
                                                            <span className="text-muted-foreground block">Vehicle Number:</span>
                                                            <span className="font-semibold">{order.vehicle_no}</span>
                                                        </div>
                                                        <div className="text-xs">
                                                            <span className="text-muted-foreground block">Pallets / PCs:</span>
                                                            <span className="font-semibold">{order.num_of_pallets} / {order.num_of_pcs}</span>
                                                        </div>
                                                    </div>

                                                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Product Breakdown</h4>
                                                    <div className="rounded-md border bg-background overflow-hidden max-w-2xl">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow className="bg-muted/20">
                                                                    <TableHead className="h-8">Product Name</TableHead>
                                                                    <TableHead className="h-8 text-right">Quantity</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {order.inventory_receivable_items.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell className="py-2">{item.products?.sku_name || 'Unknown Product'}</TableCell>
                                                                        <TableCell className="py-2 text-right font-medium">{item.qty}</TableCell>
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
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No records found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Image Viewer Dialog */}
            <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
                <DialogContent className="max-w-4xl w-[95vw] h-auto max-h-[90vh] p-1 overflow-hidden">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Purchase Order Image</DialogTitle>
                    </DialogHeader>
                    <div className="relative w-full h-full flex items-center justify-center bg-black/5 rounded-lg overflow-hidden">
                        {viewerImage && (
                            <img
                                src={viewerImage}
                                alt="Purchase Order Full"
                                className="w-full h-auto max-h-[85vh] object-contain cursor-default"
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
