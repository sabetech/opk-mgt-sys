import { useState, useEffect } from "react"
import { Trash2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { ProductSelector, type Product, type SelectedItem } from "@/components/product-selector"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

// Types
interface ReceivableItem {
    id: string
    productId: number
    productCode: string
    productName: string
    quantity: number
    unitType: string
}

interface ReceivableForm {
    date: string
    purchaseOrderNumber: string
    receivedBy: string
    deliveredBy: string
    vehicleNumber: string
    numberOfPallets: number
    numberOfPCs: number
    purchaseOrderImage: File | null
    items: ReceivableItem[]
}

export default function RecordReceivable() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [imagePreview, setImagePreview] = useState<string | null>(null)

    const [formData, setFormData] = useState<ReceivableForm>({
        date: new Date().toISOString().split('T')[0],
        purchaseOrderNumber: "",
        receivedBy: "",
        deliveredBy: "",
        vehicleNumber: "",
        numberOfPallets: 0,
        numberOfPCs: 0,
        purchaseOrderImage: null,
        items: []
    })

    // Fetch products
    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .is('deleted_at', null)
                .order('sku_name', { ascending: true })

            if (error) throw error

            // Transform data to match Product interface
            const transformedProducts: Product[] = (data || []).map(item => ({
                id: item.id,
                name: item.sku_name,
                code: item.code_name || ''
            }))

            setProducts(transformedProducts)
        } catch (error) {
            console.error('Error fetching products:', error)
            toast.error('Failed to load products')
        } finally {
            setLoading(false)
        }
    }

    // Handle form input changes
    const handleInputChange = (field: keyof ReceivableForm, value: string | number | File | null) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
    }

    // Handle items change
    const handleItemsChange = (items: SelectedItem[]) => {
        // Transform SelectedItems to ReceivableItems
        const receivableItems: ReceivableItem[] = items.map(item => ({
            id: item.id,
            productId: item.productId,
            productCode: item.productCode || 'N/A',
            productName: item.productName,
            quantity: item.quantity,
            unitType: "pcs"
        }))

        setFormData(prev => ({
            ...prev,
            items: receivableItems
        }))
    }

    // Handle image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.type.startsWith('image/')) {
                setFormData(prev => ({
                    ...prev,
                    purchaseOrderImage: file
                }))

                // Create preview
                const reader = new FileReader()
                reader.onloadend = () => {
                    setImagePreview(reader.result as string)
                }
                reader.readAsDataURL(file)
            } else {
                toast.error('Please upload an image file')
            }
        }
    }

    // Remove item from receivable
    const removeItem = (itemId: string) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }))
    }

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validation
        if (!formData.purchaseOrderNumber.trim()) {
            toast.error('Please enter a Purchase Order Number')
            return
        }

        if (!formData.receivedBy.trim()) {
            toast.error('Please enter who received the delivery')
            return
        }

        if (!formData.deliveredBy.trim()) {
            toast.error('Please enter who delivered the items')
            return
        }

        if (!formData.vehicleNumber.trim()) {
            toast.error('Please enter the vehicle number')
            return
        }

        if (formData.items.length === 0) {
            toast.error('Please add at least one product')
            return
        }

        if (formData.items.some(item => item.quantity <= 0)) {
            toast.error('Please enter valid quantities for all products')
            return
        }

        setSaving(true)
        try {
            let imageUrl = null

            // 1. Upload Image to Supabase Storage if exists
            if (formData.purchaseOrderImage) {
                const fileExt = formData.purchaseOrderImage.name.split('.').pop()
                const fileName = `${Math.random()}.${fileExt}`
                const filePath = `receivables/${fileName}`

                const { error: uploadError } = await supabase.storage
                    .from('receivable-images')
                    .upload(filePath, formData.purchaseOrderImage)

                if (uploadError) throw uploadError

                const { data: { publicUrl } } = supabase.storage
                    .from('receivable-images')
                    .getPublicUrl(filePath)

                imageUrl = publicUrl
            }

            // 2. Insert into inventory_receivables
            const { data: receivableData, error: headerError } = await supabase
                .from('inventory_receivables')
                .insert([{
                    date: formData.date,
                    purchase_order_number: formData.purchaseOrderNumber,
                    received_by: formData.receivedBy,
                    delivered_by: formData.deliveredBy,
                    vehicle_no: formData.vehicleNumber,
                    num_of_pallets: formData.numberOfPallets,
                    num_of_pcs: formData.numberOfPCs,
                    purchase_order_img_url: imageUrl
                }])
                .select()
                .single()

            if (headerError) throw headerError

            // 3. Insert into inventory_receivable_items
            const itemsToInsert = formData.items.map(item => ({
                receivable_id: receivableData.id,
                product_id: item.productId,
                qty: item.quantity,
                date: formData.date
            }))

            const { error: itemsError } = await supabase
                .from('inventory_receivable_items')
                .insert(itemsToInsert)

            if (itemsError) throw itemsError

            toast.success('Receivable recorded successfully and stock updated!')

            // Reset form
            setFormData({
                date: new Date().toISOString().split('T')[0],
                purchaseOrderNumber: "",
                receivedBy: "",
                deliveredBy: "",
                vehicleNumber: "",
                numberOfPallets: 0,
                numberOfPCs: 0,
                purchaseOrderImage: null,
                items: []
            })
            setImagePreview(null)

        } catch (error) {
            console.error('Error submitting receivable:', error)
            toast.error('Failed to record receivable')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Record Receivable</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p>Loading products...</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Record Receivable</h2>
                    <p className="text-muted-foreground">
                        Receive product supplies from Guinness Ghana
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Delivery Information */}
                <Card>
                    <CardHeader>
                        <CardTitle>Delivery Information</CardTitle>
                        <CardDescription>
                            Enter the delivery details from Guinness Ghana
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date</Label>
                                <Input
                                    id="date"
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => handleInputChange('date', e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purchaseOrderNumber">Purchase Order Number</Label>
                                <Input
                                    id="purchaseOrderNumber"
                                    placeholder="e.g., PO-2024-001"
                                    value={formData.purchaseOrderNumber}
                                    onChange={(e) => handleInputChange('purchaseOrderNumber', e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="receivedBy">Received By</Label>
                                <Input
                                    id="receivedBy"
                                    placeholder="Name of person receiving"
                                    value={formData.receivedBy}
                                    onChange={(e) => handleInputChange('receivedBy', e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deliveredBy">Delivered By</Label>
                                <Input
                                    id="deliveredBy"
                                    placeholder="Name of delivery person"
                                    value={formData.deliveredBy}
                                    onChange={(e) => handleInputChange('deliveredBy', e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="vehicleNumber">Vehicle Number</Label>
                                <Input
                                    id="vehicleNumber"
                                    placeholder="e.g., GT-1234-AB"
                                    value={formData.vehicleNumber}
                                    onChange={(e) => handleInputChange('vehicleNumber', e.target.value)}
                                    required
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numberOfPallets">Number of Pallets</Label>
                                <Input
                                    id="numberOfPallets"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={formData.numberOfPallets}
                                    onChange={(e) => handleInputChange('numberOfPallets', parseInt(e.target.value) || 0)}
                                    disabled={saving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numberOfPCs">Number of PCs</Label>
                                <Input
                                    id="numberOfPCs"
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={formData.numberOfPCs}
                                    onChange={(e) => handleInputChange('numberOfPCs', parseInt(e.target.value) || 0)}
                                    disabled={saving}
                                />
                            </div>
                        </div>

                        {/* Purchase Order Image Upload */}
                        <div className="space-y-2">
                            <Label htmlFor="purchaseOrderImage">Purchase Order Form Image</Label>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <Input
                                        id="purchaseOrderImage"
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        disabled={saving}
                                        className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                                    />
                                </div>
                                {imagePreview && (
                                    <div className="w-20 h-20 rounded-md border overflow-hidden relative group">
                                        <img
                                            src={imagePreview}
                                            alt="Purchase Order preview"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Products Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>Products Received</CardTitle>
                        <CardDescription>
                            Add the products that were delivered
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!saving && (
                            <ProductSelector
                                products={products}
                                selectedItems={formData.items.map(item => ({
                                    id: item.id,
                                    productId: item.productId,
                                    productName: item.productName,
                                    productCode: item.productCode,
                                    quantity: item.quantity
                                }))}
                                onItemsChange={handleItemsChange}
                                quantityLabel="Quantity"
                            />
                        )}

                        {/* Items List */}
                        <div className="rounded-md border bg-white dark:bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="w-[100px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {formData.items.length > 0 ? (
                                        formData.items.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium">{item.productName}</TableCell>
                                                <TableCell>{item.productCode}</TableCell>
                                                <TableCell className="text-right">{item.quantity}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={() => removeItem(item.id)}
                                                        disabled={saving}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                No products added yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {formData.items.length > 0 && (
                            <div className="flex justify-end">
                                <Badge variant="secondary">
                                    {formData.items.length} product(s) added
                                </Badge>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Submit Button */}
                <div className="flex justify-end">
                    <Button
                        type="submit"
                        className="bg-amber-700 hover:bg-amber-800 gap-2 min-w-[150px]"
                        disabled={saving || formData.items.length === 0}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? "Recording..." : "Record Receivable"}
                    </Button>
                </div>
            </form>
        </div>
    )
}