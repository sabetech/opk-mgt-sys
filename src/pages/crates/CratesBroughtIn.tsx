import { useState } from "react"
import { Edit, Trash2, ChevronDown, ChevronUp, FileImage } from "lucide-react"

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

// Mock data
const MOCK_DELIVERIES: CrateDelivery[] = [
    {
        id: 1,
        date: "2026-01-22",
        quantityReceived: 600,
        vehicleNumber: "GH-8765-22",
        purchaseOrderNumber: "PO-2026-001",
        receivedBy: "Kwame Mensah",
        deliveredBy: "Guinness Transport",
        purchaseOrderImage: null,
        products: [
            { productName: "Guinness FES 330ml RET 24*1", quantity: 200 },
            { productName: "Star lager 330ml RET 24*1", quantity: 250 },
            { productName: "Guinness Malt 330ml RET 24*1", quantity: 150 },
        ],
    },
    {
        id: 2,
        date: "2026-01-20",
        quantityReceived: 450,
        vehicleNumber: "GH-5432-20",
        purchaseOrderNumber: "PO-2026-002",
        receivedBy: "Ama Osei",
        deliveredBy: "Guinness Transport",
        purchaseOrderImage: null,
        products: [
            { productName: "ABC Golden Lag 300ml RET 24*1", quantity: 150 },
            { productName: "Orijin 330ml RET 24*1", quantity: 150 },
            { productName: "Star lager625ml RET 12*1", quantity: 150 },
        ],
    },
    {
        id: 3,
        date: "2026-01-18",
        quantityReceived: 550,
        vehicleNumber: "GH-3210-18",
        purchaseOrderNumber: "PO-2026-003",
        receivedBy: "Kofi Boateng",
        deliveredBy: "Guinness Transport",
        purchaseOrderImage: null,
        products: [
            { productName: "Guinness FES 330ml RET 24*1", quantity: 250 },
            { productName: "Gulder Lager 625ml RET 12*1", quantity: 150 },
            { productName: "Star lager 330ml RET 24*1", quantity: 150 },
        ],
    },
]

export default function CratesBroughtIn() {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

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
        alert(`Edit delivery #${id}`)
    }

    const handleDelete = (id: number) => {
        console.log("Delete delivery:", id)
        if (confirm(`Are you sure you want to delete delivery #${id}?`)) {
            alert(`Delivery #${id} deleted`)
        }
    }

    const handleViewPO = (poNumber: string) => {
        alert(`View Purchase Order: ${poNumber}`)
    }

    // Calculate stats
    const totalReceived = MOCK_DELIVERIES.reduce((sum, d) => sum + d.quantityReceived, 0)
    const quantityRemaining = 3200 // Mock value

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
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_DELIVERIES.map((delivery) => (
                            <>
                                <TableRow
                                    key={delivery.id}
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
                                    <TableCell>{delivery.quantityReceived}</TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {delivery.vehicleNumber}
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {delivery.purchaseOrderNumber}
                                    </TableCell>
                                    <TableCell>{delivery.receivedBy}</TableCell>
                                    <TableCell>{delivery.deliveredBy}</TableCell>
                                    <TableCell>
                                        {delivery.purchaseOrderImage ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleViewPO(delivery.purchaseOrderNumber)
                                                }}
                                            >
                                                <FileImage className="h-4 w-4 mr-1" />
                                                View
                                            </Button>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
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
                                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDelete(delivery.id)
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {expandedRows.has(delivery.id) && (
                                    <TableRow>
                                        <TableCell colSpan={9} className="bg-muted/30 p-0">
                                            <div className="p-4">
                                                <h4 className="font-semibold mb-3 text-sm">Product Breakdown</h4>
                                                <div className="rounded-md border bg-background">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead>Product Name</TableHead>
                                                                <TableHead className="text-right">Quantity</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {delivery.products.map((product, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell className="font-medium">
                                                                        {product.productName}
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-semibold">
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
                            </>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
