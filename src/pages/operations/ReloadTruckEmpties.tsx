import { useState, useEffect } from "react"
import { Trash2, CalendarIcon, Loader2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { pb } from "@/lib/pocketbase"
import { toast } from "sonner"

const generateReloadId = () => {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `RLD-${dateStr}-${randomSuffix}`
}

export default function ReloadTruckEmpties() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [driverCarNumber, setDriverCarNumber] = useState("")
    const [driverName, setDriverName] = useState("")
    const [numberOfPallets, setNumberOfPallets] = useState("")
    const [referenceId, setReferenceId] = useState<string>(generateReloadId())

    // Product selection
    const [products, setProducts] = useState<Product[]>([])
    const [returnItems, setReturnItems] = useState<SelectedItem[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function fetchProducts() {
            try {
                const data = await pb.collection('products').getFullList({
                    filter: 'returnable = true',
                    sort: 'sku_name',
                    fields: 'id, sku_name'
                })
                // Transform data to match Product interface
                const transformedProducts: Product[] = data.map((item) => ({
                    id: item.id,
                    name: item.sku_name
                }))
                setProducts(transformedProducts)
            } catch (error) {
                console.error("Error fetching products:", error)
                toast.error("Failed to load returnable products")
            } finally {
                setLoading(false)
            }
        }
        fetchProducts()
    }, [])

    const handleRemoveItem = (id: string) => {
        setReturnItems(returnItems.filter(item => item.id !== id))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!date || !driverCarNumber || !driverName || returnItems.length === 0) {
            toast.error("Please fill in all required fields (Date, Driver's Car Number, Driver's Name, and at least one product).")
            return
        }

        const totalQuantity = returnItems.reduce((sum, item) => sum + item.quantity, 0)

        try {
            // 1. Insert into empties_log
            const logData = await pb.collection('empties_log').create({
                date: date.toISOString().split('T')[0],
                total_quantity: totalQuantity,
                activity: 'empties_to_supplier',
                vehicle_no: driverCarNumber,
                returned_by: driverName,
                num_of_pallets: numberOfPallets ? parseInt(numberOfPallets) : 0,
                num_of_pcs: 0
            })

            // 2. Insert into empties_log_detail
            for (const item of returnItems) {
                await pb.collection('empties_log_detail').create({
                    log_id: logData.id,
                    product_id: item.productId,
                    quantity: item.quantity
                })
            }

            toast.success("Truck reloaded with empties recorded successfully!")

            // Reset form
            setDate(undefined)
            setDriverCarNumber("")
            setDriverName("")
            setNumberOfPallets("")
            setReferenceId(generateReloadId())
            setReturnItems([])
        } catch (error: any) {
            console.error("Error saving reload:", error)
            toast.error(error.message || "Failed to record reload.")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Reload Truck with Empties</h2>
                    <p className="text-muted-foreground">
                        Record empty crates being sent back to Guinness Ghana
                    </p>
                </div>
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p>Loading returnable products...</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Reload Truck with Empties</h2>
                <p className="text-muted-foreground">
                    Record empty crates being sent back to Guinness Ghana
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Reload Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Date */}
                            <div className="space-y-2">
                                <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
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

                            {/* Reference ID (auto-generated, readonly) */}
                            <div className="space-y-2">
                                <Label htmlFor="referenceId">Reference #</Label>
                                <Input
                                    id="referenceId"
                                    value={referenceId}
                                    readOnly
                                    className="bg-muted"
                                />
                            </div>

                            {/* Driver's Car Number */}
                            <div className="space-y-2">
                                <Label htmlFor="driverCarNumber">Driver's Car Number <span className="text-red-500">*</span></Label>
                                <Input
                                    id="driverCarNumber"
                                    placeholder="e.g., GH-1234-22"
                                    value={driverCarNumber}
                                    onChange={(e) => setDriverCarNumber(e.target.value)}
                                />
                            </div>

                            {/* Driver's Name */}
                            <div className="space-y-2">
                                <Label htmlFor="driverName">Driver's Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="driverName"
                                    placeholder="Name of driver"
                                    value={driverName}
                                    onChange={(e) => setDriverName(e.target.value)}
                                />
                            </div>

                            {/* Pallets */}
                            <div className="space-y-2">
                                <Label htmlFor="pallets">Pallets</Label>
                                <Input
                                    id="pallets"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={numberOfPallets}
                                    onChange={(e) => setNumberOfPallets(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Products Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Products & Quantity</CardTitle>
                        <CardDescription>
                            Select returnable products to reload
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!saving && (
                            <ProductSelector
                                products={products}
                                selectedItems={returnItems}
                                onItemsChange={setReturnItems}
                                quantityLabel="Quantity"
                            />
                        )}

                        {/* Items List */}
                        <div className="rounded-md border bg-white dark:bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="w-[100px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {returnItems.length > 0 ? (
                                        returnItems.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.productName}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => handleRemoveItem(item.id)}
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
                                                No products added yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" size="lg" disabled={saving || returnItems.length === 0}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {saving ? "Recording..." : "Record Reload"}
                    </Button>
                </div>
            </form>
        </div>
    )
}