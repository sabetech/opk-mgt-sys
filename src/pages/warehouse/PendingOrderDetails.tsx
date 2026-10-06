import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft, Loader2, Package, User, Calendar, CreditCard } from "lucide-react"

import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

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

interface WarehouseOrder {
    id: string
    order_id: string
    order_number?: number | null
    status: "pending" | "ready" | "cancelled"
    orders: {
        id: string
        total_amount: number
        amount_tendered: number | null
        payment_type: string | null
        status: string
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

export default function PendingOrderDetails() {
    const { profile } = useAuth()
    const { id } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState<WarehouseOrder | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)
    const [approving, setApproving] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [confirmingCancel, setConfirmingCancel] = useState(false)

    const isAuditor = profile?.role === 'auditor'
    const isPending = order?.status === "pending"

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) return
            setLoading(true)
            try {
                const w: any = await pb.collection('warehouse_orders').getOne(id, {
                    expand: 'order_id.customer_id,order_id.order_type_id',
                })
                const itemsData: any[] = await pb.collection('warehouse_order_items').getFullList({
                    filter: `warehouse_order_id = "${w.id}"`,
                    expand: 'product_id',
                })
                const pos = w.expand?.order_id ?? null
                setOrder({
                    id: w.id,
                    order_id: w.order_id,
                    order_number: pos?.order_number ?? null,
                    status: w.status,
                    orders: pos
                        ? {
                            id: pos.id,
                            total_amount: pos.total_amount,
                            amount_tendered: pos.amount_tendered ?? null,
                            payment_type: pos.payment_type ?? null,
                            status: pos.status,
                            date_time: pos.date_time,
                            customers: pos.expand?.customer_id ?? null,
                            order_type: pos.expand?.order_type_id ?? null,
                        }
                        : null,
                    warehouse_order_items: itemsData.map((item) => {
                        const rel = item.expand?.product_id
                        return {
                            id: item.id,
                            product_id: item.product_id,
                            quantity: item.quantity,
                            products: rel
                                ? { sku_name: rel.sku_name, code_name: rel.code_name, product_code: rel.product_code ?? null, returnable: rel.returnable }
                                : null,
                        }
                    }),
                })
            } catch (err: any) {
                if (err?.status === 404) {
                    setNotFound(true)
                } else {
                    console.error("Error fetching warehouse order:", err)
                    toast.error("Failed to load order details")
                }
            } finally {
                setLoading(false)
            }
        }
        fetchOrder()
    }, [id])

    // Handle approve order (mark as ready for fulfilment)
    const handleApproveOrder = async () => {
        if (!order || approving) return
        setApproving(true)
        try {
            await pb.collection('warehouse_orders').update(order.id, { status: 'ready' })
            toast.success("Order marked as ready for fulfilment!")
            navigate('/dashboard/warehouse/pending-orders')
        } catch (err) {
            console.error("Error approving warehouse order:", err)
            toast.error("Failed to approve order")
            setApproving(false)
        }
    }

    // Handle cancel order (revert sale)
    const handleCancelOrder = async () => {
        if (!order || cancelling) return
        setCancelling(true)
        try {
            const warehouseOrderId = order.id
            const posOrderId = order.order_id

            // 1. Fetch warehouse order items to restore stock
            // (no `fields` restriction: `expand` needs the full record on this host)
            const whItems = await pb.collection('warehouse_order_items').getFullList({
                filter: `warehouse_order_id = "${warehouseOrderId}"`,
                expand: 'product_id',
            })

            // 2. Determine sale type from POS order's customer
            const posOrder = await pb.collection('orders').getOne(posOrderId, {
                fields: 'customer_id',
            }).catch(() => null)
            const customer = posOrder?.customer_id
                ? await pb.collection('customers').getOne(posOrder.customer_id, {
                    expand: 'type_id',
                    // NOTE: `expand` must be listed in `fields` or this host drops it
                    fields: 'id, name, type_id, expand',
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
                    .catch((err) => {
                        if (err?.status === 404) return null
                        throw err
                    })
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

            // 4. Reverse the empties purchase debt for returnable items, so the
            // customer ledger (and live balance) self-corrects on cancel
            try {
                const returnableQty = whItems
                    .filter((item) => item.expand?.product_id?.returnable === true)
                    .reduce((sum: number, item) => sum + (item.quantity || 0), 0)
                if (posOrder?.customer_id && returnableQty > 0) {
                    const reversal = await pb.collection('empties_log').create({
                        date: today,
                        customer_id: posOrder.customer_id,
                        activity: 'customer_empties_return',
                        total_quantity: returnableQty,
                    })
                    for (const item of whItems) {
                        if (item.expand?.product_id?.returnable !== true || !item.product_id) continue
                        await pb.collection('empties_log_detail').create({
                            log_id: reversal.id,
                            product_id: item.product_id,
                            quantity: item.quantity,
                        })
                    }
                }
            } catch (err) {
                console.warn("Failed to reverse empties ledger on cancel:", err)
            }

            // 5. Cancel Warehouse Order
            await pb.collection('warehouse_orders').update(warehouseOrderId, { status: 'cancelled' })

            // 6. Cancel POS Order (Revert Sale)
            await pb.collection('orders').update(posOrderId, { status: 'cancelled' })

            toast.success("Sale reverted and warehouse order cancelled.")
            navigate('/dashboard/warehouse/pending-orders')
        } catch (err) {
            console.error("Error reverting sale:", err)
            toast.error("Failed to revert sale")
            setCancelling(false)
            setConfirmingCancel(false)
        }
    }

    const getStatusBadgeVariant = (status: WarehouseOrder["status"]) => {
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

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-muted-foreground">Loading order details...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (notFound || !order) {
        return (
            <div className="space-y-6">
                <Button variant="ghost" onClick={() => navigate('/dashboard/warehouse/pending-orders')} className="gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    Back to Pending Orders
                </Button>
                <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Order not found.</p>
                </div>
            </div>
        )
    }

    const tendered = order.orders?.amount_tendered ?? null
    const change = tendered !== null ? tendered - (order.orders?.total_amount || 0) : null

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2 mb-4">
                    <ChevronLeft className="h-4 w-4" />
                    Back
                </Button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-3xl font-bold tracking-tight">
                        Order #{order.order_number ?? order.order_id}
                    </h2>
                    <Badge variant={getStatusBadgeVariant(order.status)} className="w-fit">
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                </div>
                {!isPending && (
                    <p className="text-muted-foreground mt-1">
                        This order is {order.status === "ready" ? "already fulfilled" : "cancelled"} — read-only.
                    </p>
                )}
            </div>

            {/* Order info + payment */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Order Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Date:</span>
                            <span className="font-medium">
                                {order.orders?.date_time
                                    ? format(new Date(order.orders.date_time), 'MMM dd, yyyy HH:mm')
                                    : "—"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Customer:</span>
                            <span className="font-medium">{order.orders?.customers?.name || "Walk-in"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Type:</span>
                            <span className="font-medium">{order.orders?.order_type?.name || "—"}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Payment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Method:</span>
                            <span className="font-medium capitalize">
                                {(order.orders?.payment_type || "—").replace(/_/g, " ")}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Total amount:</span>
                            <span className="font-bold">GH₵ {(order.orders?.total_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount tendered:</span>
                            <span className="font-medium">
                                {tendered !== null ? `GH₵ ${tendered.toFixed(2)}` : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Change:</span>
                            <span className="font-medium">
                                {change !== null ? `GH₵ ${change.toFixed(2)}` : "—"}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Payment status:</span>
                            <Badge variant={order.orders?.status === "approved" ? "default" : order.orders?.status === "cancelled" ? "destructive" : "outline"}>
                                {order.orders?.status
                                    ? order.orders.status.charAt(0).toUpperCase() + order.orders.status.slice(1)
                                    : "—"}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Items Ordered</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Code</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-center">Qty</TableHead>
                                    <TableHead>Returnable</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {order.warehouse_order_items.length > 0 ? (
                                    order.warehouse_order_items.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-mono text-xs">
                                                {item.products?.product_code || item.products?.code_name || "—"}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {item.products?.sku_name ?? "Unknown product"}
                                            </TableCell>
                                            <TableCell className="text-center">{item.quantity}</TableCell>
                                            <TableCell>
                                                <Badge variant={item.products?.returnable ? "default" : "outline"}>
                                                    {item.products?.returnable ? "Yes" : "No"}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                                            No items for this order.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end mt-4">
                        <p className="text-sm font-bold">
                            Total: GH₵ {(order.orders?.total_amount || 0).toFixed(2)}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Actions */}
            {isPending && !isAuditor && (
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    {!confirmingCancel ? (
                        <>
                            <Button
                                variant="destructive"
                                onClick={() => setConfirmingCancel(true)}
                                disabled={approving || cancelling}
                            >
                                Cancel Order
                            </Button>
                            <Button
                                onClick={handleApproveOrder}
                                disabled={approving || cancelling}
                                className="bg-amber-700 hover:bg-amber-800 min-w-[150px]"
                            >
                                {approving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {approving ? "Approving..." : "Approve Order"}
                            </Button>
                        </>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-md border border-red-200 bg-red-50 p-3 dark:bg-red-950/20">
                            <p className="text-sm text-red-700 dark:text-red-300">
                                Cancelling reverts the entire sale and the customer must be refunded. Are you sure?
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmingCancel(false)}
                                    disabled={cancelling}
                                >
                                    Keep Order
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleCancelOrder}
                                    disabled={cancelling}
                                >
                                    {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {cancelling ? "Cancelling..." : "Yes, Cancel & Revert Sale"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
