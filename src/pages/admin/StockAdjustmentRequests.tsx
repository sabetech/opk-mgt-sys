import { useEffect, useState } from "react"
import { Loader2, ArrowUp, ArrowDown, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"
import ConfirmDialog from "@/components/ConfirmDialog"
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import {
    ADJUSTMENT_REASON_LABELS,
    approveAdjustmentRequest,
    rejectAdjustmentRequest,
    type AdjustmentDirection,
    type AdjustmentStatus,
} from "@/lib/adjustments"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface RequestItem {
    id: string
    productName: string
    productCode: string
    quantity: number
}

interface AdjustmentRequest {
    id: string
    date: string
    reference: string
    direction: AdjustmentDirection
    reason: string
    notes: string
    status: AdjustmentStatus
    requestedBy: string
    reviewedBy: string
    reviewedAt: string
    rejectReason: string
    created: string
    items: RequestItem[]
    totalQty: number
}

type StatusFilter = "pending" | "approved" | "rejected" | "all"

async function fetchRequests(status: StatusFilter): Promise<AdjustmentRequest[]> {
    const filter = status === "all" ? "" : `status = "${status}"`
    const requests = await pb.collection("stock_adjustment_requests").getFullList({
        filter: filter || undefined,
        sort: "-created",
    })

    const result: AdjustmentRequest[] = []
    for (const r of requests) {
        const items = await pb.collection("stock_adjustment_items").getFullList({
            filter: `request_id = "${r.id}"`,
            expand: "product_id",
        })
        const mappedItems: RequestItem[] = items.map((it) => {
            const product = it.expand?.product_id
            return {
                id: it.id,
                productName: product?.sku_name || "Unknown",
                productCode: product?.product_code || product?.code_name || "N/A",
                quantity: it.quantity,
            }
        })
        result.push({
            id: r.id,
            date: r.date,
            reference: r.reference,
            direction: r.direction,
            reason: r.reason || "",
            notes: r.notes || "",
            status: r.status,
            requestedBy: r.requested_by || "N/A",
            reviewedBy: r.reviewed_by || "",
            reviewedAt: r.reviewed_at || "",
            rejectReason: r.reject_reason || "",
            created: r.created,
            items: mappedItems,
            totalQty: mappedItems.reduce((s, i) => s + (i.quantity || 0), 0),
        })
    }
    return result
}

export default function StockAdjustmentRequests() {
    const { profile } = useAuth()
    const [filter, setFilter] = useState<StatusFilter>("pending")
    const [requests, setRequests] = useState<AdjustmentRequest[]>([])
    const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [actionId, setActionId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState(false)
    const [confirmApproveOpen, setConfirmApproveOpen] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState("")

    const load = async (status: StatusFilter) => {
        setLoading(true)
        try {
            const [rows, pending, approved, rejected] = await Promise.all([
                fetchRequests(status),
                pb.collection("stock_adjustment_requests").getList(1, 1, { filter: 'status = "pending"', fields: "id" }),
                pb.collection("stock_adjustment_requests").getList(1, 1, { filter: 'status = "approved"', fields: "id" }),
                pb.collection("stock_adjustment_requests").getList(1, 1, { filter: 'status = "rejected"', fields: "id" }),
            ])
            setRequests(rows)
            setCounts({
                pending: pending.totalItems,
                approved: approved.totalItems,
                rejected: rejected.totalItems,
            })
        } catch (error: any) {
            console.error("Error loading adjustment requests:", error)
            const msg: string = error?.message || ""
            if (msg.includes("Missing collection") || error?.status === 404) {
                toast.error("stock_adjustment_requests collection not found. Run scripts/setup-pocketbase.js to create it.")
            } else {
                toast.error("Failed to load adjustment requests")
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load(filter)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])

    const toggleRow = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const openApprove = (id: string) => {
        setActionId(id)
        setConfirmApproveOpen(true)
    }

    const openReject = (id: string) => {
        setActionId(id)
        setRejectReason("")
        setRejectOpen(true)
    }

    const handleApprove = async () => {
        if (!actionId) return
        if (!profile) {
            toast.error("User not authenticated")
            return
        }
        setActionLoading(true)
        try {
            await approveAdjustmentRequest(actionId, profile.full_name || profile.id)
            toast.success("Adjustment approved — stock updated")
            setConfirmApproveOpen(false)
            setActionId(null)
            await load(filter)
        } catch (error: any) {
            console.error("Approve failed:", error)
            toast.error(error?.message || "Failed to approve request")
        } finally {
            setActionLoading(false)
        }
    }

    const handleReject = async () => {
        if (!actionId) return
        if (!profile) {
            toast.error("User not authenticated")
            return
        }
        setActionLoading(true)
        try {
            await rejectAdjustmentRequest(actionId, profile.full_name || profile.id, rejectReason)
            toast.success("Adjustment request rejected")
            setRejectOpen(false)
            setActionId(null)
            await load(filter)
        } catch (error: any) {
            console.error("Reject failed:", error)
            toast.error(error?.message || "Failed to reject request")
        } finally {
            setActionLoading(false)
        }
    }

    const tabs: { value: StatusFilter; label: string; count: number | null }[] = [
        { value: "pending", label: "Pending", count: counts.pending },
        { value: "approved", label: "Approved", count: counts.approved },
        { value: "rejected", label: "Rejected", count: counts.rejected },
        { value: "all", label: "All", count: null },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Stock Adjustment Requests</h2>
                <p className="text-muted-foreground">
                    Review pending upward/downward adjustments. Stock changes only after approval.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
                        <p className="text-xs text-muted-foreground">Awaiting superuser approval</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Approved</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{counts.approved}</div>
                        <p className="text-xs text-muted-foreground">Stock applied</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Rejected</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{counts.rejected}</div>
                        <p className="text-xs text-muted-foreground">Cancelled requests</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex gap-2 flex-wrap">
                {tabs.map((t) => (
                    <Button
                        key={t.value}
                        variant={filter === t.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter(t.value)}
                    >
                        {t.label}
                        {t.count !== null && (
                            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                                {t.count}
                            </span>
                        )}
                    </Button>
                ))}
            </div>

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Direction</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Requested By</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-40 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground">Loading requests...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : requests.length > 0 ? (
                            requests.flatMap((req) => {
                                const rows = [
                                    <TableRow key={req.id} className="hover:bg-muted/50">
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => toggleRow(req.id)}>
                                                {expanded.has(req.id) ? (
                                                    <ChevronUp className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-mono text-sm">{req.reference}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {req.date ? format(new Date(req.date), "MMM d, yyyy") : ""}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={req.direction === "increase" ? "default" : "destructive"}
                                                className={cn(
                                                    req.direction === "increase" &&
                                                        "bg-green-100 text-green-800 border-green-200"
                                                )}
                                            >
                                                {req.direction === "increase" ? (
                                                    <span className="flex items-center gap-1">
                                                        <ArrowUp className="h-3 w-3" /> Increase
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1">
                                                        <ArrowDown className="h-3 w-3" /> Decrease
                                                    </span>
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm font-medium">
                                                {req.items.length} product(s)
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Total qty: {req.totalQty.toLocaleString()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm max-w-[220px]">
                                            {ADJUSTMENT_REASON_LABELS[req.reason] || req.reason || "—"}
                                        </TableCell>
                                        <TableCell className="text-sm">{req.requestedBy}</TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    req.status === "pending" &&
                                                        "bg-amber-50 text-amber-800 border-amber-200",
                                                    req.status === "approved" &&
                                                        "bg-green-50 text-green-800 border-green-200",
                                                    req.status === "rejected" &&
                                                        "bg-red-50 text-red-800 border-red-200"
                                                )}
                                            >
                                                {req.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {req.status === "pending" ? (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="bg-green-700 hover:bg-green-800"
                                                        onClick={() => openApprove(req.id)}
                                                    >
                                                        <Check className="h-4 w-4 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => openReject(req.id)}
                                                    >
                                                        <X className="h-4 w-4 mr-1" />
                                                        Cancel
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    {req.reviewedBy
                                                        ? `By ${req.reviewedBy}`
                                                        : "—"}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>,
                                ]
                                if (expanded.has(req.id)) {
                                    rows.push(
                                        <TableRow key={`${req.id}-detail`}>
                                            <TableCell colSpan={8} className="bg-muted/30">
                                                <div className="space-y-3 p-2">
                                                    {req.notes && (
                                                        <p className="text-sm text-muted-foreground bg-background p-3 rounded-md border">
                                                            <span className="font-semibold">Notes: </span>
                                                            {req.notes}
                                                        </p>
                                                    )}
                                                    {req.status === "rejected" && req.rejectReason && (
                                                        <p className="text-sm text-red-700 bg-red-50 p-3 rounded-md border border-red-200">
                                                            <span className="font-semibold">Cancel reason: </span>
                                                            {req.rejectReason}
                                                        </p>
                                                    )}
                                                    <div className="rounded-md border bg-background">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Product</TableHead>
                                                                    <TableHead>Code</TableHead>
                                                                    <TableHead className="text-right">Qty</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {req.items.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell className="font-medium">
                                                                            {item.productName}
                                                                        </TableCell>
                                                                        <TableCell>{item.productCode}</TableCell>
                                                                        <TableCell className="text-right font-mono font-bold">
                                                                            <span
                                                                                className={
                                                                                    req.direction === "increase"
                                                                                        ? "text-green-600"
                                                                                        : "text-red-600"
                                                                                }
                                                                            >
                                                                                {req.direction === "increase" ? "+" : "-"}
                                                                                {item.quantity}
                                                                            </span>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }
                                return rows
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground italic">
                                    No {filter === "all" ? "" : filter} requests found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <ConfirmDialog
                open={confirmApproveOpen}
                onOpenChange={setConfirmApproveOpen}
                title="Approve adjustment?"
                description="Stock will be increased/decreased and inventory logs will be created. This cannot be undone."
                confirmLabel="Approve"
                loading={actionLoading}
                onConfirm={handleApprove}
            />

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Cancel adjustment request?</DialogTitle>
                        <DialogDescription>
                            The request will be marked as rejected. Stock will not change. Optionally add a reason.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2 py-2">
                        <Label htmlFor="reject-reason">Reason (optional)</Label>
                        <textarea
                            id="reject-reason"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            placeholder="e.g. duplicate request, incorrect quantity..."
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={actionLoading}>
                            Back
                        </Button>
                        <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Cancel Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
