import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Package, Trash2, Loader2 } from "lucide-react"

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
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

export default function TakeStock() {
    const { profile } = useAuth()
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)

    // DB State
    const [products, setProducts] = useState<Product[]>([])
    const [systemQty, setSystemQty] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [notes, setNotes] = useState("")

    // Stock Counts State
    const [stockItems, setStockItems] = useState<SelectedItem[]>([])

    // Breakages State
    const [breakageItems, setBreakageItems] = useState<SelectedItem[]>([])

    // Fetch products + live system stock
    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name'
            })

            const transformedProducts: Product[] = data.map((item) => ({
                id: item.id,
                name: item.sku_name,
                code: item.code_name || ''
            }))
            setProducts(transformedProducts)

            if (data.length > 0) {
                const stockData = await pb.collection('warehouse_stock').getFullList({
                    filter: data.map((p) => `product_id = "${p.id}"`).join(' || '),
                    fields: 'product_id, quantity',
                })
                const map: Record<string, number> = {}
                for (const s of stockData) {
                    map[s.product_id] = s.quantity || 0
                }
                setSystemQty(map)
            }
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
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

    const handleSubmit = async () => {
        if (!date) {
            toast.error('Please select a date')
            return
        }
        if (stockItems.length === 0 && breakageItems.length === 0) {
            toast.error('Please add at least one counted product')
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

            // 1. Persist the snapshot header (only when physical counts exist)
            let takeId: string | null = null
            if (stockItems.length > 0) {
                try {
                    const take = await pb.collection('stock_takes').create({
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
                        throw new Error('stock_takes collection not found. Run scripts/setup-pocketbase.js to create it.')
                    }
                    throw err
                }

                // 2. Persist per-product snapshot rows (system qty frozen at take time)
                for (const item of stockItems) {
                    const sys = systemQty[item.productId] ?? 0
                    await pb.collection('stock_take_items').create({
                        take_id: takeId,
                        product_id: item.productId,
                        system_qty: sys,
                        physical_qty: item.quantity,
                        variance: item.quantity - sys,
                    })
                }
            }

            // 3. Persist breakages (never touches warehouse_stock directly;
            // corrections flow through stock_adjustment_requests approval)
            for (const item of breakageItems) {
                await pb.collection('breakages').create({
                    date: dateStr,
                    product_id: item.productId,
                    quantity: item.quantity,
                    reason: notes.trim() ? `Stock take: ${notes.trim()}` : 'Stock take breakage',
                })
            }

            const parts: string[] = []
            if (takeId) parts.push(`${stockItems.length} product(s) counted`)
            if (breakageItems.length > 0) parts.push(`${breakageItems.length} breakage(s) recorded`)
            toast.success(`Stock take saved — ${parts.join(', ')}. Compare it in Stock Report.`)

            setStockItems([])
            setBreakageItems([])
            setNotes("")
        } catch (error: any) {
            console.error('Error submitting stock take:', error)
            toast.error(error?.message || 'Failed to save stock take')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        setStockItems([])
        setBreakageItems([])
        setNotes("")
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Take Stock</h2>
                <p className="text-muted-foreground">
                    Record physical inventory counts and breakages. System quantities are
                    frozen at submit time — corrections go through Adjustments approval.
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
                        disabled={loading || saving}
                    />

                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">System Stock</TableHead>
                                    <TableHead className="text-right">Physical Count</TableHead>
                                    <TableHead className="text-right">Variance</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stockItems.length > 0 ? (
                                    stockItems.map((item) => {
                                        const sys = systemQty[item.productId] ?? 0
                                        const variance = item.quantity - sys
                                        return (
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
                                                <TableCell className="text-right text-muted-foreground font-mono">
                                                    {loading ? "…" : sys}
                                                </TableCell>
                                                <TableCell className="text-right font-bold">
                                                    {item.quantity}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-bold font-mono",
                                                    variance === 0 ? "text-muted-foreground" : variance > 0 ? "text-green-600" : "text-red-600"
                                                )}>
                                                    {variance > 0 ? `+${variance}` : variance}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => removeStockItem(item.id)}
                                                        disabled={saving}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
                        disabled={loading || saving}
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
                                                    disabled={saving}
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

                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="take-notes">Notes (optional)</label>
                        <textarea
                            id="take-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={saving}
                            rows={2}
                            placeholder="e.g. end-of-month count, section B..."
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={saving || !date || (stockItems.length === 0 && breakageItems.length === 0)}
                >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Saving..." : "Submit Stock Take"}
                </Button>
            </div>
        </div>
    )
}
