import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import type { Product, ProductForm } from "@/lib/productTypes"
import { validateProductForm } from "@/lib/productUtils"

interface ProductDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editingProduct: Product | null
    onSave: (product: ProductForm) => void
}

export default function ProductDialog({ open, onOpenChange, editingProduct, onSave }: ProductDialogProps) {
    const [formData, setFormData] = useState<ProductForm>({
        sku_name: '',
        code_name: '',
        wholesale_price: '',
        retail_price: '',
        returnable: false
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    // Reset form when dialog opens/closes
    useEffect(() => {
        if (open) {
            if (editingProduct) {
                setFormData({
                    sku_name: editingProduct.sku_name,
                    code_name: editingProduct.code_name || '',
                    wholesale_price: editingProduct.wholesale_price?.toString() || '',
                    retail_price: editingProduct.retail_price?.toString() || '',
                    returnable: editingProduct.returnable
                })
            } else {
                setFormData({
                    sku_name: '',
                    code_name: '',
                    wholesale_price: '',
                    retail_price: '',
                    returnable: false
                })
            }
            setErrors({})
        }
    }, [open, editingProduct])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        // Validate form
        const validationErrors = validateProductForm(formData)
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors)
            return
        }
        
        // Clear errors and save
        setErrors({})
        onSave(formData)
    }

    const handleInputChange = (field: keyof ProductForm, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        // Clear error for this field when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }))
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                    <DialogDescription>
                        {editingProduct ? 'Update product information.' : 'Add a new product to the warehouse.'}
                    </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="sku_name">Product Name *</Label>
                        <Input
                            id="sku_name"
                            value={formData.sku_name}
                            onChange={(e) => handleInputChange('sku_name', e.target.value)}
                            className={errors.sku_name ? 'border-red-500' : ''}
                            placeholder="Enter product name"
                        />
                        {errors.sku_name && <p className="text-sm text-red-500">{errors.sku_name}</p>}
                    </div>
                    
                    <div className="grid gap-2">
                        <Label htmlFor="code_name">SKU Code</Label>
                        <Input
                            id="code_name"
                            value={formData.code_name}
                            onChange={(e) => handleInputChange('code_name', e.target.value)}
                            className={errors.code_name ? 'border-red-500' : ''}
                            placeholder="Enter SKU code (optional)"
                        />
                        {errors.code_name && <p className="text-sm text-red-500">{errors.code_name}</p>}
                    </div>
                    
                    <div className="grid gap-2">
                        <Label htmlFor="wholesale_price">Wholesale Price (GHc)</Label>
                        <Input
                            id="wholesale_price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.wholesale_price}
                            onChange={(e) => handleInputChange('wholesale_price', e.target.value)}
                            className={errors.wholesale_price ? 'border-red-500' : ''}
                            placeholder="0.00"
                        />
                        {errors.wholesale_price && <p className="text-sm text-red-500">{errors.wholesale_price}</p>}
                    </div>
                    
                    <div className="grid gap-2">
                        <Label htmlFor="retail_price">Retail Price (GHc)</Label>
                        <Input
                            id="retail_price"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.retail_price}
                            onChange={(e) => handleInputChange('retail_price', e.target.value)}
                            className={errors.retail_price ? 'border-red-500' : ''}
                            placeholder="0.00"
                        />
                        {errors.retail_price && <p className="text-sm text-red-500">{errors.retail_price}</p>}
                    </div>
                    
                    <div className="grid gap-2">
                        <Label>Returnable Product</Label>
                        <Select
                            value={formData.returnable ? 'yes' : 'no'}
                            onValueChange={(value) => handleInputChange('returnable', value === 'yes')}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select returnable status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-amber-700 hover:bg-amber-800">
                            {editingProduct ? 'Update' : 'Add'} Product
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}