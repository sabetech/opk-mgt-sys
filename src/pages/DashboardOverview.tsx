import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package2, Users, DollarSign, Box, Loader2 } from "lucide-react"
import { pb, startOfDay, endOfDay } from "@/lib/pocketbase"

export default function DashboardOverview() {
    const [loading, setLoading] = useState(true)
    const [cratesOnPremises, setCratesOnPremises] = useState(0)
    const [cratesWithCustomers, setCratesWithCustomers] = useState(0)
    const [totalCustomers, setTotalCustomers] = useState(0)
    const [retailerCount, setRetailerCount] = useState(0)
    const [wholesalerCount, setWholesalerCount] = useState(0)
    const [revenueToday, setRevenueToday] = useState(0)
    const [openingStock, setOpeningStock] = useState(0)

    useEffect(() => {
        fetchDashboardData()
    }, [])

    const fetchDashboardData = async () => {
        setLoading(true)
        try {
            const today = new Date()
            const todayStart = startOfDay(today)
            const todayEnd = endOfDay(today)

            // 1. Crates on premises (sum of empties.quantity_on_ground)
            const empties = await pb.collection('empties').getFullList({
                fields: 'quantity_on_ground,quantity_in_trade',
                requestKey: null,
            })
            let onPremises = 0
            let withCustomers = 0
            for (const e of empties) {
                onPremises += (e.quantity_on_ground as number) || 0
                withCustomers += (e.quantity_in_trade as number) || 0
            }
            setCratesOnPremises(onPremises)
            setCratesWithCustomers(withCustomers)

            // 2. Total customers (non-deleted, split by type)
            const customers = await pb.collection('customers').getFullList({
                filter: 'deleted_at = ""',
                expand: 'type_id',
                fields: 'id,expand',
                requestKey: null,
            })
            let retailers = 0
            let wholesalers = 0
            for (const c of customers) {
                const typeName = (c.expand?.type_id as any)?.name || ''
                if (typeName === 'Wholesaler') {
                    wholesalers++
                } else {
                    retailers++
                }
            }
            setTotalCustomers(customers.length)
            setRetailerCount(retailers)
            setWholesalerCount(wholesalers)

            // 3. Revenue today (approved orders only)
            const orders = await pb.collection('orders').getFullList({
                filter: `status = "approved" && date_time >= "${todayStart}" && date_time <= "${todayEnd}"`,
                fields: 'total_amount',
                requestKey: null,
            })
            let todayRevenue = 0
            for (const o of orders) {
                todayRevenue += (o.total_amount as number) || 0
            }
            setRevenueToday(todayRevenue)

            // 4. Opening stock (total warehouse_stock.quantity)
            const stock = await pb.collection('warehouse_stock').getFullList({
                fields: 'quantity',
                requestKey: null,
            })
            let totalStock = 0
            for (const s of stock) {
                totalStock += (s.quantity as number) || 0
            }
            setOpeningStock(totalStock)

        } catch (err) {
            console.error('Error fetching dashboard data:', err)
        } finally {
            setLoading(false)
        }
    }

    const formatNumber = (n: number) => n.toLocaleString()
    const formatCurrency = (n: number) => `GHS ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    if (loading) {
        return (
            <div className="flex flex-1 flex-col gap-4">
                <div className="flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                </div>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Total Crates on Premises */}
                <Card className="hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Crates on Premises
                        </CardTitle>
                        <Package2 className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(cratesOnPremises)}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all returnable products
                        </p>
                    </CardContent>
                </Card>

                {/* Total Crates with Customers */}
                <Card className="hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Crates w/ Customers
                        </CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(cratesWithCustomers)}</div>
                        <p className="text-xs text-muted-foreground">
                            In trade with customers
                        </p>
                    </CardContent>
                </Card>

                {/* Total Customers (Split) */}
                <Card className="hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Customers
                        </CardTitle>
                        <Users className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(totalCustomers)}</div>
                        <div className="flex text-xs text-muted-foreground gap-4 mt-1">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                {retailerCount} Retailers
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                {wholesalerCount} Wholesalers
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Total Revenue */}
                <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Revenue (Today)
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(revenueToday)}</div>
                        <p className="text-xs text-muted-foreground">
                            From approved orders
                        </p>
                    </CardContent>
                </Card>

                {/* Opening Stock */}
                <Card className="hover:bg-muted/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Warehouse Stock
                        </CardTitle>
                        <Box className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatNumber(openingStock)}</div>
                        <p className="text-xs text-muted-foreground">
                            Total units in warehouse
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
