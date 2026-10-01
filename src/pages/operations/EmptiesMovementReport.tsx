import { useState, useEffect } from "react"
import { format, addDays, subDays } from "date-fns"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Loader2, Printer } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { pb, getFullListInBatches } from "@/lib/pocketbase"
import { groundPositions } from "@/lib/emptiesStock"
import {
    buildEmptiesMovementHtml,
    printReceiptHtml,
    type EmptiesMovementRecord,
    type EmptiesMovementSection,
} from "@/lib/receipt"
import { toast } from "sonner"

type TabKey = "in" | "out" | "ggbl" | "vse" | "breakages" | "openings" | "ground"

const TABS: { key: TabKey; label: string }[] = [
    { key: "in", label: "In From Customers" },
    { key: "out", label: "Out To Customers" },
    { key: "ggbl", label: "To GGBL" },
    { key: "vse", label: "VSE Returns" },
    { key: "breakages", label: "Breakages" },
    { key: "openings", label: "Customer Openings" },
    { key: "ground", label: "Ground Stock" },
]

/** Day-slice range bounds. Works whether the `date` field reads back as
 * "YYYY-MM-DD", full ISO, or normalized "YYYY-MM-DD HH:mm:ss.SSSZ". */
function rangeFilter(from: Date, to: Date): string {
    const fromStr = format(from, "yyyy-MM-dd")
    const exclusive = format(addDays(to, 1), "yyyy-MM-dd")
    return `date >= "${fromStr}" && date < "${exclusive}"`
}

function dayLabel(value: unknown): string {
    const s = String(value ?? "").slice(0, 10)
    const parsed = new Date(`${s}T12:00:00`)
    return isNaN(parsed.getTime()) ? s : format(parsed, "MMM d, yyyy")
}

export default function EmptiesMovementReport() {
    const [toDate, setToDate] = useState<Date>(new Date())
    const [fromDate, setFromDate] = useState<Date>(() => subDays(new Date(), 29))
    const [fromOpen, setFromOpen] = useState(false)
    const [toOpen, setToOpen] = useState(false)
    const [tab, setTab] = useState<TabKey>("in")
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const [records, setRecords] = useState<Record<TabKey, EmptiesMovementRecord[]>>({
        in: [],
        out: [],
        ggbl: [],
        vse: [],
        breakages: [],
        openings: [],
        ground: [],
    })
    const [groundOpening, setGroundOpening] = useState(0)
    const [groundClosing, setGroundClosing] = useState(0)

    const fetchData = async () => {
        if (!fromDate || !toDate) return
        setLoading(true)
        try {
            const range = rangeFilter(fromDate, toDate)

            // 1. Empties logs (customer in/out, GGBL, openings) + actors
            const logs = await pb.collection("empties_log").getFullList({
                filter: range,
                expand: "customer_id",
                $autoCancel: false,
            })
            const logIds = logs.map((l) => l.id)
            const details = logIds.length > 0
                ? await getFullListInBatches("empties_log_detail", "log_id", logIds, {
                    expand: "product_id",
                })
                : []
            const detailsByLog: Record<string, { name: string; qty: number }[]> = {}
            const logById = new Map<string, Record<string, unknown>>(logs.map((l) => [String(l.id), l]))
            const productNames: Record<string, string> = {}
            const returnsSinceFrom: Record<string, number> = {}
            for (const d of details) {
                const rel = d.expand?.product_id
                const pid = typeof d.product_id === "string" ? d.product_id : ""
                const name = rel?.sku_name || "Unknown"
                if (pid && !productNames[pid]) productNames[pid] = name
                ;(detailsByLog[d.log_id] = detailsByLog[d.log_id] || []).push({
                    name,
                    qty: d.quantity || 0,
                })
                const header = d.log_id ? logById.get(String(d.log_id)) : undefined
                if (header?.activity === "customer_empties_return" && pid) {
                    returnsSinceFrom[pid] = (returnsSinceFrom[pid] || 0) + (d.quantity || 0)
                }
            }

            const shapeLog = (l: Record<string, unknown>, actor: string, detail?: string): EmptiesMovementRecord => ({
                id: String(l.id),
                date: dayLabel(l.date),
                actor,
                detail,
                total: Number(l.total_quantity) || 0,
                lines: (detailsByLog[String(l.id)] || []).map((x) => ({
                    productName: x.name,
                    quantity: x.qty,
                })),
            })

            const byActivity: Record<TabKey, EmptiesMovementRecord[]> = {
                in: [],
                out: [],
                ggbl: [],
                vse: [],
                breakages: [],
                openings: [],
                ground: [],
            }
            for (const l of logs) {
                const customer = (l.expand as Record<string, { name?: string } | undefined> | undefined)?.customer_id
                const actor = customer?.name || "—"
                if (l.activity === "customer_empties_return") {
                    byActivity.in.push(shapeLog(l, actor))
                } else if (l.activity === "customer_purchase") {
                    byActivity.out.push(shapeLog(l, actor))
                } else if (l.activity === "empties_to_supplier") {
                    const meta = [l.vehicle_no ? `Vehicle ${l.vehicle_no}` : "", l.returned_by ? `by ${l.returned_by}` : ""]
                        .filter(Boolean)
                        .join(" · ")
                    byActivity.ggbl.push(shapeLog(l, actor === "—" ? "GGBL" : actor, meta || undefined))
                } else if (l.activity === "opening_balance") {
                    byActivity.openings.push(shapeLog(l, actor))
                }
            }

            // 2. VSE returns (separate tally system: vse_movements)
            const vseRows = await pb.collection("vse_movements").getFullList({
                filter: `movement_type = "returned" && ${range}`,
                expand: "vse_id, product_id",
                $autoCancel: false,
            })
            const byVseDay = new Map<string, EmptiesMovementRecord & { id: string }>()
            for (const m of vseRows) {
                const expand = (m.expand ?? {}) as Record<string, { name?: string; sku_name?: string } | undefined>
                const key = `${String(m.date).slice(0, 10)}||${String(m.vse_id)}||${String(m.product_id)}`
                const line = {
                    productName: expand.product_id?.sku_name || "Unknown",
                    quantity: m.quantity || 0,
                }
                const existing = byVseDay.get(key)
                if (existing) {
                    existing.total += line.quantity
                    existing.lines.push(line)
                } else {
                    byVseDay.set(key, {
                        id: key,
                        date: dayLabel(m.date),
                        actor: expand.vse_id?.name || "Unknown VSE",
                        total: line.quantity,
                        lines: [line],
                    })
                }
            }
            byActivity.vse = [...byVseDay.values()]

            // 3. Breakages
            const breakageRows = await pb.collection("breakages").getFullList({
                filter: range,
                expand: "product_id",
                $autoCancel: false,
            })
            byActivity.breakages = breakageRows.map((b) => {
                const rel = (b.expand as Record<string, { sku_name?: string } | undefined> | undefined)?.product_id
                const qty = b.quantity || 0
                return {
                    id: String(b.id),
                    date: dayLabel(b.date),
                    actor: rel?.sku_name || "Unknown",
                    detail: b.reason || undefined,
                    total: qty,
                    lines: [{ productName: rel?.sku_name || "Unknown", quantity: qty }],
                }
            })

            // 4. Ground positions: opening/closing on-ground qty per product,
            // reconstructed from the live tally minus returns since. Ground
            // moves only on customer returns, so backing those out of live
            // ground recovers both period boundaries.
            const toStr = format(toDate, "yyyy-MM-dd")
            const fromStr = format(fromDate, "yyyy-MM-dd")
            const todayStr = format(new Date(), "yyyy-MM-dd")
            const returnsAfterTo: Record<string, number> = {}
            if (format(addDays(toDate, 1), "yyyy-MM-dd") <= todayStr) {
                const laterLogs = await pb.collection("empties_log").getFullList({
                    filter: `activity = "customer_empties_return" && date >= "${format(addDays(toDate, 1), "yyyy-MM-dd")}"`,
                    fields: "id",
                    $autoCancel: false,
                })
                const laterIds = laterLogs.map((l) => l.id)
                if (laterIds.length > 0) {
                    const laterDetails = await getFullListInBatches("empties_log_detail", "log_id", laterIds, {
                        expand: "product_id",
                    })
                    for (const d of laterDetails) {
                        const pid = typeof d.product_id === "string" ? d.product_id : ""
                        if (!pid) continue
                        returnsAfterTo[pid] = (returnsAfterTo[pid] || 0) + (d.quantity || 0)
                        const rel = d.expand?.product_id
                        if (!productNames[pid]) productNames[pid] = rel?.sku_name || "Unknown"
                    }
                }
            }
            const yardRows = await pb.collection("empties").getFullList({
                fields: "product_id, quantity_on_ground",
                $autoCancel: false,
            })
            const liveGround: Record<string, number> = {}
            for (const r of yardRows) {
                if (r.product_id) liveGround[r.product_id] = r.quantity_on_ground || 0
            }
            const positions = groundPositions(liveGround, returnsSinceFrom, returnsAfterTo)
            const unnamed = positions.map((p) => p.productId).filter((pid) => !productNames[pid])
            if (unnamed.length > 0) {
                const prods = await getFullListInBatches("products", "id", [...new Set(unnamed)], {
                    fields: "id, sku_name",
                })
                for (const p of prods) productNames[p.id] = p.sku_name || p.id.slice(0, 8)
            }
            byActivity.ground = positions
                .filter((p) => p.opening !== 0 || p.received !== 0 || p.closing !== 0)
                .map((p) => ({
                    id: `ground:${p.productId}`,
                    date: `${fromStr} → ${toStr}`,
                    actor: productNames[p.productId] || p.productId.slice(0, 8),
                    total: p.closing,
                    lines: [
                        { productName: "Opening on ground", quantity: p.opening },
                        { productName: "Received in range", quantity: p.received },
                    ],
                }))
                .sort((a, b) => a.actor.localeCompare(b.actor))
            setGroundOpening(positions.reduce((s, p) => s + p.opening, 0))
            setGroundClosing(positions.reduce((s, p) => s + p.closing, 0))

            for (const key of Object.keys(byActivity) as TabKey[]) {
                byActivity[key].sort((a, b) => b.date.localeCompare(a.date))
            }
            setRecords(byActivity)
        } catch (error) {
            console.error("Error loading empties movement report:", error)
            toast.error("Failed to load empties movement report")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromDate, toDate])

    const totals: Record<TabKey, number> = {
        in: records.in.reduce((s, r) => s + r.total, 0),
        out: records.out.reduce((s, r) => s + r.total, 0),
        ggbl: records.ggbl.reduce((s, r) => s + r.total, 0),
        vse: records.vse.reduce((s, r) => s + r.total, 0),
        breakages: records.breakages.reduce((s, r) => s + r.total, 0),
        openings: records.openings.reduce((s, r) => s + r.total, 0),
        ground: groundClosing,
    }
    const net = totals.in - totals.out - totals.ggbl - totals.breakages

    const toggleRow = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handlePrint = () => {
        const sectionOf = (key: TabKey, title: string, totalLabel: string): EmptiesMovementSection => ({
            title,
            total: totals[key],
            totalLabel,
            records: records[key],
        })
        const html = buildEmptiesMovementHtml({
            from: fromDate ? format(fromDate, "yyyy-MM-dd") : "",
            to: toDate ? format(toDate, "yyyy-MM-dd") : "",
            summary: [
                { label: "Opening On Ground", value: groundOpening },
                { label: "In From Customers", value: totals.in },
                { label: "Out To Customers", value: totals.out },
                { label: "To GGBL", value: totals.ggbl },
                { label: "VSE Returns", value: totals.vse },
                { label: "Breakages", value: totals.breakages },
                { label: "Closing On Ground", value: totals.ground },
                { label: "Net (in − out − GGBL − breakages)", value: net },
            ],
            sections: [
                sectionOf("ground", "Ground Stock Positions", "Closing on ground"),
                sectionOf("in", "In From Customers", "Total in"),
                sectionOf("out", "Out To Customers", "Total out"),
                sectionOf("ggbl", "To GGBL", "Total sent"),
                sectionOf("vse", "VSE Returns", "Total back"),
                sectionOf("breakages", "Breakages", "Total broken"),
                sectionOf("openings", "Opening Balances", "Total opening"),
            ],
        })
        printReceiptHtml(html, "Empties Movement Report")
    }

    const rows = records[tab]
    const summaryCards = [
        { label: "Opening On Ground", value: groundOpening, tone: "text-blue-600" },
        { label: "In From Customers", value: totals.in, tone: "text-green-600" },
        { label: "Out To Customers", value: totals.out, tone: "text-amber-600" },
        { label: "To GGBL", value: totals.ggbl, tone: "text-muted-foreground" },
        { label: "VSE Returns", value: totals.vse, tone: "text-teal-600" },
        { label: "Breakages", value: totals.breakages, tone: "text-red-600" },
        { label: "Closing On Ground", value: totals.ground, tone: "text-blue-700" },
        { label: "Net", value: net, tone: net >= 0 ? "text-green-700" : "text-red-600" },
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Empties Movement Report</h2>
                    <p className="text-muted-foreground">
                        Which empties came in, from who, what went to GGBL, VSE returns, and breakages.
                    </p>
                </div>
                <Button variant="outline" onClick={handlePrint} disabled={loading} className="gap-2">
                    <Printer className="h-4 w-4" />
                    Print Report
                </Button>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="space-y-2">
                    <label className="text-sm font-medium">From</label>
                    <Popover open={fromOpen} onOpenChange={setFromOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn("w-[240px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}
                                onClick={() => setFromOpen(true)}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {fromDate ? format(fromDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DatePicker
                                value={fromDate}
                                onChange={(d) => {
                                    if (d) setFromDate(d)
                                    setFromOpen(false)
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">To</label>
                    <Popover open={toOpen} onOpenChange={setToOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn("w-[240px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}
                                onClick={() => setToOpen(true)}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {toDate ? format(toDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DatePicker
                                value={toDate}
                                onChange={(d) => {
                                    if (d) setToDate(d)
                                    setToOpen(false)
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {summaryCards.map((c) => (
                    <Card key={c.label}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-2xl font-bold", c.tone)}>{c.value.toLocaleString()}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex gap-2 flex-wrap">
                {TABS.map((t) => (
                    <Button
                        key={t.key}
                        variant={tab === t.key ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTab(t.key)}
                        className="gap-2"
                    >
                        {t.label}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {records[t.key].length}
                        </span>
                    </Button>
                ))}
            </div>

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>{tab === "ggbl" ? "Destination" : tab === "vse" ? "VSE" : tab === "breakages" ? "Product" : tab === "ground" ? "Product" : "Customer"}</TableHead>
                            <TableHead className="text-right">{tab === "ground" ? "Closing" : "Total Crates"}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center">
                                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin" />
                                        <span className="text-sm">Loading report...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : rows.length > 0 ? (
                            rows.flatMap((rec) => {
                                const key = `${tab}:${rec.id}`
                                const out = [
                                    <TableRow key={key} className="hover:bg-muted/50">
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => toggleRow(key)}>
                                                {expanded.has(key) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            </Button>
                                        </TableCell>
                                        <TableCell className="text-sm">{rec.date}</TableCell>
                                        <TableCell>
                                            <div className="font-medium text-sm">{rec.actor}</div>
                                            {rec.detail && (
                                                <div className="text-xs text-muted-foreground">{rec.detail}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-bold">{rec.total.toLocaleString()}</TableCell>
                                    </TableRow>,
                                ]
                                if (expanded.has(key) && rec.lines.length > 0) {
                                    out.push(
                                        <TableRow key={`${key}-detail`}>
                                            <TableCell colSpan={4} className="bg-muted/30">
                                                <div className="rounded-md border bg-background divide-y text-sm max-w-2xl">
                                                    {rec.lines.map((l, idx) => (
                                                        <div key={idx} className="flex justify-between px-3 py-2">
                                                            <span>{l.productName}</span>
                                                            <span className="font-bold">{l.quantity.toLocaleString()} crates</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )
                                }
                                return out
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground italic">
                                    No records in range.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
