import { useState, useEffect } from "react"
import React from "react"
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
import { Search, Calendar, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { RangeKeyDict, Range } from "react-date-range"

import { supabase } from "@/lib/supabase"
import { format } from "date-fns"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

// Types
interface OrderItem {
    id: number
    product_id: number
    quantity: number
    unit_price: number
    sub_total: number
    products: {
        sku_name: string
        code_name: string
        returnable: boolean
    } | null
}

interface CompletedOrder {
    id: number
    order_id: number
    status: string
    orders: {
        id: number
        date_time: string
        total_amount: number
        payment_type: string
        customers: {
            name: string
        } | null
    } | null
    warehouse_order_items: OrderItem[]
}

const ITEMS_PER_PAGE = 20

export default function CompletedOrders() {
    const [orders, setOrders] = useState<CompletedOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const navigate = useNavigate()
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // 30 days ago
            endDate: new Date(),
            key: 'selection'
        }
    ])
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

    // Fetch approved orders from Supabase
    const fetchOrders = async () => {
        setLoading(true)
        try {
            const startDateStr = dateRange[0].startDate?.toISOString() || ""
            const endDateStr = dateRange[0].endDate?.toISOString() || ""

            const { data, error } = await supabase
                .from('warehouse_orders')
                .select(`
                    id, 
                    order_id,
                    status, 
                    orders(
                        id,
                        date_time, 
                        total_amount, 
                        status, 
                        payment_type,
                        customers(name)
                    ),
                    warehouse_order_items (
                        id,
                        product_id,
                        quantity,
                        products (
                            sku_name,
                            code_name,
                            returnable
                        )
                    )
                `)
                .eq('status', 'ready')
                .gte('orders.date_time', startDateStr)
                .lte('orders.date_time', endDateStr)
                .order('created_at', { ascending: false })

            if (error) throw error
            setOrders(data as any || [])
        } catch (err) {
            console.error("Error fetching completed orders:", err)
            toast.error("Failed to load completed orders")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchOrders()
    }, [dateRange])

    // Filter orders based on search and date range
    const filteredOrders = orders.filter(order => {
        const matchesSearch =
            order.order_id.toString().includes(searchTerm) ||
            (order.orders?.customers?.name || "Walk-in").toLowerCase().includes(searchTerm.toLowerCase())

        return matchesSearch
    })

    // Pagination
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    // Handle row expand/collapse
    const toggleRowExpansion = (orderId: number) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev)
            if (newSet.has(orderId)) {
                newSet.delete(orderId)
            } else {
                newSet.add(orderId)
            }
            return newSet
        })
    }

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, dateRange])

    // Get status badge variant
    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case "approved":
                return "default"
            case "pending":
                return "outline"
            case "cancelled":
                return "destructive"
            default:
                return "outline"
        }
    }

    // Format date
    const formatDate = (dateString: string) => {
        return format(new Date(dateString), 'MMM dd, yyyy HH:mm')
    }

    // Format currency
    const formatCurrency = (amount: number) => {
        return `GH₵ ${amount.toFixed(2)}`
    }

    // Format date range for display
    const formatDateRangeDisplay = () => {
        const selectedRange = dateRange[0]
        if (!selectedRange?.startDate) return "Select date range"

        const start = new Date(selectedRange.startDate).toLocaleDateString()
        if (!selectedRange?.endDate) return start

        const end = new Date(selectedRange.endDate).toLocaleDateString()
        return start === end ? start : `${start} - ${end}`
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Completed Orders</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <p>Loading orders...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Completed Orders</h2>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search orders..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Date Range Picker */}
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

            {/* Orders Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedOrders.length > 0 ? (
                            paginatedOrders.map((order) => (
                                <React.Fragment key={order.id}>
                                    <TableRow>
                                        <TableCell className="font-medium">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 mr-2"
                                                onClick={() => toggleRowExpansion(order.id)}
                                            >
                                                {expandedRows.has(order.id) ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                            </Button>
                                            #{order.order_id}
                                        </TableCell>
                                        <TableCell>{formatDate(order.orders?.date_time || new Date().toISOString())}</TableCell>
                                        <TableCell>{order.orders?.customers?.name || "Walk-in"}</TableCell>
                                        <TableCell className="font-medium">{formatCurrency(order.orders?.total_amount || 0)}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStatusBadgeVariant(order.status)}>
                                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{order.warehouse_order_items?.length || 0}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => navigate(`/dashboard/pos/orders/${order.order_id}`)}>
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => alert("Printing...")}>
                                                        Print Order
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                    {expandedRows.has(order.id) && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="bg-gray-50 dark:bg-muted/20 p-4">
                                                <div className="space-y-4">
                                                    <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Order Items</h4>
                                                    <div className="rounded-md border bg-white dark:bg-card">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead className="w-[100px]">Code</TableHead>
                                                                    <TableHead>Product</TableHead>
                                                                    <TableHead className="text-right">Qty</TableHead>
                                                                    <TableHead className="text-right">Total</TableHead>
                                                                    <TableHead>Returnable</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {order.warehouse_order_items?.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell className="font-mono text-xs">{item.products?.code_name}</TableCell>
                                                                        <TableCell>{item.products?.sku_name}</TableCell>
                                                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                                                        <TableCell className="text-right font-medium">---</TableCell>
                                                                        <TableCell>
                                                                            <Badge variant={item.products?.returnable ? "default" : "outline"}>
                                                                                {item.products?.returnable ? "Yes" : "No"}
                                                                            </Badge>
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
                                <TableCell colSpan={7} className="h-24 text-center">
                                    No completed orders found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {
                totalPages > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Showing {startIndex + 1} to {endIndex} of {totalItems} orders
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
                )
            }
        </div>
    )
}