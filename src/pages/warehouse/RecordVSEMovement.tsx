import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, ChevronsUpDown, Package, Trash2, TrendingUp, Undo2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
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

import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type MovementType = "sold" | "returned"

export default function RecordVSEMovement() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [vseOpen, setVseOpen] = useState(false)
    const [selectedVse, setSelectedVse] = useState<string>("")
    const [movementType, setMovementType] = useState<MovementType>("sold")
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

    // DB State
    const [products, setProducts] = useState<Product[]>([])
    const [vseList, setVseList] = useState<{ id: string, name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Fetch products and VSEs
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true)
            await Promise.all([
                fetchProducts(),
                fetchVses()
            ])
            setLoading(false)
        }
        loadInitialData()
    }, [])

    const fetchVses = async () => {
        try {
            // First get the type_id for 'Retailer (VSE)'
            const typeData = await pb.collection('customer_types').getFirstListItem('name = "Retailer (VSE)"')

            const data = await pb.collection('customers').getFullList({
                filter: `type_id = "${typeData.id}" && deleted_at = ""`,
                sort: 'name',
                fields: 'id, name'
            })
            setVseList(data.map((v) => ({ id: v.id, name: v.name })))
        } catch (error) {
            console.error('Error fetching VSEs:', error)
            toast.error('Failed to load VSE list')
        }
    }

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name'
            })

            const transformedProducts: Product[] = data.map((item) => ({
                id: item.id,
                name: item.sku_name,
                code: item.product_code || item.code_name || ''
            }))

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
        }
    }

    const handleItemsChange = (items: SelectedItem[]) => {
        setSelectedItems(items)
    }

    const removeItem = (itemId: string) => {
        setSelectedItems(prev => prev.filter(item => item.id !== itemId))
    }

    const handleSubmit = async () => {
        if (!date || !selectedVse || selectedItems.length === 0) {
            toast.error('Please complete all fields')
            return
        }

        if (selectedItems.some(item => item.quantity <= 0)) {
            toast.error('Please enter valid quantities for all products')
            return
        }

        setSaving(true)
        try {
            const dateStr = date.toISOString().split('T')[0]

            for (const item of selectedItems) {
                await pb.collection('vse_movements').create({
                    date: dateStr,
                    vse_id: selectedVse,
                    product_id: item.productId,
                    quantity: item.quantity,
                    movement_type: movementType,
                })
            }

            toast.success(
                movementType === 'sold'
                    ? 'VSE sales recorded successfully'
                    : 'VSE returns recorded successfully'
            )

            // Reset form
            setSelectedVse("")
            setSelectedItems([])
            setDate(undefined)
            setMovementType("sold")
        } catch (error) {
            console.error('Error recording VSE movement:', error)
            toast.error('Failed to record VSE movement')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Record VSE Sales / Returns</h2>
                <p className="text-muted-foreground">
                    Record products sold or returned by VSEs in the field.
                </p>
            </div>

            {/* Top Section: Date and VSE */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* 1. Date Selector */}
                <Card>
                    <CardHeader>
                        <CardTitle>Date</CardTitle>
                        <CardDescription>Select the date of this activity.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col space-y-2">
                            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
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
                    </CardContent>
                </Card>

                {/* 2. VSE Selector */}
                <Card>
                    <CardHeader>
                        <CardTitle>Select VSE</CardTitle>
                        <CardDescription>Select the VSE reporting sales or returns.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Popover open={vseOpen} onOpenChange={setVseOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={vseOpen}
                                    className="w-full justify-between"
                                >
                                    {selectedVse
                                        ? vseList.find((vse) => vse.id === selectedVse)?.name
                                        : "Select VSE..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                                <Command>
                                    <CommandInput placeholder="Search VSE..." />
                                    <CommandList>
                                        <CommandEmpty>No VSE found.</CommandEmpty>
                                        <CommandGroup>
                                            {vseList.map((vse) => (
                                                <CommandItem
                                                    key={vse.id}
                                                    value={vse.name}
                                                    onSelect={() => {
                                                        setSelectedVse(vse.id.toString() === selectedVse ? "" : vse.id.toString())
                                                        setVseOpen(false)
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            selectedVse === vse.id.toString() ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {vse.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </CardContent>
                </Card>
            </div>

            {/* 3. Movement Type */}
            <Card>
                <CardHeader>
                    <CardTitle>Activity Type</CardTitle>
                    <CardDescription>Are these products sold to customers or returned unsold?</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            type="button"
                            variant={movementType === "sold" ? "default" : "outline"}
                            className="h-12 gap-2"
                            onClick={() => setMovementType("sold")}
                        >
                            <TrendingUp className="h-4 w-4" />
                            Sold
                        </Button>
                        <Button
                            type="button"
                            variant={movementType === "returned" ? "default" : "outline"}
                            className="h-12 gap-2"
                            onClick={() => setMovementType("returned")}
                        >
                            <Undo2 className="h-4 w-4" />
                            Returned
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 4. Product Selection */}
            <Card>
                <CardHeader>
                    <CardTitle>Product Quantities</CardTitle>
                    <CardDescription>
                        Enter the quantity of each product {movementType === "sold" ? "sold" : "returned"}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <ProductSelector
                        products={products}
                        selectedItems={selectedItems}
                        onItemsChange={handleItemsChange}
                        quantityLabel={movementType === "sold" ? "Quantity Sold" : "Quantity Returned"}
                        disabled={loading || saving}
                    />

                    {/* Items List */}
                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">
                                        {movementType === "sold" ? "Quantity Sold" : "Quantity Returned"}
                                    </TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedItems.length > 0 ? (
                                    selectedItems.map((item: SelectedItem) => (
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
                                            <TableCell className="text-right font-bold">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
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
                                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                                            {loading ? "Loading products..." : "No products added yet."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {selectedItems.length > 0 && (
                        <div className="flex justify-end">
                            <Badge variant="secondary">
                                {selectedItems.length} product(s) added
                            </Badge>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" disabled={saving}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!date || !selectedVse || selectedItems.length === 0 || saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Processing..." : movementType === "sold" ? "Record Sales" : "Record Returns"}
                </Button>
            </div>
        </div>
    )
}
