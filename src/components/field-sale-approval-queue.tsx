import { useState, useEffect, useMemo } from "react"
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
    aggregateFieldSaleItems,
    aggregateGroupEmpties,
    approveEmptiesGroup,
    approveFieldSaleDimension,
    approveSaleGroup,
    emptiesGroupKey,
    rejectEmptiesGroup,
    rejectFieldSaleDimension,
    rejectSaleGroup,
    tryPostSaleSide,
    tryPostEmptiesSide,
    type EmptiesShareLine,
    type FieldSaleDimension,
    type FieldSaleStatus,
} from "@/lib/fieldSales"
import { toast } from "sonner"

interface QueueRow {
    id: string
    date: string
    reference: string
    vseId: string
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

interface QueueDetailLine {
    productId: string
    name: string
    qty: number
    unitPrice: number
    total: number
    returnable: boolean
}

interface ApprovalGroup {
    key: string
    vseId: string
    vseName: string
    day: string
    saleIds: string[]
    references: string[]
    reportCount: number
    totalEmpties: number
    totalCash: number
    /** Empties-only product breakdown (empties page), sorted by name. */
    emptiesBreakdown: { productId: string; name: string; qty: number }[]
    /** Cash product breakdown (sales page): summed qty + sub-total. */
    saleBreakdown: { productId: string; name: string; qty: number; total: number }[]
    /** Member rows kept for per-report reject + ref list. */
    members: QueueRow[]
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
    const [details, setDetails] = useState<Record<string, QueueDetailLine[]>>({})
    const [actionId, setActionId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState("")
    // Group-level actions (pending view): one approval button per VSE-day
    // card. Null when the dialog targets a single row instead.
    const [groupAction, setGroupAction] = useState<ApprovalGroup | null>(null)

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
            const bySale: Record<string, QueueDetailLine[]> = {}
            const totals: Record<string, number> = {}
            const counts: Record<string, number> = {}
            for (const it of items) {
                const rel = it.expand?.product_id
                const line: QueueDetailLine = {
                    productId: typeof it.product_id === 'string' ? it.product_id : "",
                    name: rel?.sku_name || "Unknown",
                    qty: it.quantity || 0,
                    unitPrice: it.unit_price || 0,
                    total: it.sub_total ?? (it.quantity || 0) * (it.unit_price || 0),
                    returnable: rel?.returnable === true,
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
                    vseId: typeof h.vse_customer_id === 'string'
                        ? h.vse_customer_id
                        : h.vse_customer_id?.id || h.expand?.vse_customer_id?.id || "",
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

    // Grouped pending view: one card per VSE per day on both approval
    // pages. Empties cards show the empties-only product breakdown
    // (pro-rata split summed across the group's reports via the shared
    // pure helper); sales cards show summed qty + cash per product.
    const approvalGroups: ApprovalGroup[] = useMemo(() => {
        if (filter !== "pending") return []
        const byKey = new Map<string, QueueRow[]>()
        for (const row of rows) {
            const key = emptiesGroupKey(row.vseId || row.vseName, row.date)
            const list = byKey.get(key)
            if (list) list.push(row)
            else byKey.set(key, [row])
        }
        const groups: ApprovalGroup[] = []
        for (const [key, members] of byKey) {
            const first = members[0]
            const day = String(first.date).slice(0, 10)
            const aggregate = aggregateGroupEmpties(
                members.map((m) => ({
                    saleId: m.id,
                    emptiesReceived: m.empties_received || 0,
                    lines: ((details[m.id] || [])
                        .filter((d) => d.productId)
                        .map((d): EmptiesShareLine => ({
                            productId: d.productId,
                            quantity: d.qty || 0,
                            returnable: d.returnable,
                        }))),
                }))
            )
            const names: Record<string, string> = {}
            for (const m of members) {
                for (const d of details[m.id] || []) {
                    if (d.productId && !names[d.productId]) names[d.productId] = d.name
                }
            }
            const emptiesBreakdown = Object.entries(aggregate)
                .map(([productId, qty]) => ({ productId, name: names[productId] || "Unknown", qty }))
                .sort((a, b) => a.name.localeCompare(b.name))
            const saleBreakdown = aggregateFieldSaleItems(
                members.flatMap((m) => (details[m.id] || [])
                    .filter((d) => d.productId)
                    .map((d) => ({
                        productId: d.productId,
                        quantity: d.qty || 0,
                        unitPrice: d.unitPrice || 0,
                        subTotal: d.total,
                    })))
            )
                .map((l) => ({ productId: l.productId, name: names[l.productId] || "Unknown", qty: l.quantity, total: l.subTotal }))
                .sort((a, b) => a.name.localeCompare(b.name))
            groups.push({
                key,
                vseId: first.vseId,
                vseName: first.vseName,
                day,
                saleIds: members.map((m) => m.id),
                references: members.map((m) => m.reference),
                reportCount: members.length,
                totalEmpties: members.reduce((sum, m) => sum + (m.empties_received || 0), 0),
                totalCash: members.reduce((sum, m) => sum + (m.total || 0), 0),
                emptiesBreakdown,
                saleBreakdown,
                members,
            })
        }
        groups.sort((a, b) => b.day.localeCompare(a.day) || a.vseName.localeCompare(b.vseName))
        return groups
    }, [filter, rows, details])

    const useGroupedView = filter === "pending"

    const handleApproveGroup = async () => {
        if (!groupAction) return
        setActionLoading(true)
        try {
            const result = dimension === "sale"
                ? await approveSaleGroup(groupAction.saleIds, reviewer)
                : await approveEmptiesGroup(groupAction.saleIds, reviewer)
            const okLabel = dimension === "sale"
                ? `Approved GH₵ ${groupAction.totalCash.toFixed(2)} — added to the VSE pending order for the cashier`
                : `Approved ${groupAction.totalEmpties} empties — posted to Loadout Summary`
            if (result.failed.length === 0) {
                toast.success(okLabel)
            } else if (result.succeeded.length === 0) {
                toast.error(`Approval failed: ${result.failed[0]?.error || "unknown error"}`)
            } else {
                toast.warning(
                    `${result.succeeded.length} of ${groupAction.saleIds.length} approved — ` +
                    result.failed.map((f) => f.error).join("; ")
                )
            }
            setConfirmOpen(false)
            setGroupAction(null)
            await fetchQueue()
        } catch (error: unknown) {
            console.error('Group approve failed:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to approve')
        } finally {
            setActionLoading(false)
        }
    }

    const handleRejectGroup = async () => {
        if (!groupAction) return
        if (!rejectReason.trim()) {
            toast.error('A reason is required to reject')
            return
        }
        setActionLoading(true)
        try {
            const result = dimension === "sale"
                ? await rejectSaleGroup(groupAction.saleIds, reviewer, rejectReason)
                : await rejectEmptiesGroup(groupAction.saleIds, reviewer, rejectReason)
            if (result.failed.length === 0) {
                toast.success("Rejected — returned to the VSE for correction")
            } else if (result.succeeded.length === 0) {
                toast.error(`Rejection failed: ${result.failed[0]?.error || "unknown error"}`)
            } else {
                toast.warning(
                    `${result.succeeded.length} of ${groupAction.saleIds.length} rejected — ` +
                    result.failed.map((f) => f.error).join("; ")
                )
            }
            setRejectOpen(false)
            setGroupAction(null)
            setRejectReason("")
            await fetchQueue()
        } catch (error: unknown) {
            console.error('Group reject failed:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to reject')
        } finally {
            setActionLoading(false)
        }
    }


    const handleApprove = async () => {
        if (groupAction) {
            await handleApproveGroup()
            return
        }
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
        if (groupAction) {
            await handleRejectGroup()
            return
        }
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

            {useGroupedView ? (
                <div className="space-y-4">
                    {loading ? (
                        <Card>
                            <CardContent className="h-32 flex items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin" />
                                <span className="text-sm">Loading queue...</span>
                            </CardContent>
                        </Card>
                    ) : approvalGroups.length === 0 ? (
                        <Card>
                            <CardContent className="h-24 flex items-center justify-center text-muted-foreground italic">
                                Nothing here.
                            </CardContent>
                        </Card>
                    ) : (
                        approvalGroups.map((group) => {
                            const groupExpanded = expanded.has(`group-${group.key}`)
                            const toggleGroup = () => {
                                const next = new Set(expanded)
                                if (next.has(`group-${group.key}`)) next.delete(`group-${group.key}`)
                                else next.add(`group-${group.key}`)
                                setExpanded(next)
                            }
                            const isSale = dimension === "sale"
                            const breakdownEmpty = isSale
                                ? group.saleBreakdown.length === 0
                                : group.emptiesBreakdown.length === 0
                            return (
                                <Card key={group.key}>
                                    <CardContent className="p-4 space-y-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="text-lg font-bold">{group.vseName}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {formatRowDate(group.day)} · {group.reportCount} report{group.reportCount === 1 ? "" : "s"}
                                                    {" · "}
                                                    {group.references.join(", ")}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-semibold text-muted-foreground uppercase">
                                                    {isSale ? "Total sale" : "Total empties"}
                                                </div>
                                                <div className="text-3xl font-black">
                                                    {isSale ? `GH₵ ${group.totalCash.toFixed(2)}` : group.totalEmpties}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-md border divide-y text-sm">
                                            {breakdownEmpty ? (
                                                <div className="px-3 py-2 text-muted-foreground italic">
                                                    {isSale
                                                        ? "No line items — nothing to approve."
                                                        : group.totalEmpties === 0
                                                            ? "No empties reported — approval just clears the queue."
                                                            : "No returnable lines — nothing will post to the Loadout Summary."}
                                                </div>
                                            ) : isSale ? (
                                                group.saleBreakdown.map((b) => (
                                                    <div key={b.productId} className="flex justify-between px-3 py-2">
                                                        <span>{b.name} × {b.qty}</span>
                                                        <span className="font-bold">GH₵ {b.total.toFixed(2)}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                group.emptiesBreakdown.map((b) => (
                                                    <div key={b.productId} className="flex justify-between px-3 py-2">
                                                        <span>{b.name}</span>
                                                        <span className="font-bold">{b.qty} empties</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                className="bg-green-700 hover:bg-green-800"
                                                disabled={actionLoading}
                                                onClick={() => {
                                                    setGroupAction(group)
                                                    setActionId(null)
                                                    setConfirmOpen(true)
                                                }}
                                            >
                                                <Check className="h-4 w-4 mr-1" />
                                                {isSale ? `Approve GH₵ ${group.totalCash.toFixed(2)}` : `Approve ${group.totalEmpties} empties`}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                disabled={actionLoading}
                                                onClick={() => {
                                                    setGroupAction(group)
                                                    setActionId(null)
                                                    setRejectReason("")
                                                    setRejectOpen(true)
                                                }}
                                            >
                                                <X className="h-4 w-4 mr-1" /> Reject group
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={toggleGroup}>
                                                {groupExpanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                                                {groupExpanded ? "Hide reports" : "Show reports"}
                                            </Button>
                                        </div>

                                        {groupExpanded && (
                                            <div className="rounded-md border divide-y text-sm bg-muted/20">
                                                {group.members.map((m) => (
                                                    <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                                        <div>
                                                            <span className="font-mono font-bold">{m.reference}</span>
                                                            <span className="text-muted-foreground">
                                                                {isSale
                                                                    ? ` · GH₵ ${m.total.toFixed(2)}`
                                                                    : ` · ${m.empties_received} empties`}
                                                            </span>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={actionLoading}
                                                            onClick={() => {
                                                                setGroupAction(null)
                                                                setActionId(m.id)
                                                                setRejectReason("")
                                                                setRejectOpen(true)
                                                            }}
                                                        >
                                                            <X className="h-4 w-4 mr-1" /> Reject
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )
                        })
                    )}
                </div>
            ) : (
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
            )}

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open)
                    if (!open) setGroupAction(null)
                }}
                title={groupAction
                    ? dimension === "sale"
                        ? `Approve GH₵ ${groupAction.totalCash.toFixed(2)}?`
                        : `Approve ${groupAction.totalEmpties} empties?`
                    : `Approve ${dimension === "sale" ? "sale" : "empties"}?`}
                description={groupAction
                    ? `${groupAction.vseName} · ${formatRowDate(groupAction.day)} · ${groupAction.reportCount} report${groupAction.reportCount === 1 ? "" : "s"}. ` +
                      (dimension === "sale"
                          ? (groupAction.saleBreakdown.length > 0
                              ? groupAction.saleBreakdown.map((b) => `${b.name} × ${b.qty}`).join(" · ") + ". "
                              : "") +
                            "This adds the sales to the VSE's pending order for the day — the cashier collects the cash and approves it in Orders."
                          : (groupAction.emptiesBreakdown.length > 0
                              ? groupAction.emptiesBreakdown.map((b) => `${b.name}: ${b.qty}`).join(" · ") + ". "
                              : "") +
                            "This posts the empties to the Loadout Summary right away.")
                    : dimension === "sale"
                        ? "This adds the sale to the VSE's pending order for the day — the cashier collects the cash and approves it in Orders. Empties still post to the Loadout Summary on their own check."
                        : "This records your approval and posts the empties to the Loadout Summary right away — no waiting on the other check."}
                confirmLabel={groupAction
                    ? dimension === "sale"
                        ? `Approve GH₵ ${groupAction.totalCash.toFixed(2)}`
                        : `Approve ${groupAction.totalEmpties} empties`
                    : "Approve"}
                loading={actionLoading}
                onConfirm={handleApprove}
            />

            <Dialog open={rejectOpen} onOpenChange={(open) => {
                setRejectOpen(open)
                if (!open) setGroupAction(null)
            }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>
                            {groupAction
                                ? dimension === "sale"
                                    ? `Reject ${groupAction.reportCount} report${groupAction.reportCount === 1 ? "" : "s"} (GH₵ ${groupAction.totalCash.toFixed(2)})?`
                                    : `Reject ${groupAction.reportCount} report${groupAction.reportCount === 1 ? "" : "s"} (${groupAction.totalEmpties} empties)?`
                                : `Reject ${dimension === "sale" ? "sale" : "empties"}?`}
                        </DialogTitle>
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
