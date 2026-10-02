import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Search, Save, Loader2 } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import { toast } from "sonner"

interface StockThresholds {
    low_max: number
    medium_max: number
}

interface WholesaleSurcharge {
    amount: number
    product_ids: string[]
}

interface WholesaleDiscount {
    amount: number
    product_ids: string[]
    customer_ids: string[]
}

interface WholesaleRetailPricing {
    product_ids: string[]
    customer_ids: string[]
}

interface CrateDeposit {
    amount: number
}

interface EmptiesDisplay {
    mode: "debit" | "raw"
}

interface Product {
    id: string
    sku_name: string
    code_name: string | null
}

interface Wholesaler {
    id: string
    name: string
    phone: string | null
}

export default function Settings() {
    const [loading, setLoading] = useState(true)
    const [savingStock, setSavingStock] = useState(false)
    const [savingSurcharge, setSavingSurcharge] = useState(false)
    const [savingDiscount, setSavingDiscount] = useState(false)
    const [savingRetailPricing, setSavingRetailPricing] = useState(false)
    const [savingDeposit, setSavingDeposit] = useState(false)
    const [savingEmptiesDisplay, setSavingEmptiesDisplay] = useState(false)

    const [stockThresholds, setStockThresholds] = useState<StockThresholds>({ low_max: 20, medium_max: 50 })
    const [surcharge, setSurcharge] = useState<WholesaleSurcharge>({ amount: 2, product_ids: [] })
    const [discount, setDiscount] = useState<WholesaleDiscount>({ amount: 2, product_ids: [], customer_ids: [] })
    const [retailPricing, setRetailPricing] = useState<WholesaleRetailPricing>({ product_ids: [], customer_ids: [] })
    const [crateDeposit, setCrateDeposit] = useState<CrateDeposit>({ amount: 200 })
    const [emptiesDisplay, setEmptiesDisplay] = useState<EmptiesDisplay>({ mode: "debit" })
    const [products, setProducts] = useState<Product[]>([])
    const [wholesalers, setWholesalers] = useState<Wholesaler[]>([])
    const [productSearch, setProductSearch] = useState("")
    const [discountProductSearch, setDiscountProductSearch] = useState("")
    const [discountCustomerSearch, setDiscountCustomerSearch] = useState("")
    const [retailPricingProductSearch, setRetailPricingProductSearch] = useState("")
    const [retailPricingCustomerSearch, setRetailPricingCustomerSearch] = useState("")

    const [stockSettingsId, setStockSettingsId] = useState<string | null>(null)
    const [surchargeSettingsId, setSurchargeSettingsId] = useState<string | null>(null)
    const [discountSettingsId, setDiscountSettingsId] = useState<string | null>(null)
    const [retailPricingSettingsId, setRetailPricingSettingsId] = useState<string | null>(null)
    const [depositSettingsId, setDepositSettingsId] = useState<string | null>(null)
    const [emptiesDisplaySettingsId, setEmptiesDisplaySettingsId] = useState<string | null>(null)

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fetch products
                const productsData = await pb.collection('products').getFullList({
                    filter: 'deleted_at = ""',
                    sort: 'sku_name',
                    fields: 'id, sku_name, code_name, product_code'
                })
                setProducts(productsData.map(p => ({ id: p.id, sku_name: p.sku_name, code_name: p.product_code || p.code_name })))

                // Fetch wholesalers (eligible-customer pool for wholesale discount)
                try {
                    const customersData = await pb.collection('customers').getFullList({
                        filter: 'deleted_at = ""',
                        sort: 'name',
                        expand: 'type_id',
                    })
                    setWholesalers(
                        customersData
                            .filter((c) => c.expand?.type_id?.name === "Wholesaler")
                            .map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null }))
                    )
                } catch {
                    // Customers list is optional; discount customer picker just stays empty
                }

                // Fetch stock thresholds
                try {
                    const stockRecord = await pb.collection('app_settings').getFirstListItem('key = "stock_thresholds"')
                    setStockThresholds(stockRecord.value as StockThresholds)
                    setStockSettingsId(stockRecord.id)
                } catch {
                    // Record doesn't exist yet
                }

                // Fetch wholesale surcharge
                try {
                    const surchargeRecord = await pb.collection('app_settings').getFirstListItem('key = "wholesale_surcharge"')
                    setSurcharge(surchargeRecord.value as WholesaleSurcharge)
                    setSurchargeSettingsId(surchargeRecord.id)
                } catch {
                    // Record doesn't exist yet
                }

                // Fetch wholesale discount (fixed per-unit reduction for
                // eligible wholesalers on eligible products)
                try {
                    const discountRecord = await pb.collection('app_settings').getFirstListItem('key = "wholesale_discount"')
                    const raw = discountRecord.value as Partial<WholesaleDiscount>
                    setDiscount({
                        amount: typeof raw.amount === "number" ? raw.amount : 2,
                        product_ids: Array.isArray(raw.product_ids) ? raw.product_ids : [],
                        customer_ids: Array.isArray(raw.customer_ids) ? raw.customer_ids : [],
                    })
                    setDiscountSettingsId(discountRecord.id)
                } catch {
                    // Record doesn't exist yet (defaults to 2 GHc, nobody eligible)
                }

                // Fetch retail pricing for wholesalers (eligible wholesalers
                // pay retail price on eligible products instead of wholesale)
                try {
                    const retailPricingRecord = await pb.collection('app_settings').getFirstListItem('key = "wholesale_retail_pricing"')
                    const raw = retailPricingRecord.value as Partial<WholesaleRetailPricing>
                    setRetailPricing({
                        product_ids: Array.isArray(raw.product_ids) ? raw.product_ids : [],
                        customer_ids: Array.isArray(raw.customer_ids) ? raw.customer_ids : [],
                    })
                    setRetailPricingSettingsId(retailPricingRecord.id)
                } catch {
                    // Record doesn't exist yet (nobody eligible)
                }

                // Fetch crate deposit (refundable per-crate fee for retailers
                // without enough empties to buy returnable products)
                try {
                    const depositRecord = await pb.collection('app_settings').getFirstListItem('key = "crate_deposit"')
                    setCrateDeposit(depositRecord.value as CrateDeposit)
                    setDepositSettingsId(depositRecord.id)
                } catch {
                    // Record doesn't exist yet (defaults to 200 GHc)
                }

                // Fetch empties balance display mode (debit Dr/Cr vs raw stored)
                try {
                    const displayRecord = await pb.collection('app_settings').getFirstListItem('key = "empties_display"')
                    const mode = (displayRecord.value as EmptiesDisplay | null)?.mode
                    setEmptiesDisplay({ mode: mode === "raw" ? "raw" : "debit" })
                    setEmptiesDisplaySettingsId(displayRecord.id)
                } catch {
                    // Record doesn't exist yet (defaults to debit Dr/Cr)
                }
            } catch (err) {
                console.error("Error fetching settings:", err)
                toast.error("Failed to load settings")
            } finally {
                setLoading(false)
            }
        }
        fetchSettings()
    }, [])

    const handleSaveStock = async () => {
        setSavingStock(true)
        try {
            if (stockSettingsId) {
                await pb.collection('app_settings').update(stockSettingsId, {
                    value: stockThresholds
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'stock_thresholds',
                    value: stockThresholds
                })
                setStockSettingsId(record.id)
            }
            toast.success("Stock thresholds saved!")
        } catch (err) {
            console.error("Error saving stock thresholds:", err)
            toast.error("Failed to save stock thresholds")
        } finally {
            setSavingStock(false)
        }
    }

    const handleSaveSurcharge = async () => {
        setSavingSurcharge(true)
        try {
            if (surchargeSettingsId) {
                await pb.collection('app_settings').update(surchargeSettingsId, {
                    value: surcharge
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'wholesale_surcharge',
                    value: surcharge
                })
                setSurchargeSettingsId(record.id)
            }
            toast.success("Wholesale surcharge settings saved!")
        } catch (err) {
            console.error("Error saving surcharge settings:", err)
            toast.error("Failed to save surcharge settings")
        } finally {
            setSavingSurcharge(false)
        }
    }

    const handleSaveDiscount = async () => {
        if (discount.amount < 0) {
            toast.error("Discount amount cannot be negative")
            return
        }
        setSavingDiscount(true)
        try {
            if (discountSettingsId) {
                await pb.collection('app_settings').update(discountSettingsId, {
                    value: discount
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'wholesale_discount',
                    value: discount
                })
                setDiscountSettingsId(record.id)
            }
            toast.success("Wholesale discount settings saved!")
        } catch (err) {
            console.error("Error saving discount settings:", err)
            toast.error("Failed to save discount settings")
        } finally {
            setSavingDiscount(false)
        }
    }

    const handleSaveRetailPricing = async () => {
        setSavingRetailPricing(true)
        try {
            if (retailPricingSettingsId) {
                await pb.collection('app_settings').update(retailPricingSettingsId, {
                    value: retailPricing
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'wholesale_retail_pricing',
                    value: retailPricing
                })
                setRetailPricingSettingsId(record.id)
            }
            toast.success("Retail pricing settings saved!")
        } catch (err) {
            console.error("Error saving retail pricing settings:", err)
            toast.error("Failed to save retail pricing settings")
        } finally {
            setSavingRetailPricing(false)
        }
    }

    const handleSaveEmptiesDisplay = async () => {
        setSavingEmptiesDisplay(true)
        try {
            if (emptiesDisplaySettingsId) {
                await pb.collection('app_settings').update(emptiesDisplaySettingsId, {
                    value: emptiesDisplay
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'empties_display',
                    value: emptiesDisplay
                })
                setEmptiesDisplaySettingsId(record.id)
            }
            toast.success("Empties display settings saved!")
        } catch (err) {
            console.error("Error saving empties display settings:", err)
            toast.error("Failed to save empties display settings")
        } finally {
            setSavingEmptiesDisplay(false)
        }
    }

    const handleSaveDeposit = async () => {        if (crateDeposit.amount < 0) {
            toast.error("Deposit amount cannot be negative")
            return
        }
        setSavingDeposit(true)
        try {
            if (depositSettingsId) {
                await pb.collection('app_settings').update(depositSettingsId, {
                    value: crateDeposit
                })
            } else {
                const record = await pb.collection('app_settings').create({
                    key: 'crate_deposit',
                    value: crateDeposit
                })
                setDepositSettingsId(record.id)
            }
            toast.success("Crate deposit settings saved!")
        } catch (err) {
            console.error("Error saving crate deposit settings:", err)
            toast.error("Failed to save crate deposit settings")
        } finally {
            setSavingDeposit(false)
        }
    }

    const toggleProduct = (productId: string) => {
        setSurcharge(prev => ({
            ...prev,
            product_ids: prev.product_ids.includes(productId)
                ? prev.product_ids.filter(id => id !== productId)
                : [...prev.product_ids, productId]
        }))
    }

    const toggleDiscountProduct = (productId: string) => {
        setDiscount(prev => ({
            ...prev,
            product_ids: prev.product_ids.includes(productId)
                ? prev.product_ids.filter(id => id !== productId)
                : [...prev.product_ids, productId]
        }))
    }

    const toggleDiscountCustomer = (customerId: string) => {
        setDiscount(prev => ({
            ...prev,
            customer_ids: prev.customer_ids.includes(customerId)
                ? prev.customer_ids.filter(id => id !== customerId)
                : [...prev.customer_ids, customerId]
        }))
    }

    const toggleRetailPricingProduct = (productId: string) => {
        setRetailPricing(prev => ({
            ...prev,
            product_ids: prev.product_ids.includes(productId)
                ? prev.product_ids.filter(id => id !== productId)
                : [...prev.product_ids, productId]
        }))
    }

    const toggleRetailPricingCustomer = (customerId: string) => {
        setRetailPricing(prev => ({
            ...prev,
            customer_ids: prev.customer_ids.includes(customerId)
                ? prev.customer_ids.filter(id => id !== customerId)
                : [...prev.customer_ids, customerId]
        }))
    }

    const filteredProducts = products.filter(p => {
        const term = productSearch.toLowerCase()
        return p.sku_name.toLowerCase().includes(term) ||
            (p.code_name && p.code_name.toLowerCase().includes(term))
    })

    const filteredDiscountProducts = products.filter(p => {
        const term = discountProductSearch.toLowerCase()
        return p.sku_name.toLowerCase().includes(term) ||
            (p.code_name && p.code_name.toLowerCase().includes(term))
    })

    const filteredWholesalers = wholesalers.filter(c => {
        const term = discountCustomerSearch.toLowerCase()
        return c.name.toLowerCase().includes(term) ||
            (c.phone && c.phone.toLowerCase().includes(term))
    })

    const filteredRetailPricingProducts = products.filter(p => {
        const term = retailPricingProductSearch.toLowerCase()
        return p.sku_name.toLowerCase().includes(term) ||
            (p.code_name && p.code_name.toLowerCase().includes(term))
    })

    const filteredRetailPricingWholesalers = wholesalers.filter(c => {
        const term = retailPricingCustomerSearch.toLowerCase()
        return c.name.toLowerCase().includes(term) ||
            (c.phone && c.phone.toLowerCase().includes(term))
    })

    if (loading) {
        return (
            <div className="space-y-6">
                <h1 className="text-lg font-semibold md:text-2xl">Settings</h1>
                <div className="flex items-center justify-center h-64">
                    <p>Loading settings...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Settings</h2>

            {/* Stock Level Thresholds */}
            <Card>
                <CardHeader>
                    <CardTitle>Stock Level Thresholds</CardTitle>
                    <CardDescription>
                        Configure the quantity thresholds for stock level labels (High, Medium, Low).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="low_max">Low Stock Max</Label>
                            <Input
                                id="low_max"
                                type="number"
                                min="0"
                                value={stockThresholds.low_max}
                                onChange={(e) => setStockThresholds(prev => ({
                                    ...prev,
                                    low_max: parseInt(e.target.value) || 0
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                Quantities at or below this value are "Low Stock"
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="medium_max">Medium Stock Max</Label>
                            <Input
                                id="medium_max"
                                type="number"
                                min="0"
                                value={stockThresholds.medium_max}
                                onChange={(e) => setStockThresholds(prev => ({
                                    ...prev,
                                    medium_max: parseInt(e.target.value) || 0
                                }))}
                            />
                            <p className="text-xs text-muted-foreground">
                                Quantities at or below this value (but above Low) are "Medium Stock"
                            </p>
                        </div>
                    </div>
                    <Button onClick={handleSaveStock} disabled={savingStock} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingStock ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingStock ? "Saving..." : "Save Stock Thresholds"}
                    </Button>
                </CardContent>
            </Card>

            {/* Wholesale Surcharge */}
            <Card>
                <CardHeader>
                    <CardTitle>Wholesale Surcharge</CardTitle>
                    <CardDescription>
                        Configure an additional charge applied to specific products when purchased by wholesale customers.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 max-w-xs">
                        <Label htmlFor="surcharge_amount">Charge Amount (GHc)</Label>
                        <Input
                            id="surcharge_amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={surcharge.amount}
                            onChange={(e) => setSurcharge(prev => ({
                                ...prev,
                                amount: parseFloat(e.target.value) || 0
                            }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Apply to Products</Label>
                        <p className="text-xs text-muted-foreground">
                            Select which products incur the additional charge for wholesale customers.
                        </p>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search products..."
                                className="pl-8"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                            />
                        </div>
                        <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.map((product) => (
                                    <label
                                        key={product.id}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                    >
                                        <Checkbox
                                            checked={surcharge.product_ids.includes(product.id)}
                                            onCheckedChange={() => toggleProduct(product.id)}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{product.sku_name}</span>
                                            {product.code_name && (
                                                <span className="text-xs text-muted-foreground">{product.code_name}</span>
                                            )}
                                        </div>
                                    </label>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {surcharge.product_ids.length} product(s) selected
                        </p>
                    </div>

                    <Button onClick={handleSaveSurcharge} disabled={savingSurcharge} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingSurcharge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingSurcharge ? "Saving..." : "Save Surcharge Settings"}
                    </Button>
                </CardContent>
            </Card>

            {/* Wholesale Discount */}
            <Card>
                <CardHeader>
                    <CardTitle>Wholesale Discount</CardTitle>
                    <CardDescription>
                        Fixed per-unit reduction for eligible wholesale customers on eligible products.
                        Mutually exclusive with the surcharge — a line gets one or the other, never both.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 max-w-xs">
                        <Label htmlFor="discount_amount">Discount Amount (GHc)</Label>
                        <Input
                            id="discount_amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={discount.amount}
                            onChange={(e) => setDiscount(prev => ({
                                ...prev,
                                amount: parseFloat(e.target.value) || 0
                            }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Apply to Products</Label>
                        <p className="text-xs text-muted-foreground">
                            Select which products get the per-unit reduction for eligible wholesalers.
                        </p>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search products..."
                                className="pl-8"
                                value={discountProductSearch}
                                onChange={(e) => setDiscountProductSearch(e.target.value)}
                            />
                        </div>
                        <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredDiscountProducts.length > 0 ? (
                                filteredDiscountProducts.map((product) => (
                                    <label
                                        key={product.id}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                    >
                                        <Checkbox
                                            checked={discount.product_ids.includes(product.id)}
                                            onCheckedChange={() => toggleDiscountProduct(product.id)}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{product.sku_name}</span>
                                            {product.code_name && (
                                                <span className="text-xs text-muted-foreground">{product.code_name}</span>
                                            )}
                                        </div>
                                    </label>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {discount.product_ids.length} product(s) selected
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Eligible Wholesalers</Label>
                        <p className="text-xs text-muted-foreground">
                            Only these wholesale customers can claim the discount (on the products above).
                        </p>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search wholesalers..."
                                className="pl-8"
                                value={discountCustomerSearch}
                                onChange={(e) => setDiscountCustomerSearch(e.target.value)}
                            />
                        </div>
                        <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredWholesalers.length > 0 ? (
                                filteredWholesalers.map((customer) => (
                                    <label
                                        key={customer.id}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                    >
                                        <Checkbox
                                            checked={discount.customer_ids.includes(customer.id)}
                                            onCheckedChange={() => toggleDiscountCustomer(customer.id)}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{customer.name}</span>
                                            {customer.phone && (
                                                <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                            )}
                                        </div>
                                    </label>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No wholesalers found.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {discount.customer_ids.length} wholesaler(s) selected
                        </p>
                    </div>

                    <Button onClick={handleSaveDiscount} disabled={savingDiscount} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingDiscount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingDiscount ? "Saving..." : "Save Discount Settings"}
                    </Button>
                </CardContent>
            </Card>

            {/* Retail Pricing for Wholesalers */}
            <Card>
                <CardHeader>
                    <CardTitle>Retail Pricing for Wholesalers</CardTitle>
                    <CardDescription>
                        Selected wholesalers pay the retail price (instead of wholesale)
                        on selected products. A retail-priced line gets neither the
                        surcharge nor the discount — one pricing treatment per line.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Apply to Products</Label>
                        <p className="text-xs text-muted-foreground">
                            Select which products sell at retail price to eligible wholesalers.
                        </p>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search products..."
                                className="pl-8"
                                value={retailPricingProductSearch}
                                onChange={(e) => setRetailPricingProductSearch(e.target.value)}
                            />
                        </div>
                        <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredRetailPricingProducts.length > 0 ? (
                                filteredRetailPricingProducts.map((product) => (
                                    <label
                                        key={product.id}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                    >
                                        <Checkbox
                                            checked={retailPricing.product_ids.includes(product.id)}
                                            onCheckedChange={() => toggleRetailPricingProduct(product.id)}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{product.sku_name}</span>
                                            {product.code_name && (
                                                <span className="text-xs text-muted-foreground">{product.code_name}</span>
                                            )}
                                        </div>
                                    </label>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No products found.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {retailPricing.product_ids.length} product(s) selected
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Eligible Wholesalers</Label>
                        <p className="text-xs text-muted-foreground">
                            Only these wholesale customers pay retail price (on the products above).
                        </p>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search wholesalers..."
                                className="pl-8"
                                value={retailPricingCustomerSearch}
                                onChange={(e) => setRetailPricingCustomerSearch(e.target.value)}
                            />
                        </div>
                        <div className="border rounded-md max-h-64 overflow-y-auto">
                            {filteredRetailPricingWholesalers.length > 0 ? (
                                filteredRetailPricingWholesalers.map((customer) => (
                                    <label
                                        key={customer.id}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                    >
                                        <Checkbox
                                            checked={retailPricing.customer_ids.includes(customer.id)}
                                            onCheckedChange={() => toggleRetailPricingCustomer(customer.id)}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{customer.name}</span>
                                            {customer.phone && (
                                                <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                            )}
                                        </div>
                                    </label>
                                ))
                            ) : (
                                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No wholesalers found.</p>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {retailPricing.customer_ids.length} wholesaler(s) selected
                        </p>
                    </div>

                    <Button onClick={handleSaveRetailPricing} disabled={savingRetailPricing} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingRetailPricing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingRetailPricing ? "Saving..." : "Save Retail Pricing Settings"}
                    </Button>
                </CardContent>
            </Card>

            {/* Crate Deposit */}
            <Card>
                <CardHeader>
                    <CardTitle>Crate Deposit</CardTitle>
                    <CardDescription>
                        Refundable per-crate fee charged to retailers without enough empty crates
                        to buy returnable products. Covers the shortfall only; refunded in cash
                        when empties are returned. MOU customers are exempt.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 max-w-xs">
                        <Label htmlFor="crate_deposit_amount">Deposit Amount per Crate (GHc)</Label>
                        <Input
                            id="crate_deposit_amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={crateDeposit.amount}
                            onChange={(e) => setCrateDeposit({
                                amount: parseFloat(e.target.value) || 0
                            })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Frozen per order at sale time, so changing this never rewrites history.
                        </p>
                    </div>

                    <Button onClick={handleSaveDeposit} disabled={savingDeposit} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingDeposit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingDeposit ? "Saving..." : "Save Crate Deposit"}
                    </Button>
                </CardContent>
            </Card>
            {/* Empties Balance Display */}
            <Card>
                <CardHeader>
                    <CardTitle>Empties Balance Display</CardTitle>
                    <CardDescription>
                        Stored balances are credit-scale (purchases subtract), but the business
                        reads debit-scale (positive = crates the customer owes, negative = credit
                        with OPK). Debit mode shows e.g. "291 Dr" / "162 Cr" to match the
                        empties-balance spreadsheet. POS math is unaffected either way.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 max-w-xs">
                        <Label htmlFor="empties_display_mode">Display Mode</Label>
                        <Select
                            value={emptiesDisplay.mode}
                            onValueChange={(v) => setEmptiesDisplay({ mode: v === "raw" ? "raw" : "debit" })}
                        >
                            <SelectTrigger id="empties_display_mode">
                                <SelectValue placeholder="Choose display mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="debit">Debit / Credit (291 Dr, 162 Cr)</SelectItem>
                                <SelectItem value="raw">Raw stored values</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button onClick={handleSaveEmptiesDisplay} disabled={savingEmptiesDisplay} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        {savingEmptiesDisplay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingEmptiesDisplay ? "Saving..." : "Save Display Settings"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
