import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, Pencil } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/context/AuthContext"
import { pb, dayFilter } from "@/lib/pocketbase"
import FieldSaleForm, { type FieldSaleInitialItem } from "@/components/field-sale-form"
import { toast } from "sonner"

type SaleStatus = "pending" | "approved" | "rejected"

interface FieldSaleRow {
    id: string
    date: string
    reference: string
    empties_received: number
    sale_status: SaleStatus
    empties_status: SaleStatus
    sale_reject_reason: string
    empties_reject_reason: string
    posted_to_summary: boolean
    sale_posted: boolean
    empties_posted: boolean
    total: number
    itemCount: number
}

function StatusBadge({ value, label }: { value: SaleStatus; label: string }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                "text-[11px]",
                value === "pending" && "bg-amber-50 text-amber-800 border-amber-200",
                value === "approved" && "bg-green-50 text-green-800 border-green-200",
                value === "rejected" && "bg-red-50 text-red-800 border-red-200"
            )}
        >
            {label}: {value}
        </Badge>
    )
}

export default function MyFieldSales() {
    const { user } = useAuth()
    const [date, setDate] = useState<Date>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [rows, setRows] = useState<FieldSaleRow[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [details, setDetails] = useState<Record<string, { name: string; qty: number; total: number }[]>>({})
    const [editing, setEditing] = useState<{
        saleId: string
        date: string
        empties: number
        vseCustomerId: string
        vseCustomerName: string
        items: FieldSaleInitialItem[]
        salePosted: boolean
        emptiesPosted: boolean
    } | null>(null)

    const userId = user?.id || ""

    const fetchSales = async (target: Date) => {
        if (!userId) return
        setLoading(true)
        try {
            const headers = await pb.collection('vse_field_sales').getFullList({
                filter: `created_by = "${userId}" && ${dayFilter("date", target)}`,
            })
            // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
            headers.sort((a, b) => String(b.created).localeCompare(String(a.created)))
            const ids = headers.map((h) => h.id)
            const items = ids.length > 0
                ? await pb.collection('vse_field_sale_items').getFullList({
                    filter: ids.map((id) => `sale_id = "${id}"`).join(" || "),
                    expand: 'product_id',
                })
                : []
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
                    empties_received: h.empties_received || 0,
                    sale_status: h.sale_status,
                    empties_status: h.empties_status,
                    sale_reject_reason: h.sale_reject_reason || "",
                    empties_reject_reason: h.empties_reject_reason || "",
                    posted_to_summary: !!h.posted_to_summary,
                    sale_posted: !!h.sale_posted,
                    empties_posted: !!h.empties_posted,
                    total: totals[h.id] || 0,
                    itemCount: counts[h.id] || 0,
                }))
            )
        } catch (error) {
            console.error('Error fetching field sales:', error)
            toast.error('Failed to load your sales')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSales(date)
        setEditing(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, userId])

    const startEdit = async (row: FieldSaleRow) => {
        try {
            const [items, header] = await Promise.all([
                pb.collection('vse_field_sale_items').getFullList({
                    filter: `sale_id = "${row.id}"`,
                    expand: 'product_id',
                }),
                pb.collection('vse_field_sales').getOne(row.id, { fields: 'vse_customer_id' }),
            ])
            const vseId = typeof header.vse_customer_id === 'string'
                ? header.vse_customer_id
                : header.vse_customer_id?.id || ''
            const vseCustomer = vseId
                ? await pb.collection('customers').getOne(vseId, { fields: 'id, name' }).catch(() => null)
                : null
            setEditing({
                saleId: row.id,
                date: String(row.date).slice(0, 10),
                empties: row.empties_received,
                vseCustomerId: vseId,
                vseCustomerName: vseCustomer?.name || 'Your route',
                salePosted: row.sale_posted,
                emptiesPosted: row.empties_posted,
                items: items.map((it) => ({
                    id: crypto.randomUUID(),
                    productId: it.product_id,
                    productName: it.expand?.product_id?.sku_name || "Unknown",
                    productCode: it.expand?.product_id?.product_code || it.expand?.product_id?.code_name || "",
                    quantity: it.quantity,
                    unitPrice: it.unit_price || 0,
                })),
            })
            window.scrollTo({ top: 0, behavior: "smooth" })
        } catch (error) {
            console.error('Error loading sale for edit:', error)
            toast.error('Failed to load sale for editing')
        }
    }

    if (editing) {
        return (
            <div className="space-y-4">
                <div>
                        <h2 className="text-2xl font-bold tracking-tight">Edit Field Sale</h2>
                        <p className="text-sm text-muted-foreground">
                            {editing.salePosted || editing.emptiesPosted
                                ? "Only the not-yet-counted side can be changed — the counted side stays as approved."
                                : "Fix and resubmit — rejected checks restart."}
                        </p>
                    </div>
                    <FieldSaleForm
                        vseCustomerId={editing.vseCustomerId}
                        vseCustomerName={editing.vseCustomerName}
                        saleId={editing.saleId}
                        initialDate={editing.date}
                        initialItems={editing.items}
                        initialEmpties={editing.empties}
                        salePosted={editing.salePosted}
                        emptiesPosted={editing.emptiesPosted}
                        submitLabel="Update & Resubmit"
                    onSaved={() => {
                        setEditing(null)
                        fetchSales(date)
                    }}
                    onCancelEdit={() => setEditing(null)}
                />
            </div>
        )
    }

    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">My Sales</h2>
                <p className="text-sm text-muted-foreground">
                    Sales you recorded, with approval status.
                </p>
            </div>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-full h-12 justify-start text-left font-normal text-base"
                        onClick={() => setCalendarOpen(true)}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(date, "PPP")}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <DatePicker
                        value={date}
                        onChange={(newDate) => {
                            if (newDate) setDate(newDate)
                            setCalendarOpen(false)
                        }}
                    />
                </PopoverContent>
            </Popover>

            {loading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Loading...</p>
                </div>
            ) : rows.length === 0 ? (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        No sales recorded on {format(date, "PPP")}.
                    </CardContent>
                </Card>
            ) : (
                rows.map((row) => (
                    <Card key={row.id}>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono font-bold text-sm">{row.reference}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {row.itemCount} product(s) · {row.empties_received} empties
                                    </p>
                                </div>
                                <p className="font-black text-lg">GH₵ {row.total.toFixed(2)}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <StatusBadge value={row.sale_status} label="Sale" />
                                <StatusBadge value={row.empties_status} label="Empties" />
                                {row.posted_to_summary && (
                                    <Badge variant="secondary" className="text-[11px]">Counted</Badge>
                                )}
                                {row.sale_status === "approved" && !row.sale_posted && !row.posted_to_summary && (
                                    <Badge variant="outline" className="text-[11px] bg-blue-50 text-blue-800 border-blue-200">With cashier</Badge>
                                )}
                            </div>
                            {row.sale_status === "rejected" && row.sale_reject_reason && (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                    Sale rejected: {row.sale_reject_reason}
                                </p>
                            )}
                            {row.empties_status === "rejected" && row.empties_reject_reason && (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                    Empties rejected: {row.empties_reject_reason}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => {
                                        const next = new Set(expanded)
                                        if (next.has(row.id)) next.delete(row.id)
                                        else next.add(row.id)
                                        setExpanded(next)
                                    }}
                                >
                                    {expanded.has(row.id) ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                                    Items
                                </Button>
                                {!row.empties_posted && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => startEdit(row)}
                                    >
                                        <Pencil className="h-4 w-4 mr-1" /> Edit & Resubmit
                                    </Button>
                                )}
                            </div>
                            {expanded.has(row.id) && (
                                <div className="rounded-md border bg-muted/30 divide-y text-sm">
                                    {(details[row.id] || []).map((d, idx) => (
                                        <div key={idx} className="flex justify-between px-3 py-2">
                                            <span>{d.name} × {d.qty}</span>
                                            <span className="font-bold">GH₵ {d.total.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    )
}
