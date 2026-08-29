import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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

interface Product {
    id: string
    sku_name: string
    code_name: string | null
}

export default function Settings() {
    const [loading, setLoading] = useState(true)
    const [savingStock, setSavingStock] = useState(false)
    const [savingSurcharge, setSavingSurcharge] = useState(false)

    const [stockThresholds, setStockThresholds] = useState<StockThresholds>({ low_max: 20, medium_max: 50 })
    const [surcharge, setSurcharge] = useState<WholesaleSurcharge>({ amount: 2, product_ids: [] })
    const [products, setProducts] = useState<Product[]>([])
    const [productSearch, setProductSearch] = useState("")

    const [stockSettingsId, setStockSettingsId] = useState<string | null>(null)
    const [surchargeSettingsId, setSurchargeSettingsId] = useState<string | null>(null)

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Fetch products
                const productsData = await pb.collection('products').getFullList({
                    filter: 'deleted_at = ""',
                    sort: 'sku_name',
                    fields: 'id, sku_name, code_name'
                })
                setProducts(productsData.map(p => ({ id: p.id, sku_name: p.sku_name, code_name: p.code_name })))

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

    const toggleProduct = (productId: string) => {
        setSurcharge(prev => ({
            ...prev,
            product_ids: prev.product_ids.includes(productId)
                ? prev.product_ids.filter(id => id !== productId)
                : [...prev.product_ids, productId]
        }))
    }

    const filteredProducts = products.filter(p => {
        const term = productSearch.toLowerCase()
        return p.sku_name.toLowerCase().includes(term) ||
            (p.code_name && p.code_name.toLowerCase().includes(term))
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
        </div>
    )
}
