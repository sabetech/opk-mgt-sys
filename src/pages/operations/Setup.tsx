import { useState, useEffect, useRef } from "react"
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
import {
  Upload,
  FileText,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  Download,
  Archive,
  RotateCcw,
} from "lucide-react"
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"
import Papa from "papaparse"
import ProductDialog from "@/pages/warehouse/ProductDialog"
import type { Product, ProductForm } from "@/lib/productTypes"

interface ProductRecord {
  id: string
  sku_name: string
  code_name: string | null
  wholesale_price: number | null
  retail_price: number | null
  returnable: boolean
  created: string
  deleted_at: string | null
  quantity: number | null
}

interface ParsedRow {
  sku_name: string
  quantity: number
  rowNumber: number
  matched: boolean
  productId: string | null
  error?: string
}

export default function Setup() {
  useAuth()
  const [products, setProducts] = useState<ProductRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("active")
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const data = await pb.collection("products").getFullList({
        filter: 'deleted_at = ""',
        sort: "sku_name",
      })
      const stockRecords = await pb.collection("warehouse_stock").getFullList()
      const stockMap = new Map<string, number>()
      stockRecords.forEach((s) => stockMap.set(s.product_id, s.quantity))

      setProducts(
        data.map((p) => ({
          id: p.id,
          sku_name: p.sku_name,
          code_name: p.code_name,
          wholesale_price: p.wholesale_price,
          retail_price: p.retail_price,
          returnable: p.returnable,
          created: p.created,
          deleted_at: p.deleted_at,
          quantity: stockMap.get(p.id) ?? null,
        }))
      )
    } catch (error) {
      console.error("Error fetching products:", error)
      toast.error("Failed to load products")
    } finally {
      setLoading(false)
    }
  }

  const fetchAllProducts = async () => {
    try {
      setLoading(true)
      const data = await pb.collection("products").getFullList({ sort: "sku_name" })
      const stockRecords = await pb.collection("warehouse_stock").getFullList()
      const stockMap = new Map<string, number>()
      stockRecords.forEach((s) => stockMap.set(s.product_id, s.quantity))

      setProducts(
        data.map((p) => ({
          id: p.id,
          sku_name: p.sku_name,
          code_name: p.code_name,
          wholesale_price: p.wholesale_price,
          retail_price: p.retail_price,
          returnable: p.returnable,
          created: p.created,
          deleted_at: p.deleted_at,
          quantity: stockMap.get(p.id) ?? null,
        }))
      )
    } catch (error) {
      console.error("Error fetching products:", error)
      toast.error("Failed to load products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (filterStatus === "archived") {
      fetchAllProducts()
    } else {
      fetchProducts()
    }
  }, [filterStatus])

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.sku_name.toLowerCase().includes(searchTerm.toLowerCase())
    if (filterStatus === "active") return matchesSearch && !p.deleted_at
    if (filterStatus === "archived") return matchesSearch && !!p.deleted_at
    return matchesSearch
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file")
      return
    }
    setCsvFileName(file.name)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (results) => {
        processCsvRows(results.data as Record<string, string>[])
      },
      error: (err) => {
        console.error("CSV parse error:", err)
        toast.error("Failed to parse CSV file")
      },
    })
  }

  const processCsvRows = async (rows: Record<string, string>[]) => {
    const headers = Object.keys(rows[0] || {})
    const hasSkuName = headers.some((h) => h === "sku_name" || h === "product_name" || h === "name")
    const hasQuantity = headers.some((h) => h === "quantity" || h === "qty" || h === "stock")

    if (!hasSkuName || !hasQuantity) {
      toast.error("CSV must have 'sku_name' (or 'product_name'/'name') and 'quantity' columns")
      setParsedRows([])
      setShowPreview(false)
      return
    }

    const allProducts = await pb.collection("products").getFullList({ filter: 'deleted_at = ""' })
    const productMap = new Map<string, string>()
    allProducts.forEach((p) => productMap.set(p.sku_name.toLowerCase(), p.id))

    const parsed: ParsedRow[] = rows
      .map((row, index) => {
        const skuName = row["sku_name"] || row["product_name"] || row["name"] || ""
        const quantityStr = row["quantity"] || row["qty"] || row["stock"] || "0"
        const quantity = parseInt(quantityStr, 10)

        if (!skuName.trim()) {
          return { sku_name: "(empty)", quantity: 0, rowNumber: index + 2, matched: false, productId: null, error: "Product name is required" }
        }
        if (isNaN(quantity) || quantity < 0) {
          return { sku_name: skuName.trim(), quantity: 0, rowNumber: index + 2, matched: false, productId: null, error: "Invalid quantity" }
        }

        const productId = productMap.get(skuName.trim().toLowerCase())
        if (productId) {
          return { sku_name: skuName.trim(), quantity, rowNumber: index + 2, matched: true, productId }
        }

        return { sku_name: skuName.trim(), quantity, rowNumber: index + 2, matched: false, productId: null, error: "Product not found - will be created" }
      })
      .filter((r) => r.sku_name !== "(empty)")

    setParsedRows(parsed)
    setShowPreview(true)
  }

  const handleSavePreview = async () => {
    setSaving(true)
    let created = 0
    let updated = 0
    let errors = 0

    for (const row of parsedRows) {
      try {
        let productId = row.productId

        if (!productId) {
          const newProduct = await pb.collection("products").create({
            sku_name: row.sku_name,
            code_name: null,
            wholesale_price: null,
            retail_price: null,
            returnable: false,
          })
          productId = newProduct.id
          created++
        }

        const existingStock = await pb.collection("warehouse_stock").getFullList({
          filter: `product_id = "${productId}"`,
        })

        if (existingStock.length > 0) {
          await pb.collection("warehouse_stock").update(existingStock[0].id, { quantity: row.quantity })
        } else {
          await pb.collection("warehouse_stock").create({ product_id: productId, quantity: row.quantity })
        }
        updated++
      } catch (err) {
        console.error("Error saving row:", row, err)
        errors++
      }
    }

    toast.success(`Import complete: ${created} products created, ${updated} stock records updated, ${errors} errors`)
    setParsedRows([])
    setShowPreview(false)
    setCsvFileName(null)
    fetchProducts()
    setSaving(false)
  }

  const clearPreview = () => {
    setParsedRows([])
    setShowPreview(false)
    setCsvFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddProduct = () => {
    setEditingProduct(null)
    setIsProductDialogOpen(true)
  }

  const handleSaveProduct = async (formData: ProductForm) => {
    try {
      if (editingProduct) {
        await pb.collection("products").update(editingProduct.id, {
          sku_name: formData.sku_name,
          code_name: formData.code_name || null,
          wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
          retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
          returnable: formData.returnable,
        })
        toast.success("Product updated successfully!")
      } else {
        const data = await pb.collection("products").create({
          sku_name: formData.sku_name,
          code_name: formData.code_name || null,
          wholesale_price: formData.wholesale_price ? parseFloat(formData.wholesale_price) : null,
          retail_price: formData.retail_price ? parseFloat(formData.retail_price) : null,
          returnable: formData.returnable,
        })
        await pb.collection("warehouse_stock").create({ product_id: data.id, quantity: 0 })
        toast.success("Product added successfully!")
      }
      setIsProductDialogOpen(false)
      fetchProducts()
    } catch (error) {
      console.error("Error saving product:", error)
      toast.error("Failed to save product")
    }
  }

  const handleArchiveProduct = async (product: ProductRecord) => {
    if (!confirm(`Archive "${product.sku_name}"? It will no longer appear in forms but can be restored later.`)) return
    try {
      await pb.collection("products").update(product.id, { deleted_at: new Date().toISOString() })
      toast.success(`"${product.sku_name}" archived`)
      fetchProducts()
    } catch (error) {
      console.error("Error archiving product:", error)
      toast.error("Failed to archive product")
    }
  }

  const handleRestoreProduct = async (product: ProductRecord) => {
    try {
      await pb.collection("products").update(product.id, { deleted_at: "" })
      toast.success(`"${product.sku_name}" restored`)
      fetchProducts()
    } catch (error) {
      console.error("Error restoring product:", error)
      toast.error("Failed to restore product")
    }
  }

  const downloadTemplate = () => {
    const activeProducts = products.filter((p) => !p.deleted_at)
    const rows = activeProducts.map((p) => `${p.sku_name},${p.code_name || ""},`)
    const csv = ["sku_name,code_name,quantity", ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "stock_import_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold md:text-2xl">Setup</h1>
        <div className="flex items-center justify-center h-64">
          <p>Loading products...</p>
        </div>
      </div>
    )
  }

  const matchedCount = parsedRows.filter((r) => r.matched).length
  const willCreateCount = parsedRows.filter((r) => !r.matched && !r.error?.includes("required") && !r.error?.includes("Invalid")).length
  const errorCount = parsedRows.filter((r) => r.error?.includes("required") || r.error?.includes("Invalid")).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Setup</h2>
          <p className="text-muted-foreground">
            Initialize foundation stock quantities and manage products
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-6 dark:bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="h-5 w-5 text-amber-700" />
          <h3 className="text-lg font-semibold">Upload Stock Spreadsheet</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a CSV file with columns: <code className="bg-muted px-1 rounded">sku_name</code> (or
          product_name/name) and <code className="bg-muted px-1 rounded">quantity</code>. Matched
          products will have their stock replaced; unmatched names will create new
          products.
        </p>

        {!showPreview ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Choose CSV File
              </Button>
              <Button variant="ghost" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>
            {csvFileName && (
              <span className="text-sm text-muted-foreground">
                Selected: {csvFileName}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {matchedCount} matched
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {willCreateCount} will create new products
              </span>
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-red-600" />
                {errorCount} errors
              </span>
            </div>

            <div className="rounded-md border max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>SKU Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">{row.sku_name}</TableCell>
                      <TableCell>{row.quantity}</TableCell>
                      <TableCell>
                        {row.error?.includes("required") || row.error?.includes("Invalid") ? (
                          <Badge variant="destructive">{row.error}</Badge>
                        ) : row.matched ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            Replace stock
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            Create new
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSavePreview}
                disabled={saving}
                className="bg-amber-700 hover:bg-amber-800 gap-2"
              >
                {saving ? "Saving..." : `Save ${parsedRows.length} Records`}
              </Button>
              <Button variant="outline" onClick={clearPreview}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6 dark:bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="h-5 w-5 text-amber-700" />
          <h3 className="text-lg font-semibold">Add New Product</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Manually add a single product to the catalog. It will be created with
          zero stock.
        </p>
        <Button
          onClick={handleAddProduct}
          className="bg-amber-700 hover:bg-amber-800 gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="rounded-lg border bg-white p-6 dark:bg-card">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-amber-700" />
          <h3 className="text-lg font-semibold">Product Registry</h3>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between mb-4">
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
          <div className="flex gap-2">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              All
            </Button>
            <Button
              variant={filterStatus === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("active")}
            >
              Active
            </Button>
            <Button
              variant={filterStatus === "archived" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("archived")}
            >
              Archived
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU Code</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Wholesale</TableHead>
                <TableHead>Retail</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Returnable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <TableRow
                    key={product.id}
                    className={product.deleted_at ? "opacity-60" : ""}
                  >
                    <TableCell className="font-medium">
                      {product.code_name || "N/A"}
                    </TableCell>
                    <TableCell>{product.sku_name}</TableCell>
                    <TableCell>
                      {product.wholesale_price != null
                        ? `GHc ${product.wholesale_price.toFixed(2)}`
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {product.retail_price != null
                        ? `GHc ${product.retail_price.toFixed(2)}`
                        : "\u2014"}
                    </TableCell>
                    <TableCell>{product.quantity ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={product.returnable ? "default" : "outline"}>
                        {product.returnable ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {product.deleted_at ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {product.deleted_at ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleRestoreProduct(product)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleArchiveProduct(product)}
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No products found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProductDialog
        open={isProductDialogOpen}
        onOpenChange={setIsProductDialogOpen}
        editingProduct={editingProduct}
        onSave={handleSaveProduct}
      />
    </div>
  )
}
