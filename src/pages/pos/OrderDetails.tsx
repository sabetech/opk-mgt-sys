import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { pb } from "@/lib/pocketbase"
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
    Package,
    RotateCcw
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { format, isSameDay } from "date-fns"
import { useAuth } from "@/context/AuthContext"

interface OrderDetail {
    id: string
    order_number: number
    customer_id: string | null
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
    id: string
    product_id: string
    quantity: number
    unit_price: number
    sub_total: number
    discount: number
    products: {
        id: string
        sku_name: string
        code_name: string
        returnable: boolean
    } | null
}

interface ReturnRecord {
    id: string
    product_id: string
    quantity: number
    unit_price: number
    refund_amount: number
    reason: string
    date: string
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
    const [returnOpen, setReturnOpen] = useState(false)
    const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({})
    const [returnReason, setReturnReason] = useState("")
    const [existingReturns, setExistingReturns] = useState<ReturnRecord[]>([])
    const [returning, setReturning] = useState(false)

    useEffect(() => {
        const fetchOrderDetails = async () => {
            if (!id) return
            setLoading(true)
            try {
                // Fetch Order Header
                const orderData: any = await pb.collection('orders').getOne(id, {
                    expand: 'customer_id,order_type_id',
                })
                setOrder({
                    ...orderData,
                    customers: orderData.expand?.customer_id ?? null,
                    order_types: orderData.expand?.order_type_id,
                })
                setAmountTendered(orderData.amount_tendered?.toString() || "")

                // Fetch Sale Items
                const itemsData: any[] = await pb.collection('sales').getFullList({
                    filter: `order_id = "${id}" && deleted_at = ""`,
                    expand: 'product_id',
                })
                setItems(itemsData.map((r) => ({
                    ...r,
                    products: r.expand?.product_id ?? null,
                })))

                // Fetch existing returns
                const returnsData: any[] = await pb.collection('returns').getFullList({
                    filter: `order_id = "${id}"`,
                })
                setExistingReturns(returnsData.map((r) => ({
                    id: r.id,
                    product_id: r.product_id,
                    quantity: r.quantity,
                    unit_price: r.unit_price,
                    refund_amount: r.refund_amount,
                    reason: r.reason || '',
                    date: r.date,
                })))

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
            // Determine sale type (retail vs wholesale) from customer type
            const customer = order.customer_id
                ? await pb.collection('customers').getOne(order.customer_id, {
                    expand: 'type_id',
                    fields: 'id, name, type_id',
                }).catch(() => null)
                : null
            const saleType = customer?.expand?.type_id?.name === 'Wholesaler'
                ? 'wholesale_sale'
                : 'retail_sale'

            // 1. Validate stock for every item before mutating anything
            const stockRecords: { item: typeof items[0]; stockId: string; currentQty: number }[] = []
            for (const item of items) {
                if (!item.product_id) continue
                const stock = await pb.collection('warehouse_stock')
                    .getFirstListItem(`product_id = "${item.product_id}"`, { fields: 'id, quantity' })
                    .catch(() => null)
                if (!stock || (stock.quantity || 0) < item.quantity) {
                    toast.error(`Insufficient stock for ${item.products?.sku_name ?? 'product'}.`)
                    setApproving(false)
                    return
                }
                stockRecords.push({ item, stockId: stock.id, currentQty: stock.quantity || 0 })
            }

            // 2. Update POS order status
            await pb.collection('orders').update(order.id, {
                status: 'approved',
                amount_tendered: tendered
            })

            // 3. Create Warehouse Order
            const warehouseOrder = await pb.collection('warehouse_orders').create({
                order_id: order.id,
                status: 'pending'
            })

            // 4. Create Warehouse Order Items
            const warehouseItemsToInsert = items.map(item => ({
                warehouse_order_id: warehouseOrder.id,
                product_id: item.product_id,
                quantity: item.quantity
            })).filter(item => item.product_id !== null)

            for (const wItem of warehouseItemsToInsert) {
                await pb.collection('warehouse_order_items').create(wItem)
            }

            // 5. Deduct stock and log inventory movement for each item
            const today = new Date().toISOString().split('T')[0]
            for (const { item, stockId, currentQty } of stockRecords) {
                await pb.collection('warehouse_stock').update(stockId, {
                    quantity: Math.max(0, currentQty - item.quantity)
                })
                await pb.collection('inventory_logs').create({
                    date: today,
                    product_id: item.product_id,
                    type: saleType,
                    quantity: -item.quantity,
                    reference_id: order.id,
                    reference_table: 'orders',
                    description: `Sale - ${customer?.name || 'Walk-in'}`,
                })
            }

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

    // Returns helpers
    const getAlreadyReturnedQty = (productId: string) =>
        existingReturns.filter((r) => r.product_id === productId).reduce((sum, r) => sum + r.quantity, 0)

    const getReturnableQty = (item: SaleItem) => {
        const returned = getAlreadyReturnedQty(item.product_id)
        return Math.max(0, item.quantity - returned)
    }

    const isSameDayOrder = order && isSameDay(new Date(order.date_time), new Date())
    const canReturn = order?.status === 'approved' && isSameDayOrder && profile?.role !== 'auditor'
    const hasReturnableItems = items.some((item) => getReturnableQty(item) > 0)

    const totalRefund = Object.entries(returnQuantities).reduce((sum, [saleId, qty]) => {
        if (qty <= 0) return sum
        const item = items.find((i) => i.id === saleId)
        return sum + (item ? item.unit_price * qty : 0)
    }, 0)

    const handleReturn = async () => {
        if (!order || returning) return

        const returnEntries = Object.entries(returnQuantities).filter(([, qty]) => qty > 0)
        if (returnEntries.length === 0) {
            toast.warning("Select at least one item to return.")
            return
        }

        setReturning(true)
        try {
            for (const [saleId, returnQty] of returnEntries) {
                const item = items.find((i) => i.id === saleId)
                if (!item || !item.product_id) continue

                const available = getReturnableQty(item)
                if (returnQty > available) {
                    toast.error(`Cannot return ${returnQty} of "${item.products?.sku_name}" — only ${available} available.`)
                    setReturning(false)
                    return
                }

                // 1. Create returns record
                const refundAmount = item.unit_price * returnQty
                await pb.collection('returns').create({
                    order_id: order.id,
                    product_id: item.product_id,
                    quantity: returnQty,
                    unit_price: item.unit_price,
                    refund_amount: refundAmount,
                    reason: returnReason,
                    handled_by: profile?.id || '',
                    date: new Date().toISOString(),
                })

                // 2. Restore warehouse stock
                const stock = await pb.collection('warehouse_stock')
                    .getFirstListItem(`product_id = "${item.product_id}"`, { fields: 'id, quantity' })
                    .catch(() => null)
                if (stock) {
                    await pb.collection('warehouse_stock').update(stock.id, {
                        quantity: (stock.quantity || 0) + returnQty,
                    })
                }

                // 3. Log inventory movement
                const today = new Date().toISOString().split('T')[0]
                await pb.collection('inventory_logs').create({
                    date: today,
                    product_id: item.product_id,
                    type: 'customer_return',
                    quantity: returnQty,
                    reference_id: order.id,
                    reference_table: 'orders',
                    description: `Customer return - ${order.customers?.name || 'Walk-in'}`,
                })

                // 4. Restore empties balance if returnable and registered customer
                if (item.products?.returnable && order.customer_id) {
                    await pb.collection('empties_log').create({
                        date: new Date().toISOString(),
                        customer_id: order.customer_id,
                        activity: 'customer_empties_return',
                        total_quantity: returnQty,
                    }).then(async (logData) => {
                        await pb.collection('empties_log_detail').create({
                            log_id: logData.id,
                            product_id: item.product_id,
                            quantity: returnQty,
                        })
                    }).catch((err) => {
                        console.warn("Failed to reverse empties balance:", err)
                    })
                }
            }

            // Refresh returns
            const returnsData: any[] = await pb.collection('returns').getFullList({
                filter: `order_id = "${order.id}"`,
            })
            setExistingReturns(returnsData.map((r) => ({
                id: r.id,
                product_id: r.product_id,
                quantity: r.quantity,
                unit_price: r.unit_price,
                refund_amount: r.refund_amount,
                reason: r.reason || '',
                date: r.date,
            })))

            setReturnQuantities({})
            setReturnReason("")
            setReturnOpen(false)
            toast.success("Return processed successfully.")
        } catch (err) {
            console.error("Error processing return:", err)
            toast.error("Failed to process return.")
        } finally {
            setReturning(false)
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
                    <h2 className="text-3xl font-bold tracking-tight">Order #{order.order_number}</h2>
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

                    {canReturn && hasReturnableItems && (
                        <Button
                            variant="outline"
                            className="w-full h-12 gap-2 border-dashed"
                            onClick={() => {
                                const initial: Record<string, number> = {}
                                items.forEach((item) => {
                                    initial[item.id] = getReturnableQty(item)
                                })
                                setReturnQuantities(initial)
                                setReturnOpen(true)
                            }}
                        >
                            <RotateCcw className="h-4 w-4" />
                            Return Items
                        </Button>
                    )}
                </div>
            </div>

            {/* Return Items Dialog */}
            <Dialog open={returnOpen} onOpenChange={(open) => { if (!open) setReturnOpen(false) }}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="h-5 w-5" />
                            Return Items — Order #{order.order_number}
                        </DialogTitle>
                        <DialogDescription>
                            Select items and quantities to return. Stock will be restored immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-center">Purchased</TableHead>
                                    <TableHead className="text-center">Already Returned</TableHead>
                                    <TableHead className="text-center">Return Qty</TableHead>
                                    <TableHead className="text-right">Unit Price</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item) => {
                                    const returned = getAlreadyReturnedQty(item.product_id)
                                    const maxReturn = getReturnableQty(item)
                                    if (maxReturn <= 0) return null
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.products?.sku_name ?? 'Unknown'}</TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell className="text-center">{returned}</TableCell>
                                            <TableCell className="text-center">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={maxReturn}
                                                    value={returnQuantities[item.id] ?? 0}
                                                    onChange={(e) => {
                                                        const val = Math.max(0, Math.min(maxReturn, parseInt(e.target.value) || 0))
                                                        setReturnQuantities((prev) => ({ ...prev, [item.id]: val }))
                                                    }}
                                                    className="h-9 w-20 text-center"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">GH₵ {item.unit_price.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>

                        <div className="space-y-2">
                            <Label htmlFor="return-reason">Reason (optional)</Label>
                            <textarea
                                id="return-reason"
                                placeholder="e.g. Customer changed mind"
                                value={returnReason}
                                onChange={(e) => setReturnReason(e.target.value)}
                                rows={2}
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        {totalRefund > 0 && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100 flex justify-between items-center">
                                <span className="text-sm font-bold text-green-800 uppercase">Refund Total:</span>
                                <span className="text-lg font-black text-green-900 italic">GH₵ {totalRefund.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" disabled={returning}>Cancel</Button>
                        </DialogClose>
                        <Button
                            className="bg-green-700 hover:bg-green-800"
                            onClick={handleReturn}
                            disabled={returning || totalRefund <= 0}
                        >
                            {returning ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                            ) : (
                                <><RotateCcw className="h-4 w-4" /> Confirm Return</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
