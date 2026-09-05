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
import { Search, MoreHorizontal } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

// Types
interface Order {
    id: string
    order_id: string
    status: "pending" | "ready" | "cancelled"
    orders: {
        total_amount: number
        date_time: string
        customers: {
            name: string
        } | null
        order_type: {
            name: string
        } | null
    } | null
}

const ITEMS_PER_PAGE = 20

export default function PendingOrders() {
    const { profile } = useAuth()
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)

    // Fetch warehouse orders from PocketBase
    const fetchOrders = async () => {
        setLoading(true)
        try {
            const data = await pb.collection('warehouse_orders').getFullList({
                filter: 'status = "pending"',
                sort: '-id',
                expand: 'order_id.customer_id,order_id.order_type_id',
            })

            const shaped = data.map((w) => {
                const order = w.expand?.order_id ?? null
                return {
                    id: w.id,
                    order_id: w.order_id,
                    order_number: order?.order_number ?? null,
                    status: w.status,
                    orders: order
                        ? {
                            total_amount: order.total_amount,
                            date_time: order.date_time,
                            customers: order.expand?.customer_id ?? null,
                            order_type: order.expand?.order_type_id ?? null,
                        }
                        : null,
                }
            })
            setOrders(shaped)
        } catch (err) {
            console.error("Error fetching pending warehouse orders:", err)
            toast.error("Failed to load pending warehouse orders")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchOrders()
    }, [])

    // Filter orders
    const filteredOrders = orders.filter(order =>
        (order.orders?.customers?.name || "Walk-in").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.orders?.order_type?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.order_id.toString().includes(searchTerm)
    )

    // Pagination
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    // Handle approve order (mark as ready for fulfilment)
    const handleApproveOrder = async (orderId: string) => {
        try {
            await pb.collection('warehouse_orders').update(orderId, { status: 'ready' })
            toast.success("Order marked as ready for fulfilment!")
            fetchOrders()
        } catch (err) {
            console.error("Error approving warehouse order:", err)
            toast.error("Failed to approve order")
        }
    }

    // Handle cancel order (revert sale)
    const handleCancelOrder = async (warehouseOrderId: string, posOrderId: string) => {
        const confirmed = confirm(
            "ARE YOU SURE? Cancelling this warehouse order will REVERT the entire POS sale. The customer must be refunded."
        )

        if (confirmed) {
            try {
                // 1. Fetch warehouse order items to restore stock
                const whItems = await pb.collection('warehouse_order_items').getFullList({
                    filter: `warehouse_order_id = "${warehouseOrderId}"`,
                    fields: 'product_id, quantity',
                })

                // 2. Determine sale type from POS order's customer
                const posOrder = await pb.collection('orders').getOne(posOrderId, {
                    fields: 'customer_id',
                }).catch(() => null)
                const customer = posOrder?.customer_id
                    ? await pb.collection('customers').getOne(posOrder.customer_id, {
                        expand: 'type_id',
                        fields: 'id, name, type_id',
                    }).catch(() => null)
                    : null
                const saleType = customer?.expand?.type_id?.name === 'Wholesaler'
                    ? 'wholesale_sale'
                    : 'retail_sale'

                // 3. Restore stock and log reversal for each item
                const today = new Date().toISOString().split('T')[0]
                for (const item of whItems) {
                    if (!item.product_id) continue
                    const stock = await pb.collection('warehouse_stock')
                        .getFirstListItem(`product_id = "${item.product_id}"`, { fields: 'id, quantity' })
                        .catch(() => null)
                    if (stock) {
                        await pb.collection('warehouse_stock').update(stock.id, {
                            quantity: (stock.quantity || 0) + item.quantity,
                        })
                    }
                    await pb.collection('inventory_logs').create({
                        date: today,
                        product_id: item.product_id,
                        type: saleType,
                        quantity: item.quantity,
                        reference_id: posOrderId,
                        reference_table: 'orders',
                        description: `Sale reverted - ${customer?.name || 'Walk-in'}`,
                    })
                }

                // 4. Cancel Warehouse Order
                await pb.collection('warehouse_orders').update(warehouseOrderId, { status: 'cancelled' })

                // 5. Cancel POS Order (Revert Sale)
                await pb.collection('orders').update(posOrderId, { status: 'cancelled' })

                toast.success("Sale reverted and warehouse order cancelled.")
                fetchOrders()
            } catch (err) {
                console.error("Error reverting sale:", err)
                toast.error("Failed to revert sale")
            }
        }
    }

    // Reset pagination when search changes
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm])

    // Get status badge variant
    const getStatusBadgeVariant = (status: Order["status"]) => {
        switch (status) {
            case "pending":
                return "outline"
            case "ready":
                return "default"
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

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Pending Orders</h1>
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
                <h2 className="text-3xl font-bold tracking-tight">Pending Orders</h2>
            </div>

            {/* Search */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
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
            </div>

            {/* Orders Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Status</TableHead>
                            {profile?.role !== 'auditor' && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedOrders.length > 0 ? (
                            paginatedOrders.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-mono text-xs">#{order.order_number ?? order.order_id}</TableCell>
                                    <TableCell>{formatDate(order.orders?.date_time || new Date().toISOString())}</TableCell>
                                    <TableCell className="font-medium">{order.orders?.customers?.name || "Walk-in"}</TableCell>
                                    <TableCell>{order.orders?.order_type?.name || "—"}</TableCell>
                                    <TableCell className="font-bold">GH₵ {order.orders?.total_amount.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusBadgeVariant(order.status)}>
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </Badge>
                                    </TableCell>
                                    {profile?.role !== 'auditor' && (
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {order.status === "pending" && (
                                                        <>
                                                            <DropdownMenuItem onClick={() => handleApproveOrder(order.id)}>
                                                                Approve Order
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => handleCancelOrder(order.id, order.order_id)}
                                                                className="text-red-600"
                                                            >
                                                                Cancel Order
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {order.status === "ready" && (
                                                        <DropdownMenuItem disabled>
                                                            Ready for Fulfilment
                                                        </DropdownMenuItem>
                                                    )}
                                                    {order.status === "cancelled" && (
                                                        <DropdownMenuItem disabled>
                                                            Order Cancelled
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={profile?.role !== 'auditor' ? 7 : 6} className="h-24 text-center">
                                    No orders found.
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
            )}
        </div>
    )
}