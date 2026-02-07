import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Package, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { supabase } from "@/lib/supabase"

export default function TakeStock() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)

    // DB State
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)

    // Stock Counts State
    const [stockItems, setStockItems] = useState<SelectedItem[]>([])

    // Breakages State
    const [breakageItems, setBreakageItems] = useState<SelectedItem[]>([])

    // Fetch products
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

            const transformedProducts: Product[] = (data || []).map(item => ({
                id: item.id,
                name: item.sku_name,
                code: item.code_name || ''
            }))

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
        } finally {
            setLoading(false)
        }
    }

    const removeStockItem = (itemId: string) => {
        setStockItems(prev => prev.filter(item => item.id !== itemId))
    }

    const removeBreakageItem = (itemId: string) => {
        setBreakageItems(prev => prev.filter(item => item.id !== itemId))
    }

    const handleSubmit = () => {
        console.log("Submitting Stock Take:", {
            date,
            stockCounts: stockItems,
            breakages: breakageItems
        })
        // Add actual submit logic here
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Take Stock</h2>
                <p className="text-muted-foreground">
                    Record physical inventory counts and breakages.
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

            {/* 1. Physical Stock Count Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Physical Stock Count</CardTitle>
                    <CardDescription>Record the actual physical quantities available in the warehouse.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ProductSelector
                        products={products}
                        selectedItems={stockItems}
                        onItemsChange={setStockItems}
                        quantityLabel="Physical Count"
                        disabled={loading}
                    />

                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">System Stock</TableHead>
                                    <TableHead className="text-right">Physical Count</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stockItems.length > 0 ? (
                                    stockItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    {item.productName}
                                                    {item.productCode && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {item.productCode}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                N/A
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => removeStockItem(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                            {loading ? "Loading products..." : "No items counted yet."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* 2. Breakages Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Record Breakages</CardTitle>
                    <CardDescription>Record any broken or damaged stock.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ProductSelector
                        products={products}
                        selectedItems={breakageItems}
                        onItemsChange={setBreakageItems}
                        quantityLabel="Broken Quantity"
                        disabled={loading}
                    />

                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">Broken Quantity</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {breakageItems.length > 0 ? (
                                    breakageItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                    {item.productName}
                                                    {item.productCode && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {item.productCode}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-red-600">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => removeBreakageItem(item.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            {loading ? "Loading products..." : "No breakages recorded."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline">Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={!date || (stockItems.length === 0 && breakageItems.length === 0)}
                >
                    Submit Stock Take
                </Button>
            </div>
        </div>
    )
}
