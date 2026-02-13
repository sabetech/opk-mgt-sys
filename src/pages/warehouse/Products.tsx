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
import { Trash2, Search, Plus } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/context/AuthContext"
import type { Product, ProductForm } from "@/lib/productTypes"
import { getMockQuantity, formatPrice, getStockLevel, getStockBadgeVariant, getStockBadgeText } from "@/lib/productUtils"
import ProductDialog from "./ProductDialog"

const ITEMS_PER_PAGE = 20

export default function Products() {
    const { profile } = useAuth()
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [filterReturnable, setFilterReturnable] = useState<"all" | "returnable" | "non-returnable">("all")
    const [currentPage, setCurrentPage] = useState(1)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)

    // Fetch products
    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .is('deleted_at', null) // Only get non-deleted products
                .order('sku_name', { ascending: true })

            if (error) throw error

            // Add mock quantities
            const productsWithQuantity = data.map(product => ({
                ...product,
                quantity: getMockQuantity(product.id)
            }))

            setProducts(productsWithQuantity)
        } catch (error) {
            console.error('Error fetching products:', error)
            alert('❌ Failed to load products')
        } finally {
            setLoading(false)
        }
    }

    // Filter products
    const filteredProducts = products.filter(product => {
        const matchesSearch = product.sku_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (product.code_name && product.code_name.toLowerCase().includes(searchTerm.toLowerCase()))
        const matchesFilter = filterReturnable === "all" ||
            (filterReturnable === "returnable" && product.returnable) ||
            (filterReturnable === "non-returnable" && !product.returnable)
        return matchesSearch && matchesFilter
    })

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
                // Update existing product
                const { error } = await supabase
                    .from('products')
                    .update({
                        sku_name: formData.sku_name,
                        code_name: formData.code_name || null,
                        wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                        retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                        returnable: formData.returnable
                    })
                    .eq('id', editingProduct.id)

                if (error) throw error

                // Update local state
                setProducts(prev => prev.map(p =>
                    p.id === editingProduct.id
                        ? { ...p, ...formData, wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null, retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null }
                        : p
                ))

                alert('✅ Product updated successfully!')
            } else {
                // Add new product
                const { data, error } = await supabase
                    .from('products')
                    .insert([{
                        sku_name: formData.sku_name,
                        code_name: formData.code_name || null,
                        wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
                        retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
                        returnable: formData.returnable,
                        // status: 'active' // Will be added after migration
                    }])
                    .select()
                    .single()

                if (error) throw error

                // Add to local state with mock quantity
                const newProduct = { ...data, quantity: getMockQuantity(data.id) }
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
            const { error } = await supabase
                .from('products')
                .update({ deleted_at: new Date().toISOString() }) // Soft delete
                .eq('id', product.id)

            if (error) throw error

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
    }, [searchTerm, filterReturnable])

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
                {profile?.role !== 'auditor' && (
                    <Button onClick={handleAddProduct} className="bg-amber-700 hover:bg-amber-800 gap-2">
                        <Plus className="h-4 w-4" />
                        Add Product
                    </Button>
                )}
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
                <div className="flex flex-wrap gap-2">
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
                            <TableHead>SKU Code</TableHead>
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
                                        <TableCell className="font-medium">{product.code_name || 'N/A'}</TableCell>
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
                                                        <Edit className="h-4 w-4" />
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