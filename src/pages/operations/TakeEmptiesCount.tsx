import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useNavigate } from "react-router-dom"
import { Calendar as CalendarIcon, Loader2, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { pb, getFullListInBatches } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

interface CountProduct {
    id: string
    name: string
    code: string
    systemQty: number
}

export default function TakeEmptiesCount() {
    const { profile } = useAuth()
    const navigate = useNavigate()
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)

    const [products, setProducts] = useState<CountProduct[]>([])
    const [counts, setCounts] = useState<Record<string, string>>({})
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [duplicateMonth, setDuplicateMonth] = useState(false)

    useEffect(() => {
        fetchProducts()
    }, [])

    // Warn (don't block) when this calendar month already has a submitted take
    useEffect(() => {
        if (!date) {
            setDuplicateMonth(false)
            return
        }
        let cancelled = false
        const monthPrefix = format(date, "yyyy-MM")
        pb.collection('empties_count_takes')
            .getList(1, 1, { filter: `date >= "${monthPrefix}-01" && date <= "${monthPrefix}-31"`, fields: 'id' })
            .then((res) => {
                if (!cancelled) setDuplicateMonth((res.totalItems ?? 0) > 0)
            })
            .catch(() => {
                // collection may not exist yet (pre-migration) — ignore
                if (!cancelled) setDuplicateMonth(false)
            })
        return () => {
            cancelled = true
        }
    }, [date])

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'returnable = true && deleted_at = ""',
                sort: 'sku_name',
                fields: 'id, sku_name, code_name, product_code',
            })

            const emptiesData = await getFullListInBatches('empties', 'product_id', data.map((p) => p.id), {
                fields: 'product_id, quantity_on_ground',
            })
            const groundMap: Record<string, number> = {}
            for (const e of emptiesData) {
                groundMap[e.product_id] = e.quantity_on_ground || 0
            }

            setProducts(data.map((p) => ({
                id: p.id,
                name: p.sku_name,
                code: p.product_code || p.code_name || '—',
                systemQty: groundMap[p.id] ?? 0,
            })))
        } catch (error) {
            console.error('Error fetching returnable products:', error)
            toast.error('Failed to load returnable products')
        } finally {
            setLoading(false)
        }
    }

    const parsedCount = (productId: string): number | null => {
        const raw = counts[productId]
        if (raw === undefined || raw.trim() === "") return null
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 0) return null
        return n
    }

    const filledCount = products.filter((p) => parsedCount(p.id) !== null).length
    const allFilled = products.length > 0 && filledCount === products.length

    const totals = products.reduce(
        (acc, p) => {
            const physical = parsedCount(p.id)
            acc.system += p.systemQty
            if (physical !== null) {
                acc.counted += physical
                acc.variance += physical - p.systemQty
                if (physical !== p.systemQty) acc.linesWithVariance += 1
            }
            return acc
        },
        { system: 0, counted: 0, variance: 0, linesWithVariance: 0 }
    )

    const handleSubmit = async () => {
        if (!date) {
            toast.error('Please select a date')
            return
        }
        if (!allFilled) {
            toast.error(`Please enter a physical count for all ${products.length} products (${filledCount} of ${products.length} filled)`)
            return
        }
        if (!profile) {
            toast.error('User not authenticated')
            return
        }

        setSaving(true)
        try {
            const dateStr = format(date, "yyyy-MM-dd")
            const takenBy = profile.full_name || profile.id

            let takeId: string
            try {
                const take = await pb.collection('empties_count_takes').create({
                    date: dateStr,
                    taken_by: takenBy,
                    taken_by_id: profile.id,
                    notes: notes.trim() || null,
                    status: 'submitted',
                })
                takeId = take.id
            } catch (err: any) {
                const msg = err?.message || ''
                if (msg.includes('Missing collection') || err?.status === 404) {
                    throw new Error('empties_count_takes collection not found. Run scripts/setup-pocketbase.js to create it.')
                }
                throw err
            }

            // One frozen snapshot row per returnable product. Never touches
            // the live empties collection — variances are report-only.
            for (const p of products) {
                const physical = parsedCount(p.id) ?? 0
                await pb.collection('empties_count_items').create({
                    take_id: takeId,
                    product_id: p.id,
                    system_qty: p.systemQty,
                    physical_qty: physical,
                    variance: physical - p.systemQty,
                })
            }

            toast.success(`Empties count saved — ${products.length} product(s), net variance ${totals.variance > 0 ? `+${totals.variance}` : totals.variance}.`)
            navigate('/dashboard/operations/empties-count-reports')
        } catch (error: any) {
            console.error('Error submitting empties count:', error)
            toast.error(error?.message || 'Failed to save empties count')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setCounts({})
        setNotes("")
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Take Empties Count</h2>
                <p className="text-muted-foreground">
                    Physically count Empties on Ground for every returnable product.
                    System quantities are frozen at submit time — differences are report-only.
                </p>
            </div>

            <div className="flex justify-start">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-[240px] justify-start text-left font-normal",
                                !date && "text-muted-foreground"
                            )}
                            onClick={() => setCalendarOpen(true)}
                            disabled={saving}
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
            </div>

            {duplicateMonth && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>A count already exists for {date ? format(date, "MMMM yyyy") : "this month"}. You can still submit a recount — it will appear alongside it in the reports.</span>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Physical Count — Empties on Ground</CardTitle>
                    <CardDescription>
                        {loading
                            ? "Loading returnable products…"
                            : `${filledCount} of ${products.length} products counted`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">System (On Ground)</TableHead>
                                    <TableHead className="text-right w-[160px]">Physical Count</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : products.length > 0 ? (
                                    products.map((p) => {
                                        const physical = parsedCount(p.id)
                                        const variance = physical === null ? null : physical - p.systemQty
                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell className="font-medium">
                                                    {p.name}
                                                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.code}</span>
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground font-mono">
                                                    {p.systemQty}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        placeholder="0"
                                                        value={counts[p.id] ?? ""}
                                                        onChange={(e) => setCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                                        disabled={saving}
                                                        className="text-right"
                                                    />
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-bold font-mono",
                                                    variance === null
                                                        ? "text-muted-foreground"
                                                        : variance === 0
                                                            ? "text-muted-foreground"
                                                            : variance > 0
                                                                ? "text-green-600"
                                                                : "text-red-600"
                                                )}>
                                                    {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            No returnable products found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {products.length > 0 && (
                        <div className="flex flex-wrap gap-6 rounded-md bg-muted/30 px-4 py-3 text-sm">
                            <span>System total: <strong className="font-mono">{totals.system.toLocaleString()}</strong></span>
                            <span>Counted total: <strong className="font-mono">{totals.counted.toLocaleString()}</strong></span>
                            <span>Net variance: <strong className={cn("font-mono", totals.variance === 0 ? "" : totals.variance > 0 ? "text-green-600" : "text-red-600")}>
                                {totals.variance > 0 ? `+${totals.variance.toLocaleString()}` : totals.variance.toLocaleString()}
                            </strong></span>
                            <span>Lines with variance: <strong className="font-mono">{totals.linesWithVariance}</strong></span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="empties-count-notes">Notes (optional)</label>
                        <textarea
                            id="empties-count-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={saving}
                            rows={2}
                            placeholder="e.g. September month-end count, yard section A..."
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleCancel} disabled={saving}>Clear</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={saving || !date || !allFilled}
                >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Saving..." : "Submit Empties Count"}
                </Button>
            </div>
        </div>
    )
}
