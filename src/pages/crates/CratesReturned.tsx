import { useState } from "react"
import { Calendar as CalendarIcon, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react"
import type { Range, RangeKeyDict } from "react-date-range"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
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

interface CrateReturn {
    id: number
    date: string
    quantityReturned: number
    vehicleNumber: string
    returnedBy: string
    products: ProductBreakdown[]
}

// Mock data
const MOCK_RETURNS: CrateReturn[] = [
    {
        id: 1,
        date: "2026-01-22",
        quantityReturned: 450,
        vehicleNumber: "GH-2345-22",
        returnedBy: "Kofi Mensah",
        products: [
            { productName: "Guinness FES 330ml RET 24*1", quantity: 150 },
            { productName: "Star lager 330ml RET 24*1", quantity: 200 },
            { productName: "Guinness Malt 330ml RET 24*1", quantity: 100 },
        ],
    },
    {
        id: 2,
        date: "2026-01-21",
        quantityReturned: 320,
        vehicleNumber: "GH-1876-21",
        returnedBy: "Ama Osei",
        products: [
            { productName: "ABC Golden Lag 300ml RET 24*1", quantity: 120 },
            { productName: "Orijin 330ml RET 24*1", quantity: 100 },
            { productName: "Star lager625ml RET 12*1", quantity: 100 },
        ],
    },
    {
        id: 3,
        date: "2026-01-20",
        quantityReturned: 500,
        vehicleNumber: "GH-5432-20",
        returnedBy: "Kwame Boateng",
        products: [
            { productName: "Guinness FES 330ml RET 24*1", quantity: 200 },
            { productName: "Gulder Lager 625ml RET 12*1", quantity: 150 },
            { productName: "Star lager 330ml RET 24*1", quantity: 150 },
        ],
    },
    {
        id: 4,
        date: "2026-01-19",
        quantityReturned: 280,
        vehicleNumber: "GH-7890-19",
        returnedBy: "Akua Adjei",
        products: [
            { productName: "Orijin 625ml RET 12*1", quantity: 80 },
            { productName: "Guinness Malt 330ml RET 24*1", quantity: 120 },
            { productName: "ABC Golden Lag 300ml RET 24*1", quantity: 80 },
        ],
    },
]

export default function CratesReturned() {
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(),
            endDate: new Date(),
            key: 'selection'
        }
    ])
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
        console.log("Edit return:", id)
        alert(`Edit return #${id}`)
    }

    const handleDelete = (id: number) => {
        console.log("Delete return:", id)
        if (confirm(`Are you sure you want to delete return #${id}?`)) {
            alert(`Return #${id} deleted`)
        }
    }

    const handleDateRangeChange = (ranges: RangeKeyDict) => {
        setDateRange([ranges.selection as Range])
    }

    // Calculate stats based on mock data
    const totalReturned = MOCK_RETURNS.reduce((sum, r) => sum + r.quantityReturned, 0)
    const cratesRemaining = 2500 // Mock value

    const selectedRange = dateRange[0]
    const hasDateRange = selectedRange && selectedRange.startDate && selectedRange.endDate

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <h2 className="text-3xl font-bold tracking-tight">Crates Returned</h2>
                <p className="text-muted-foreground">
                    Track crates returned by customers to OPK
                </p>
            </div>

            {/* Date Range Selector */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Select Date Range</label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-full md:w-[300px] justify-start text-left font-normal",
                                !hasDateRange && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {hasDateRange ? (
                                <>
                                    {selectedRange.startDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} -{" "}
                                    {selectedRange.endDate!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </>
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <DateRangePicker
                            value={dateRange}
                            onChange={handleDateRangeChange}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Crates Returned
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalReturned.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            In selected period
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Crates Remaining
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cratesRemaining.toLocaleString()}</div>
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
                            <TableHead>Quantity Returned</TableHead>
                            <TableHead>Vehicle Number</TableHead>
                            <TableHead>Returned By</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {MOCK_RETURNS.map((returnRecord) => (
                            <>
                                <TableRow
                                    key={returnRecord.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleRow(returnRecord.id)}
                                >
                                    <TableCell>
                                        {expandedRows.has(returnRecord.id) ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {new Date(returnRecord.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </TableCell>
                                    <TableCell>{returnRecord.quantityReturned}</TableCell>
                                    <TableCell className="font-mono text-sm">
                                        {returnRecord.vehicleNumber}
                                    </TableCell>
                                    <TableCell>{returnRecord.returnedBy}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleEdit(returnRecord.id)
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
                                                    handleDelete(returnRecord.id)
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                                {expandedRows.has(returnRecord.id) && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="bg-muted/30 p-0">
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
                                                            {returnRecord.products.map((product, idx) => (
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
