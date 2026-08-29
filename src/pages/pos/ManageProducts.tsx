import { useState, useEffect } from "react"
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
import { Search, Plus, Edit2 } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import type { Product, ProductForm } from "@/lib/productTypes"
import { formatPrice, getStockLevel, getStockBadgeVariant, getStockBadgeText } from "@/lib/productUtils"
import ProductDialog from "@/pages/warehouse/ProductDialog"
import { toast } from "sonner"

const ITEMS_PER_PAGE = 20

export default function ManageProducts() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
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
                ex_factory_price: p.ex_factory_price,
                wholesale_price: p.wholesale_price,
                retail_price: p.retail_price,
                returnable: p.returnable,
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
        return product.sku_name.toLowerCase().includes(term) ||
            (product.code_name && product.code_name.toLowerCase().includes(term))
    })

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
                await pb.collection('products').update(editingProduct.id, {
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable
                })

                setProducts(prev => prev.map(p =>
                    p.id === editingProduct.id
                        ? {
                            ...p,
                            sku_name: formData.sku_name,
                            code_name: formData.code_name || null,
                            ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                            wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                            retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                            returnable: formData.returnable,
                        }
                        : p
                ))

                toast.success('Product updated successfully!')
            } else {
                const data = await pb.collection('products').create({
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable
                })

                setProducts(prev => [...prev, {
                    id: data.id,
                    sku_name: formData.sku_name,
                    code_name: formData.code_name || null,
                    ex_factory_price: formData.ex_factory_price ? parseFloat(formData.ex_factory_price) : null,
                    wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                    retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                    returnable: formData.returnable,
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
    }, [searchTerm])

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
                <Button onClick={handleAddProduct} className="bg-amber-700 hover:bg-amber-800 gap-2">
                    <Plus className="h-4 w-4" />
                    Add Product
                </Button>
            </div>

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

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>SKU Code</TableHead>
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
                                        <TableCell className="font-medium">{product.code_name || 'N/A'}</TableCell>
                                        <TableCell>{product.sku_name}</TableCell>
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
