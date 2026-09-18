import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { useNavigate } from "react-router-dom"
import { ClipboardList, Loader2, Printer, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { pb } from "@/lib/pocketbase"
import { printReceiptHtml } from "@/lib/receipt"
import { scoreEmptiesRow } from "@/lib/emptiesAnomaly"
import { askAI } from "@/lib/aiClient"

type EmptiesTake = {
    id: string
    date: string
    takenBy: string
    notes: string
}

type ComparisonRow = {
    productId: string
    name: string
    code: string
    systemAtTake: number
    counted: number
    varianceAtTake: number
    current: number
    drift: number
}

export default function EmptiesCountReports() {
    const navigate = useNavigate()
    const [takes, setTakes] = useState<EmptiesTake[]>([])
    const [takesAvailable, setTakesAvailable] = useState(true)
    const [selectedTakeId, setSelectedTakeId] = useState("")
    const [comparison, setComparison] = useState<ComparisonRow[]>([])
    const [loading, setLoading] = useState(true)
    const [takeLoading, setTakeLoading] = useState(false)

    // Anomaly view state (deterministic scoring; AI explanation on demand)
    const [flaggedOnly, setFlaggedOnly] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({})
    const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)

    const scored = useMemo(
        () => comparison.map((row) => ({
            ...row,
            anomaly: scoreEmptiesRow(
                { systemAtTake: row.systemAtTake, counted: row.counted, varianceAtTake: row.varianceAtTake, drift: row.drift },
                row.name,
            ),
        })),
        [comparison],
    )
    const visibleRows = flaggedOnly ? scored.filter((r) => r.anomaly.severity !== "info") : scored
    const flaggedCount = scored.filter((r) => r.anomaly.severity !== "info").length

    useEffect(() => {
        fetchTakes()
    }, [])

    const fetchTakes = async () => {
        try {
            const rows = await pb.collection('empties_count_takes').getFullList({
                sort: '-date,-created',
            })
            const mapped: EmptiesTake[] = rows.map((r) => ({
                id: r.id,
                date: r.date,
                takenBy: r.taken_by || 'N/A',
                notes: r.notes || '',
            }))
            setTakes(mapped)
            if (mapped.length > 0) {
                setSelectedTakeId(mapped[0].id)
                fetchTakeComparison(mapped[0].id)
            }
        } catch (error: any) {
            const msg = error?.message || ''
            if (msg.includes('Missing collection') || error?.status === 404) {
                setTakesAvailable(false)
            } else {
                console.error('Error fetching empties counts:', error)
            }
        } finally {
            setLoading(false)
        }
    }

    const fetchTakeComparison = async (takeId: string) => {
        setTakeLoading(true)
        try {
            const items = await pb.collection('empties_count_items').getFullList({
                filter: `take_id = "${takeId}"`,
                expand: 'product_id',
            })
            // Live on-ground quantities for drift calculation
            const productIds = items.map((it) =>
                typeof it.product_id === 'string' ? it.product_id : (it.expand?.product_id?.id || '')
            ).filter(Boolean)
            const currentMap: Record<string, number> = {}
            if (productIds.length > 0) {
                const live = await pb.collection('empties').getFullList({
                    filter: productIds.map((id) => `product_id = "${id}"`).join(' || '),
                    fields: 'product_id, quantity_on_ground',
                })
                for (const e of live) currentMap[e.product_id] = e.quantity_on_ground || 0
            }
            const rows: ComparisonRow[] = items.map((it) => {
                const product = it.expand?.product_id
                const pid = typeof it.product_id === 'string' ? it.product_id : product?.id || ''
                const current = currentMap[pid] ?? 0
                return {
                    productId: pid,
                    name: product?.sku_name || 'Unknown',
                    code: product?.code_name || 'N/A',
                    systemAtTake: it.system_qty ?? 0,
                    counted: it.physical_qty ?? 0,
                    varianceAtTake: it.variance ?? ((it.physical_qty ?? 0) - (it.system_qty ?? 0)),
                    current,
                    drift: current - (it.physical_qty ?? 0),
                }
            })
            rows.sort((a, b) => a.name.localeCompare(b.name))
            setComparison(rows)
        } catch (error) {
            console.error('Error fetching empties count comparison:', error)
        } finally {
            setTakeLoading(false)
        }
    }

    const handleTakeChange = (takeId: string) => {
        setSelectedTakeId(takeId)
        setExpandedId(null)
        setAiExplanations({})
        setFlaggedOnly(false)
        if (takeId) fetchTakeComparison(takeId)
        else setComparison([])
    }

    const handleExplain = async (row: (typeof scored)[number]) => {
        const key = `${selectedTakeId}:${row.productId}`
        if (aiExplanations[key] || aiLoadingId === row.productId) return
        setAiLoadingId(row.productId)
        const take = takes.find((t) => t.id === selectedTakeId)
        const fallback = row.anomaly.explanation
        const result = await askAI(
            `Why does ${row.name} show a variance of ${row.varianceAtTake} (system ${row.systemAtTake}, counted ${row.counted}) with drift ${row.drift}? Suggest the most likely cause and what to check.`,
            {
                take: take ? { date: take.date, takenBy: take.takenBy, notes: take.notes } : null,
                row: { product: row.name, code: row.code, systemAtTake: row.systemAtTake, counted: row.counted, variance: row.varianceAtTake, current: row.current, drift: row.drift, flags: row.anomaly.flags, score: row.anomaly.score },
                totals: { systemTotal, countedTotal, netVariance },
            },
            fallback,
        )
        setAiExplanations((prev) => ({ ...prev, [key]: result.answer }))
        setAiLoadingId(null)
    }

    const severityBadge = (severity: "info" | "warn" | "critical") =>
        severity === "critical" ? (
            <Badge variant="destructive">Critical</Badge>
        ) : severity === "warn" ? (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">Watch</Badge>
        ) : (
            <Badge variant="secondary">OK</Badge>
        )

    const handlePrint = () => {
        const take = takes.find((t) => t.id === selectedTakeId)
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        const bodyRows = comparison.map((r, i) => `<tr>
            <td class="center">${i + 1}</td>
            <td>${esc(r.name)}</td>
            <td>${esc(r.code)}</td>
            <td class="right">${r.systemAtTake}</td>
            <td class="right">${r.counted}</td>
            <td class="right">${r.varianceAtTake > 0 ? `+${r.varianceAtTake}` : r.varianceAtTake}</td>
            <td class="right">${r.current}</td>
            <td class="right">${r.drift > 0 ? `+${r.drift}` : r.drift}</td>
        </tr>`).join("")
        const generated = format(new Date(), "dd/MM/yyyy HH:mm")
        const takeLabel = take ? `${format(new Date(take.date), 'MMM d, yyyy')} — ${esc(take.takenBy)}` : ""
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Empties Count Report</title>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; }
h2 { margin: 0 0 4px; font-size: 18px; }
.company { font-size: 15px; font-weight: bold; }
.subtitle { color: #444; margin-bottom: 16px; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
th { background: #f0f0f0; font-weight: bold; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
.right { text-align: right; }
.center { text-align: center; }
@media print { body { margin: 0; } }
</style></head><body>
<div class="company">OPPONG KYEKYEKU DISTRIBUTION LTD</div>
<h2>Empties Count Report — On Ground</h2>
<div class="subtitle">Count: ${takeLabel} | Generated: ${generated} | Lines: ${comparison.length}</div>
<table><thead><tr>
<th class="center">#</th><th>Product</th><th>Code</th><th class="right">System at Take</th><th class="right">Counted</th><th class="right">Variance</th><th class="right">Current</th><th class="right">Drift</th>
</tr></thead><tbody>${bodyRows || `<tr><td colspan="8" class="center">No lines.</td></tr>`}</tbody></table>
</body></html>`
        printReceiptHtml(html, "Empties Count Report")
    }

    const selectedTake = takes.find((t) => t.id === selectedTakeId)
    const systemTotal = comparison.reduce((s, r) => s + r.systemAtTake, 0)
    const countedTotal = comparison.reduce((s, r) => s + r.counted, 0)
    const netVariance = comparison.reduce((s, r) => s + r.varianceAtTake, 0)
    const varianceCount = comparison.filter((r) => r.varianceAtTake !== 0).length

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading empties counts…</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Empties Count Reports</h2>
                    <p className="text-muted-foreground">
                        Frozen on-ground counts versus the live dynamic value. Differences are report-only.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/dashboard/operations/empties-count')} className="gap-2">
                        <ClipboardList className="h-4 w-4" />
                        New Count
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handlePrint}
                        disabled={comparison.length === 0 || takeLoading}
                        className="gap-2"
                    >
                        <Printer className="h-4 w-4" />
                        Print Report
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-muted-foreground" />
                        Count Variance Report
                    </CardTitle>
                    <CardDescription>
                        System on-ground frozen at count time, physical count, and drift since.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!takesAvailable ? (
                        <p className="text-sm text-muted-foreground italic">
                            No empties counts yet — submit one from Take Empties Count (run scripts/setup-pocketbase.js if the empties_count_takes collection is missing).
                        </p>
                    ) : takes.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No empties counts submitted yet.</p>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                                <select
                                    value={selectedTakeId}
                                    onChange={(e) => handleTakeChange(e.target.value)}
                                    className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm max-w-md"
                                >
                                    {takes.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.date ? format(new Date(t.date), 'MMM d, yyyy') : 'Count'} — {t.takenBy}{t.notes ? ` — ${t.notes}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedTake && (
                                    <Badge variant="secondary">
                                        {comparison.length} product(s) · {varianceCount} with variance · {flaggedCount} flagged
                                    </Badge>
                                )}
                                {flaggedCount > 0 && (
                                    <Button
                                        variant={flaggedOnly ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setFlaggedOnly((v) => !v)}
                                    >
                                        {flaggedOnly ? "Show all" : `Flagged only (${flaggedCount})`}
                                    </Button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-6 rounded-md bg-muted/30 px-4 py-3 text-sm">
                                <span>System total: <strong className="font-mono">{systemTotal.toLocaleString()}</strong></span>
                                <span>Counted total: <strong className="font-mono">{countedTotal.toLocaleString()}</strong></span>
                                <span>Net variance: <strong className={cn("font-mono", netVariance === 0 ? "" : netVariance > 0 ? "text-green-600" : "text-red-600")}>
                                    {netVariance > 0 ? `+${netVariance.toLocaleString()}` : netVariance.toLocaleString()}
                                </strong></span>
                            </div>

                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Product</TableHead>
                                            <TableHead>Code</TableHead>
                                            <TableHead className="text-right">System at Take</TableHead>
                                            <TableHead className="text-right">Counted</TableHead>
                                            <TableHead className="text-right">Variance</TableHead>
                                            <TableHead className="text-right">Current</TableHead>
                                            <TableHead className="text-right">Drift</TableHead>
                                            <TableHead>Signal</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {takeLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-24 text-center">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                </TableCell>
                                            </TableRow>
                                        ) : visibleRows.length > 0 ? (
                                            visibleRows.flatMap((row) => {
                                                const key = `${selectedTakeId}:${row.productId}`
                                                const expanded = expandedId === row.productId
                                                return [
                                                    <TableRow
                                                        key={row.productId}
                                                        className={cn(expanded && "bg-muted/30", "cursor-pointer")}
                                                        onClick={() => setExpandedId(expanded ? null : row.productId)}
                                                    >
                                                        <TableCell className="font-medium">{row.name}</TableCell>
                                                        <TableCell className="font-mono text-xs">{row.code}</TableCell>
                                                        <TableCell className="text-right text-muted-foreground font-mono">{row.systemAtTake}</TableCell>
                                                        <TableCell className="text-right font-bold">{row.counted}</TableCell>
                                                        <TableCell className={cn(
                                                            "text-right font-bold font-mono",
                                                            row.varianceAtTake === 0 ? "text-muted-foreground" : row.varianceAtTake > 0 ? "text-green-600" : "text-red-600"
                                                        )}>
                                                            {row.varianceAtTake > 0 ? `+${row.varianceAtTake}` : row.varianceAtTake}
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground font-mono">{row.current}</TableCell>
                                                        <TableCell className={cn(
                                                            "text-right font-mono",
                                                            row.drift === 0 ? "text-muted-foreground" : row.drift > 0 ? "text-green-600" : "text-red-600"
                                                        )}>
                                                            {row.drift > 0 ? `+${row.drift}` : row.drift}
                                                        </TableCell>
                                                        <TableCell>{severityBadge(row.anomaly.severity)}</TableCell>
                                                    </TableRow>,
                                                    ...(expanded ? [(
                                                        <TableRow key={`${row.productId}-why`}>
                                                            <TableCell colSpan={8} className="bg-muted/20">
                                                                <div className="space-y-2 text-sm">
                                                                    {row.anomaly.flags.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            {row.anomaly.flags.map((f) => (
                                                                                <Badge key={f} variant="outline">{f}</Badge>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <p className="text-muted-foreground">{row.anomaly.explanation}</p>
                                                                    {aiExplanations[key] && (
                                                                        <p className="rounded-md border border-muted bg-background p-2">
                                                                            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                                                                            {aiExplanations[key]}
                                                                        </p>
                                                                    )}
                                                                    {!aiExplanations[key] && (
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="gap-1.5"
                                                                            disabled={aiLoadingId === row.productId}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                handleExplain(row)
                                                                            }}
                                                                        >
                                                                            {aiLoadingId === row.productId ? (
                                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                            ) : (
                                                                                <Sparkles className="h-3.5 w-3.5" />
                                                                            )}
                                                                            Explain with AI
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )] : []),
                                                ]
                                            })
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                                    {flaggedOnly ? "No flagged lines in this count." : "No lines in this count."}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
