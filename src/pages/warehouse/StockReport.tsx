import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useNavigate } from "react-router-dom"
import { Calendar as CalendarIcon, Package, AlertTriangle, XCircle, BarChart3, ClipboardList, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { pb } from "@/lib/pocketbase"

// Types
type StockStatus = 'good' | 'low' | 'out'

type ProductStock = {
    id: string
    name: string
    code: string
    quantity: number
    status: StockStatus
}

type StockTake = {
    id: string
    date: string
    takenBy: string
    notes: string
}

type TakeComparisonRow = {
    productId: string
    name: string
    code: string
    systemAtTake: number
    counted: number
    varianceAtTake: number
    current: number
    drift: number
}

export default function StockReport() {
    const navigate = useNavigate()
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [products, setProducts] = useState<ProductStock[]>([])
    const [loading, setLoading] = useState(true)

    // Take-vs-current comparison state
    const [takes, setTakes] = useState<StockTake[]>([])
    const [takesAvailable, setTakesAvailable] = useState(true)
    const [selectedTakeId, setSelectedTakeId] = useState<string>("")
    const [comparison, setComparison] = useState<TakeComparisonRow[]>([])
    const [takeLoading, setTakeLoading] = useState(false)

    // Fetch products from database
    useEffect(() => {
        fetchProducts()
        fetchTakes()
    }, [])

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name'
            })

            // Fetch actual warehouse stock quantities
            const stockData = await pb.collection('warehouse_stock').getFullList({
                filter: data.map(p => `product_id = "${p.id}"`).join(' || '),
                fields: 'product_id, quantity',
            })

            // Map product_id -> quantity
            const stockMap: Record<string, number> = {}
            for (const stock of stockData) {
                stockMap[stock.product_id] = stock.quantity || 0
            }

            const transformedProducts: ProductStock[] = data.map((item) => {
                const quantity = stockMap[item.id] ?? 0
                return {
                    id: item.id,
                    name: item.sku_name,
                    code: item.code_name || '',
                    quantity,
                    status: getStockStatus(quantity)
                }
            })

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchTakes = async () => {
        try {
            const rows = await pb.collection('stock_takes').getFullList({
                sort: '-date,-created',
                perPage: 30,
            })
            const mapped: StockTake[] = rows.map((r) => ({
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
                console.error('Error fetching stock takes:', error)
            }
        }
    }

    const fetchTakeComparison = async (takeId: string) => {
        setTakeLoading(true)
        try {
            const items = await pb.collection('stock_take_items').getFullList({
                filter: `take_id = "${takeId}"`,
                expand: 'product_id',
            })
            // Live quantities for drift calculation
            const currentMap: Record<string, number> = {}
            for (const p of products) currentMap[p.id] = p.quantity
            if (Object.keys(currentMap).length === 0) {
                const live = await pb.collection('warehouse_stock').getFullList({ fields: 'product_id, quantity' })
                for (const s of live) currentMap[s.product_id] = s.quantity || 0
            }
            const rows: TakeComparisonRow[] = items.map((it) => {
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
            setComparison(rows)
        } catch (error) {
            console.error('Error fetching take comparison:', error)
        } finally {
            setTakeLoading(false)
        }
    }

    const handleTakeChange = (takeId: string) => {
        setSelectedTakeId(takeId)
        if (takeId) fetchTakeComparison(takeId)
        else setComparison([])
    }

    const requestAdjustmentFor = (row: TakeComparisonRow) => {
        const diff = row.current - row.counted
        if (diff === 0) return
        const direction = diff < 0 ? 'increase' : 'decrease'
        const params = new URLSearchParams({
            direction,
            product: row.productId,
            qty: String(Math.abs(diff)),
            reason: 'stock_correction',
            notes: `From stock take ${selectedTake?.date ? format(new Date(selectedTake.date), 'MMM d, yyyy') : ''}: counted ${row.counted}, current ${row.current}`.trim(),
        })
        navigate(`/dashboard/operations/adjustments?${params.toString()}`)
    }

    const selectedTake = takes.find((t) => t.id === selectedTakeId)
    const varianceCount = comparison.filter((r) => r.varianceAtTake !== 0).length

    const getStockStatus = (quantity: number): StockStatus => {
        if (quantity === 0) return 'out'
        if (quantity < 20) return 'low'
        return 'good'
    }

    const getStatusColor = (status: StockStatus) => {
        switch (status) {
            case 'good': return 'text-green-600 bg-green-50 border-green-200'
            case 'low': return 'text-orange-600 bg-orange-50 border-orange-200'
            case 'out': return 'text-red-600 bg-red-50 border-red-200'
        }
    }

    const getStatusLabel = (status: StockStatus) => {
        switch (status) {
            case 'good': return 'Good Stock'
            case 'low': return 'Low Stock'
            case 'out': return 'Out of Stock'
        }
    }

    const getProgressColor = (status: StockStatus) => {
        switch (status) {
            case 'good': return 'bg-green-500'
            case 'low': return 'bg-orange-500'
            case 'out': return 'bg-red-500'
        }
    }

    // Calculate statistics
    const totalProducts = products.length
    const totalStockValue = products.reduce((sum, p) => sum + p.quantity, 0)
    const lowStockItems = products.filter(p => p.status === 'low').length
    const outOfStockItems = products.filter(p => p.status === 'out').length

    // Get top 10 products by quantity for chart
    const topProducts = [...products]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)

    const maxQuantity = Math.max(...topProducts.map(p => p.quantity), 1)

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Stock Report</h2>
                <p className="text-muted-foreground">
                    Comprehensive overview of warehouse inventory status and stock levels.
                </p>
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

            {/* Stock Take Comparison */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-muted-foreground" />
                        Stock Take Comparison
                    </CardTitle>
                    <CardDescription>
                        Frozen counts from a submitted take versus live warehouse stock. Request corrections via Adjustments (admin approval required).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!takesAvailable ? (
                        <p className="text-sm text-muted-foreground italic">
                            No stock takes yet — submit one from Take Stock (run scripts/setup-pocketbase.js if the stock_takes collection is missing).
                        </p>
                    ) : takes.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No stock takes submitted yet.</p>
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
                                            {t.date ? format(new Date(t.date), 'MMM d, yyyy') : 'Take'} — {t.takenBy}{t.notes ? ` — ${t.notes}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedTake && (
                                    <Badge variant="secondary">
                                        {comparison.length} product(s), {varianceCount} variance(s)
                                    </Badge>
                                )}
                            </div>

                            <div className="rounded-md border bg-white dark:bg-card overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Product</TableHead>
                                            <TableHead className="text-right">System @ Take</TableHead>
                                            <TableHead className="text-right">Counted</TableHead>
                                            <TableHead className="text-right">Variance @ Take</TableHead>
                                            <TableHead className="text-right">Current</TableHead>
                                            <TableHead className="text-right">Drift Since Take</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {takeLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                                    Loading take...
                                                </TableCell>
                                            </TableRow>
                                        ) : comparison.length > 0 ? (
                                            comparison.map((row) => (
                                                <TableRow key={row.productId} className="hover:bg-muted/50">
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <Package className="h-4 w-4 text-muted-foreground" />
                                                            <span>{row.name}</span>
                                                            {row.code && <Badge variant="outline" className="text-xs">{row.code}</Badge>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">{row.systemAtTake}</TableCell>
                                                    <TableCell className="text-right font-mono font-bold">{row.counted}</TableCell>
                                                    <TableCell className={cn(
                                                        "text-right font-mono font-bold",
                                                        row.varianceAtTake === 0 ? "text-muted-foreground" : row.varianceAtTake > 0 ? "text-green-600" : "text-red-600"
                                                    )}>
                                                        {row.varianceAtTake > 0 ? `+${row.varianceAtTake}` : row.varianceAtTake}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">{row.current}</TableCell>
                                                    <TableCell className={cn(
                                                        "text-right font-mono",
                                                        row.drift === 0 ? "text-muted-foreground" : "font-bold text-amber-600"
                                                    )}>
                                                        {row.drift > 0 ? `+${row.drift}` : row.drift}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {row.current !== row.counted ? (
                                                            <Button size="sm" variant="outline" onClick={() => requestAdjustmentFor(row)}>
                                                                Request fix <ArrowRight className="ml-1 h-3 w-3" />
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">In sync</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground italic">
                                                    No items in this take.
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

            {/* Summary Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Products</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalProducts}</div>
                        <p className="text-xs text-muted-foreground">Active products in inventory</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalStockValue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total units in warehouse</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-600">{lowStockItems}</div>
                        <p className="text-xs text-muted-foreground">Products below 20 units</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
                        <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{outOfStockItems}</div>
                        <p className="text-xs text-muted-foreground">Products with zero quantity</p>
                    </CardContent>
                </Card>
            </div>

            {/* Stock Distribution Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Top 10 Products by Stock Quantity</CardTitle>
                    <CardDescription>Visual representation of highest stock levels</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center h-64 text-muted-foreground">
                            Loading chart data...
                        </div>
                    ) : topProducts.length > 0 ? (
                        <div className="space-y-4">
                            {topProducts.map((product) => (
                                <div key={product.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                            <span className="font-medium truncate">{product.name}</span>
                                            {product.code && (
                                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                                    {product.code}
                                                </Badge>
                                            )}
                                        </div>
                                        <span className="font-bold ml-4 flex-shrink-0">{product.quantity}</span>
                                    </div>
                                    <div className="relative h-8 bg-muted rounded-md overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full transition-all duration-500 flex items-center justify-end px-3",
                                                getProgressColor(product.status)
                                            )}
                                            style={{ width: `${(product.quantity / maxQuantity) * 100}%` }}
                                        >
                                            <span className="text-xs font-semibold text-white">
                                                {((product.quantity / totalStockValue) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-64 text-muted-foreground">
                            No products available
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Product-wise Stock Breakdown Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Product Stock Breakdown</CardTitle>
                    <CardDescription>Detailed inventory status for all products</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="min-w-[250px]">Product</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="min-w-[200px]">Stock Level</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-right">% of Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            Loading products...
                                        </TableCell>
                                    </TableRow>
                                ) : products.length > 0 ? (
                                    products.map((product) => (
                                        <TableRow key={product.id} className="hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    <span>{product.name}</span>
                                                    {product.code && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {product.code}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold">
                                                {product.quantity}
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <Progress
                                                        value={(product.quantity / 150) * 100}
                                                        className="h-2"
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        {product.quantity} / 150 units
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge
                                                    variant="outline"
                                                    className={cn("font-medium", getStatusColor(product.status))}
                                                >
                                                    {getStatusLabel(product.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {totalStockValue > 0
                                                    ? ((product.quantity / totalStockValue) * 100).toFixed(1)
                                                    : '0.0'}%
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                            No products found
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
