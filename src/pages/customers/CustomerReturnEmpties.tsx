import { useState, useEffect } from "react"
import { Check, ChevronsUpDown, Trash2, CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { format } from "date-fns"
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
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

interface Customer {
    id: number
    name: string
    customer_types: {
        name: string
    }
}

export default function CustomerReturnEmpties() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [openCustomer, setOpenCustomer] = useState(false)
    const [selectedCustomer, setSelectedCustomer] = useState("")

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [returnItems, setReturnItems] = useState<SelectedItem[]>([])

    const [loadingCustomers, setLoadingCustomers] = useState(true)

    // Fetch Data
    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch Products
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('id, sku_name')
                    .order('sku_name')

                if (productsError) throw productsError
                if (productsData) {
                    const transformedProducts: Product[] = productsData.map(item => ({
                        id: item.id,
                        name: item.sku_name
                    }))
                    setProducts(transformedProducts)
                }

                // Fetch Customers
                const { data: customersData, error: customersError } = await supabase
                    .from('customers')
                    .select('id, name, customer_types(name)')
                    .is('deleted_at', null)
                    .order('name', { ascending: true })

                if (customersError) throw customersError
                setCustomers(customersData as any || [])
                setLoadingCustomers(false)

            } catch (error) {
                console.error("Error fetching data:", error)
            }
        }
        fetchData()
    }, [])

    const handleRemoveItem = (id: string) => {
        setReturnItems(returnItems.filter(item => item.id !== id))
    }

    const handleSubmit = async () => {
        if (!selectedCustomer || !date || returnItems.length === 0) {
            toast.error("Please fill in all required fields (Customer, Date, and at least one item).")
            return
        }

        const totalQuantity = returnItems.reduce((sum, item) => sum + item.quantity, 0)

        try {
            // 1. Insert into empties_log
            const { data: logData, error: logError } = await supabase
                .from('empties_log')
                .insert([{
                    date: date.toISOString().split('T')[0],
                    customer_id: parseInt(selectedCustomer),
                    activity: 'customer_empties_return',
                    total_quantity: totalQuantity
                }])
                .select()
                .single()

            if (logError) throw logError

            // 2. Insert into empties_log_detail
            const detailsToInsert = returnItems.map(item => ({
                log_id: logData.id,
                product_id: item.productId,
                quantity: item.quantity
            }))

            const { error: detailError } = await supabase
                .from('empties_log_detail')
                .insert(detailsToInsert)

            if (detailError) throw detailError

            toast.success("Return recorded successfully!")

            // Reset form
            setSelectedCustomer("")
            setDate(undefined)
            setReturnItems([])
        } catch (error: any) {
            console.error("Error saving return:", error)
            toast.error(error.message || "Failed to record return.")
        }
    }

    const currentCustomer = customers.find(c => c.id.toString() === selectedCustomer)

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
                                disabled={loadingCustomers}
                            >
                                {selectedCustomer
                                    ? `${currentCustomer?.name} (${currentCustomer?.customer_types?.name})`
                                    : loadingCustomers ? "Loading customers..." : "Select customer..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                            <Command>
                                <CommandInput placeholder="Search customer..." />
                                <CommandList>
                                    <CommandEmpty>No customer found.</CommandEmpty>
                                    <CommandGroup>
                                        {customers.map((customer) => (
                                            <CommandItem
                                                key={customer.id}
                                                onSelect={() => {
                                                    setSelectedCustomer(customer.id.toString() === selectedCustomer ? "" : customer.id.toString())
                                                    setOpenCustomer(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedCustomer === customer.id.toString() ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {customer.name} ({customer.customer_types?.name})
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
            </div>

            {/* 3. Add Items Section */}
            <ProductSelector
                products={products}
                selectedItems={returnItems}
                onItemsChange={setReturnItems}
                quantityLabel="Quantity (Crates)"
            />

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
