import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Loader2, ChevronDown, ChevronRight, Printer, Download } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { pb, dayFilter } from "@/lib/pocketbase"
import { buildLoadoutBreakdownHtml, printReceiptHtml } from "@/lib/receipt"
import { toast } from "sonner"

interface ProductBreakdown {
    productId: string
    productName: string
    returnable: boolean
    given: number
    sold: number
    /** Unsold products returned — empties posts backed out (see fetchData). */
    returned: number
    balance: number
}

interface VSERow {
    id: string
    vseName: string
    givenRet: number
    givenNonRet: number
    given: number
    sold: number
    /** Unsold products returned (Record VSE Returns) — excludes empties. */
    returned: number
    /** Empties handed back (validated field sales). */
    emptiesReturned: number
    balance: number
    /** Returnable units sold minus empties returned. */
    emptiesBalance: number
    details: ProductBreakdown[]
}

export default function Loadout() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [rows, setRows] = useState<VSERow[]>([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchData()
    }, [date])

    const toggleExpanded = (vseId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(vseId)) {
                next.delete(vseId)
            } else {
                next.add(vseId)
            }
            return next
        })
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const target = date ?? new Date()

            // 1. VSE roster: every Retailer (VSE) customer gets a row
            const typeData = await pb
                .collection("customer_types")
                .getFirstListItem('name = "Retailer (VSE)"')
            const vses = await pb.collection("customers").getFullList({
                filter: `type_id = "${typeData.id}" && deleted_at = ""`,
                sort: "name",
                fields: "id, name",
            })

            // 2. Approved loadouts for the selected date -> Quantity Given,
            // split into returnable / non-returnable via the product master
            const loadouts = await pb.collection("loadouts").getFullList({
                filter: `${dayFilter("date", target)} && status = "approved"`,
                fields: "id, vse_id",
            })
            const loadoutIds = loadouts.map((l) => l.id)
            const givenRetByVse: Record<string, number> = {}
            const givenNonRetByVse: Record<string, number> = {}
            // vseId -> productId -> qty, plus product master info
            const givenByKey: Record<string, number> = {}
            const productMeta: Record<string, { name: string; returnable: boolean }> = {}
            const captureProduct = (productId: string, expand: unknown) => {
                if (!productId || productMeta[productId]) return
                const p = (expand as { product_id?: { sku_name?: string; returnable?: boolean } } | undefined)?.product_id
                productMeta[productId] = {
                    name: p?.sku_name || "Unknown product",
                    returnable: p?.returnable === true,
                }
            }
            if (loadoutIds.length > 0) {
                const loadoutItems = await pb
                    .collection("loadout_items")
                    .getFullList({
                        filter: loadoutIds
                            .map((id) => `loadout_id = "${id}"`)
                            .join(" || "),
                        fields: "loadout_id, product_id, quantity, expand",
                        expand: "product_id",
                    })
                const vseByLoadout: Record<string, string> = {}
                for (const l of loadouts) {
                    vseByLoadout[l.id] = l.vse_id
                }
                for (const item of loadoutItems) {
                    const vseId = vseByLoadout[item.loadout_id]
                    if (!vseId || !item.product_id) continue
                    captureProduct(item.product_id, item.expand)
                    const qty = item.quantity || 0
                    givenByKey[`${vseId}||${item.product_id}`] =
                        (givenByKey[`${vseId}||${item.product_id}`] || 0) + qty
                    if (item.expand?.product_id?.returnable === true) {
                        givenRetByVse[vseId] = (givenRetByVse[vseId] || 0) + qty
                    } else {
                        givenNonRetByVse[vseId] = (givenNonRetByVse[vseId] || 0) + qty
                    }
                }
            }

            // 3. Field movements for the selected date -> Sold / Returned.
            // Sold is additionally split into returnable units (drives the
            // Outstanding Empties balance).
            const movements = await pb
                .collection("vse_movements")
                .getFullList({
                    filter: dayFilter("date", target),
                    fields: "vse_id, product_id, quantity, movement_type, expand",
                    expand: "product_id",
                })
            const soldByVse: Record<string, number> = {}
            const soldRetByVse: Record<string, number> = {}
            const returnedByVse: Record<string, number> = {}
            const soldByKey: Record<string, number> = {}
            const returnedByKey: Record<string, number> = {}
            for (const m of movements) {
                if (!m.vse_id || !m.product_id) continue
                captureProduct(m.product_id, m.expand)
                const key = `${m.vse_id}||${m.product_id}`
                if (m.movement_type === "sold") {
                    soldByVse[m.vse_id] =
                        (soldByVse[m.vse_id] || 0) + (m.quantity || 0)
                    soldByKey[key] = (soldByKey[key] || 0) + (m.quantity || 0)
                    if (m.expand?.product_id?.returnable === true) {
                        soldRetByVse[m.vse_id] =
                            (soldRetByVse[m.vse_id] || 0) + (m.quantity || 0)
                    }
                } else if (m.movement_type === "returned") {
                    returnedByVse[m.vse_id] =
                        (returnedByVse[m.vse_id] || 0) + (m.quantity || 0)
                    returnedByKey[key] = (returnedByKey[key] || 0) + (m.quantity || 0)
                }
            }

            // 4. Validated field sales for the selected date -> empties
            // handed back. Only empties-posted sales count (their empties
            // already exist as `returned` movements), even when the sale
            // side is still pending — the two sides post independently.
            const emptiesByVse: Record<string, number> = {}
            try {
                const fieldSales = await pb
                    .collection("vse_field_sales")
                    .getFullList({
                        filter: `${dayFilter("date", target)} && empties_posted = true`,
                        fields: "vse_customer_id, empties_received",
                    })
                for (const s of fieldSales) {
                    if (!s.vse_customer_id) continue
                    emptiesByVse[s.vse_customer_id] =
                        (emptiesByVse[s.vse_customer_id] || 0) + (s.empties_received || 0)
                }
            } catch {
                // Collection may not exist on older DBs — treat as no empties
            }

            setRows(
                vses.map((vse) => {
                    const givenRet = givenRetByVse[vse.id] || 0
                    const givenNonRet = givenNonRetByVse[vse.id] || 0
                    const given = givenRet + givenNonRet
                    const sold = soldByVse[vse.id] || 0
                    const soldRet = soldRetByVse[vse.id] || 0
                    const emptiesReturned = emptiesByVse[vse.id] || 0
                    // Unsold products only: back out the empties posts (they
                    // live in `returned` movements too). Floor guards history
                    // where the two sources don't reconcile.
                    const returned = Math.max(0, (returnedByVse[vse.id] || 0) - emptiesReturned)

                    // Per-product breakdown: union of products seen in
                    // given / sold / returned for this VSE.
                    const productIds = new Set<string>()
                    for (const key of Object.keys(givenByKey)) {
                        const [v, p] = key.split("||")
                        if (v === vse.id) productIds.add(p)
                    }
                    for (const key of Object.keys(soldByKey)) {
                        const [v, p] = key.split("||")
                        if (v === vse.id) productIds.add(p)
                    }
                    for (const key of Object.keys(returnedByKey)) {
                        const [v, p] = key.split("||")
                        if (v === vse.id) productIds.add(p)
                    }

                    // Empties posts are `returned` movements on the same
                    // returnable products (pro-rata split at posting time),
                    // so back each VSE's empties out of its returnable
                    // products' returned qty pro-rata (largest remainder) to
                    // keep the breakdown summing to the summary row. No
                    // per-product empties column — the deduction is silent.
                    const retProductIds = [...productIds].filter(
                        (p) => productMeta[p]?.returnable === true && (returnedByKey[`${vse.id}||${p}`] || 0) > 0
                    )
                    const retReturnedTotal = retProductIds.reduce(
                        (sum, p) => sum + (returnedByKey[`${vse.id}||${p}`] || 0), 0
                    )
                    const emptiesShare: Record<string, number> = {}
                    if (emptiesReturned > 0 && retReturnedTotal > 0) {
                        const distributable = Math.min(emptiesReturned, retReturnedTotal)
                        const floors: { p: string; frac: number }[] = []
                        let floored = 0
                        for (const p of retProductIds) {
                            const raw = returnedByKey[`${vse.id}||${p}`] || 0
                            const exact = (distributable * raw) / retReturnedTotal
                            const fl = Math.floor(exact)
                            floored += fl
                            emptiesShare[p] = fl
                            floors.push({ p, frac: exact - fl })
                        }
                        floors.sort((a, b) => b.frac - a.frac)
                        let leftover = distributable - floored
                        for (const { p } of floors) {
                            if (leftover <= 0) break
                            const raw = returnedByKey[`${vse.id}||${p}`] || 0
                            if ((emptiesShare[p] || 0) < raw) {
                                emptiesShare[p] = (emptiesShare[p] || 0) + 1
                                leftover -= 1
                            }
                        }
                    }

                    const details: ProductBreakdown[] = [...productIds]
                        .map((p) => {
                            const g = givenByKey[`${vse.id}||${p}`] || 0
                            const s = soldByKey[`${vse.id}||${p}`] || 0
                            const rawRet = returnedByKey[`${vse.id}||${p}`] || 0
                            const r = Math.max(0, rawRet - (emptiesShare[p] || 0))
                            return {
                                productId: p,
                                productName: productMeta[p]?.name || "Unknown product",
                                returnable: productMeta[p]?.returnable === true,
                                given: g,
                                sold: s,
                                returned: r,
                                balance: g - s - r,
                            }
                        })
                        .sort((a, b) => a.productName.localeCompare(b.productName))

                    return {
                        id: vse.id,
                        vseName: vse.name,
                        givenRet,
                        givenNonRet,
                        given,
                        sold,
                        returned,
                        emptiesReturned,
                        balance: given - sold - returned,
                        // Empties owed on what was actually sold returnable
                        emptiesBalance: soldRet - emptiesReturned,
                        details,
                    }
                })
            )
        } catch (error) {
            console.error("Error fetching loadout summary:", error)
            toast.error("Failed to load VSE performance")
        } finally {
            setLoading(false)
        }
    }

    const hasActivity = rows.some((r) => r.details.length > 0)

    const handlePrint = () => {
        const target = date ?? new Date()
        const dateLabel = format(target, "PPP")
        printReceiptHtml(
            buildLoadoutBreakdownHtml(dateLabel, rows),
            `Loadout Breakdown — ${dateLabel}`
        )
    }

    const handleExportCsv = () => {
        const target = date ?? new Date()
        const dateStr = format(target, "yyyy-MM-dd")
        const quote = (v: string | number) =>
            typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`
        const lines = [
            ["Date", "VSE", "Product", "Type", "Given", "Sold", "Returned", "Balance"].join(","),
            ...rows.flatMap((r) =>
                r.details.map((d) =>
                    [
                        dateStr,
                        quote(r.vseName),
                        quote(d.productName),
                        d.returnable ? "RET" : "NON-RET",
                        d.given,
                        d.sold,
                        d.returned,
                        d.balance,
                    ].join(",")
                )
            ),
        ]
        const blob = new Blob([lines.join("\n")], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `loadout-breakdown-${dateStr}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Breakdown exported to CSV")
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Loadout Summary</h2>
                    <p className="text-muted-foreground">
                        Daily summary of VSE sales performance.
                    </p>
                </div>
            </div>

            {/* Date Selector + actions */}
            <div className="flex flex-wrap items-center gap-2">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-[240px] justify-start text-left font-normal",
                                !date && "text-muted-foreground"
                            )}
                            onClick={() => setCalendarOpen(true)}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <DatePicker
                            value={date}
                            onChange={(newDate) => {
                                setDate(newDate)
                                setCalendarOpen(false)
                            }}
                        />
                    </PopoverContent>
                </Popover>
                <Button
                    variant="outline"
                    onClick={handlePrint}
                    disabled={loading || !hasActivity}
                    className="gap-2"
                >
                    <Printer className="h-4 w-4" />
                    Print breakdown
                </Button>
                <Button
                    variant="outline"
                    onClick={handleExportCsv}
                    disabled={loading || !hasActivity}
                    className="gap-2"
                >
                    <Download className="h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Loadout Table */}
            <Card>
                <CardHeader>
                    <CardTitle>VSE Performance</CardTitle>
                        <CardDescription>
                            Returnable vs non-returnable given, sold, products returned,
                            empties returned, and both outstanding balances per VSE.
                            Expand a row for the per-product breakdown.
                        </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead>Name of VSE</TableHead>
                                <TableHead className="text-right">RET Quantity Given</TableHead>
                                <TableHead className="text-right">NON-RET Quantity Given</TableHead>
                                <TableHead className="text-right">Total Given</TableHead>
                                <TableHead className="text-right">Quantity Sold</TableHead>
                                <TableHead className="text-right">Quantity Returned</TableHead>
                                <TableHead className="text-right">Empties Returned</TableHead>
                                <TableHead className="text-right">Outstanding Balance</TableHead>
                                <TableHead className="text-right">Outstanding Empties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={10} className="h-40 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Loading VSE performance...
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : rows.length > 0 ? (
                                rows.flatMap((row) => {
                                    const isOpen = expanded.has(row.id)
                                    const expandable = row.details.length > 0
                                    const summaryRow = (
                                        <TableRow
                                            key={row.id}
                                            className={expandable ? "cursor-pointer hover:bg-muted/40" : undefined}
                                            onClick={() => expandable && toggleExpanded(row.id)}
                                        >
                                            <TableCell>
                                                {expandable && (
                                                    <span className="text-muted-foreground">
                                                        {isOpen ? (
                                                            <ChevronDown className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-medium">{row.vseName}</TableCell>
                                            <TableCell className="text-right">{row.givenRet}</TableCell>
                                            <TableCell className="text-right">{row.givenNonRet}</TableCell>
                                            <TableCell className="text-right font-medium">{row.given}</TableCell>
                                            <TableCell className="text-right">{row.sold}</TableCell>
                                            <TableCell className="text-right">{row.returned}</TableCell>
                                            <TableCell className="text-right">{row.emptiesReturned}</TableCell>
                                            <TableCell className={cn(
                                                "text-right font-bold",
                                                row.balance > 0 ? "text-red-500" : "text-green-500"
                                            )}>
                                                {row.balance}
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-right font-bold",
                                                row.emptiesBalance > 0 ? "text-red-500" : "text-green-500"
                                            )}>
                                                {row.emptiesBalance}
                                            </TableCell>
                                        </TableRow>
                                    )
                                    if (!isOpen) return [summaryRow]
                                    return [
                                        summaryRow,
                                        <TableRow key={`${row.id}-details`}>
                                            <TableCell />
                                            <TableCell colSpan={9} className="bg-muted/30 p-3">
                                                <div className="rounded-md border bg-white dark:bg-card">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Product</TableHead>
                                                                <TableHead>Type</TableHead>
                                                                <TableHead className="text-right">Given</TableHead>
                                                                <TableHead className="text-right">Sold</TableHead>
                                                                <TableHead className="text-right">Returned</TableHead>
                                                                <TableHead className="text-right">Balance</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {row.details.map((d) => (
                                                                <TableRow key={d.productId}>
                                                                    <TableCell className="font-medium">{d.productName}</TableCell>
                                                                    <TableCell>
                                                                        <Badge variant={d.returnable ? "default" : "outline"}>
                                                                            {d.returnable ? "RET" : "NON-RET"}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right">{d.given}</TableCell>
                                                                    <TableCell className="text-right">{d.sold}</TableCell>
                                                                    <TableCell className="text-right">{d.returned}</TableCell>
                                                                    <TableCell className={cn(
                                                                        "text-right font-bold",
                                                                        d.balance > 0 ? "text-red-500" : "text-green-500"
                                                                    )}>
                                                                        {d.balance}
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </TableCell>
                                        </TableRow>,
                                    ]
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground italic">
                                        No VSEs found. Add customers of type "Retailer (VSE)" to track performance.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
