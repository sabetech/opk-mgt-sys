import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, ChevronsUpDown, Package, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { pb, dayFilter } from "@/lib/pocketbase"

import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export type VSEMovementType = "sold" | "returned"

interface VSEMovementFormProps {
    movementType: VSEMovementType
    title: string
    description: string
    quantityLabel: string
    submitLabel: string
    successMessage: string
}

export default function VSEMovementForm({
    movementType,
    title,
    description,
    quantityLabel,
    submitLabel,
    successMessage,
}: VSEMovementFormProps) {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [vseOpen, setVseOpen] = useState(false)
    const [selectedVse, setSelectedVse] = useState<string>("")
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])

    // DB State
    const [products, setProducts] = useState<Product[]>([])
    const [vseList, setVseList] = useState<{ id: string, name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [prefilling, setPrefilling] = useState(false)

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

    // Prepopulate from the VSE's approved loadout for the selected date,
    // minus quantities already recorded as sold/returned that day.
    // Replaces the item list whenever VSE or date changes.
    useEffect(() => {
        if (!selectedVse || !date) return
        let cancelled = false

        const prefill = async () => {
            setPrefilling(true)
            try {
                // 1. Approved loadouts for this VSE + date -> given per product
                const loadouts = await pb.collection("loadouts").getFullList({
                    filter: `${dayFilter("date", date)} && vse_id = "${selectedVse}" && status = "approved"`,
                    fields: "id",
                })
                const loadoutIds = loadouts.map((l) => l.id)

                const givenByProduct: Record<string, number> = {}
                const metaByProduct: Record<string, { name: string; code: string }> = {}
                if (loadoutIds.length > 0) {
                    const loadoutItems = await pb.collection("loadout_items").getFullList({
                        filter: loadoutIds.map((id) => `loadout_id = "${id}"`).join(" || "),
                        expand: "product_id",
                    })
                    for (const item of loadoutItems) {
                        const rel = item.expand?.product_id
                        if (!item.product_id) continue
                        givenByProduct[item.product_id] =
                            (givenByProduct[item.product_id] || 0) + (item.quantity || 0)
                        if (rel && !metaByProduct[item.product_id]) {
                            metaByProduct[item.product_id] = {
                                name: rel.sku_name,
                                code: rel.product_code || rel.code_name || "",
                            }
                        }
                    }
                }

                // 2. Movements already recorded this VSE + date -> sold/returned per product
                const movements = await pb.collection("vse_movements").getFullList({
                    filter: `${dayFilter("date", date)} && vse_id = "${selectedVse}"`,
                    fields: "product_id, quantity, movement_type",
                })
                const accountedByProduct: Record<string, number> = {}
                for (const m of movements) {
                    if (!m.product_id) continue
                    accountedByProduct[m.product_id] =
                        (accountedByProduct[m.product_id] || 0) + (m.quantity || 0)
                }

                if (cancelled) return

                // 3. Remainder per product; drop fully-accounted lines
                const prefilled: SelectedItem[] = Object.entries(givenByProduct)
                    .map(([productId, given]) => ({
                        productId,
                        quantity: given - (accountedByProduct[productId] || 0),
                    }))
                    .filter((r) => r.quantity > 0 && metaByProduct[r.productId])
                    .map((r) => ({
                        id: crypto.randomUUID(),
                        productId: r.productId,
                        productName: metaByProduct[r.productId].name,
                        productCode: metaByProduct[r.productId].code,
                        quantity: r.quantity,
                    }))

                setSelectedItems(prefilled)
                if (prefilled.length > 0) {
                    toast.success(`Prepopulated ${prefilled.length} product(s) from loadout`)
                } else {
                    toast.info("No outstanding loadout for this VSE on this date")
                }
            } catch (error) {
                if (!cancelled) {
                    console.error("Error prepopulating from loadout:", error)
                    toast.error("Failed to load loadout for prepopulation")
                }
            } finally {
                if (!cancelled) setPrefilling(false)
            }
        }

        prefill()
        return () => {
            cancelled = true
        }
    }, [selectedVse, date])

    const handleItemsChange = (items: SelectedItem[]) => {
        setSelectedItems(items)
    }

    const removeItem = (itemId: string) => {
        setSelectedItems(prev => prev.filter(item => item.id !== itemId))
    }

    const updateQuantity = (itemId: string, quantity: number) => {
        setSelectedItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, quantity } : item
        ))
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

            toast.success(successMessage)

            // Reset form
            setSelectedVse("")
            setSelectedItems([])
            setDate(undefined)
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
                <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                <p className="text-muted-foreground">
                    {description}
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
                        <CardDescription>Select the VSE reporting this activity.</CardDescription>
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

            {/* 3. Product Selection */}
            <Card>
                <CardHeader>
                    <CardTitle>Product Quantities</CardTitle>
                    <CardDescription>
                        Enter the quantity of each product.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {prefilling && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading loadout for prepopulation...
                        </div>
                    )}
                    <ProductSelector
                        products={products}
                        selectedItems={selectedItems}
                        onItemsChange={handleItemsChange}
                        quantityLabel={quantityLabel}
                        disabled={loading || saving || prefilling}
                    />

                    {/* Items List */}
                    <div className="rounded-md border bg-white dark:bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">
                                        {quantityLabel}
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
                                                        <Badge variant="outline" className="text-xs font-mono">
                                                            {item.productCode}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                                                    disabled={saving || prefilling}
                                                    className="w-20 ml-auto text-right font-bold h-8"
                                                />
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
                <Button onClick={handleSubmit} disabled={!date || !selectedVse || selectedItems.length === 0 || saving || prefilling}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Processing..." : submitLabel}
                </Button>
            </div>
        </div>
    )
}
