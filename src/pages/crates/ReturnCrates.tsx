import { useState, useEffect } from "react"
import { Trash2, CalendarIcon } from "lucide-react"

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { supabase } from "@/lib/supabase"

export default function ReturnCrates() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [vehicleNumber, setVehicleNumber] = useState("")
    const [returnedBy, setReturnedBy] = useState("")
    const [numberOfPallets, setNumberOfPallets] = useState("")
    const [numberOfPCs, setNumberOfPCs] = useState("")

    // Product selection
    const [products, setProducts] = useState<Product[]>([])
    const [returnItems, setReturnItems] = useState<SelectedItem[]>([])

    useEffect(() => {
        async function fetchProducts() {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, sku_name')
                    .eq('returnable', true)
                    .order('sku_name')

                if (error) throw error
                if (data) {
                    // Transform data to match Product interface
                    const transformedProducts: Product[] = data.map(item => ({
                        id: item.id,
                        name: item.sku_name
                    }))
                    setProducts(transformedProducts)
                }
            } catch (error) {
                console.error("Error fetching products:", error)
            }
        }
        fetchProducts()
    }, [])

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
                        <ProductSelector
                            products={products}
                            selectedItems={returnItems}
                            onItemsChange={setReturnItems}
                            quantityLabel="Quantity"
                        />

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
