import { useState, useEffect } from "react"
import { Calendar as CalendarIcon, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

interface Product {
    id: number
    sku_name: string
}

interface ReturnItem {
    id: string
    productId: number
    productName: string
    quantity: number
}

export default function ReturnCrates() {
    const [date, setDate] = useState<Date>()
    const [vehicleNumber, setVehicleNumber] = useState("")
    const [returnedBy, setReturnedBy] = useState("")
    const [numberOfPallets, setNumberOfPallets] = useState("")
    const [numberOfPCs, setNumberOfPCs] = useState("")

    // Product selection
    const [products, setProducts] = useState<Product[]>([])
    const [productsLoading, setProductsLoading] = useState(true)
    const [openProduct, setOpenProduct] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
    const [quantity, setQuantity] = useState<string>("1")
    const [returnItems, setReturnItems] = useState<ReturnItem[]>([])

    useEffect(() => {
        async function fetchProducts() {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, sku_name')
                    .eq('returnable', true)
                    .order('sku_name')

                if (error) throw error
                if (data) setProducts(data)
            } catch (error) {
                console.error("Error fetching products:", error)
            } finally {
                setProductsLoading(false)
            }
        }
        fetchProducts()
    }, [])

    const handleAddItem = () => {
        if (!selectedProduct || !quantity || parseInt(quantity) <= 0) return

        const product = products.find(p => p.id === selectedProduct)
        if (!product) return

        const newItem: ReturnItem = {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.sku_name,
            quantity: parseInt(quantity)
        }

        setReturnItems([...returnItems, newItem])

        // Reset inputs
        setSelectedProduct(null)
        setQuantity("1")
    }

    const handleRemoveItem = (id: string) => {
        setReturnItems(returnItems.filter(item => item.id !== id))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (!date || !vehicleNumber || !returnedBy || returnItems.length === 0) {
            alert("Please fill in all required fields (Date, Vehicle Number, Returned By, and at least one product).")
            return
        }

        const submissionData = {
            date: date.toISOString(),
            vehicleNumber,
            returnedBy,
            numberOfPallets: numberOfPallets ? parseInt(numberOfPallets) : 0,
            numberOfPCs: numberOfPCs ? parseInt(numberOfPCs) : 0,
            items: returnItems
        }

        console.log("Submitting Return to Guinness Ghana:", submissionData)
        alert("Return recorded! Check console for data.")

        // Reset form
        setDate(undefined)
        setVehicleNumber("")
        setReturnedBy("")
        setNumberOfPallets("")
        setNumberOfPCs("")
        setReturnItems([])
    }

    // Filter out products that are already in the return items list
    const selectedProductIds = new Set(returnItems.map(item => item.productId))
    const availableProducts = products.filter(product => !selectedProductIds.has(product.id))

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Return Crates</h2>
                <p className="text-muted-foreground">
                    Record crates being returned to Guinness Ghana
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Return Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Date */}
                            <div className="space-y-2">
                                <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !date && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {date ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <DatePicker
                                            value={date}
                                            onChange={(newDate) => setDate(newDate)}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Vehicle Number */}
                            <div className="space-y-2">
                                <Label htmlFor="vehicleNumber">Vehicle Number <span className="text-red-500">*</span></Label>
                                <Input
                                    id="vehicleNumber"
                                    placeholder="e.g., GH-1234-22"
                                    value={vehicleNumber}
                                    onChange={(e) => setVehicleNumber(e.target.value)}
                                />
                            </div>

                            {/* Returned By */}
                            <div className="space-y-2">
                                <Label htmlFor="returnedBy">Returned By <span className="text-red-500">*</span></Label>
                                <Input
                                    id="returnedBy"
                                    placeholder="Name of person returning"
                                    value={returnedBy}
                                    onChange={(e) => setReturnedBy(e.target.value)}
                                />
                            </div>

                            {/* Number of Pallets */}
                            <div className="space-y-2">
                                <Label htmlFor="pallets">Number of Pallets</Label>
                                <Input
                                    id="pallets"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={numberOfPallets}
                                    onChange={(e) => setNumberOfPallets(e.target.value)}
                                />
                            </div>

                            {/* Number of PCs */}
                            <div className="space-y-2">
                                <Label htmlFor="pcs">Number of PCs</Label>
                                <Input
                                    id="pcs"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={numberOfPCs}
                                    onChange={(e) => setNumberOfPCs(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Products Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Products to Return</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
                            <h4 className="font-semibold text-sm">Add Product</h4>
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 space-y-2 w-full">
                                    <Label>Product</Label>
                                    <Popover open={openProduct} onOpenChange={setOpenProduct}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openProduct}
                                                className="w-full justify-between"
                                            >
                                                {selectedProduct
                                                    ? products.find((product) => product.id === selectedProduct)?.sku_name
                                                    : "Select product..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[400px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search product..." />
                                                <CommandList>
                                                    <CommandEmpty>No product found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {availableProducts.map((product) => (
                                                            <CommandItem
                                                                key={product.id}
                                                                value={product.sku_name}
                                                                onSelect={() => {
                                                                    setSelectedProduct(product.id === selectedProduct ? null : product.id)
                                                                    setOpenProduct(false)
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        selectedProduct === product.id ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {product.sku_name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="w-full md:w-32 space-y-2">
                                    <Label>Quantity</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                    />
                                </div>

                                <Button type="button" onClick={handleAddItem} disabled={!selectedProduct}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Item
                                </Button>
                            </div>
                        </div>

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
                    <Button type="submit" size="lg" disabled={returnItems.length === 0}>
                        Submit Return
                    </Button>
                </div>
            </form>
        </div>
    )
}
