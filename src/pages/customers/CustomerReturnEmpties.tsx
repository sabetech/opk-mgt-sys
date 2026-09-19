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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { pb } from "@/lib/pocketbase"
import { toast } from "sonner"

interface Customer {
    id: string
    name: string
    customer_types: {
        name: string
    } | null
}

interface HeldDeposit {
    id: string
    quantity: number
    refunded_qty: number
    amount_per_crate: number
    total_amount: number
    status: string
    created: string
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

    // Held crate deposits for the selected customer (refundable cash-out, FIFO)
    const [heldDeposits, setHeldDeposits] = useState<HeldDeposit[]>([])
    const [refundMethod, setRefundMethod] = useState<string>("cash")
    const [applyRefund, setApplyRefund] = useState(true)

    // Fetch held deposits whenever the customer changes
    useEffect(() => {
        async function fetchHeldDeposits() {
            if (!selectedCustomer) {
                setHeldDeposits([])
                return
            }
            try {
                const data = await pb.collection('crate_deposits').getFullList({
                    filter: `customer_id = "${selectedCustomer}" && (status = "held" || status = "partial")`,
                })
                // NOTE: sorting by `created` server-side fails on some hosts — sort locally.
                data.sort((a, b) => String(a.created).localeCompare(String(b.created)))
                setHeldDeposits(data.map((d) => ({
                    id: d.id,
                    quantity: d.quantity || 0,
                    refunded_qty: d.refunded_qty || 0,
                    amount_per_crate: d.amount_per_crate || 0,
                    total_amount: d.total_amount || 0,
                    status: d.status,
                    created: d.created,
                })))
            } catch {
                // Collection may not exist yet on older DBs — no refundable deposits
                setHeldDeposits([])
            }
        }
        fetchHeldDeposits()
    }, [selectedCustomer])

    const heldCrates = heldDeposits.reduce((sum, d) => sum + Math.max(0, d.quantity - d.refunded_qty), 0)
    const heldTotal = heldDeposits.reduce((sum, d) => sum + Math.max(0, d.quantity - d.refunded_qty) * (d.amount_per_crate || 0), 0)
    const returnQty = returnItems.reduce((sum, item) => sum + item.quantity, 0)
    const refundQty = applyRefund ? Math.min(returnQty, heldCrates) : 0
    // Preview of the FIFO cash-out amount (oldest held rows first)
    let previewRemaining = refundQty
    let previewRefundAmount = 0
    for (const dep of heldDeposits) {
        if (previewRemaining <= 0) break
        const available = Math.max(0, dep.quantity - dep.refunded_qty)
        const alloc = Math.min(available, previewRemaining)
        previewRefundAmount += alloc * (dep.amount_per_crate || 0)
        previewRemaining -= alloc
    }

    // Fetch Data
    useEffect(() => {
        async function fetchData() {
            try {
                // Fetch Products
                const productsData = await pb.collection('products').getFullList({
                    filter: 'returnable = true',
                    sort: 'sku_name',
                    fields: 'id, sku_name'
                })
                const transformedProducts: Product[] = productsData.map((item) => ({
                    id: item.id,
                    name: item.sku_name
                }))
                setProducts(transformedProducts)

                // Fetch Customers
                const customersData = await pb.collection('customers').getFullList({
                    sort: 'name',
                    filter: 'deleted_at = ""',
                    expand: 'type_id',
                    // NOTE: `expand` must be listed in `fields` or this host drops it
                    fields: 'id, name, type_id, expand'
                })
                setCustomers(customersData.map((c) => ({
                    id: c.id,
                    name: c.name,
                    customer_types: c.expand?.type_id ?? null,
                })) || [])
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
            const logData = await pb.collection('empties_log').create({
                date: date.toISOString().split('T')[0],
                customer_id: selectedCustomer,
                activity: 'customer_empties_return',
                total_quantity: totalQuantity
            })

            // 2. Insert into empties_log_detail
            for (const item of returnItems) {
                await pb.collection('empties_log_detail').create({
                    log_id: logData.id,
                    product_id: item.productId,
                    quantity: item.quantity
                })
            }

            // 3. Cash-out refundable crate deposits FIFO, proportional per crate.
            // Crates are fungible across SKUs, so the oldest held deposit rows
            // are refunded first at their frozen per-crate amounts.
            let refundedCrates = 0
            let refundedAmount = 0
            let remaining = refundQty
            if (remaining > 0) {
                for (const dep of heldDeposits) {
                    if (remaining <= 0) break
                    const available = Math.max(0, dep.quantity - dep.refunded_qty)
                    if (available <= 0) continue
                    const alloc = Math.min(available, remaining)
                    const newRefunded = dep.refunded_qty + alloc
                    const fullyRefunded = newRefunded >= dep.quantity
                    try {
                        await pb.collection('crate_deposits').update(dep.id, {
                            refunded_qty: newRefunded,
                            status: fullyRefunded ? 'refunded' : 'partial',
                            ...(fullyRefunded
                                ? { refunded_at: new Date().toISOString(), refund_log_id: logData.id, refund_method: refundMethod }
                                : {}),
                        })
                        refundedCrates += alloc
                        refundedAmount += alloc * (dep.amount_per_crate || 0)
                        remaining -= alloc
                    } catch (refundError) {
                        console.error("Failed to refund crate deposit row:", refundError)
                        break
                    }
                }
            }

            if (refundedCrates > 0) {
                toast.success(`Return recorded! Refund GH₵ ${refundedAmount.toFixed(2)} in ${refundMethod.replace(/_/g, " ")} for ${refundedCrates} crate(s).`)
            } else {
                toast.success("Return recorded successfully!")
            }

            // Reset form
            setSelectedCustomer("")
            setDate(undefined)
            setReturnItems([])
            setHeldDeposits([])
            setApplyRefund(true)
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

            {/* 5. Crate deposit refund (cash-out on the spot, FIFO) */}
            {selectedCustomer && heldCrates > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3 dark:bg-amber-900/20">
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-medium">Held crate deposits</span>
                        <span className="font-bold">{heldCrates} crate(s) · GH₵ {heldTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Refund for this return</span>
                        <span className="font-bold">
                            {refundQty} crate(s)
                            {refundQty > 0 && ` · GH₵ ${previewRefundAmount.toFixed(2)}`}
                        </span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <Checkbox
                            checked={applyRefund}
                            onCheckedChange={(checked) => setApplyRefund(checked === true)}
                        />
                        <span>Refund deposit in cash on the spot (FIFO, oldest first)</span>
                    </label>
                    {applyRefund && refundQty > 0 && (
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium">Refund method</label>
                            <Select value={refundMethod} onValueChange={setRefundMethod}>
                                <SelectTrigger className="w-[180px] bg-background">
                                    <SelectValue placeholder="Choose method" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {returnQty > heldCrates && (
                        <p className="text-xs text-muted-foreground italic">
                            Returning more crates than held — only {heldCrates} crate(s) will be refunded.
                        </p>
                    )}
                </div>
            )}

            <div className="flex justify-end">
                <Button size="lg" onClick={handleSubmit} disabled={returnItems.length === 0}>
                    Save Return Record{refundQty > 0 ? ` + Refund ${refundQty} crate(s)` : ""}
                </Button>
            </div>
        </div>
    )
}
