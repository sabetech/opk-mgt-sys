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
import { pb } from "@/lib/pocketbase"
import { fetchCustomerBalance } from "@/lib/customerBalance"
import { fetchEmptiesDisplayMode, formatEmptiesBalance, type EmptiesDisplayMode } from "@/lib/emptiesDisplay"
import { moveYardStock } from "@/lib/emptiesStock"
import { toast } from "sonner"

interface Customer {
    id: string
    name: string
    customer_types: {
        name: string
    } | null
}

export default function ReturnCustomerEmpties() {
    const [date, setDate] = useState<Date>()
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [openCustomer, setOpenCustomer] = useState(false)
    const [selectedCustomer, setSelectedCustomer] = useState("")

    // Data State
    const [customers, setCustomers] = useState<Customer[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [returnItems, setReturnItems] = useState<SelectedItem[]>([])

    const [loadingCustomers, setLoadingCustomers] = useState(true)
    const [balance, setBalance] = useState<number | null>(null)
    const [loadingBalance, setLoadingBalance] = useState(false)
    const [emptiesMode, setEmptiesMode] = useState<EmptiesDisplayMode>("debit")
    const [saving, setSaving] = useState(false)

    // Fetch products, customers and display mode
    useEffect(() => {
        async function fetchData() {
            try {
                const productsData = await pb.collection('products').getFullList({
                    filter: '(returnable = true || empties_only = true) && deleted_at = ""',
                    sort: 'sku_name',
                    fields: 'id, sku_name'
                })
                setProducts(productsData.map((item) => ({
                    id: item.id,
                    name: item.sku_name
                })))

                const customersData = await pb.collection('customers').getFullList({
                    sort: 'name',
                    filter: 'deleted_at = ""',
                    expand: 'type_id',
                    // NOTE: `expand` must be listed in `fields` or this host drops it
                    fields: 'id, name, type_id, balance, expand'
                })
                setCustomers(customersData.map((c) => ({
                    id: c.id,
                    name: c.name,
                    customer_types: c.expand?.type_id ?? null,
                })) || [])
                setLoadingCustomers(false)

                setEmptiesMode(await fetchEmptiesDisplayMode())
            } catch (error) {
                console.error("Error fetching data:", error)
                setLoadingCustomers(false)
            }
        }
        fetchData()
    }, [])

    // Live balance whenever the customer changes
    useEffect(() => {
        async function fetchBalance() {
            if (!selectedCustomer) {
                setBalance(null)
                return
            }
            setLoadingBalance(true)
            try {
                const customer = await pb.collection('customers').getOne(selectedCustomer, {
                    fields: 'id, balance',
                })
                setBalance(await fetchCustomerBalance(selectedCustomer, customer.balance || 0))
            } catch (error) {
                console.error("Error fetching customer balance:", error)
                setBalance(null)
            } finally {
                setLoadingBalance(false)
            }
        }
        fetchBalance()
    }, [selectedCustomer])

    const currentCustomer = customers.find(c => c.id.toString() === selectedCustomer)
    const returnQty = returnItems.reduce((sum, item) => sum + item.quantity, 0)
    const remainingBalance = balance !== null ? balance - returnQty : null

    const handleRemoveItem = (id: string) => {
        setReturnItems(returnItems.filter(item => item.id !== id))
    }

    const handleSubmit = async () => {
        if (!selectedCustomer || !date || returnItems.length === 0) {
            toast.error("Please fill in all required fields (Customer, Date, and at least one item).")
            return
        }
        if (saving) return

        const totalQuantity = returnQty
        setSaving(true)
        try {
            // Hard guard: re-fetch the live balance at submit time and never
            // let a reclaim push it negative (no MOU exception on this page).
            const customer = await pb.collection('customers').getOne(selectedCustomer, {
                fields: 'id, balance',
            })
            const live = await fetchCustomerBalance(selectedCustomer, customer.balance || 0)
            if (live - totalQuantity < 0) {
                toast.error(
                    `Insufficient empties balance. Current balance: ${formatEmptiesBalance(live, emptiesMode).text}, requested: ${totalQuantity}.`
                )
                return
            }

            // 1. Insert into empties_log
            const logData = await pb.collection('empties_log').create({
                date: date.toISOString().split('T')[0],
                customer_id: selectedCustomer,
                activity: 'customer_empties_reclaim',
                total_quantity: totalQuantity,
                source: 'reclaim'
            })

            // 2. Insert into empties_log_detail
            for (const item of returnItems) {
                await pb.collection('empties_log_detail').create({
                    log_id: logData.id,
                    product_id: item.productId,
                    quantity: item.quantity
                })
            }

            // 3. Move yard stock: empties left the yard (ground −) and went
            // out with the customer (trade +, unclamped). Ledger above is the
            // source of truth — a tally failure warns without rolling back.
            try {
                await moveYardStock(
                    returnItems.map((item) => ({
                        productId: item.productId,
                        groundDelta: -item.quantity,
                        tradeDelta: item.quantity,
                    }))
                )
            } catch (yardError) {
                console.error("Failed to update yard stock (reclaim recorded):", yardError)
                toast.warning("Return recorded, but yard stock needs review — reconcile manually.")
            }

            const after = live - totalQuantity
            toast.success(
                `Returned ${totalQuantity} empties to ${currentCustomer?.name ?? "customer"}. ` +
                `Balance: ${formatEmptiesBalance(live, emptiesMode).text} → ${formatEmptiesBalance(after, emptiesMode).text}.`
            )

            // Reset form
            setSelectedCustomer("")
            setDate(undefined)
            setReturnItems([])
            setBalance(null)
        } catch (error) {
            console.error("Error saving return:", error)
            toast.error(error instanceof Error ? error.message : "Failed to record return.")
        } finally {
            setSaving(false)
        }
    }

    const balanceFormatted = balance !== null ? formatEmptiesBalance(balance, emptiesMode) : null
    const remainingFormatted = remainingBalance !== null ? formatEmptiesBalance(remainingBalance, emptiesMode) : null

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Return Customer Empties</h2>
                <p className="text-muted-foreground">
                    Hand empty crates back to a customer and deduct them from their empties balance.
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

            {/* 3. Live empties balance */}
            {selectedCustomer && (
                <div className="rounded-md border bg-muted/30 p-4">
                    {loadingBalance ? (
                        <p className="text-sm text-muted-foreground">Loading empties balance...</p>
                    ) : balanceFormatted ? (
                        <div className="flex flex-wrap justify-between gap-3 text-sm">
                            <div>
                                <span className="text-muted-foreground">Current empties balance: </span>
                                <span className={cn(
                                    "font-bold",
                                    balanceFormatted.tone === "debit" ? "text-red-600" : balanceFormatted.tone === "credit" ? "text-green-600" : undefined
                                )}>
                                    {balanceFormatted.text}
                                </span>
                            </div>
                            {returnQty > 0 && remainingFormatted && (
                                <div>
                                    <span className="text-muted-foreground">After this return: </span>
                                    <span className={cn(
                                        "font-bold",
                                        remainingBalance !== null && remainingBalance < 0 ? "text-red-600" : "text-green-600"
                                    )}>
                                        {remainingFormatted.text}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Could not load empties balance.</p>
                    )}
                </div>
            )}

            {/* 4. Add Items Section */}
            <ProductSelector
                products={products}
                selectedItems={returnItems}
                onItemsChange={setReturnItems}
                quantityLabel="Quantity (Crates)"
                disabled={!selectedCustomer}
            />

            {/* 5. Items List */}
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
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={returnItems.length === 0 || saving || loadingBalance || balance === null}
                >
                    {saving ? "Saving..." : `Return ${returnQty} Empties`}
                </Button>
            </div>
        </div>
    )
}
