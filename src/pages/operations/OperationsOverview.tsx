import { useState, useEffect } from "react"
import { Calendar as CalendarIcon, Package, ArrowUp, ArrowDown, Truck, Loader2, RotateCcw, Users, Package2, Boxes, Layers } from "lucide-react"
import { format } from "date-fns"
import { useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { pb } from "@/lib/pocketbase"
import { toast } from "sonner"

interface OverviewStats {
    stocksReceivedToday: number
    stocksReceivedCount: number
    cratesReturnedToday: number
    cratesReturnedCount: number
    adjustmentsUpToday: number
    adjustmentsUpCount: number
    adjustmentsDownToday: number
    adjustmentsDownCount: number
}

interface EmptiesRow {
    id: string
    skuName: string
    codeName: string | null
    fulls: number
    onGround: number
    inTrade: number
}

export default function OperationsOverview() {
    const navigate = useNavigate()
    const [stats, setStats] = useState<OverviewStats>({
        stocksReceivedToday: 0,
        stocksReceivedCount: 0,
        cratesReturnedToday: 0,
        cratesReturnedCount: 0,
        adjustmentsUpToday: 0,
        adjustmentsUpCount: 0,
        adjustmentsDownToday: 0,
        adjustmentsDownCount: 0,
    })
    const [loading, setLoading] = useState(true)
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)

    // Live empties snapshot (date-independent): returnable crates only.
    // In Trade = with customers (not yet returned), On Ground = empty crates
    // on premises, Fulls = returnable products not empty (warehouse_stock).
    const [emptiesLoading, setEmptiesLoading] = useState(true)
    const [emptiesRows, setEmptiesRows] = useState<EmptiesRow[]>([])

    const fetchEmptiesSnapshot = async () => {
        setEmptiesLoading(true)
        try {
            const returnable = await pb.collection("products").getFullList({
                filter: 'returnable = true',
                sort: 'sku_name',
                fields: "id, sku_name, code_name",
                $autoCancel: false,
            })
            const productIds = returnable.map((p) => p.id)

            const [emptiesData, stockData] = await Promise.all([
                pb.collection("empties").getFullList({
                    fields: "product_id, quantity_in_trade, quantity_on_ground",
                    $autoCancel: false,
                }),
                productIds.length > 0
                    ? pb.collection("warehouse_stock").getFullList({
                        filter: `product_id in ("${productIds.join('","')}")`,
                        fields: "product_id, quantity",
                        $autoCancel: false,
                    })
                    : Promise.resolve([] as any[]),
            ])

            const tradeByProduct: Record<string, number> = {}
            const groundByProduct: Record<string, number> = {}
            for (const e of emptiesData) {
                const pid = (e as any).product_id
                if (!pid) continue
                tradeByProduct[pid] = ((e as any).quantity_in_trade as number) || 0
                groundByProduct[pid] = ((e as any).quantity_on_ground as number) || 0
            }
            const stockByProduct: Record<string, number> = {}
            for (const s of stockData) {
                const pid = (s as any).product_id
                if (!pid) continue
                stockByProduct[pid] = ((s as any).quantity as number) || 0
            }

            setEmptiesRows(
                returnable.map((p: any) => ({
                    id: p.id,
                    skuName: p.sku_name,
                    codeName: p.code_name ?? null,
                    fulls: stockByProduct[p.id] || 0,
                    onGround: groundByProduct[p.id] || 0,
                    inTrade: tradeByProduct[p.id] || 0,
                }))
            )
        } catch (error: any) {
            // Don't toast here: the date-filtered stats have their own error
            // path, and an empty snapshot (zeros) is a safe fallback.
            console.error("Error fetching empties snapshot:", error)
            setEmptiesRows([])
        } finally {
            setEmptiesLoading(false)
        }
    }

    const fetchData = async () => {
        setLoading(true)
        try {
            const dateStr = format(selectedDate, "yyyy-MM-dd")
            const startOfDay = `${dateStr} 00:00:00.000Z`
            const endOfDay = `${dateStr} 23:59:59.999Z`

            // 1. Stocks Received Today (inventory_receivables)
            const receivablesData = await pb.collection("inventory_receivables").getFullList({
                filter: `date >= "${startOfDay}" && date <= "${endOfDay}"`,
                fields: "id, num_of_pallets, num_of_pcs",
                $autoCancel: false,
            })
            const stocksReceivedCount = receivablesData.length
            const stocksReceivedToday = receivablesData.reduce(
                (sum, r) => sum + (r.num_of_pallets || 0) + (r.num_of_pcs || 0),
                0
            )

            // 2. Crates Returned Today (empties_log with activity=empties_to_supplier)
            const emptiesData = await pb.collection("empties_log").getFullList({
                filter: `activity = "empties_to_supplier" && date >= "${startOfDay}" && date <= "${endOfDay}"`,
                fields: "id, total_quantity",
                $autoCancel: false,
            })
            const cratesReturnedCount = emptiesData.length
            const cratesReturnedToday = emptiesData.reduce(
                (sum, r) => sum + (r.total_quantity || 0),
                0
            )

            // 3. Adjustments Upward Today (inventory_logs type=adjustment_increase)
            const adjUpData = await pb.collection("inventory_logs").getFullList({
                filter: `type = "adjustment_increase" && date >= "${startOfDay}" && date <= "${endOfDay}"`,
                fields: "id, quantity",
                $autoCancel: false,
            })
            const adjustmentsUpCount = adjUpData.length
            const adjustmentsUpToday = adjUpData.reduce(
                (sum, r) => sum + (r.quantity || 0),
                0
            )

            // 4. Adjustments Downward Today (inventory_logs type=adjustment_decrease)
            const adjDownData = await pb.collection("inventory_logs").getFullList({
                filter: `type = "adjustment_decrease" && date >= "${startOfDay}" && date <= "${endOfDay}"`,
                fields: "id, quantity",
                $autoCancel: false,
            })
            const adjustmentsDownCount = adjDownData.length
            const adjustmentsDownToday = adjDownData.reduce(
                (sum, r) => sum + (r.quantity || 0),
                0
            )

            setStats({
                stocksReceivedToday,
                stocksReceivedCount,
                cratesReturnedToday,
                cratesReturnedCount,
                adjustmentsUpToday,
                adjustmentsUpCount,
                adjustmentsDownToday,
                adjustmentsDownCount,
            })
        } catch (error: any) {
            console.error("Error fetching overview stats:", error)
            toast.error("Failed to load overview stats")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [selectedDate])

    useEffect(() => {
        fetchEmptiesSnapshot()
    }, [])

    const emptiesInTrade = emptiesRows.reduce((sum, r) => sum + r.inTrade, 0)
    const emptiesOnGround = emptiesRows.reduce((sum, r) => sum + r.onGround, 0)
    const fulls = emptiesRows.reduce((sum, r) => sum + r.fulls, 0)
    const totalEmpties = fulls + emptiesOnGround + emptiesInTrade

    const quickActions = [
        {
            title: "Stocks Coming In",
            href: "/dashboard/operations/stocks-coming-in",
            icon: Package,
            color: "text-blue-600",
            bgColor: "bg-blue-50 hover:bg-blue-100",
        },
        {
            title: "Reload Truck with Empties",
            href: "/dashboard/operations/reload-truck-empties",
            icon: Truck,
            color: "text-green-600",
            bgColor: "bg-green-50 hover:bg-green-100",
        },
        {
            title: "Adjustments",
            href: "/dashboard/operations/adjustments",
            icon: ArrowUp,
            color: "text-amber-600",
            bgColor: "bg-amber-50 hover:bg-amber-100",
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">
                    Operations Overview
                </h2>
                <p className="text-muted-foreground">
                    Summary of today's operations activity
                </p>
            </div>

            {/* Empties Position (live snapshot, returnables only) */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-xl font-semibold">Empties Position</h3>
                    <p className="text-sm text-muted-foreground">
                        Live snapshot across returnable products — not affected by the date filter.
                    </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Empties in Trade
                            </CardTitle>
                            <Users className="h-4 w-4 text-purple-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-600">
                                {emptiesLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    emptiesInTrade.toLocaleString()
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                With customers, not yet returned
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Empties on Ground
                            </CardTitle>
                            <Package2 className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-600">
                                {emptiesLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    emptiesOnGround.toLocaleString()
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Empty crates on premises
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Fulls
                            </CardTitle>
                            <Boxes className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600">
                                {emptiesLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    fulls.toLocaleString()
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Returnable products, not empty
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                Total Empties
                            </CardTitle>
                            <Layers className="h-4 w-4 text-amber-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {emptiesLoading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                ) : (
                                    totalEmpties.toLocaleString()
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Fulls + On Ground + In Trade
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="p-0">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>Product</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead className="text-right">Fulls</TableHead>
                                        <TableHead className="text-right">On Ground</TableHead>
                                        <TableHead className="text-right">In Trade</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {emptiesLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                            </TableCell>
                                        </TableRow>
                                    ) : emptiesRows.length > 0 ? (
                                        <>
                                            {emptiesRows.map((row) => (
                                                <TableRow key={row.id}>
                                                    <TableCell className="font-medium">{row.skuName}</TableCell>
                                                    <TableCell className="font-mono text-xs">{row.codeName || "—"}</TableCell>
                                                    <TableCell className="text-right">{row.fulls.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">{row.onGround.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right">{row.inTrade.toLocaleString()}</TableCell>
                                                    <TableCell className="text-right font-bold">
                                                        {(row.fulls + row.onGround + row.inTrade).toLocaleString()}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow className="bg-muted/30 font-bold">
                                                <TableCell colSpan={2}>Total</TableCell>
                                                <TableCell className="text-right">{fulls.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{emptiesOnGround.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{emptiesInTrade.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{totalEmpties.toLocaleString()}</TableCell>
                                            </TableRow>
                                        </>
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                                No returnable products found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Date Filter */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Select Date</label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full md:w-[240px] justify-start text-left font-normal"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(selectedDate, "PPP")}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) => {
                                if (date) {
                                    setSelectedDate(date)
                                    setCalendarOpen(false)
                                }
                            }}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Stocks Received
                        </CardTitle>
                        <Package className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                stats.stocksReceivedToday.toLocaleString()
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.stocksReceivedCount} receivable(s)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Crates Returned
                        </CardTitle>
                        <RotateCcw className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                stats.cratesReturnedToday.toLocaleString()
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.cratesReturnedCount} return(s)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Adjusted Stock Upward
                        </CardTitle>
                        <ArrowUp className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                `+${stats.adjustmentsUpToday.toLocaleString()}`
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.adjustmentsUpCount} adjustment(s)
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Adjusted Stock Downward
                        </CardTitle>
                        <ArrowDown className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            {loading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                `-${stats.adjustmentsDownToday.toLocaleString()}`
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.adjustmentsDownCount} adjustment(s)
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-3">
                        {quickActions.map((action) => (
                            <Button
                                key={action.href}
                                variant="outline"
                                className={cn(
                                    "h-auto flex-col items-start p-4 text-left",
                                    action.bgColor
                                )}
                                onClick={() => navigate(action.href)}
                            >
                                <action.icon className={cn("h-6 w-6 mb-2", action.color)} />
                                <span className="font-medium">{action.title}</span>
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* View Reports */}
            <Card>
                <CardHeader>
                    <CardTitle>View Reports</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-3">
                        <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => navigate("/dashboard/operations/stocks-coming-in-log")}
                        >
                            <Package className="mr-2 h-4 w-4" />
                            Stocks Coming In Log
                        </Button>
                        <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => navigate("/dashboard/operations/truck-reloads-to-ggbl")}
                        >
                            <Truck className="mr-2 h-4 w-4" />
                            Truck Reloads to GGBL
                        </Button>
                        <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => navigate("/dashboard/operations/adjustments-log")}
                        >
                            <ArrowUp className="mr-2 h-4 w-4" />
                            Adjustments Log
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
