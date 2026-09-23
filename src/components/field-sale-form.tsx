import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Package, Trash2, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createFieldSale, updateFieldSale } from "@/lib/fieldSales"

import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export interface FieldSaleInitialItem extends SelectedItem {
    unitPrice: number
}

interface FieldSaleFormProps {
    vseCustomerId: string
    vseCustomerName: string
    /** Edit mode: sale being resubmitted */
    saleId?: string
    initialDate?: string
    initialItems?: FieldSaleInitialItem[]
    initialEmpties?: number
    submitLabel: string
    onSaved: () => void
    onCancelEdit?: () => void
}

export default function FieldSaleForm({
    vseCustomerId,
    vseCustomerName,
    saleId,
    initialDate,
    initialItems,
    initialEmpties,
    submitLabel,
    onSaved,
    onCancelEdit,
}: FieldSaleFormProps) {
    const isEdit = !!saleId
    const [date, setDate] = useState<Date | undefined>(
        initialDate ? new Date(`${initialDate}T12:00:00`) : new Date()
    )
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>(
        (initialItems || []).map((i) => ({ ...i }))
    )
    // productId -> { retail, returnable }
    const [catalog, setCatalog] = useState<Record<string, { retail: number; returnable: boolean }>>({})
    const [products, setProducts] = useState<Product[]>([])
    const [empties, setEmpties] = useState<string>(
        initialEmpties !== undefined ? String(initialEmpties) : ""
    )
    const [emptiesTouched, setEmptiesTouched] = useState(isEdit)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            try {
                const data = await pb.collection('products').getFullList({
                    filter: 'deleted_at = ""',
                    sort: 'sku_name',
                })
                const cat: Record<string, { retail: number; returnable: boolean }> = {}
                const list: Product[] = data.map((item) => {
                    cat[item.id] = {
                        retail: item.retail_price ?? 0,
                        returnable: item.returnable === true,
                    }
                    return {
                        id: item.id,
                        name: item.sku_name,
                        code: item.product_code || item.code_name || '',
                    }
                })
                setCatalog(cat)
                setProducts(list)
            } catch (error) {
                console.error('Error fetching products:', error)
                toast.error('Failed to load products')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const returnableQty = selectedItems.reduce(
        (sum, item) => sum + (catalog[item.productId]?.returnable ? item.quantity : 0),
        0
    )

    // Autofill empties from returnables until the VSE overrides it
    useEffect(() => {
        if (!emptiesTouched) setEmpties(String(returnableQty))
    }, [returnableQty, emptiesTouched])

    const grandTotal = selectedItems.reduce(
        (sum, item) => sum + item.quantity * (catalog[item.productId]?.retail ?? 0),
        0
    )

    const updateQuantity = (itemId: string, quantity: number) => {
        setSelectedItems((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
        )
    }

    const removeItem = (itemId: string) => {
        setSelectedItems((prev) => prev.filter((item) => item.id !== itemId))
    }

    const handleSubmit = async () => {
        if (!date) {
            toast.error('Please pick a date')
            return
        }
        if (selectedItems.length === 0) {
            toast.error('Please add at least one product')
            return
        }
        if (selectedItems.some((item) => item.quantity <= 0)) {
            toast.error('Please enter valid quantities for all products')
            return
        }
        const emptiesNum = parseInt(empties, 10)
        if (isNaN(emptiesNum) || emptiesNum < 0) {
            toast.error('Enter a valid number of empties received (0 or more)')
            return
        }

        setSaving(true)
        try {
            const dateStr = date.toISOString().split('T')[0]
            const payloadItems = selectedItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: catalog[item.productId]?.retail ?? 0,
            }))
            if (isEdit && saleId) {
                await updateFieldSale(saleId, { emptiesReceived: emptiesNum, items: payloadItems })
                toast.success('Sale updated and resubmitted for approval')
            } else {
                const userId = pb.authStore.model?.id || ''
                await createFieldSale({
                    date: dateStr,
                    vseCustomerId,
                    createdBy: userId,
                    emptiesReceived: emptiesNum,
                    items: payloadItems,
                })
                toast.success('Field sale recorded — awaiting approvals')
            }
            onSaved()
        } catch (error: any) {
            console.error('Error saving field sale:', error)
            toast.error(error?.message || 'Failed to save field sale')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4 max-w-lg mx-auto">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-md bg-muted/40 px-3 py-2.5 text-sm">
                        <span className="text-muted-foreground">Selling as: </span>
                        <span className="font-bold">{vseCustomerName}</span>
                    </div>
                    <div className="space-y-2">
                        <Label>Date</Label>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn("w-full h-12 justify-start text-left font-normal text-base")}
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

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Products Sold</CardTitle>
                    <CardDescription>Retail prices apply.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!loading && (
                        <ProductSelector
                            products={products}
                            selectedItems={selectedItems}
                            onItemsChange={setSelectedItems}
                            quantityLabel="Quantity"
                            disabled={saving}
                        />
                    )}

                    <div className="rounded-md border bg-white dark:bg-card overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right w-[92px]">Qty</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="w-[44px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedItems.length > 0 ? (
                                    selectedItems.map((item) => {
                                        const retail = catalog[item.productId]?.retail ?? 0
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium text-sm">
                                                    <div className="flex items-center gap-1.5">
                                                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <span>{item.productName}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        GH₵ {retail.toFixed(2)} each
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={item.quantity}
                                                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                                                        disabled={saving}
                                                        className="h-11 text-right font-bold text-base px-2"
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-sm whitespace-nowrap">
                                                    GH₵ {(item.quantity * retail).toFixed(2)}
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
                                        )
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-20 text-center text-muted-foreground text-sm">
                                            {loading ? "Loading products..." : "No products added yet."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex justify-between items-center text-base">
                        <span className="font-semibold">Sale Total</span>
                        <span className="font-black text-lg">GH₵ {grandTotal.toFixed(2)}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Empties Received</CardTitle>
                    <CardDescription>
                        {returnableQty > 0
                            ? `${returnableQty} returnable crate(s) sold — adjust if you got back fewer or more.`
                            : "No returnables in this sale."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            type="number"
                            min={0}
                            value={empties}
                            onChange={(e) => {
                                setEmpties(e.target.value)
                                setEmptiesTouched(true)
                            }}
                            disabled={saving}
                            className="h-12 text-lg font-bold flex-1"
                            placeholder="0"
                        />
                        {emptiesTouched && (
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 shrink-0"
                                title="Reset to returnable quantity"
                                onClick={() => {
                                    setEmpties(String(returnableQty))
                                    setEmptiesTouched(false)
                                }}
                            >
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    {selectedItems.length > 0 && (
                        <div className="flex justify-start">
                            <Badge variant="secondary">
                                {selectedItems.length} product(s)
                            </Badge>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex gap-3 pb-4">
                {onCancelEdit && (
                    <Button variant="outline" className="h-12 flex-1 text-base" onClick={onCancelEdit} disabled={saving}>
                        Cancel
                    </Button>
                )}
                <Button className="h-12 flex-1 text-base" onClick={handleSubmit} disabled={saving || selectedItems.length === 0}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saving ? "Saving..." : submitLabel}
                </Button>
            </div>
        </div>
    )
}
