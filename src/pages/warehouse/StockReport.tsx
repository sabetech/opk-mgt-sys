import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Package, AlertTriangle, XCircle, BarChart3 } from "lucide-react"

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
import { supabase } from "@/lib/supabase"

// Types
type StockStatus = 'good' | 'low' | 'out'

type ProductStock = {
    id: number
    name: string
    code: string
    quantity: number
    status: StockStatus
}

export default function StockReport() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [products, setProducts] = useState<ProductStock[]>([])
    const [loading, setLoading] = useState(true)

    // Fetch products from database
    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .is('deleted_at', null)
                .order('sku_name', { ascending: true })

            if (error) throw error

            // Transform and add mock quantities for demonstration
            // In production, you would fetch actual stock quantities from inventory table
            const transformedProducts: ProductStock[] = (data || []).map(item => {
                const mockQuantity = Math.floor(Math.random() * 150) // Random quantity for demo
                return {
                    id: item.id,
                    name: item.sku_name,
                    code: item.code_name || '',
                    quantity: mockQuantity,
                    status: getStockStatus(mockQuantity)
                }
            })

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
        } finally {
            setLoading(false)
        }
    }

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
