import { useState, useEffect } from "react"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import {
    Loader2,
    ShoppingCart,
    RefreshCcw,
    ChevronDown,
    ChevronRight,
    TrendingDown,
    TrendingUp,
    Calendar,
    Package,
    Minus,
    Ban
} from "lucide-react"
import { pb } from "@/lib/pocketbase"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { emptiesActivityEffect } from "@/lib/customerBalance"
import { fetchEmptiesDisplayMode, formatEmptiesBalance, type EmptiesDisplayMode } from "@/lib/emptiesDisplay"
import { voidEmptiesReturn, VoidBlockedError } from "@/lib/emptiesVoid"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CustomerHistorySheetProps {
    customer: {
        id: string
        name: string
    } | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

type TimelineEntry = {
    id: string
    date: string
    type: 'purchase' | 'return' | 'opening'
    description: string
    amount?: number
    quantity: number
    status?: string
    details: any[]
    /** empties_log id — present on ledger-backed entries. */
    logId?: string
    /** Writer attribution ('return_page' | 'pos' | 'order_cancel' | 'reclaim'). */
    source?: string | null
    /** Voided ledger rows stay visible for audit but move no balances. */
    voided?: boolean
    voidReason?: string | null
}

export default function CustomerHistorySheet({ customer, open, onOpenChange }: CustomerHistorySheetProps) {
    const { profile } = useAuth()
    const [loading, setLoading] = useState(false)
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const [netBalance, setNetBalance] = useState<number | null>(null)
    const [emptiesMode, setEmptiesMode] = useState<EmptiesDisplayMode>("debit")
    const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

    // Void dialog state
    const [voidTarget, setVoidTarget] = useState<TimelineEntry | null>(null)
    const [voidReason, setVoidReason] = useState("")
    const [voiding, setVoiding] = useState(false)

    const canVoidRole = profile?.role === "admin" || profile?.role === "empties_manager"
    const canVoidEntry = (entry: TimelineEntry) =>
        canVoidRole && entry.type === "return" && entry.source === "return_page" && !entry.voided

    useEffect(() => {
        if (open && customer) {
            fetchHistory()
            fetchEmptiesDisplayMode().then(setEmptiesMode).catch(() => undefined)
        }
    }, [open, customer])

    const fetchHistory = async () => {
        if (!customer) return
        setLoading(true)
        try {
            // 1. Fetch Orders
            const orders = await pb.collection('orders').getFullList({
                filter: `customer_id = "${customer.id}" && deleted_at = ""`,
                sort: '-date_time',
                fields: 'id, order_number, date_time, total_amount, status'
            })

            // 2. Fetch Sales for those orders (with product names)
            const orderIds = orders.map((o) => o.id)
            const sales = orderIds.length > 0
                ? await pb.collection('sales').getFullList({
                    filter: orderIds.map(id => `order_id = "${id}"`).join(' || '),
                    expand: 'product_id',
                })
                : []

            const salesByOrder: Record<string, any[]> = {}
            for (const sale of sales) {
                const rel = sale.expand?.product_id
                const shaped = {
                    ...sale,
                    products: rel ? { sku_name: rel.sku_name } : null,
                }
                ;(salesByOrder[sale.order_id] = salesByOrder[sale.order_id] || []).push(shaped)
            }

            // 3. Fetch Empties Logs (voided rows stay visible for audit but
            // must not feed the net balance below)
            const empties = await pb.collection('empties_log').getFullList({
                filter: `customer_id = "${customer.id}"`,
                sort: '-date',
                fields: 'id, date, created, activity, total_quantity, source, voided_at, void_reason'
            })

            // 4. Fetch empties log details (with product names)
            const logIds = empties.map((log) => log.id)
            const emptiesDetails = logIds.length > 0
                ? await pb.collection('empties_log_detail').getFullList({
                    filter: logIds.map(id => `log_id = "${id}"`).join(' || '),
                    expand: 'product_id',
                })
                : []

            const detailsByLog: Record<string, any[]> = {}
            for (const detail of emptiesDetails) {
                const rel = detail.expand?.product_id
                const shaped = {
                    ...detail,
                    products: rel ? { sku_name: rel.sku_name } : null,
                }
                ;(detailsByLog[detail.log_id] = detailsByLog[detail.log_id] || []).push(shaped)
            }

            // 5. Merge and process
            const entries: TimelineEntry[] = []

            // Process Orders
            orders?.forEach(order => {
                entries.push({
                    id: `order-${order.id}`,
                    date: order.date_time,
                    type: 'purchase',
                    description: `Order #${order.order_number}`,
                    amount: order.total_amount,
                    quantity: salesByOrder[order.id]?.reduce((sum: number, s) => sum + s.quantity, 0) || 0,
                    status: order.status,
                    details: salesByOrder[order.id] || []
                })
            })

            // Process Empties Returns
            // Filter only for 'customer_empties_return' because 'customer_purchase' is already reflected in orders (logic-wise)
            // But actually 'customer_purchase' in empties_log is a separate record created during POS checkout.
            // We want to show it in the timeline to show the balance impact.
            empties?.forEach(log => {
                const isReturn = log.activity === 'customer_empties_return'
                const isOpening = log.activity === 'opening_balance'
                const isReclaim = log.activity === 'customer_empties_reclaim'
                entries.push({
                    id: `empty-${log.id}`,
                    date: log.created || log.date, // Use created for time sorting
                    type: isOpening ? 'opening' : isReturn ? 'return' : 'purchase',
                    description: isOpening ? 'Opening Balance'
                        : isReturn ? 'Empties Return'
                        : isReclaim ? 'Empties Returned to Customer'
                        : `Empties for Sale`,
                    quantity: log.total_quantity,
                    details: detailsByLog[log.id] || [],
                    logId: log.id,
                    source: log.source,
                    voided: !!log.voided_at,
                    voidReason: log.void_reason || null
                })
            })

            // Sort by date descending
            entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            setTimeline(entries)

            // Net crates balance: stored opening + empties ledger (orders would
            // double-count purchases already logged as customer_purchase, so
            // only the ledger and the opening feed this figure)
            const customerRecord = await pb.collection('customers').getOne(customer.id, {
                fields: 'id, balance',
            }).catch(() => null)
            const opening = customerRecord?.balance || 0
            setNetBalance(
                opening +
                (empties || []).reduce(
                    (sum: number, log) =>
                        log.voided_at
                            ? sum
                            : sum + emptiesActivityEffect(log.activity) * (log.total_quantity || 0),
                    0
                )
            )

        } catch (error) {
            console.error("Error fetching customer history:", error)
        } finally {
            setLoading(false)
        }
    }

    const toggleEntry = (id: string) => {
        const newExpanded = new Set(expandedEntries)
        if (newExpanded.has(id)) newExpanded.delete(id)
        else newExpanded.add(id)
        setExpandedEntries(newExpanded)
    }

    const openVoidDialog = (entry: TimelineEntry) => {
        setVoidTarget(entry)
        setVoidReason("")
    }

    const handleVoid = async () => {
        if (!voidTarget?.logId || !profile) return
        const reason = voidReason.trim()
        if (!reason) {
            toast.error("A reason is required to void a return.")
            return
        }
        setVoiding(true)
        try {
            const summary = await voidEmptiesReturn(voidTarget.logId, { reason, userId: profile.id })
            toast.success(`Return voided — customer balance reduced by ${Math.abs(summary.balanceDelta)} crate(s).`)
            if (!summary.yardApplied) {
                toast.warning("Return voided, but yard stock needs review — reconcile manually.")
            }
            setVoidTarget(null)
            setVoidReason("")
            fetchHistory()
        } catch (error) {
            console.error("Failed to void return:", error)
            toast.error(
                error instanceof VoidBlockedError
                    ? error.message
                    : error instanceof Error ? error.message : "Failed to void return."
            )
        } finally {
            setVoiding(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[600px] overflow-y-auto">
                <SheetHeader className="pb-6 border-b">
                    <SheetTitle className="flex items-center gap-2 text-2xl">
                        <Calendar className="h-6 w-6 text-primary" />
                        Transaction History
                    </SheetTitle>
                    <SheetDescription>
                        Timeline of purchases and empties for <span className="font-bold text-foreground">{customer?.name}</span>
                        {netBalance !== null && (
                            <span className="block mt-1">
                                Net crates balance:{" "}
                                {(() => {
                                    const formatted = formatEmptiesBalance(netBalance, emptiesMode)
                                    return (
                                        <span className={cn(
                                            "font-bold",
                                            formatted.tone === "debit" ? "text-red-600" : formatted.tone === "credit" ? "text-green-600" : undefined
                                        )}>
                                            {formatted.text}
                                        </span>
                                    )
                                })()}
                            </span>
                        )}
                    </SheetDescription>
                </SheetHeader>

                <div className="py-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                            <p className="text-sm font-medium text-muted-foreground">Fetching ledger...</p>
                        </div>
                    ) : timeline.length > 0 ? (
                        <div className="space-y-4">
                            {timeline.map((entry) => (
                                <div
                                    key={entry.id}
                                    className={cn(
                                        "group border rounded-lg transition-all overflow-hidden",
                                        expandedEntries.has(entry.id) ? "ring-1 ring-primary/20 border-primary/20" : "hover:border-primary/20"
                                    )}
                                >
                                    <div
                                        className="p-4 cursor-pointer flex items-center justify-between"
                                        onClick={() => toggleEntry(entry.id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                                                entry.type === 'purchase'
                                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20"
                                                    : entry.type === 'opening'
                                                        ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20"
                                                        : "bg-green-50 text-green-600 dark:bg-green-900/20"
                                            )}>
                                                {entry.type === 'purchase' ? <ShoppingCart className="h-5 w-5" /> : entry.type === 'opening' ? <Package className="h-5 w-5" /> : <RefreshCcw className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <p className={cn("font-bold text-sm flex items-center gap-2", entry.voided && "text-muted-foreground")}>
                                                    {entry.description}
                                                    {entry.voided && (
                                                        <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-muted-foreground/30">
                                                            Voided
                                                        </Badge>
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {entry.date ? format(new Date(entry.date), 'MMM dd, yyyy • hh:mm a') : 'No date'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                {entry.amount !== undefined && (
                                                    <p className="font-bold">GH₵ {entry.amount.toFixed(2)}</p>
                                                )}
                                                <div className="flex items-center gap-1 justify-end">
                                                    {entry.type === 'purchase' ? (
                                                        <TrendingDown className="h-3 w-3 text-red-500" />
                                                    ) : entry.type === 'opening' ? (
                                                        <Minus className="h-3 w-3 text-muted-foreground" />
                                                    ) : (
                                                        <TrendingUp className="h-3 w-3 text-green-500" />
                                                    )}
                                                    <span className={cn(
                                                        "text-xs font-bold",
                                                        entry.voided ? "text-muted-foreground line-through" :
                                                            entry.type === 'purchase' ? "text-red-600" : entry.type === 'opening' ? "text-muted-foreground" : "text-green-600"
                                                    )}>
                                                        {entry.type === 'opening' ? `${entry.quantity} Crates` : `${entry.type === 'purchase' ? '-' : '+'}${entry.quantity} Crates`}
                                                    </span>
                                                </div>
                                            </div>
                                            {expandedEntries.has(entry.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                        </div>
                                    </div>

                                    {expandedEntries.has(entry.id) && (
                                        <div className="px-4 pb-4 pt-0 border-t bg-muted/5 animate-in slide-in-from-top-2">
                                            <div className="py-3">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 tracking-wider">Breakdown</p>
                                                <div className="space-y-2">
                                                    {entry.details.map((detail, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-sm bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800 shadow-sm">
                                                            <span className="font-medium">{detail.products?.sku_name}</span>
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-muted-foreground">Qty: {detail.quantity}</span>
                                                                {detail.unit_price && (
                                                                    <span className="font-mono text-xs">@ GH₵ {detail.unit_price.toFixed(2)}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {entry.voided && entry.voidReason && (
                                                    <p className="mt-3 text-xs text-muted-foreground italic">
                                                        Voided: {entry.voidReason}
                                                    </p>
                                                )}
                                                {canVoidEntry(entry) && (
                                                    <div className="mt-3">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-900/20"
                                                            onClick={() => openVoidDialog(entry)}
                                                        >
                                                            <Ban className="h-3.5 w-3.5 mr-1.5" />
                                                            Void Return
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
                                <Calendar className="h-8 w-8 text-muted-foreground/50" />
                            </div>
                            <p className="text-muted-foreground italic">No transaction history found for this customer.</p>
                        </div>
                    )}
                </div>

                <Dialog open={!!voidTarget} onOpenChange={(isOpen) => {
                    if (!isOpen && !voiding) {
                        setVoidTarget(null)
                        setVoidReason("")
                    }
                }}>
                    <DialogContent className="sm:max-w-[440px]">
                        <DialogHeader>
                            <DialogTitle>Void empties return</DialogTitle>
                            <DialogDescription>
                                This return credited <span className="font-semibold text-foreground">{voidTarget?.quantity} crate(s)</span> to {customer?.name}.
                                Voiding removes them from the customer's balance and reverses the yard tally (ground −{voidTarget?.quantity}, trade +{voidTarget?.quantity}).
                                The entry stays in history marked as voided.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-2">
                            <Label htmlFor="void-reason">Reason</Label>
                            <Input
                                id="void-reason"
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="e.g. Recorded against the wrong customer"
                                disabled={voiding}
                            />
                            <p className="text-xs text-muted-foreground">
                                Returns with a paid crate-deposit refund cannot be voided.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setVoidTarget(null)
                                    setVoidReason("")
                                }}
                                disabled={voiding}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleVoid}
                                disabled={voiding || !voidReason.trim()}
                            >
                                {voiding ? "Voiding..." : "Void Return"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SheetContent>
        </Sheet>
    )
}
