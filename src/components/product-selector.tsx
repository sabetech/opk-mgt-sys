import { useState } from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

// Product interface that can be extended
export interface Product {
    id: number
    name: string
    code?: string
}

// Selected item interface
export interface SelectedItem {
    id: string
    productId: number
    productName: string
    productCode?: string
    quantity: number
}

interface ProductSelectorProps {
    products: Product[]
    selectedItems: SelectedItem[]
    onItemsChange: (items: SelectedItem[]) => void
    quantityLabel?: string
    disabled?: boolean
    filterCondition?: (product: Product) => boolean
}

export function ProductSelector({
    products,
    selectedItems,
    onItemsChange,
    quantityLabel = "Quantity",
    disabled = false,
    filterCondition
}: ProductSelectorProps) {
    const [openProduct, setOpenProduct] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null)
    const [quantity, setQuantity] = useState<string>("1")

    // Filter products based on condition and already selected items
    const selectedProductIds = new Set(selectedItems.map(item => item.productId))
    const availableProducts = products.filter(product => {
        const isNotSelected = !selectedProductIds.has(product.id)
        const meetsCondition = filterCondition ? filterCondition(product) : true
        return isNotSelected && meetsCondition
    })

    const handleAddItem = () => {
        if (!selectedProduct || !quantity || parseInt(quantity) <= 0) return

        const product = products.find(p => p.id === selectedProduct)
        if (!product) return

        const newItem: SelectedItem = {
            id: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            productCode: product.code || '',
            quantity: parseInt(quantity)
        }

        onItemsChange([...selectedItems, newItem])

        // Reset inputs
        setSelectedProduct(null)
        setQuantity("1")
    }

    return (
        <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
            <h4 className="font-semibold text-sm">Add Product</h4>
            <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2 w-full">
                    <Label>Product</Label>
                    <Popover open={openProduct} onOpenChange={setOpenProduct}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openProduct}
                                className="w-full justify-between"
                                disabled={disabled}
                            >
                                {selectedProduct
                                    ? products.find((product) => product.id === selectedProduct)?.name
                                    : "Select product..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
                            <Command>
                                <CommandInput placeholder="Search product..." />
                                <CommandList>
                                    <CommandEmpty>No product found.</CommandEmpty>
                                    <CommandGroup>
                                        {availableProducts.map((product) => (
                                            <CommandItem
                                                key={product.id}
                                                value={product.name}
                                                onSelect={() => {
                                                    setSelectedProduct(product.id === selectedProduct ? null : product.id)
                                                    setOpenProduct(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        selectedProduct === product.id ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                {product.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="w-full md:w-32 space-y-2">
                    <Label>{quantityLabel}</Label>
                    <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        disabled={disabled}
                    />
                </div>

                <Button 
                    type="button" 
                    onClick={handleAddItem} 
                    disabled={!selectedProduct || disabled}
                >
                    <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
            </div>
        </div>
    )
}