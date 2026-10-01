import { useState, useEffect, useMemo } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Search, Plus, Edit2, Printer, ChevronDown } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import { buildStockLevelsHtml, printReceiptHtml } from "@/lib/receipt"
import type { Product, ProductForm } from "@/lib/productTypes"
import { formatPrice, getProductCategory, getStockLevel, getStockBadgeVariant, getStockBadgeText } from "@/lib/productUtils"
import { assignProductCode, displayProductCode } from "@/lib/productCode"
import ProductDialog from "@/pages/warehouse/ProductDialog"
import { toast } from "sonner"

const ITEMS_PER_PAGE = 20

export default function ManageProducts() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [minQty, setMinQty] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [stockThresholds, setStockThresholds] = useState({ low_max: 20, medium_max: 50 })

    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            // Fetch stock thresholds
            try {
                const settingsRecord = await pb.collection('app_settings').getFirstListItem('key = "stock_thresholds"')
                setStockThresholds(settingsRecord.value)
            } catch {
                // Use defaults
            }

            // Fetch stock quantities
            const stockData = await pb.collection('warehouse_stock').getFullList({
                fields: 'product_id, quantity'
            })
            const stockMap = new Map<string, number>()
            for (const s of stockData) {
                stockMap.set(s.product_id, s.quantity || 0)
            }

            // Fetch products
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name'
            })
            setProducts(data.map((p) => ({
                id: p.id,
                sku_name: p.sku_name,
                code_name: p.code_name,
                product_code: p.product_code ?? null,
                ex_factory_price: p.ex_factory_price,
                wholesale_price: p.wholesale_price,
                retail_price: p.retail_price,
                returnable: p.returnable,
                empties_only: p.empties_only === true,
                created: p.created,
                deleted_at: p.deleted_at,
                quantity: stockMap.get(p.id) ?? 0,
            })))
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
        } finally {
            setLoading(false)
        }
    }

    const filteredProducts = products.filter(product => {
        const term = searchTerm.toLowerCase()
        const matchesSearch = product.sku_name.toLowerCase().includes(term) ||
            (product.code_name && product.code_name.toLowerCase().includes(term)) ||
            (product.product_code && product.product_code.toLowerCase().includes(term))
        const matchesCategory = selectedCategories.length === 0 ||
            selectedCategories.includes(getProductCategory(product))
        const min = minQty === "" ? null : parseFloat(minQty)
        const matchesQty = min === null || isNaN(min) || product.quantity >= min
        return matchesSearch && matchesCategory && matchesQty
    })

    const categories = useMemo(() => {
        const set = new Set<string>()
        for (const p of products) set.add(getProductCategory(p))
        return [...set].sort((a, b) => a.localeCompare(b))
    }, [products])

    const toggleCategory = (category: string) => {
        setSelectedCategories(prev =>
            prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
        )
    }

    const isFiltered = selectedCategories.length > 0 || (minQty !== "" && !isNaN(parseFloat(minQty)))

    const totalItems = filteredProducts.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const paginatedProducts = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product)
        setIsDialogOpen(true)
    }

    const handleAddProduct = () => {
        setEditingProduct(null)
        setIsDialogOpen(true)
    }

    const handleSaveProduct = async (formData: ProductForm) => {
        try {
            if (editingProduct) {
                // Preserve the unique code; generate one for legacy rows missing it
                const product_code = editingProduct.product_code || await assignProductCode(formData.code_name)
                await pb.collection('products').update(editingProduct.id, {
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable,
                    empties_only: formData.empties_only
                })

                setProducts(prev => prev.map(p =>
                    p.id === editingProduct.id
                        ? {
                            ...p,
                            sku_name: formData.sku_name,
                            code_name: formData.code_name || null,
                            product_code,
                            ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                            wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                            retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                            returnable: formData.returnable,
                            empties_only: formData.empties_only,
                        }
                        : p
                ))

                toast.success('Product updated successfully!')
            } else {
                const product_code = await assignProductCode(formData.code_name)
                const data = await pb.collection('products').create({
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable,
                    empties_only: formData.empties_only
                })

                setProducts(prev => [...prev, {
                    id: data.id,
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable,
                    empties_only: formData.empties_only,
                    created: data.created,
                    deleted_at: data.deleted_at ?? null,
                    quantity: 0,
                }])

                toast.success('Product added successfully!')
            }

            setIsDialogOpen(false)
        } catch (error) {
            console.error('Error saving product:', error)
            toast.error('Failed to save product')
        }
    }

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, selectedCategories, minQty])

    const handlePrint = () => {
        const rows = filteredProducts.map((product) => ({
            skuCode: displayProductCode(product),
            productName: product.sku_name,
            quantity: product.quantity,
            retailPrice: product.retail_price,
            category: getProductCategory(product),
        }))
        const scope = selectedCategories.length === 1
            ? ` — ${selectedCategories[0]}`
            : selectedCategories.length > 1
                ? ` — ${selectedCategories.length} categories`
                : ""
        printReceiptHtml(buildStockLevelsHtml(rows), `Current Stock Levels${scope}`)
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <h1 className="text-lg font-semibold md:text-2xl">Manage Products</h1>
                <div className="flex items-center justify-center h-64">
                    <p>Loading products...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Manage Products</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handlePrint} disabled={loading || filteredProducts.length === 0} className="gap-2">
                        <Printer className="h-4 w-4" />
                        {selectedCategories.length === 1
                            ? `Print ${selectedCategories[0]}`
                            : selectedCategories.length > 1
                                ? `Print ${selectedCategories.length} Categories`
                                : "Print Stock Levels"}
                    </Button>
                    <Button onClick={handleAddProduct} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        <Plus className="h-4 w-4" />
                        Add Product
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search products..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full md:w-auto justify-between gap-2">
                            {selectedCategories.length === 0
                                ? "All categories"
                                : `${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}`}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                        <div className="max-h-64 overflow-y-auto">
                            {categories.length > 0 ? (
                                categories.map((category) => (
                                    <label
                                        key={category}
                                        className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50 cursor-pointer rounded"
                                    >
                                        <Checkbox
                                            checked={selectedCategories.includes(category)}
                                            onCheckedChange={() => toggleCategory(category)}
                                        />
                                        <span className="text-sm font-medium">{category}</span>
                                    </label>
                                ))
                            ) : (
                                <p className="px-2 py-4 text-sm text-muted-foreground text-center">No categories found.</p>
                            )}
                        </div>
                        {selectedCategories.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full mt-1"
                                onClick={() => setSelectedCategories([])}
                            >
                                Clear selection
                            </Button>
                        )}
                    </PopoverContent>
                </Popover>

                <div className="flex items-center gap-2">
                    <label htmlFor="min-qty" className="text-sm font-medium whitespace-nowrap">Qty &gt;=</label>
                    <Input
                        id="min-qty"
                        type="number"
                        min="0"
                        placeholder="0"
                        className="w-24"
                        value={minQty}
                        onChange={(e) => setMinQty(e.target.value)}
                    />
                </div>

                {isFiltered && (
                    <p className="text-xs text-muted-foreground md:ml-auto">
                        Showing {filteredProducts.length} of {products.length} products
                    </p>
                )}
            </div>

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-mono">Product Code</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead className="text-right">Ex Factory Price</TableHead>
                            <TableHead className="text-right">Wholesale Price</TableHead>
                            <TableHead className="text-right">Retail Price</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedProducts.length > 0 ? (
                            paginatedProducts.map((product) => {
                                const stockLevel = getStockLevel(product.quantity, stockThresholds.low_max, stockThresholds.medium_max)
                                return (
                                    <TableRow key={product.id}>
                                        <TableCell className="font-medium font-mono">{displayProductCode(product)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span>{product.sku_name}</span>
                                                {product.empties_only && (
                                                    <Badge variant="outline" className="text-[10px] w-fit bg-blue-50 text-blue-700 border-blue-200">
                                                        Empties only
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">{formatPrice(product.ex_factory_price)}</TableCell>
                                        <TableCell className="text-right">{formatPrice(product.wholesale_price)}</TableCell>
                                        <TableCell className="text-right">{formatPrice(product.retail_price)}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{product.quantity}</span>
                                                <Badge variant={getStockBadgeVariant(stockLevel)}>
                                                    {getStockBadgeText(stockLevel)}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                onClick={() => handleEditProduct(product)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                                <span className="sr-only">Edit</span>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    No products found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} of {totalItems} products
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <span className="text-sm">Page {currentPage} of {totalPages}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <ProductDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                editingProduct={editingProduct}
                onSave={handleSaveProduct}
            />
        </div>
    )
}
