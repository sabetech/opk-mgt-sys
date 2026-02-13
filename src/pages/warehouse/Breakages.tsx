import { useState, useEffect } from "react"
import { Trash2, Loader2, XCircle, Search, Calendar, ChevronDown, ListFilter, PlusCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { toast } from "sonner"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { Range } from "react-date-range"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface BreakageItem {
    id: string
    productId: number
    productCode: string
    productName: string
    quantity: number
}

interface BreakageRecord {
    id: number
    date: string
    quantity: number
    reason: string
    products: {
        sku_name: string
        code_name: string
    } | null
}

export default function Breakages() {
    const [view, setView] = useState<'report' | 'view'>('report')
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Reporting State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [breakageItems, setBreakageItems] = useState<BreakageItem[]>([])
    const [reason, setReason] = useState("")

    // Viewing State
    const [records, setRecords] = useState<BreakageRecord[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 7)), // Last 7 days
            endDate: new Date(),
            key: 'selection'
        }
    ])
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

    // Fetch products
    useEffect(() => {
        fetchProducts()
    }, [])

    useEffect(() => {
        if (view === 'view') {
            fetchRecords()
        }
    }, [view, dateRange])

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .is('deleted_at', null)
                .order('sku_name', { ascending: true })

            if (error) throw error

            const transformedProducts: Product[] = (data || []).map((item: any) => ({
                id: item.id,
                name: item.sku_name,
                code: item.code_name || ''
            }))

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
        } finally {
            setLoading(false)
        }
    }

    const fetchRecords = async () => {
        setLoading(true)
        try {
            const startDateStr = dateRange[0].startDate?.toISOString().split('T')[0] || ""
            const endDateStr = dateRange[0].endDate?.toISOString().split('T')[0] || ""

            const { data, error } = await supabase
                .from('breakages')
                .select(`
                    id,
                    date,
                    quantity,
                    reason,
                    products (
                        sku_name,
                        code_name
                    )
                `)
                .gte('date', startDateStr)
                .lte('date', endDateStr)
                .order('date', { ascending: false })

            if (error) throw error
            setRecords(data as any || [])
        } catch (error) {
            console.error('Error fetching breakage records:', error)
            toast.error('Failed to load breakage records')
        } finally {
            setLoading(false)
        }
    }

    const handleItemsChange = (items: SelectedItem[]) => {
        const transformedItems: BreakageItem[] = items.map((item: SelectedItem) => ({
            id: item.id,
            productId: item.productId,
            productCode: item.productCode || 'N/A',
            productName: item.productName,
            quantity: item.quantity
        }))
        setBreakageItems(transformedItems)
    }

    const removeItem = (itemId: string) => {
        setBreakageItems((prev: BreakageItem[]) => prev.filter((item: BreakageItem) => item.id !== itemId))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (breakageItems.length === 0) {
            toast.error('Please add at least one product')
            return
        }

        setSaving(true)
        try {
            const itemsToInsert = breakageItems.map((item: BreakageItem) => ({
                date,
                product_id: item.productId,
                quantity: item.quantity,
                reason: reason.trim() || 'Breakage'
            }))

            const { error } = await supabase
                .from('breakages')
                .insert(itemsToInsert)

            if (error) throw error

            toast.success('Breakages recorded successfully and stock updated!')
            setBreakageItems([])
            setReason("")

            // Switch to view mode to see the results
            setView('view')
        } catch (error) {
            console.error('Error submitting breakages:', error)
            toast.error('Failed to record breakages')
        } finally {
            setSaving(false)
        }
    }

    const filteredRecords = records.filter((record: BreakageRecord) =>
        record.products?.sku_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.products?.code_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.reason.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const formatDateRangeDisplay = () => {
        const selectedRange = dateRange[0]
        if (!selectedRange?.startDate) return "Select date range"
        const start = format(new Date(selectedRange.startDate), 'MMM dd, yyyy')
        if (!selectedRange?.endDate) return start
        const end = format(new Date(selectedRange.endDate), 'MMM dd, yyyy')
        return start === end ? start : `${start} - ${end}`
    }

    if (loading && products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Warehouse Breakages</h2>
                    <p className="text-muted-foreground">
                        Report and monitor damaged or broken stock.
                    </p>
                </div>

                <div className="flex bg-muted/60 p-1.5 rounded-xl self-start sm:self-auto border border-muted-foreground/10">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setView('report')}
                        className={cn(
                            "gap-2 px-4 h-8 transition-all duration-200 rounded-lg",
                            view === 'report'
                                ? "bg-white dark:bg-slate-950 shadow-sm text-foreground font-bold"
                                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                        )}
                    >
                        <PlusCircle className={cn("h-4 w-4", view === 'report' ? "text-red-500" : "text-muted-foreground")} />
                        Report Breakages
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setView('view')}
                        className={cn(
                            "gap-2 px-4 h-8 transition-all duration-200 rounded-lg",
                            view === 'view'
                                ? "bg-white dark:bg-slate-950 shadow-sm text-foreground font-bold"
                                : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                        )}
                    >
                        <ListFilter className={cn("h-4 w-4", view === 'view' ? "text-red-500" : "text-muted-foreground")} />
                        View History
                    </Button>
                </div>
            </div>

            {view === 'report' ? (
                <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in duration-500">
                    <Card>
                        <CardHeader>
                            <CardTitle>Session Details</CardTitle>
                            <CardDescription>Enter the date and reason for these breakages</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date</Label>
                                <Input
                                    id="date"
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reason">General Reason (Optional)</Label>
                                <Input
                                    id="reason"
                                    placeholder="e.g., Handling accident, Spillage"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    disabled={saving}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Select Products</CardTitle>
                            <CardDescription>Add the products that were damaged</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!saving && (
                                <ProductSelector
                                    products={products}
                                    selectedItems={breakageItems.map((item: BreakageItem) => ({
                                        id: item.id,
                                        productId: item.productId,
                                        productName: item.productName,
                                        productCode: item.productCode,
                                        quantity: item.quantity
                                    }))}
                                    onItemsChange={handleItemsChange}
                                    quantityLabel="Broken Qty"
                                />
                            )}

                            <div className="rounded-md border bg-white dark:bg-card">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Code</TableHead>
                                            <TableHead className="text-right">Broken Quantity</TableHead>
                                            <TableHead className="w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {breakageItems.length > 0 ? (
                                            breakageItems.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">{item.productName}</TableCell>
                                                    <TableCell>{item.productCode}</TableCell>
                                                    <TableCell className="text-right font-bold text-red-600">
                                                        {item.quantity}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => removeItem(item.id)}
                                                            disabled={saving}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                    No breakages added yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            className="bg-red-600 hover:bg-red-700 gap-2 min-w-[150px]"
                            disabled={saving || breakageItems.length === 0}
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            {saving ? "Recording..." : "Record Breakages"}
                        </Button>
                    </div>
                </form>
            ) : (
                <div className="space-y-4 animate-in fade-in duration-500">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search history..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full md:w-auto justify-start text-left font-normal">
                                    <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                                    {formatDateRangeDisplay()}
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <DateRangePicker
                                    value={dateRange}
                                    onChange={(ranges) => {
                                        const { selection } = ranges
                                        setDateRange([selection as Range])
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>Date</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead>Code</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead>Reason</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredRecords.length > 0 ? (
                                            filteredRecords.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell>{format(new Date(record.date), 'MMM dd, yyyy')}</TableCell>
                                                    <TableCell className="font-medium">{record.products?.sku_name}</TableCell>
                                                    <TableCell className="font-mono text-xs">{record.products?.code_name}</TableCell>
                                                    <TableCell className="text-right font-bold text-red-600">{record.quantity}</TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{record.reason}</TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                    No breakage records found for this period.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
