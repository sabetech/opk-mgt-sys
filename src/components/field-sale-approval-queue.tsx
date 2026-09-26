import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Loader2, Check, X, ChevronDown, ChevronUp, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import ConfirmDialog from "@/components/ConfirmDialog"
import { useAuth } from "@/context/AuthContext"
import { pb, getFullListInBatches } from "@/lib/pocketbase"
import {
    approveFieldSaleDimension,
    rejectFieldSaleDimension,
    tryPostSaleSide,
    tryPostEmptiesSide,
    type FieldSaleDimension,
    type FieldSaleStatus,
} from "@/lib/fieldSales"
import { toast } from "sonner"

interface QueueRow {
    id: string
    date: string
    reference: string
    vseName: string
    empties_received: number
    sale_status: FieldSaleStatus
    empties_status: FieldSaleStatus
    posted_to_summary: boolean
    sale_posted: boolean
    empties_posted: boolean
    orderId: string | null
    total: number
    itemCount: number
}

interface ApprovalQueueProps {
    dimension: FieldSaleDimension
    title: string
    description: string
}

/** PocketBase returns dates with a space separator — slice to YYYY-MM-DD
 *  before parsing so format() never throws RangeError. */
function formatRowDate(value: string): string {
    if (!value) return ""
    const day = String(value).slice(0, 10)
    const parsed = new Date(`${day}T12:00:00`)
    return isNaN(parsed.getTime()) ? day : format(parsed, "MMM d, yyyy")
}

export default function FieldSaleApprovalQueue({ dimension, title, description }: ApprovalQueueProps) {
    const { profile } = useAuth()
    const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
    const [rows, setRows] = useState<QueueRow[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [details, setDetails] = useState<Record<string, { name: string; qty: number; total: number }[]>>({})
    const [actionId, setActionId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState("")

    const dimField = dimension === "sale" ? "sale_status" : "empties_status"

    const fetchQueue = async () => {
        setLoading(true)
        try {
            const headers = await pb.collection('vse_field_sales').getFullList({
                filter: filter === "all" ? undefined : `${dimField} = "${filter}"`,
                expand: 'vse_customer_id',
            })
            // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
            headers.sort((a, b) => String(b.created).localeCompare(String(a.created)))
            const ids = headers.map((h) => h.id)
            const items = await getFullListInBatches('vse_field_sale_items', 'sale_id', ids, {
                expand: 'product_id',
            })
            const bySale: Record<string, { name: string; qty: number; total: number }[]> = {}
            const totals: Record<string, number> = {}
            const counts: Record<string, number> = {}
            for (const it of items) {
                const rel = it.expand?.product_id
                const line = {
                    name: rel?.sku_name || "Unknown",
                    qty: it.quantity || 0,
                    total: it.sub_total ?? (it.quantity || 0) * (it.unit_price || 0),
                }
                ;(bySale[it.sale_id] = bySale[it.sale_id] || []).push(line)
                totals[it.sale_id] = (totals[it.sale_id] || 0) + line.total
                counts[it.sale_id] = (counts[it.sale_id] || 0) + 1
            }
            setDetails(bySale)
            setRows(
                headers.map((h) => ({
                    id: h.id,
                    date: h.date,
                    reference: h.reference,
                    vseName: h.expand?.vse_customer_id?.name || "Unknown VSE",
                    empties_received: h.empties_received || 0,
                    sale_status: h.sale_status,
                    empties_status: h.empties_status,
                    posted_to_summary: !!h.posted_to_summary,
                    sale_posted: !!h.sale_posted,
                    empties_posted: !!h.empties_posted,
                    orderId: typeof h.order_id === 'string' ? h.order_id : h.order_id?.id || null,
                    total: totals[h.id] || 0,
                    itemCount: counts[h.id] || 0,
                }))
            )
        } catch (error) {
            console.error('Error fetching approval queue:', error)
            toast.error('Failed to load approval queue')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchQueue()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])

    const reviewer = profile?.full_name || profile?.id || 'manager'

    const handleApprove = async () => {
        if (!actionId) return
        setActionLoading(true)
        try {
            const posted = await approveFieldSaleDimension(actionId, dimension, reviewer)
            const side = dimension === "sale"
                ? "Sale approved — added to the VSE pending order for the cashier"
                : "Empties posted to Loadout Summary"
            toast.success(posted ? side : "Approved")
            setConfirmOpen(false)
            setActionId(null)
            await fetchQueue()
        } catch (error: any) {
            console.error('Approve failed:', error)
            toast.error(error?.message || 'Failed to approve')
        } finally {
            setActionLoading(false)
        }
    }

    // Recovery for records whose approval succeeded but posting did not
    // (e.g. a posting failure left them approved but unposted). Posts
    // whichever approved-but-unposted side(s) remain on this record.
    const handleRetryPost = async (saleId: string, retryDimension: FieldSaleDimension) => {
        setActionId(saleId)
        setActionLoading(true)
        try {
            const posted = retryDimension === "sale"
                ? await tryPostSaleSide(saleId)
                : await tryPostEmptiesSide(saleId)
            if (posted) {
                toast.success("Posted to Loadout Summary")
            } else {
                toast.info("Not approved yet — nothing posted")
            }
            await fetchQueue()
        } catch (error: any) {
            console.error('Retry posting failed:', error)
            toast.error(error?.message || 'Posting failed')
        } finally {
            setActionLoading(false)
            setActionId(null)
        }
    }

    const handleReject = async () => {
        if (!actionId) return
        if (!rejectReason.trim()) {
            toast.error('A reason is required to reject')
            return
        }
        setActionLoading(true)
        try {
            await rejectFieldSaleDimension(actionId, dimension, reviewer, rejectReason)
            toast.success("Rejected — returned to the VSE for correction")
            setRejectOpen(false)
            setActionId(null)
            setRejectReason("")
            await fetchQueue()
        } catch (error: any) {
            console.error('Reject failed:', error)
            toast.error(error?.message || 'Failed to reject')
        } finally {
            setActionLoading(false)
        }
    }

    const statusBadge = (value: FieldSaleStatus) => (
        <Badge
            variant="outline"
            className={cn(
                "text-[11px]",
                value === "pending" && "bg-amber-50 text-amber-800 border-amber-200",
                value === "approved" && "bg-green-50 text-green-800 border-green-200",
                value === "rejected" && "bg-red-50 text-red-800 border-red-200"
            )}
        >
            {value}
        </Badge>
    )

    const tabs = ["pending", "approved", "rejected", "all"] as const

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                <p className="text-muted-foreground">{description}</p>
            </div>

            <div className="flex gap-2 flex-wrap">
                {tabs.map((t) => (
                    <Button
                        key={t}
                        variant={filter === t ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter(t)}
                        className="capitalize"
                    >
                        {t}
                    </Button>
                ))}
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>VSE</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Empties</TableHead>
                                <TableHead>{dimension === "sale" ? "Sale" : "Empties"}</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-32 text-center">
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                            <span className="text-sm">Loading queue...</span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground italic">
                                        Nothing here.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.flatMap((row) => {
                                    const mine = row[dimField] as FieldSaleStatus
                                    const out = [
                                        <TableRow key={row.id} className="hover:bg-muted/50">
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        const next = new Set(expanded)
                                                        if (next.has(row.id)) next.delete(row.id)
                                                        else next.add(row.id)
                                                        setExpanded(next)
                                                    }}
                                                >
                                                    {expanded.has(row.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-mono text-sm font-bold">{row.reference}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {formatRowDate(row.date)}
                                                    {row.posted_to_summary ? " · Counted" : ""}
                                                    {dimension === "sale" && row.sale_status === "approved" && !row.sale_posted ? " · In pending order" : ""}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{row.vseName}</TableCell>
                                            <TableCell className="text-right font-bold">GH₵ {row.total.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{row.empties_received}</TableCell>
                                            <TableCell>{statusBadge(mine)}</TableCell>
                                            <TableCell className="text-right">
                                                {(() => {
                                                    const minePosted = dimension === "sale" ? row.sale_posted : row.empties_posted
                                                    if (mine === "pending") {
                                                        return (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    className="bg-green-700 hover:bg-green-800"
                                                                    onClick={() => {
                                                                        setActionId(row.id)
                                                                        setConfirmOpen(true)
                                                                    }}
                                                                >
                                                                    <Check className="h-4 w-4 mr-1" /> Approve
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    onClick={() => {
                                                                        setActionId(row.id)
                                                                        setRejectReason("")
                                                                        setRejectOpen(true)
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4 mr-1" /> Reject
                                                                </Button>
                                                            </div>
                                                        )
                                                    }
                                                    if (mine === "approved" && !minePosted) {
                                                        return (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleRetryPost(row.id, dimension)}
                                                                disabled={actionLoading}
                                                            >
                                                                {actionLoading ? (
                                                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                                ) : (
                                                                    <RotateCcw className="h-4 w-4 mr-1" />
                                                                )}
                                                                Retry posting
                                                            </Button>
                                                        )
                                                    }
                                                    return <span className="text-xs text-muted-foreground">—</span>
                                                })()}
                                            </TableCell>
                                        </TableRow>,
                                    ]
                                    if (expanded.has(row.id)) {
                                        out.push(
                                            <TableRow key={`${row.id}-detail`}>
                                                <TableCell colSpan={7} className="bg-muted/30">
                                                    <div className="rounded-md border bg-background divide-y text-sm max-w-2xl">
                                                        {(details[row.id] || []).map((d, idx) => (
                                                            <div key={idx} className="flex justify-between px-3 py-2">
                                                                <span>{d.name} × {d.qty}</span>
                                                                <span className="font-bold">GH₵ {d.total.toFixed(2)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    }
                                    return out
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={`Approve ${dimension === "sale" ? "sale" : "empties"}?`}
                description={dimension === "sale"
                    ? "This adds the sale to the VSE's pending order for the day — the cashier collects the cash and approves it in Orders. Empties still post to the Loadout Summary on their own check."
                    : "This records your approval and posts the empties to the Loadout Summary right away — no waiting on the other check."}
                confirmLabel="Approve"
                loading={actionLoading}
                onConfirm={handleApprove}
            />

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Reject {dimension === "sale" ? "sale" : "empties"}?</DialogTitle>
                        <DialogDescription>
                            The VSE will see your reason and can correct and resubmit.
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="Reason for rejection (required)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        disabled={actionLoading}
                        className="h-12 text-base"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={actionLoading}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reject
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
