import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter
} from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    ChevronLeft,
    Loader2,
    CheckCircle2,
    Calendar,
    User,
    CreditCard,
    DollarSign,
    Package
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { useAuth } from "@/context/AuthContext"

interface OrderDetail {
    id: number
    date_time: string
    total_amount: number
    amount_tendered: number
    payment_type: string
    status: 'pending' | 'approved' | 'cancelled'
    customers: {
        name: string
        phone: string | null
    } | null
    order_types: {
        name: string
    }
}

interface SaleItem {
    id: number
    quantity: number
    unit_price: number
    sub_total: number
    discount: number
    products: {
        id: number
        sku_name: string
        code_name: string
    } | null
}

export default function OrderDetails() {
    const { profile } = useAuth()
    const { id } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState<OrderDetail | null>(null)
    const [items, setItems] = useState<SaleItem[]>([])
    const [loading, setLoading] = useState(true)
    const [approving, setApproving] = useState(false)
    const [amountTendered, setAmountTendered] = useState<string>("")

    useEffect(() => {
        const fetchOrderDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                // Fetch Order Header
                const { data: orderData, error: orderError } = await supabase
                    .from('orders')
                    .select('*, customers(name, phone), order_types(name)')
                    .eq('id', id)
                    .single()

                if (orderError) throw orderError
                setOrder(orderData as any)
                setAmountTendered(orderData.amount_tendered?.toString() || "")

                // Fetch Sale Items
                const { data: itemsData, error: itemsError } = await supabase
                    .from('sales')
                    .select('*, products(id, sku_name, code_name)')
                    .eq('order_id', id)
                    .is('deleted_at', null)

                if (itemsError) throw itemsError
                setItems(itemsData as any || [])

            } catch (err) {
                console.error("Error fetching order details:", err)
                toast.error("Failed to load order details.")
            } finally {
                setLoading(false)
            }
        }

        fetchOrderDetails()
    }, [id])

    const handleApprove = async () => {
        if (!order || approving) return

        const tendered = parseFloat(amountTendered)
        if (isNaN(tendered) || tendered < order.total_amount) {
            toast.warning(`Amount tendered must be at least GH₵ ${order.total_amount.toFixed(2)}`)
            return
        }

        setApproving(true)
        try {
            // 1. Update POS order status
            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    status: 'approved',
                    amount_tendered: tendered,
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id)

            if (updateError) throw updateError

            // 2. Create Warehouse Order
            const { data: warehouseOrder, error: warehouseError } = await supabase
                .from('warehouse_orders')
                .insert([{
                    order_id: order.id,
                    status: 'pending'
                }])
                .select()
                .single()

            if (warehouseError) throw warehouseError

            // 3. Create Warehouse Order Items
            const warehouseItemsToInsert = items.map(item => ({
                warehouse_order_id: warehouseOrder.id,
                product_id: item.products?.id || null, // Ensure ID is available
                quantity: item.quantity
            })).filter(item => item.product_id !== null)

            const { error: itemsError } = await supabase
                .from('warehouse_order_items')
                .insert(warehouseItemsToInsert)

            if (itemsError) throw itemsError

            toast.success("Order approved and sent to warehouse!")
            // Refresh local state
            setOrder({ ...order, status: 'approved', amount_tendered: tendered })
        } catch (err) {
            console.error("Error approving order:", err)
            toast.error("Failed to approve order.")
        } finally {
            setApproving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground italic">Loading order details...</p>
                </div>
            </div>
        )
    }

    if (!order) {
        return (
            <div className="text-center py-20">
                <p className="text-muted-foreground">Order not found.</p>
                <Button variant="link" onClick={() => navigate("/dashboard/pos/orders")}>
                    Back to Orders
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/pos/orders")}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Order #{order.id}</h2>
                    <p className="text-muted-foreground">Review and approve transaction details.</p>
                </div>
                <Badge
                    className={`ml-auto capitalize text-sm px-3 py-1 ${order.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700 border-red-200' :
                            'bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                    variant="outline"
                >
                    {order.status}
                </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Order Summary & Items */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                Order Items
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-center">Qty</TableHead>
                                        <TableHead className="text-right">Subtotal</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.products?.sku_name}</span>
                                                    <span className="text-xs text-muted-foreground font-mono">{item.products?.code_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">GH₵ {item.unit_price.toFixed(2)}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-right font-bold">GH₵ {item.sub_total.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/30 font-bold">
                                        <TableCell colSpan={3} className="text-right uppercase text-xs tracking-wider">Grand Total</TableCell>
                                        <TableCell className="text-right text-lg text-amber-900 dark:text-amber-100 italic">
                                            GH₵ {order.total_amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-muted-foreground" />
                                Transaction Context
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="bg-amber-100 p-2 rounded-lg text-amber-700">
                                        <User className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Customer</p>
                                        <p className="font-semibold">{order.customers?.name || "Walk-in"}</p>
                                        <p className="text-sm text-muted-foreground">{order.customers?.phone || "No contact info"}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                                        <Calendar className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Date & Time</p>
                                        <p className="font-semibold">{format(new Date(order.date_time), 'PPpp')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="bg-purple-100 p-2 rounded-lg text-purple-700">
                                        <CreditCard className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Payment Type</p>
                                        <p className="font-semibold capitalize">{order.payment_type?.replace('_', ' ') || "N/A"}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="bg-green-100 p-2 rounded-lg text-green-700">
                                        <Package className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-muted-foreground uppercase opacity-70">Order Type</p>
                                        <Badge variant="outline" className="capitalize mt-1">{order.order_types?.name}</Badge>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Approval Section */}
                <div className="space-y-6">
                    <Card className="border-amber-200 shadow-md">
                        <CardHeader className="bg-amber-50/50">
                            <CardTitle className="text-lg">Approval</CardTitle>
                            <CardDescription>Enter payment and confirm approval.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount-tendered" className="font-bold text-amber-900">Amount Tendered (GH₵)</Label>
                                <Input
                                    id="amount-tendered"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={amountTendered}
                                    onChange={(e) => setAmountTendered(e.target.value)}
                                    disabled={order.status !== 'pending' || approving || profile?.role === 'auditor'}
                                    className="h-12 text-lg border-2 border-amber-100 focus-visible:ring-amber-500"
                                />
                                {order.status === 'pending' && (
                                    <p className="text-[10px] text-muted-foreground italic">
                                        Must be greater than or equal to GH₵ {order.total_amount.toFixed(2)}
                                    </p>
                                )}
                            </div>

                            {order.status === 'approved' && order.amount_tendered && (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold text-green-800 uppercase">Change Due:</span>
                                        <span className="text-lg font-black text-green-900 italic">
                                            GH₵ {(order.amount_tendered - order.total_amount).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            {order.status === 'pending' ? (
                                <Button
                                    className="w-full h-14 bg-amber-800 hover:bg-amber-900 text-lg font-bold shadow-md gap-2"
                                    onClick={handleApprove}
                                    disabled={approving || profile?.role === 'auditor'}
                                >
                                    {profile?.role === 'auditor' ? (
                                        <>
                                            <CheckCircle2 className="h-5 w-5" /> Read Only Access
                                        </>
                                    ) : approving ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Approving...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-5 w-5" /> Confirm Approval
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    className="w-full h-12 bg-muted text-muted-foreground cursor-not-allowed"
                                    disabled
                                >
                                    {order.status === 'approved' ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" /> Already Approved
                                        </div>
                                    ) : 'Order Cancelled'}
                                </Button>
                            )}
                        </CardFooter>
                    </Card>

                    <div className="bg-muted/30 p-4 rounded-lg border border-dashed text-xs text-muted-foreground italic">
                        Once approved, the order status changes to "approved" and the payment amount is permanently recorded.
                    </div>
                </div>
            </div>
        </div>
    )
}
