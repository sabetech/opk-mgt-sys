import { useState, useEffect } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Loader2, Eye, XCircle, CheckCircle } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { format } from "date-fns"

interface Order {
    id: number
    date_time: string
    total_amount: number
    status: 'pending' | 'approved' | 'cancelled'
    customer_id: number | null
    customers: {
        name: string
    } | null
    order_types: {
        name: string
    }
}

export default function Orders() {
    const [orders, setOrders] = useState<Order[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const navigate = useNavigate()

    const fetchOrders = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id, 
                    date_time, 
                    total_amount, 
                    status, 
                    customers(name), 
                    order_types(name)
                `)
                .order('date_time', { ascending: false })

            if (error) throw error
            setOrders(data as any || [])
        } catch (err) {
            console.error("Error fetching orders:", err)
            toast.error("Failed to load orders.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchOrders()
    }, [])

    const handleCancel = async (id: number) => {
        if (!confirm("Are you sure you want to cancel this order?")) return

        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'cancelled' })
                .eq('id', id)

            if (error) throw error
            toast.success("Order cancelled.")
            fetchOrders()
        } catch (err) {
            console.error("Error cancelling order:", err)
            toast.error("Failed to cancel order.")
        }
    }

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'approved': return 'bg-green-100 text-green-700 border-green-200'
            case 'cancelled': return 'bg-red-100 text-red-700 border-red-200'
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200'
            default: return ''
        }
    }

    const filteredOrders = orders.filter(order =>
        (order.customers?.name || "Walk-in").toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id.toString().includes(searchTerm)
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">POS Orders</h2>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search by Order ID or Customer..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Date & Time</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        <span>Loading orders...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredOrders.length > 0 ? (
                            filteredOrders.map((order) => (
                                <TableRow key={order.id}>
                                    <TableCell className="font-mono text-sm">#{order.id}</TableCell>
                                    <TableCell className="text-sm">
                                        {format(new Date(order.date_time), 'MMM dd, yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell className="font-medium">{order.customers?.name || "Walk-in"}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {order.order_types?.name}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-bold">
                                        GH₵ {order.total_amount.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={`capitalize py-0.5 ${getStatusStyle(order.status)}`} variant="outline">
                                            {order.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {order.status === 'pending' ? (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                                        onClick={() => navigate(`/dashboard/pos/orders/${order.id}`)}
                                                    >
                                                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                                        onClick={() => handleCancel(order.id)}
                                                    >
                                                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 shadow-none"
                                                    onClick={() => navigate(`/dashboard/pos/orders/${order.id}`)}
                                                >
                                                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground italic">
                                    No orders found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
