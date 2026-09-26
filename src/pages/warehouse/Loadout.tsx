import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { toast } from "sonner"

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
}

export default function Loadout() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [rows, setRows] = useState<VSERow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [date])

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
                    if (!vseId) continue
                    const qty = item.quantity || 0
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
            for (const m of movements) {
                if (!m.vse_id) continue
                if (m.movement_type === "sold") {
                    soldByVse[m.vse_id] =
                        (soldByVse[m.vse_id] || 0) + (m.quantity || 0)
                    if (m.expand?.product_id?.returnable === true) {
                        soldRetByVse[m.vse_id] =
                            (soldRetByVse[m.vse_id] || 0) + (m.quantity || 0)
                    }
                } else if (m.movement_type === "returned") {
                    returnedByVse[m.vse_id] =
                        (returnedByVse[m.vse_id] || 0) + (m.quantity || 0)
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

            {/* Date Selector */}
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

            {/* Loadout Table */}
            <Card>
                <CardHeader>
                    <CardTitle>VSE Performance</CardTitle>
                        <CardDescription>
                            Returnable vs non-returnable given, sold, products returned,
                            empties returned, and both outstanding balances per VSE.
                        </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
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
                                    <TableCell colSpan={9} className="h-40 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                            <p className="text-sm font-medium text-muted-foreground">
                                                Loading VSE performance...
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : rows.length > 0 ? (
                                rows.map((row) => (
                                    <TableRow key={row.id}>
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
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground italic">
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
