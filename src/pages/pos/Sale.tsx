import { useState, useEffect } from "react"
import {
    Search,
    ShoppingCart,
    Trash2,
    Plus,
    User,
    Package,
    Wallet,
    CheckCircle2,
    Loader2
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
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
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Product {
    id: number
    sku_name: string
    code_name: string
    retail_price: number | null
    wholesale_price: number | null
    returnable?: boolean
}

interface Customer {
    id: number
    name: string
    phone: string | null
    balance: number
    has_mou: boolean
    customer_types: {
        name: string
    }
}

interface CartItem {
    id: string
    productId: number
    skuCode: string
    productName: string
    quantity: number
    price: number
    total: number
}

export default function Sale() {
    // State
    const [products, setProducts] = useState<Product[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [cart, setCart] = useState<CartItem[]>([])
    const [loadingProducts, setLoadingProducts] = useState(true)
    const [loadingCustomers, setLoadingCustomers] = useState(true)

    // Selection State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [quantity, setQuantity] = useState<number>(1)
    const [paymentType, setPaymentType] = useState<string>("cash")

    // UI helpers
    const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false)
    const [productPopoverOpen, setProductPopoverOpen] = useState(false)

    // Fetch Data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch Products
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('id, sku_name, code_name, retail_price, wholesale_price, returnable')
                    .is('deleted_at', null)
                    .order('sku_name', { ascending: true })

                if (productsError) throw productsError
                setProducts(productsData || [])
                setLoadingProducts(false)

                // Fetch Customers
                const { data: customersData, error: customersError } = await supabase
                    .from('customers')
                    .select('id, name, phone, balance, has_mou, customer_types(name)')
                    .is('deleted_at', null)
                    .order('name', { ascending: true })

                if (customersError) throw customersError
                setCustomers(customersData as any || [])
                setLoadingCustomers(false)

            } catch (err) {
                console.error("Error fetching initial data:", err)
            }
        }
        fetchInitialData()
    }, [])

    const getUnitPrice = (product: Product) => {
        if (!selectedCustomer) return product.retail_price || 0
        return selectedCustomer.customer_types?.name === "Wholesaler"
            ? product.wholesale_price || product.retail_price || 0
            : product.retail_price || 0
    }

    const currentUnitPrice = selectedProduct ? getUnitPrice(selectedProduct) : 0
    const currentTotalPrice = currentUnitPrice * quantity

    const handleAddToCart = () => {
        if (!selectedProduct || quantity <= 0) return

        const existingItem = cart.find(item => item.productId === selectedProduct.id)
        if (existingItem) {
            setCart(cart.map(item =>
                item.productId === selectedProduct.id
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        total: (item.quantity + quantity) * item.price
                    }
                    : item
            ))
        } else {
            const newItem: CartItem = {
                id: crypto.randomUUID(),
                productId: selectedProduct.id,
                skuCode: selectedProduct.code_name || "N/A",
                productName: selectedProduct.sku_name,
                quantity: quantity,
                price: currentUnitPrice,
                total: currentTotalPrice
            }
            setCart([...cart, newItem])
        }

        // Reset product selection
        setSelectedProduct(null)
        setQuantity(1)
    }

    const removeFromCart = (id: string) => {
        setCart(cart.filter(item => item.id !== id))
    }

    const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0)
    const grandTotal = cart.reduce((sum, item) => sum + item.total, 0)

    // Calculate required empties for the cart
    const itemsInCart = cart.map(item => ({
        ...item,
        isReturnable: products.find(p => p.id === item.productId)?.returnable || false
    }))

    const requiredEmpties = itemsInCart
        .filter(item => item.isReturnable)
        .reduce((sum, item) => sum + item.quantity, 0)

    const currentBalance = selectedCustomer?.balance || 0
    const projectedBalance = currentBalance - requiredEmpties
    const isBalanceInsufficient = !selectedCustomer?.has_mou && projectedBalance < 0

    const [processing, setProcessing] = useState(false)

    const handleCheckout = async () => {
        if (!selectedCustomer) {
            toast.error("Please select a customer first.")
            return
        }
        if (cart.length === 0) {
            toast.error("Cart is empty.")
            return
        }

        const returnableItems = cart.filter(item => {
            const product = products.find(p => p.id === item.productId)
            return product?.returnable === true
        })

        setProcessing(true)
        try {
            if (returnableItems.length > 0) {
                const totalQuantity = returnableItems.reduce((sum, item) => sum + item.quantity, 0)

                // 1. Insert into empties_log
                const { data: logData, error: logError } = await supabase
                    .from('empties_log')
                    .insert([{
                        date: new Date().toISOString().split('T')[0],
                        customer_id: selectedCustomer.id,
                        activity: 'customer_purchase',
                        total_quantity: totalQuantity
                    }])
                    .select()
                    .single()

                if (logError) {
                    if (logError.message.includes('Insufficient empties balance')) {
                        throw new Error(logError.message)
                    }
                    throw logError
                }

                // 2. Insert into empties_log_detail
                const detailsToInsert = returnableItems.map(item => ({
                    log_id: logData.id,
                    product_id: item.productId,
                    quantity: item.quantity
                }))

                const { error: detailError } = await supabase
                    .from('empties_log_detail')
                    .insert(detailsToInsert)

                if (detailError) throw detailError
            }

            // 3. Record the actual sale in 'orders' and 'sales' tables
            // First, get the order_type_id for 'sale'
            const { data: orderTypeData, error: orderTypeError } = await supabase
                .from('order_types')
                .select('id')
                .eq('name', 'sale')
                .single()

            if (orderTypeError) throw orderTypeError

            // Insert into orders header
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert([{
                    customer_id: selectedCustomer.id,
                    total_amount: grandTotal,
                    payment_type: paymentType,
                    order_type_id: orderTypeData.id,
                    status: 'pending',
                    date_time: new Date().toISOString()
                }])
                .select()
                .single()

            if (orderError) throw orderError

            // Insert into sales (order items)
            const salesToInsert = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.productId,
                quantity: item.quantity,
                unit_price: item.price,
                sub_total: item.total,
                discount: 0
            }))

            const { error: salesError } = await supabase
                .from('sales')
                .insert(salesToInsert)

            if (salesError) throw salesError

            toast.success(`Order #${orderData.id} created successfully for ${selectedCustomer.name} and is pending approval.`)
            setCart([])
            setSelectedCustomer(null)
        } catch (error: any) {
            console.error("Error processing sale:", error)
            toast.error(error.message || "Failed to process sale.")
        } finally {
            setProcessing(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">Point of Sale</h2>
                <p className="text-muted-foreground">Process new sales for registered customers.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Input & Table */}
                <div className="lg:col-span-2 space-y-6">
                    {/* 1. Selection Card */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Item Selection</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Customer Selection */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Customer</label>
                                    <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between"
                                                disabled={loadingCustomers}
                                            >
                                                {selectedCustomer ? (
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-4 w-4" />
                                                        {selectedCustomer.name}
                                                    </div>
                                                ) : loadingCustomers ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading...
                                                    </div>
                                                ) : "Select customer..."}
                                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search customer..." />
                                                <CommandList>
                                                    <CommandEmpty>No customer found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {customers.map((c) => (
                                                            <CommandItem
                                                                key={c.id}
                                                                onSelect={() => {
                                                                    setSelectedCustomer(c)
                                                                    setCustomerPopoverOpen(false)
                                                                }}
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span>{c.name}</span>
                                                                    <span className="text-xs text-muted-foreground">{c.customer_types?.name} • {c.phone || "No Phone"}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {/* Product Selection */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Product</label>
                                    <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full justify-between"
                                                disabled={loadingProducts}
                                            >
                                                {selectedProduct ? (
                                                    <div className="flex items-center gap-2">
                                                        <Package className="h-4 w-4" />
                                                        {selectedProduct.sku_name}
                                                    </div>
                                                ) : loadingProducts ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading...
                                                    </div>
                                                ) : "Select product..."}
                                                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search product..." />
                                                <CommandList>
                                                    <CommandEmpty>No product found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {products.map((p) => (
                                                            <CommandItem
                                                                key={p.id}
                                                                onSelect={() => {
                                                                    setSelectedProduct(p)
                                                                    setProductPopoverOpen(false)
                                                                }}
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span>{p.sku_name}</span>
                                                                    <span className="text-xs text-muted-foreground">{p.code_name || "No SKU"}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>

                            {selectedProduct && (
                                <div className="bg-muted/30 p-4 rounded-lg animate-in fade-in slide-in-from-top-1 px-4 py-3 flex flex-wrap items-end gap-6 border border-dashed">
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase">Unit Price</span>
                                        <div className="text-lg font-bold">GH₵ {currentUnitPrice.toFixed(2)}</div>
                                    </div>

                                    <div className="space-y-1 w-24">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase">Quantity</span>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={quantity}
                                            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="h-9"
                                        />
                                    </div>

                                    <div className="space-y-1 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded border border-amber-200 dark:border-amber-800">
                                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">Item Total</span>
                                        <div className="text-lg font-bold text-amber-800 dark:text-amber-300">GH₵ {currentTotalPrice.toFixed(2)}</div>
                                    </div>

                                    <Button onClick={handleAddToCart} className="h-9 bg-amber-700 hover:bg-amber-800">
                                        <Plus className="h-4 w-4 mr-1" /> Add to List
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* 2. Cart Table */}
                    <Card className="min-h-[400px]">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-lg">Checkout List</CardTitle>
                                <CardDescription>Items ready for purchase.</CardDescription>
                            </div>
                            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>SKU</TableHead>
                                            <TableHead>Product</TableHead>
                                            <TableHead className="text-right">Price</TableHead>
                                            <TableHead className="text-center">Qty</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                            <TableHead className="w-[50px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {cart.length > 0 ? (
                                            cart.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-mono text-xs">{item.skuCode}</TableCell>
                                                    <TableCell className="font-medium">{item.productName}</TableCell>
                                                    <TableCell className="text-right">GH₵ {item.price.toFixed(2)}</TableCell>
                                                    <TableCell className="text-center">{item.quantity}</TableCell>
                                                    <TableCell className="text-right font-bold">GH₵ {item.total.toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                            onClick={() => removeFromCart(item.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground italic">
                                                    Your cart is currently empty.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Summary */}
                <div className="space-y-6">
                    <Card className="sticky top-6 border-amber-200 dark:border-amber-900 shadow-lg">
                        <CardHeader className="bg-amber-50 dark:bg-amber-900/10 rounded-t-lg border-b border-amber-100 dark:border-amber-900">
                            <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100 italic">
                                Purchase Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            {/* Customer Info */}
                            <div className="space-y-4 pb-6 border-b">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase">Customer</span>
                                    <div className="text-lg font-bold flex items-center justify-between mt-1">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-amber-700" />
                                            {selectedCustomer ? selectedCustomer.name : "Not Selected"}
                                        </div>
                                        {selectedCustomer && (
                                            <Badge variant="outline" className="text-[10px] uppercase font-bold text-amber-700 border-amber-200">
                                                {selectedCustomer.customer_types?.name}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center bg-muted/20 px-3 py-2 rounded-lg">
                                    <span className="text-sm font-medium">Total Quantity</span>
                                    <span className="text-lg font-bold">{totalQuantity}</span>
                                </div>

                                {/* Empties Breakdown */}
                                {selectedCustomer && requiredEmpties > 0 && (
                                    <div className="space-y-2 pt-2">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">Empties Balance</span>
                                            <span className="font-bold">{currentBalance}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm text-amber-700">
                                            <span className="font-medium">Required for Cart</span>
                                            <span className="font-bold">-{requiredEmpties}</span>
                                        </div>
                                        <div className={`flex justify-between items-center p-2 rounded-md ${isBalanceInsufficient ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                            <span className="text-xs font-bold uppercase">Projected Balance</span>
                                            <span className="text-lg font-black">{projectedBalance}</span>
                                        </div>
                                        {isBalanceInsufficient && (
                                            <p className="text-[10px] text-red-600 font-bold text-center leading-tight">
                                                Insufficient empties. Customer requires an MOU to go negative.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Total Price Section */}
                            <div className="space-y-2">
                                <span className="text-sm font-semibold text-muted-foreground uppercase block text-center">Grand Total</span>
                                <div className="text-4xl font-black text-center text-amber-900 dark:text-amber-100 py-2">
                                    GH₵ {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {/* Payment Options */}
                            <div className="space-y-3">
                                <label className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                                    <Wallet className="h-4 w-4" /> Payment Type
                                </label>
                                <Select value={paymentType} onValueChange={setPaymentType}>
                                    <SelectTrigger className="w-full bg-background border-2 border-amber-100 focus:ring-amber-500">
                                        <SelectValue placeholder="Choose payment type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                        <SelectItem value="cheque">Cheque</SelectItem>
                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-2">
                            <Button
                                onClick={handleCheckout}
                                className="w-full h-14 bg-amber-800 hover:bg-amber-900 text-lg font-bold shadow-md uppercase tracking-widest gap-2"
                                disabled={cart.length === 0 || processing || isBalanceInsufficient}
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="h-5 w-5" /> Confirm & Process Sale
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* Quick Tips */}
                    <div className="p-4 bg-muted/20 border-l-4 border-amber-600 rounded-r-lg space-y-2">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-500 uppercase">Tip</p>
                        <p className="text-xs text-muted-foreground italic">
                            Customer selection automatically applies correct pricing (Retail vs Wholesale).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
