import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2, Save, ArrowUp, ArrowDown, Trash2 } from "lucide-react"
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
import { pb } from "@/lib/pocketbase"
import { createAdjustmentRequest, generateAdjustmentId } from "@/lib/adjustments"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

interface AdjustmentItem {
    id: string
    productId: string
    productCode: string
    productName: string
    quantity: number
}

interface AdjustmentForm {
    date: string
    direction: "increase" | "decrease"
    reason: string
    reference: string
    notes: string
    items: AdjustmentItem[]
}

const INCREASE_REASONS = [
    { value: "supplier_discounted", label: "Supplier Discounted Stock Adjustment" },
    { value: "stock_correction", label: "Stock Correction" },
]

const DECREASE_REASONS = [
    { value: "breakages", label: "Breakages/Hole in cases/defects" },
    { value: "expired", label: "Expired Products" },
    { value: "protocol_request", label: "Protocol Requests" },
]

export default function Adjustments() {
    const { profile } = useAuth()
    const [searchParams] = useSearchParams()
    const prefillApplied = useRef(false)
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [formData, setFormData] = useState<AdjustmentForm>({
        date: new Date().toISOString().split('T')[0],
        direction: "increase",
        reason: "",
        reference: generateAdjustmentId(),
        notes: "",
        items: []
    })

    const currentReasons = formData.direction === "increase" ? INCREASE_REASONS : DECREASE_REASONS

    useEffect(() => {
        fetchProducts()
    }, [])

    // Prefill from Stock Report "Request fix" links (?direction=&product=&qty=&reason=&notes=)
    useEffect(() => {
        if (loading || prefillApplied.current || products.length === 0) return
        const direction = searchParams.get('direction')
        const productId = searchParams.get('product')
        if (direction !== 'increase' && direction !== 'decrease') return
        if (!productId) return
        const product = products.find((p) => p.id === productId)
        if (!product) return
        prefillApplied.current = true
        const qty = Math.max(1, parseInt(searchParams.get('qty') || '1', 10) || 1)
        const reason = searchParams.get('reason') || ''
        const notes = searchParams.get('notes') || ''
        setFormData((prev) => ({
            ...prev,
            direction,
            reason,
            notes,
            items: [{
                id: crypto.randomUUID(),
                productId: product.id,
                productCode: product.code || 'N/A',
                productName: product.name,
                quantity: qty,
            }],
        }))
    }, [loading, products, searchParams])

    const fetchProducts = async () => {
        try {
            const data = await pb.collection('products').getFullList({
                filter: 'deleted_at = ""',
                sort: 'sku_name'
            })

            const transformedProducts: Product[] = data.map((item) => ({
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

    const handleInputChange = (field: keyof AdjustmentForm, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
        
        if (field === "direction") {
            setFormData(prev => ({
                ...prev,
                reason: ""
            }))
        }
    }

    const handleItemsChange = (items: SelectedItem[]) => {
        const adjustmentItems: AdjustmentItem[] = items.map(item => ({
            id: item.id,
            productId: item.productId,
            productCode: item.productCode || 'N/A',
            productName: item.productName,
            quantity: item.quantity
        }))

        setFormData(prev => ({
            ...prev,
            items: adjustmentItems
        }))
    }

    const removeItem = (itemId: string) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== itemId)
        }))
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        if (!formData.reason) {
            toast.error('Please select a reason')
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

        if (!profile) {
            toast.error('User not authenticated')
            return
        }

        setSaving(true)
        try {
            const requestedBy = profile.full_name || profile.id

            await createAdjustmentRequest({
                date: formData.date,
                direction: formData.direction,
                reason: formData.reason,
                reference: formData.reference,
                notes: formData.notes,
                items: formData.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                })),
                requestedBy,
                requestedById: profile.id,
            })

            toast.success('Stock adjustment request submitted for admin approval!')

            setFormData({
                date: new Date().toISOString().split('T')[0],
                direction: "increase",
                reason: "",
                reference: generateAdjustmentId(),
                notes: "",
                items: []
            })

        } catch (error: any) {
            console.error('Error submitting adjustment:', error)
            toast.error(error?.message || 'Failed to submit adjustment request')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Adjustments</h1>
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Adjustments</h2>
                    <p className="text-muted-foreground">
                        Submit stock increases or decreases for admin approval. Stock only changes after approval.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Adjustment Details</CardTitle>
                        <CardDescription>
                            Enter the adjustment information
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
                                <Label htmlFor="reference">Reference #</Label>
                                <Input
                                    id="reference"
                                    value={formData.reference}
                                    readOnly
                                    className="bg-muted"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Adjustment Direction</Label>
                            <div className="flex gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="direction"
                                        value="increase"
                                        checked={formData.direction === "increase"}
                                        onChange={(e) => handleInputChange('direction', e.target.value as "increase" | "decrease")}
                                        disabled={saving}
                                        className="h-4 w-4 text-amber-600 border-gray-300 focus:ring-amber-500"
                                    />
                                    <span className="flex items-center gap-2">
                                        <ArrowUp className="h-4 w-4 text-green-600" />
                                        Increase
                                    </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="direction"
                                        value="decrease"
                                        checked={formData.direction === "decrease"}
                                        onChange={(e) => handleInputChange('direction', e.target.value as "increase" | "decrease")}
                                        disabled={saving}
                                        className="h-4 w-4 text-amber-600 border-gray-300 focus:ring-amber-500"
                                    />
                                    <span className="flex items-center gap-2">
                                        <ArrowDown className="h-4 w-4 text-red-600" />
                                        Decrease
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason</Label>
                            <select
                                id="reason"
                                value={formData.reason}
                                onChange={(e) => handleInputChange('reason', e.target.value)}
                                disabled={saving}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">Select a reason</option>
                                {currentReasons.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <textarea
                                id="notes"
                                placeholder="Additional notes..."
                                value={formData.notes}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('notes', e.target.value)}
                                disabled={saving}
                                rows={3}
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Products</CardTitle>
                        <CardDescription>
                            Add the products to adjust
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
                                    {formData.items.length} product(s)
                                </Badge>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        className="bg-amber-700 hover:bg-amber-800 gap-2 min-w-[150px]"
                        disabled={saving || formData.items.length === 0}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? "Submitting..." : `Submit Stock ${formData.direction === "increase" ? "Increase" : "Decrease"} Request`}
                    </Button>
                </div>
            </form>
        </div>
    )
}