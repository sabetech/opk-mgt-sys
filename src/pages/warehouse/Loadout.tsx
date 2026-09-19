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
    given: number
    sold: number
    returned: number
    balance: number
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

            // 2. Approved loadouts for the selected date -> Quantity Given
            const loadouts = await pb.collection("loadouts").getFullList({
                filter: `${dayFilter("date", target)} && status = "approved"`,
                fields: "id, vse_id",
            })
            const loadoutIds = loadouts.map((l) => l.id)
            const givenByVse: Record<string, number> = {}
            if (loadoutIds.length > 0) {
                const loadoutItems = await pb
                    .collection("loadout_items")
                    .getFullList({
                        filter: loadoutIds
                            .map((id) => `loadout_id = "${id}"`)
                            .join(" || "),
                        fields: "loadout_id, quantity",
                    })
                const vseByLoadout: Record<string, string> = {}
                for (const l of loadouts) {
                    vseByLoadout[l.id] = l.vse_id
                }
                for (const item of loadoutItems) {
                    const vseId = vseByLoadout[item.loadout_id]
                    if (!vseId) continue
                    givenByVse[vseId] =
                        (givenByVse[vseId] || 0) + (item.quantity || 0)
                }
            }

            // 3. Field movements for the selected date -> Sold / Returned
            const movements = await pb
                .collection("vse_movements")
                .getFullList({
                    filter: dayFilter("date", target),
                    fields: "vse_id, quantity, movement_type",
                })
            const soldByVse: Record<string, number> = {}
            const returnedByVse: Record<string, number> = {}
            for (const m of movements) {
                if (!m.vse_id) continue
                if (m.movement_type === "sold") {
                    soldByVse[m.vse_id] =
                        (soldByVse[m.vse_id] || 0) + (m.quantity || 0)
                } else if (m.movement_type === "returned") {
                    returnedByVse[m.vse_id] =
                        (returnedByVse[m.vse_id] || 0) + (m.quantity || 0)
                }
            }

            setRows(
                vses.map((vse) => {
                    const given = givenByVse[vse.id] || 0
                    const sold = soldByVse[vse.id] || 0
                    const returned = returnedByVse[vse.id] || 0
                    return {
                        id: vse.id,
                        vseName: vse.name,
                        given,
                        sold,
                        returned,
                        balance: given - sold - returned,
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
                        Overview of products given, sold, and returned by each VSE.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name of VSE</TableHead>
                                <TableHead className="text-right">Quantity Given</TableHead>
                                <TableHead className="text-right">Quantity Sold</TableHead>
                                <TableHead className="text-right">Quantity Returned</TableHead>
                                <TableHead className="text-right">Outstanding Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-40 text-center">
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
                                        <TableCell className="text-right">{row.given}</TableCell>
                                        <TableCell className="text-right">{row.sold}</TableCell>
                                        <TableCell className="text-right">{row.returned}</TableCell>
                                        <TableCell className={cn(
                                            "text-right font-bold",
                                            row.balance > 0 ? "text-red-500" : "text-green-500"
                                        )}>
                                            {row.balance}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
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
