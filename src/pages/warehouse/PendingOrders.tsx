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
import { Search } from "lucide-react"

import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { toast } from "sonner"
import { useNavigate } from "react-router-dom"

// Types
interface OrderItem {
    id: string
    product_id: string
    quantity: number
    products: {
        sku_name: string
        code_name: string
        product_code: string | null
        returnable: boolean
    } | null
}

interface Order {
    id: string
    order_id: string
    order_number?: number
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
    warehouse_order_items: OrderItem[]
}

const ITEMS_PER_PAGE = 20

export default function PendingOrders() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const navigate = useNavigate()

    // Fetch warehouse orders from PocketBase
    const fetchOrders = async () => {
        setLoading(true)
        try {
            const data = await pb.collection('warehouse_orders').getFullList({
                filter: 'status = "pending"',
                sort: '-id',
                expand: 'order_id.customer_id,order_id.order_type_id',
            })

            const whOrderIds = data.map((w) => w.id)
            const itemsData = whOrderIds.length > 0
                ? await pb.collection('warehouse_order_items').getFullList({
                    filter: whOrderIds.map(id => `warehouse_order_id = "${id}"`).join(' || '),
                    expand: 'product_id',
                })
                : []

            const itemsByWhOrder: Record<string, OrderItem[]> = {}
            for (const item of itemsData) {
                const rel = item.expand?.product_id
                const shapedItem: OrderItem = {
                    id: item.id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    products: rel
                        ? { sku_name: rel.sku_name, code_name: rel.code_name, product_code: rel.product_code ?? null, returnable: rel.returnable }
                        : null,
                }
                if (!itemsByWhOrder[item.warehouse_order_id]) {
                    itemsByWhOrder[item.warehouse_order_id] = []
                }
                itemsByWhOrder[item.warehouse_order_id].push(shapedItem)
            }

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
                    warehouse_order_items: itemsByWhOrder[w.id] || [],
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

    // Filter orders (match the POS order number, not the internal record id)
    const filteredOrders = orders.filter(order =>
        (order.orders?.customers?.name || "Walk-in").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.orders?.order_type?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order.order_number ?? order.order_id).toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Pagination
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

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
                        placeholder="Search by order #, customer..."
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
                            <TableHead>Order #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedOrders.length > 0 ? (
                            paginatedOrders.map((order) => (
                                <TableRow
                                    key={order.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => navigate(`/dashboard/warehouse/pending-orders/${order.id}`)}
                                >
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
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
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