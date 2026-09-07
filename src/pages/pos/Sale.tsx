import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
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
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import { generateOrderNumber } from "@/lib/orderNumber"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import CustomerFormFields from "@/components/CustomerFormFields"

interface Product {
    id: string
    sku_name: string
    code_name: string
    retail_price: number | null
    wholesale_price: number | null
    returnable?: boolean
    quantity: number
}

interface Customer {
    id: string
    name: string
    phone: string | null
    balance: number
    has_mou: boolean
    customer_types: {
        name: string
    } | null
}

interface CartItem {
    id: string
    productId: string
    skuCode: string
    productName: string
    quantity: number
    price: number
    surcharge: number
    total: number
}

export default function Sale() {
    const navigate = useNavigate()
    const { profile } = useAuth()
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
    const [addCustomerOpen, setAddCustomerOpen] = useState(false)

    // Wholesale surcharge
    const [surchargeConfig, setSurchargeConfig] = useState<{ amount: number; product_ids: string[] }>({ amount: 0, product_ids: [] })
    const [applySurcharge, setApplySurcharge] = useState(false)

    // Fetch customers (reusable for refresh after add)
    const fetchCustomers = async () => {
        try {
            const customersData = await pb.collection('customers').getFullList({
                filter: 'deleted_at = ""',
                sort: 'name',
                expand: 'type_id'
            })
            setCustomers(customersData.map((c) => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                balance: c.balance,
                has_mou: c.has_mou,
                customer_types: c.expand?.type_id ?? null
            })))
        } catch (err) {
            console.error("Error fetching customers:", err)
        } finally {
            setLoadingCustomers(false)
        }
    }

    // Fetch Data
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch stock quantities
                const stockData = await pb.collection('warehouse_stock').getFullList({
                    fields: 'product_id, quantity'
                })
                const stockMap = new Map<string, number>()
                for (const s of stockData) {
                    stockMap.set(s.product_id, s.quantity || 0)
                }

                // Fetch Products
                const productsData = await pb.collection('products').getFullList({
                    filter: 'deleted_at = ""',
                    sort: 'sku_name',
                    fields: 'id, sku_name, code_name, retail_price, wholesale_price, returnable'
                })
                setProducts(productsData.map((p) => ({
                    id: p.id,
                    sku_name: p.sku_name,
                    code_name: p.code_name,
                    retail_price: p.retail_price,
                    wholesale_price: p.wholesale_price,
                    returnable: p.returnable,
                    quantity: stockMap.get(p.id) ?? 0,
                })))
                setLoadingProducts(false)

                // Fetch Customers
                await fetchCustomers()

                // Fetch wholesale surcharge settings
                try {
                    const surchargeRecord = await pb.collection('app_settings').getFirstListItem('key = "wholesale_surcharge"')
                    const raw = surchargeRecord.value
                    setSurchargeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw)
                } catch (err) {
                    console.error("Failed to load surcharge settings:", err)
                }

            } catch (err) {
                console.error("Error fetching initial data:", err)
            }
        }
        fetchInitialData()
    }, [])

    // Reset surcharge when product or customer changes
    useEffect(() => {
        setApplySurcharge(false)
    }, [selectedProduct, selectedCustomer])

    const getUnitPrice = (product: Product) => {
        if (!selectedCustomer) return product.retail_price || 0
        return selectedCustomer.customer_types?.name === "Wholesaler"
            ? product.wholesale_price || product.retail_price || 0
            : product.retail_price || 0
    }

    // Check if wholesale surcharge applies to current selection
    const isSurchargeApplicable = selectedCustomer?.customer_types?.name === "Wholesaler" &&
        surchargeConfig.product_ids.includes(selectedProduct?.id || "") &&
        surchargeConfig.amount > 0

    const currentUnitPrice = selectedProduct ? getUnitPrice(selectedProduct) : 0
    const currentSurcharge = (applySurcharge && isSurchargeApplicable) ? surchargeConfig.amount : 0
    const currentTotalPrice = (currentUnitPrice + currentSurcharge) * quantity

    const handleAddToCart = () => {
        if (!selectedProduct || quantity <= 0) return
        if (selectedProduct.quantity <= 0) {
            toast.error("This product is out of stock.")
            return
        }

        const existingItem = cart.find(item => item.productId === selectedProduct.id)
        if (existingItem) {
            setCart(cart.map(item =>
                item.productId === selectedProduct.id
                    ? {
                        ...item,
                        quantity: item.quantity + quantity,
                        total: (item.quantity + quantity) * (item.price + item.surcharge)
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
                surcharge: currentSurcharge,
                total: currentTotalPrice
            }
            setCart([...cart, newItem])
        }

        // Reset product selection and surcharge
        setSelectedProduct(null)
        setQuantity(1)
        setApplySurcharge(false)
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
                let logData: any
                try {
                    logData = await pb.collection('empties_log').create({
                        date: new Date().toISOString(),
                        customer_id: selectedCustomer.id,
                        activity: 'customer_purchase',
                        total_quantity: totalQuantity
                    })
                } catch (logError: any) {
                    const msg = logError.response?.data?.message || logError.message || ''
                    if (msg.includes('Insufficient empties balance')) {
                        throw new Error(msg)
                    }
                    throw logError
                }

                // 2. Insert into empties_log_detail
                const detailsToInsert = returnableItems.map(item => ({
                    log_id: logData.id,
                    product_id: item.productId,
                    quantity: item.quantity
                }))

                for (const detail of detailsToInsert) {
                    await pb.collection('empties_log_detail').create(detail)
                }
            }

            // 3. Record the actual sale in 'orders' and 'sales' tables
            // First, get the order_type_id for 'sale'
            const orderTypeData = await pb.collection('order_types').getFirstListItem('name = "sale"', { fields: 'id' })

            // Generate sequential order number
            const orderNumber = await generateOrderNumber()

            // Insert into orders header
            const orderData = await pb.collection('orders').create({
                customer_id: selectedCustomer.id,
                order_number: orderNumber,
                total_amount: grandTotal,
                payment_type: paymentType,
                order_type_id: orderTypeData.id,
                status: 'pending',
                date_time: new Date().toISOString(),
                created_by: profile?.id || '',
            })

            // Insert into sales (order items)
            const salesToInsert = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.productId,
                quantity: item.quantity,
                unit_price: item.price,
                sub_total: item.total,
                discount: 0
            }))

            for (const sale of salesToInsert) {
                await pb.collection('sales').create(sale)
            }

            toast.success(`Order #${orderNumber} created successfully for ${selectedCustomer.name} and is pending approval.`)
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
                                                    <CommandEmpty>
                                                        <div className="flex flex-col items-center gap-2 py-2">
                                                            <p className="text-sm text-muted-foreground">No customer found.</p>
                                                            <Button
                                                                variant="link"
                                                                size="sm"
                                                                className="h-auto p-0"
                                                                onClick={() => {
                                                                    setCustomerPopoverOpen(false)
                                                                    setAddCustomerOpen(true)
                                                                }}
                                                            >
                                                                + Add New Customer
                                                            </Button>
                                                        </div>
                                                    </CommandEmpty>
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
                                                                disabled={p.quantity <= 0}
                                                                onSelect={() => {
                                                                    if (p.quantity <= 0) return
                                                                    setSelectedProduct(p)
                                                                    setProductPopoverOpen(false)
                                                                }}
                                                                className={p.quantity <= 0 ? "opacity-50 pointer-events-none" : ""}
                                                            >
                                                                <div className="flex flex-col flex-1">
                                                                    <span>{p.sku_name}</span>
                                                                    <span className="text-xs text-muted-foreground">{p.code_name || "No SKU"}</span>
                                                                </div>
                                                                <span className={`text-xs font-medium whitespace-nowrap ${p.quantity <= 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                                                    {p.quantity <= 0 ? "Out of stock" : `Qty: ${p.quantity}`}
                                                                </span>
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

                                    {isSurchargeApplicable && (
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="surcharge"
                                                checked={applySurcharge}
                                                onCheckedChange={(checked) => setApplySurcharge(checked === true)}
                                            />
                                            <label
                                                htmlFor="surcharge"
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                                Apply GH₵ {surchargeConfig.amount.toFixed(2)} additional charge
                                            </label>
                                        </div>
                                    )}

                                    <div className="space-y-1 bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded border border-amber-200 dark:border-amber-800">
                                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase">Item Total</span>
                                        <div className="text-lg font-bold text-amber-800 dark:text-amber-300">
                                            GH₵ {currentTotalPrice.toFixed(2)}
                                        </div>
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
                                                    <TableCell className="text-right">
                                                        GH₵ {item.price.toFixed(2)}
                                                        {item.surcharge > 0 && (
                                                            <span className="text-muted-foreground"> + GH₵ {item.surcharge.toFixed(2)}</span>
                                                        )}
                                                    </TableCell>
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

            {/* Add Customer Dialog */}
            <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add Customer</DialogTitle>
                    </DialogHeader>
                    <CustomerFormFields
                        onSuccess={(newCustomer) => {
                            fetchCustomers()
                            setSelectedCustomer({
                                id: newCustomer.id,
                                name: newCustomer.name,
                                phone: null,
                                balance: 0,
                                has_mou: false,
                                customer_types: null,
                            })
                            setAddCustomerOpen(false)
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
