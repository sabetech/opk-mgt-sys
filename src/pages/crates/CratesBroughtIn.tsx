import React, { useState, useEffect } from "react"
import { Edit, Trash2, ChevronDown, ChevronUp, FileImage, Loader2, Package } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"

interface ProductBreakdown {
    productName: string
    quantity: number
}

interface CrateDelivery {
    id: number
    date: string
    quantityReceived: number
    vehicleNumber: string
    purchaseOrderNumber: string
    receivedBy: string
    deliveredBy: string
    purchaseOrderImage: string | null
    products: ProductBreakdown[]
}

export default function CratesBroughtIn() {
    const { profile } = useAuth()
    const [deliveries, setDeliveries] = useState<CrateDelivery[]>([])
    const [totalStock, setTotalStock] = useState(0)
    const [loading, setLoading] = useState(true)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    const [previewImage, setPreviewImage] = useState<string | null>(null)

    // Fetch Data
    const fetchData = async () => {
        setLoading(true)
        try {
            // 1. Fetch Deliveries (inventory_receivables joined with items)
            const { data: receivablesData, error: receivablesError } = await supabase
                .from('inventory_receivables')
                .select(`
                    id,
                    date,
                    vehicle_no,
                    purchase_order_number,
                    received_by,
                    delivered_by,
                    purchase_order_img_url,
                    inventory_receivable_items (
                        qty,
                        products (sku_name)
                    )
                `)
                .order('date', { ascending: false })

            if (receivablesError) throw receivablesError

            if (receivablesData) {
                const transformed: CrateDelivery[] = receivablesData.map(item => ({
                    id: item.id,
                    date: item.date,
                    quantityReceived: item.inventory_receivable_items?.reduce((sum: number, r: any) => sum + r.qty, 0) || 0,
                    vehicleNumber: item.vehicle_no,
                    purchaseOrderNumber: item.purchase_order_number,
                    receivedBy: item.received_by,
                    deliveredBy: item.delivered_by,
                    purchaseOrderImage: item.purchase_order_img_url,
                    products: item.inventory_receivable_items?.map((r: any) => ({
                        productName: r.products?.sku_name || "Unknown Product",
                        quantity: r.qty
                    })) || []
                }))
                setDeliveries(transformed)
            }

            // 2. Fetch Total Stock (warehouse_stock)
            const { data: stockData, error: stockError } = await supabase
                .from('warehouse_stock')
                .select('quantity')

            if (stockError) throw stockError
            const total = stockData?.reduce((sum, item) => sum + item.quantity, 0) || 0
            setTotalStock(total)

        } catch (error) {
            console.error("Error fetching crates data:", error)
            toast.error("Failed to load crates data.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const toggleRow = (id: number) => {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    const handleEdit = (id: number) => {
        console.log("Edit delivery:", id)
        // Future implementation: Open edit dialog
    }

    const handleDelete = async (id: number) => {
        if (!confirm(`Are you sure you want to delete delivery #${id}? This will NOT automatically revert stock changes unless a trigger specifically handles deletes.`)) return

        try {
            const { error } = await supabase
                .from('inventory_receivables')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success("Record deleted successfully.")
            fetchData()
        } catch (error: any) {
            console.error("Error deleting record:", error)
            toast.error(error.message || "Failed to delete record.")
        }
    }

    // Calculate stats
    const totalReceived = deliveries.reduce((sum, d) => sum + d.quantityReceived, 0)
    const quantityRemaining = totalStock

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Crates Brought In</h2>
                <p className="text-muted-foreground">
                    Track crate deliveries from Guinness Ghana (Supplier)
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Quantity Received
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReceived.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Total crates received
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Quantity Remaining
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{quantityRemaining.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            Current inventory
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Quantity Received</TableHead>
                            <TableHead>Vehicle Number</TableHead>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Received By</TableHead>
                            <TableHead>Delivered By</TableHead>
                            <TableHead>PO Image</TableHead>
                            {profile?.role !== 'auditor' && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={profile?.role !== 'auditor' ? 9 : 8} className="h-40 text-center">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">Loading deliveries...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : deliveries.length > 0 ? (
                            deliveries.map((delivery) => (
                                <React.Fragment key={delivery.id}>
                                    <TableRow
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => toggleRow(delivery.id)}
                                    >
                                        <TableCell>
                                            {expandedRows.has(delivery.id) ? (
                                                <ChevronUp className="h-4 w-4" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4" />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {new Date(delivery.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Package className="h-3 w-3 text-muted-foreground" />
                                                {delivery.quantityReceived}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm lowercase">
                                            {delivery.vehicleNumber}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {delivery.purchaseOrderNumber}
                                        </TableCell>
                                        <TableCell>{delivery.receivedBy}</TableCell>
                                        <TableCell>{delivery.deliveredBy}</TableCell>
                                        <TableCell>
                                            {delivery.purchaseOrderImage ? (
                                                <div
                                                    className="relative h-12 w-12 rounded-md border bg-muted overflow-hidden cursor-zoom-in hover:ring-2 hover:ring-primary transition-all shadow-sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setPreviewImage(delivery.purchaseOrderImage)
                                                    }}
                                                >
                                                    <img
                                                        src={delivery.purchaseOrderImage}
                                                        alt="PO"
                                                        className="h-full w-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-black/10 hover:bg-transparent transition-colors" />
                                                </div>
                                            ) : (
                                                <div className="h-12 w-12 rounded-md border bg-muted/30 flex items-center justify-center">
                                                    <FileImage className="h-5 w-5 text-muted-foreground/40" />
                                                </div>
                                            )}
                                        </TableCell>
                                        {profile?.role !== 'auditor' && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleEdit(delivery.id)
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-danger hover:text-danger hover:bg-red-50"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDelete(delivery.id)
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                    {expandedRows.has(delivery.id) && (
                                        <TableRow>
                                            <TableCell colSpan={profile?.role !== 'auditor' ? 9 : 8} className="bg-muted/30 p-0 overflow-hidden">
                                                <div className="p-4 animate-in slide-in-from-top-2">
                                                    <h4 className="font-bold mb-3 text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                        <Package className="h-3 w-3" />
                                                        Product Breakdown
                                                    </h4>
                                                    <div className="rounded-md border bg-background shadow-sm overflow-hidden">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow className="bg-muted/50">
                                                                    <TableHead className="h-9">Product Name</TableHead>
                                                                    <TableHead className="text-right h-9">Quantity</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {delivery.products.map((product, idx) => (
                                                                    <TableRow key={idx}>
                                                                        <TableCell className="py-2 text-sm font-medium">
                                                                            {product.productName}
                                                                        </TableCell>
                                                                        <TableCell className="text-right py-2 font-bold font-mono">
                                                                            {product.quantity}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </React.Fragment>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground italic">
                                    No records found in the database.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Image Preview Dialog */}
            <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-transparent border-none shadow-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>PO Image Preview</DialogTitle>
                    </DialogHeader>
                    <div
                        className="relative w-full h-full flex items-center justify-center cursor-zoom-out p-4"
                        onClick={() => setPreviewImage(null)}
                    >
                        {previewImage && (
                            <img
                                src={previewImage}
                                alt="Purchase Order Preview"
                                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
