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
import { Trash2, Search, Plus, Edit2, Printer, ChevronDown } from "lucide-react"
import { pb, getFullListInBatches } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import type { Product, ProductForm } from "@/lib/productTypes"
import { formatPrice, getProductCategory, getStockLevel, getStockBadgeVariant, getStockBadgeText } from "@/lib/productUtils"
import { buildStockLevelsHtml, printReceiptHtml } from "@/lib/receipt"
import { assignProductCode, displayProductCode } from "@/lib/productCode"
import ProductDialog from "./ProductDialog"
import { toast } from "sonner"

const ITEMS_PER_PAGE = 20

export default function Products() {
    const { profile } = useAuth()
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [filterReturnable, setFilterReturnable] = useState<"all" | "returnable" | "non-returnable">("all")
    const [selectedCategories, setSelectedCategories] = useState<string[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    // Fetch products
    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""', // Only get non-deleted products
                sort: 'sku_name'
            })

            // Fetch actual warehouse stock quantities (batched: full catalog filter)
            const stockData = await getFullListInBatches('warehouse_stock', 'product_id', data.map((p) => p.id), {
                fields: 'product_id, quantity',
            })

            // Map product_id -> quantity
            const stockMap: Record<string, number> = {}
            for (const stock of stockData) {
                stockMap[stock.product_id] = stock.quantity || 0
            }

            // Add real quantities from warehouse_stock
            const productsWithQuantity = data.map((product) => ({
                id: product.id,
                sku_name: product.sku_name,
                code_name: product.code_name,
                product_code: product.product_code ?? null,
                ex_factory_price: product.ex_factory_price,
                wholesale_price: product.wholesale_price,
                retail_price: product.retail_price,
                returnable: product.returnable,
                created: product.created,
                deleted_at: product.deleted_at,
                quantity: stockMap[product.id] ?? 0
            }))

            setProducts(productsWithQuantity)
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
        } finally {
            setLoading(false)
        }
    }

    // Filter products
    const filteredProducts = products.filter(product => {
        const matchesSearch = product.sku_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (product.code_name && product.code_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (product.product_code && product.product_code.toLowerCase().includes(searchTerm.toLowerCase()))
        const matchesFilter = filterReturnable === "all" ||
            (filterReturnable === "returnable" && product.returnable) ||
            (filterReturnable === "non-returnable" && !product.returnable)
        const matchesCategory = selectedCategories.length === 0 ||
            selectedCategories.includes(getProductCategory(product))
        return matchesSearch && matchesFilter && matchesCategory
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

    // Pagination
    const totalItems = filteredProducts.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

    // CRUD operations
    const handleAddProduct = () => {
        setEditingProduct(null)
        setIsDialogOpen(true)
    }

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product)
        setIsDialogOpen(true)
    }

    const handleSaveProduct = async (formData: ProductForm) => {
        try {
            if (editingProduct) {
                // Update existing product (preserve unique code; generate for legacy rows)
                const product_code = editingProduct.product_code || await assignProductCode(formData.code_name)
                await pb.collection('products').update(editingProduct.id, {
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable
                })

                // Update local state
                setProducts(prev => prev.map(p =>
                    p.id === editingProduct.id
                        ? { ...p, ...formData, product_code, ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null, wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null, retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null }
                        : p
                ))

                alert('✅ Product updated successfully!')
            } else {
                // Add new product
                const product_code = await assignProductCode(formData.code_name)
                const data = await pb.collection('products').create({
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable
                })

                // Add to local state with zero quantity
                const newProduct: Product = {
                    id: data.id,
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    product_code,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable,
                    created: data.created,
                    deleted_at: data.deleted_at ?? null,
                    quantity: 0
                }
                setProducts(prev => [...prev, newProduct])

                alert('✅ Product added successfully!')
            }

            setIsDialogOpen(false)
        } catch (error) {
            console.error('Error saving product:', error)
            alert('❌ Failed to save product')
        }
    }

    const handleDeleteProduct = async (product: Product) => {
        if (!confirm(`Are you sure you want to delete "${product.sku_name}"?`)) {
            return
        }

        try {
            await pb.collection('products').update(product.id, { deleted_at: new Date().toISOString() }) // Soft delete

            // Remove from local state
            setProducts(prev => prev.filter(p => p.id !== product.id))

            alert('✅ Product deleted successfully!')
        } catch (error) {
            console.error('Error deleting product:', error)
            alert('❌ Failed to delete product')
        }
    }

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, filterReturnable, selectedCategories])

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Products</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <p>Loading products...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Products</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handlePrint} disabled={loading || filteredProducts.length === 0} className="gap-2">
                        <Printer className="h-4 w-4" />
                        {selectedCategories.length === 1
                            ? `Print ${selectedCategories[0]}`
                            : selectedCategories.length > 1
                                ? `Print ${selectedCategories.length} Categories`
                                : "Print Stock Levels"}
                    </Button>
                    {profile?.role !== 'auditor' && (
                        <Button onClick={handleAddProduct} className="bg-amber-700 hover:bg-amber-800 gap-2">
                            <Plus className="h-4 w-4" />
                            Add Product
                        </Button>
                    )}
                </div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                {/* Search Bar */}
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

                {/* Filter Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="justify-between gap-2">
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
                    <Button
                        variant={filterReturnable === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterReturnable("all")}
                    >
                        All
                    </Button>
                    <Button
                        variant={filterReturnable === "returnable" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterReturnable("returnable")}
                    >
                        Returnable
                    </Button>
                    <Button
                        variant={filterReturnable === "non-returnable" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterReturnable("non-returnable")}
                    >
                        Non-Returnable
                    </Button>
                </div>
            </div>

            {/* Products Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="font-mono">Product Code</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Wholesale Price</TableHead>
                            <TableHead>Retail Price</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Returnable</TableHead>
                            {profile?.role !== 'auditor' && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedProducts.length > 0 ? (
                            paginatedProducts.map((product) => {
                                const stockLevel = getStockLevel(product.quantity)
                                return (
                                    <TableRow key={product.id}>
                                        <TableCell className="font-medium font-mono">{displayProductCode(product)}</TableCell>
                                        <TableCell>{product.sku_name}</TableCell>
                                        <TableCell>{formatPrice(product.wholesale_price)}</TableCell>
                                        <TableCell>{formatPrice(product.retail_price)}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{product.quantity}</span>
                                                <Badge variant={getStockBadgeVariant(stockLevel)}>
                                                    {getStockBadgeText(stockLevel)}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={product.returnable ? "default" : "outline"}>
                                                {product.returnable ? "Yes" : "No"}
                                            </Badge>
                                        </TableCell>
                                        {profile?.role !== 'auditor' && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        onClick={() => handleEditProduct(product)}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                        <span className="sr-only">Edit</span>
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => handleDeleteProduct(product)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Delete</span>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {startIndex + 1} to {endIndex} of {totalItems} products
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

            {/* Add/Edit Dialog */}
            <ProductDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                editingProduct={editingProduct}
                onSave={handleSaveProduct}
            />
        </div>
    )
}