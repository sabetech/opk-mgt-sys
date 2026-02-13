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
    Calendar
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface CustomerHistorySheetProps {
    customer: {
        id: number
        name: string
    } | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

type TimelineEntry = {
    id: string
    date: string
    type: 'purchase' | 'return'
    description: string
    amount?: number
    quantity: number
    status?: string
    details: any[]
}

export default function CustomerHistorySheet({ customer, open, onOpenChange }: CustomerHistorySheetProps) {
    const [loading, setLoading] = useState(false)
    const [timeline, setTimeline] = useState<TimelineEntry[]>([])
    const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (open && customer) {
            fetchHistory()
        }
    }, [open, customer])

    const fetchHistory = async () => {
        if (!customer) return
        setLoading(true)
        try {
            // 1. Fetch Orders
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select(`
                    id,
                    date_time,
                    total_amount,
                    status,
                    sales (
                        quantity,
                        unit_price,
                        sub_total,
                        products (sku_name)
                    )
                `)
                .eq('customer_id', customer.id)
                .order('date_time', { ascending: false })

            if (ordersError) throw ordersError

            // 2. Fetch Empties Logs
            const { data: empties, error: emptiesError } = await supabase
                .from('empties_log')
                .select(`
                    id,
                    date,
                    activity,
                    total_quantity,
                    created_at,
                    empties_log_detail (
                        quantity,
                        products (sku_name)
                    )
                `)
                .eq('customer_id', customer.id)
                .order('created_at', { ascending: false })

            if (emptiesError) throw emptiesError

            // 3. Merge and process
            const entries: TimelineEntry[] = []

            // Process Orders
            orders?.forEach(order => {
                entries.push({
                    id: `order-${order.id}`,
                    date: order.date_time,
                    type: 'purchase',
                    description: `Order #${order.id}`,
                    amount: order.total_amount,
                    quantity: order.sales?.reduce((sum: number, s: any) => sum + s.quantity, 0) || 0,
                    status: order.status,
                    details: order.sales || []
                })
            })

            // Process Empties Returns
            // Filter only for 'customer_empties_return' because 'customer_purchase' is already reflected in orders (logic-wise)
            // But actually 'customer_purchase' in empties_log is a separate record created during POS checkout.
            // We want to show it in the timeline to show the balance impact.
            empties?.forEach(log => {
                const isReturn = log.activity === 'customer_empties_return'
                entries.push({
                    id: `empty-${log.id}`,
                    date: log.created_at, // Use created_at for time sorting
                    type: isReturn ? 'return' : 'purchase',
                    description: isReturn ? 'Empties Return' : `Empties for Sale`,
                    quantity: log.total_quantity,
                    details: log.empties_log_detail || []
                })
            })

            // Sort by date descending
            entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            setTimeline(entries)

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
                                                    : "bg-green-50 text-green-600 dark:bg-green-900/20"
                                            )}>
                                                {entry.type === 'purchase' ? <ShoppingCart className="h-5 w-5" /> : <RefreshCcw className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm">{entry.description}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {format(new Date(entry.date), 'MMM dd, yyyy • hh:mm a')}
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
                                                    ) : (
                                                        <TrendingUp className="h-3 w-3 text-green-500" />
                                                    )}
                                                    <span className={cn(
                                                        "text-xs font-bold",
                                                        entry.type === 'purchase' ? "text-red-600" : "text-green-600"
                                                    )}>
                                                        {entry.type === 'purchase' ? '-' : '+'}{entry.quantity} Crates
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
                                                            <span className="font-medium">{(detail.products as any)?.sku_name}</span>
                                                            <div className="flex items-center gap-4">
                                                                <span className="text-muted-foreground">Qty: {detail.quantity}</span>
                                                                {detail.unit_price && (
                                                                    <span className="font-mono text-xs">@ GH₵ {detail.unit_price.toFixed(2)}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
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
            </SheetContent>
        </Sheet>
    )
}
