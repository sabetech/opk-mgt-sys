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

// Types
interface Order {
    id: string
    orderID: string
    date: string
    customer: string
    status: "pending" | "approved" | "cancelled"
}

// Mock data
const mockOrders: Order[] = [
    { id: "1", orderID: "ORD-2024-001", date: "2024-01-15", customer: "John's Store", status: "pending" },
    { id: "2", orderID: "ORD-2024-002", date: "2024-01-15", customer: "Mary's Shop", status: "pending" },
    { id: "3", orderID: "ORD-2024-003", date: "2024-01-14", customer: "Bob's Market", status: "approved" },
    { id: "4", orderID: "ORD-2024-004", date: "2024-01-14", customer: "Alice Retail", status: "pending" },
    { id: "5", orderID: "ORD-2024-005", date: "2024-01-13", customer: "Charlie's Store", status: "cancelled" },
    { id: "6", orderID: "ORD-2024-006", date: "2024-01-13", customer: "Diana Shop", status: "pending" },
    { id: "7", orderID: "ORD-2024-007", date: "2024-01-12", customer: "Evan Market", status: "approved" },
    { id: "8", orderID: "ORD-2024-008", date: "2024-01-12", customer: "Fiona Retail", status: "pending" },
    { id: "9", orderID: "ORD-2024-009", date: "2024-01-11", customer: "George Store", status: "pending" },
    { id: "10", orderID: "ORD-2024-010", date: "2024-01-11", customer: "Hannah Shop", status: "cancelled" },
    { id: "11", orderID: "ORD-2024-011", date: "2024-01-10", customer: "Ian Market", status: "pending" },
    { id: "12", orderID: "ORD-2024-012", date: "2024-01-10", customer: "Julia Retail", status: "approved" },
]

const ITEMS_PER_PAGE = 20

export default function PendingOrders() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)

    // Fetch orders (using mock data for now)
    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true)
            // Simulate API call
            setTimeout(() => {
                setOrders(mockOrders)
                setLoading(false)
            }, 500)
        }
        fetchOrders()
    }, [])

    // Filter orders
    const filteredOrders = orders.filter(order =>
        order.orderID.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.status.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Pagination
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    // Handle approve order
    const handleApproveOrder = (orderId: string) => {
        setOrders(prev => prev.map(order =>
            order.id === orderId ? { ...order, status: "approved" as const } : order
        ))
        alert("✅ Order approved successfully!")
    }

    // Handle cancel order
    const handleCancelOrder = (orderId: string) => {
        if (confirm("Are you sure you want to cancel this order?")) {
            setOrders(prev => prev.map(order =>
                order.id === orderId ? { ...order, status: "cancelled" as const } : order
            ))
            alert("✅ Order cancelled successfully!")
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
            case "approved":
                return "default"
            case "cancelled":
                return "destructive"
            default:
                return "outline"
        }
    }

    // Format date
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString()
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
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedOrders.length > 0 ? (
                            paginatedOrders.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-medium">{order.orderID}</TableCell>
                                    <TableCell>{formatDate(order.date)}</TableCell>
                                    <TableCell>{order.customer}</TableCell>
                                    <TableCell>
                                        <Badge variant={getStatusBadgeVariant(order.status)}>
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </Badge>
                                    </TableCell>
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
                                                            onClick={() => handleCancelOrder(order.id)}
                                                            className="text-red-600"
                                                        >
                                                            Cancel Order
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                                {order.status === "approved" && (
                                                    <DropdownMenuItem disabled>
                                                        Order Already Approved
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
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
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