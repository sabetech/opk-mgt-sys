import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Trash2, Plus, Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"

// Mock Customers for selection
const MOCK_CUSTOMERS = [
    { value: "1", label: "John Doe (Retailer)" },
    { value: "2", label: "Jane Smith (Wholesaler)" },
    { value: "3", label: "Kwame Mensah (Retailer VSE)" },
    { value: "4", label: "Ama Osei (Retailer)" },
    { value: "5", label: "Kofi Boateng (Wholesaler)" },
]

interface Product {
    id: number
    sku_name: string
}

interface ReturnItem {
    id: string // temporary id for the list
    productId: number
    productName: string
    quantity: number
}

export default function CustomerReturnEmpties() {
    const [date, setDate] = useState<Date>()
    const [openCustomer, setOpenCustomer] = useState(false)
    const [selectedCustomer, setSelectedCustomer] = useState("")

    // Product Fetching
    const [products, setProducts] = useState<Product[]>([])
    const [productsLoading, setProductsLoading] = useState(true)

    // Form State
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

    const handleSubmit = () => {
        if (!selectedCustomer || !date || returnItems.length === 0) {
            alert("Please fill in all required fields (Customer, Date, and at least one item).")
            return
        }

        const submissionData = {
            customerId: selectedCustomer,
            returnDate: date.toISOString(),
            items: returnItems
        }

        console.log("Submitting Return Data:", submissionData)
        alert("Return recorded! Check console for data.")

        // Reset form
        setSelectedCustomer("")
        setDate(undefined)
        setReturnItems([])
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Return Empty Crates</h2>
                <p className="text-muted-foreground">
                    Record empty crates returned by customers.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* 1. Customer Selection */}
                <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Select Customer</label>
                    <Popover open={openCustomer} onOpenChange={setOpenCustomer}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCustomer}
                                className="w-full justify-between"
                            >
                                {selectedCustomer
                                    ? MOCK_CUSTOMERS.find((customer) => customer.value === selectedCustomer)?.label
                                    : "Select customer..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                            <Command>
                                <CommandInput placeholder="Search customer..." />
                                <CommandList>
                                    <CommandEmpty>No customer found.</CommandEmpty>
                                    <CommandGroup>
                                        {MOCK_CUSTOMERS.map((customer) => (
                                            <CommandItem
                                                key={customer.value}
                                                value={customer.label}
                                                onSelect={() => {
                                                    setSelectedCustomer(customer.value === selectedCustomer ? "" : customer.value)
                                                    setOpenCustomer(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedCustomer === customer.value ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {customer.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* 2. Date Selection */}
                <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Return Date</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
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
            </div>

            {/* 3. Add Items Section */}
            <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
                <h3 className="font-semibold">Add Returned Items</h3>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2 w-full">
                        <label className="text-sm font-medium">Product</label>
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
                                            {products.map((product) => (
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
                        <label className="text-sm font-medium">Quantity (Crates)</label>
                        <Input
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                    </div>

                    <Button onClick={handleAddItem} disabled={!selectedProduct}>
                        <Plus className="mr-2 h-4 w-4" /> Add Item
                    </Button>
                </div>
            </div>

            {/* 4. Items List */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Quantity (Crates)</TableHead>
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
                                    No items added yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex justify-end">
                <Button size="lg" onClick={handleSubmit} disabled={returnItems.length === 0}>
                    Save Return Record
                </Button>
            </div>
        </div>
    )
}
