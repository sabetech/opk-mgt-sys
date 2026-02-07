import { useState, useEffect } from "react"
import React from "react"
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
import { Search, Calendar, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { RangeKeyDict, Range } from "react-date-range"

// Types
interface OrderItem {
    id: string
    productCode: string
    productName: string
    quantity: number
    unitPrice: number
    totalPrice: number
    returnable: boolean
}

interface CompletedOrder {
    id: string
    orderID: string
    date: string
    customer: string
    totalAmount: number
    paymentStatus: "paid" | "pending" | "partial"
    deliveryStatus: "delivered" | "pending" | "in-transit"
    itemCount: number
    items: OrderItem[]
}

// Mock data
const mockCompletedOrders: CompletedOrder[] = [
    {
        id: "1",
        orderID: "ORD-2024-001",
        date: "2024-01-15",
        customer: "John's Store",
        totalAmount: 1250.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 15,
        items: [
            { id: "1-1", productCode: "BR001", productName: "Premium Lager Beer", quantity: 10, unitPrice: 45.00, totalPrice: 450.00, returnable: true },
            { id: "1-2", productCode: "BR002", productName: "Craft IPA", quantity: 5, unitPrice: 160.00, totalPrice: 800.00, returnable: true },
        ]
    },
    {
        id: "2",
        orderID: "ORD-2024-002",
        date: "2024-01-14",
        customer: "Mary's Shop",
        totalAmount: 890.50,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 12,
        items: [
            { id: "2-1", productCode: "BR003", productName: "Stout Beer", quantity: 8, unitPrice: 55.00, totalPrice: 440.00, returnable: true },
            { id: "2-2", productCode: "BR004", productName: "Wheat Beer", quantity: 4, unitPrice: 112.625, totalPrice: 450.50, returnable: true },
        ]
    },
    {
        id: "3",
        orderID: "ORD-2024-003",
        date: "2024-01-13",
        customer: "Bob's Market",
        totalAmount: 2100.00,
        paymentStatus: "partial",
        deliveryStatus: "delivered",
        itemCount: 28,
        items: [
            { id: "3-1", productCode: "BR001", productName: "Premium Lager Beer", quantity: 15, unitPrice: 45.00, totalPrice: 675.00, returnable: true },
            { id: "3-2", productCode: "BR005", productName: "Pilsner Beer", quantity: 10, unitPrice: 52.50, totalPrice: 525.00, returnable: true },
            { id: "3-3", productCode: "BR006", productName: "Amber Ale", quantity: 3, unitPrice: 300.00, totalPrice: 900.00, returnable: false },
        ]
    },
    {
        id: "4",
        orderID: "ORD-2024-004",
        date: "2024-01-12",
        customer: "Alice Retail",
        totalAmount: 567.75,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 8,
        items: [
            { id: "4-1", productCode: "BR007", productName: "Light Beer", quantity: 6, unitPrice: 35.00, totalPrice: 210.00, returnable: true },
            { id: "4-2", productCode: "BR008", productName: "Dark Beer", quantity: 2, unitPrice: 178.875, totalPrice: 357.75, returnable: true },
        ]
    },
    {
        id: "5",
        orderID: "ORD-2024-005",
        date: "2024-01-11",
        customer: "Charlie's Store",
        totalAmount: 3450.00,
        paymentStatus: "paid",
        deliveryStatus: "in-transit",
        itemCount: 45,
        items: [
            { id: "5-1", productCode: "BR001", productName: "Premium Lager Beer", quantity: 20, unitPrice: 45.00, totalPrice: 900.00, returnable: true },
            { id: "5-2", productCode: "BR002", productName: "Craft IPA", quantity: 10, unitPrice: 160.00, totalPrice: 1600.00, returnable: true },
            { id: "5-3", productCode: "BR009", productName: "Seasonal Brew", quantity: 15, unitPrice: 65.00, totalPrice: 975.00, returnable: false },
        ]
    },
    {
        id: "6",
        orderID: "ORD-2024-006",
        date: "2024-01-10",
        customer: "Diana Shop",
        totalAmount: 789.25,
        paymentStatus: "pending",
        deliveryStatus: "delivered",
        itemCount: 11,
        items: [
            { id: "6-1", productCode: "BR010", productName: "Imported Beer", quantity: 5, unitPrice: 85.00, totalPrice: 425.00, returnable: true },
            { id: "6-2", productCode: "BR011", productName: "Local Brew", quantity: 6, unitPrice: 60.708, totalPrice: 364.25, returnable: false },
        ]
    },
    {
        id: "7",
        orderID: "ORD-2024-007",
        date: "2024-01-09",
        customer: "Evan Market",
        totalAmount: 1890.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 22,
        items: [
            { id: "7-1", productCode: "BR012", productName: "Organic Beer", quantity: 12, unitPrice: 75.00, totalPrice: 900.00, returnable: true },
            { id: "7-2", productCode: "BR013", productName: "Gluten-Free Beer", quantity: 10, unitPrice: 99.00, totalPrice: 990.00, returnable: false },
        ]
    },
    {
        id: "8",
        orderID: "ORD-2024-008",
        date: "2024-01-08",
        customer: "Fiona Retail",
        totalAmount: 445.50,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 6,
        items: [
            { id: "8-1", productCode: "BR014", productName: "Non-Alcoholic Beer", quantity: 3, unitPrice: 40.00, totalPrice: 120.00, returnable: true },
            { id: "8-2", productCode: "BR015", productName: "Low-Calorie Beer", quantity: 3, unitPrice: 108.50, totalPrice: 325.50, returnable: false },
        ]
    },
    {
        id: "9",
        orderID: "ORD-2024-009",
        date: "2024-01-07",
        customer: "George Store",
        totalAmount: 2780.00,
        paymentStatus: "partial",
        deliveryStatus: "delivered",
        itemCount: 35,
        items: [
            { id: "9-1", productCode: "BR016", productName: "Belgian Ale", quantity: 15, unitPrice: 88.00, totalPrice: 1320.00, returnable: true },
            { id: "9-2", productCode: "BR017", productName: "German Lager", quantity: 10, unitPrice: 65.00, totalPrice: 650.00, returnable: true },
            { id: "9-3", productCode: "BR018", productName: "British Stout", quantity: 10, unitPrice: 81.00, totalPrice: 810.00, returnable: true },
        ]
    },
    {
        id: "10",
        orderID: "ORD-2024-010",
        date: "2024-01-06",
        customer: "Hannah Shop",
        totalAmount: 1234.00,
        paymentStatus: "paid",
        deliveryStatus: "pending",
        itemCount: 18,
        items: [
            { id: "10-1", productCode: "BR019", productName: "Fruit Beer", quantity: 8, unitPrice: 55.00, totalPrice: 440.00, returnable: false },
            { id: "10-2", productCode: "BR020", productName: "Spiced Beer", quantity: 10, unitPrice: 79.40, totalPrice: 794.00, returnable: false },
        ]
    },
    {
        id: "11",
        orderID: "ORD-2024-011",
        date: "2024-01-05",
        customer: "Ian Market",
        totalAmount: 890.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 14,
        items: [
            { id: "11-1", productCode: "BR021", productName: "Honey Beer", quantity: 7, unitPrice: 65.00, totalPrice: 455.00, returnable: false },
            { id: "11-2", productCode: "BR022", productName: "Vanilla Beer", quantity: 7, unitPrice: 62.143, totalPrice: 435.00, returnable: false },
        ]
    },
    {
        id: "12",
        orderID: "ORD-2024-012",
        date: "2024-01-04",
        customer: "Julia Retail",
        totalAmount: 3456.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 42,
        items: [
            { id: "12-1", productCode: "BR023", productName: "Coffee Beer", quantity: 20, unitPrice: 72.00, totalPrice: 1440.00, returnable: false },
            { id: "12-2", productCode: "BR024", productName: "Chocolate Beer", quantity: 12, unitPrice: 85.00, totalPrice: 1020.00, returnable: false },
            { id: "12-3", productCode: "BR025", productName: "Caramel Beer", quantity: 10, unitPrice: 99.60, totalPrice: 996.00, returnable: false },
        ]
    },
    {
        id: "13",
        orderID: "ORD-2024-013",
        date: "2024-01-03",
        customer: "Kevin Store",
        totalAmount: 678.50,
        paymentStatus: "pending",
        deliveryStatus: "delivered",
        itemCount: 9,
        items: [
            { id: "13-1", productCode: "BR026", productName: "Lemon Beer", quantity: 5, unitPrice: 58.00, totalPrice: 290.00, returnable: false },
            { id: "13-2", productCode: "BR027", productName: "Lime Beer", quantity: 4, unitPrice: 97.125, totalPrice: 388.50, returnable: false },
        ]
    },
    {
        id: "14",
        orderID: "ORD-2024-014",
        date: "2024-01-02",
        customer: "Laura Shop",
        totalAmount: 1567.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 20,
        items: [
            { id: "14-1", productCode: "BR028", productName: "Cherry Beer", quantity: 10, unitPrice: 68.00, totalPrice: 680.00, returnable: false },
            { id: "14-2", productCode: "BR029", productName: "Berry Beer", quantity: 10, unitPrice: 88.70, totalPrice: 887.00, returnable: false },
        ]
    },
    {
        id: "15",
        orderID: "ORD-2024-015",
        date: "2024-01-01",
        customer: "Mike Market",
        totalAmount: 2340.00,
        paymentStatus: "partial",
        deliveryStatus: "in-transit",
        itemCount: 31,
        items: [
            { id: "15-1", productCode: "BR030", productName: "Apple Beer", quantity: 15, unitPrice: 62.00, totalPrice: 930.00, returnable: false },
            { id: "15-2", productCode: "BR031", productName: "Pear Beer", quantity: 8, unitPrice: 75.00, totalPrice: 600.00, returnable: false },
            { id: "15-3", productCode: "BR032", productName: "Peach Beer", quantity: 8, unitPrice: 101.25, totalPrice: 810.00, returnable: false },
        ]
    },
    {
        id: "16",
        orderID: "ORD-2023-316",
        date: "2023-12-31",
        customer: "Nancy Retail",
        totalAmount: 456.75,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 7,
        items: [
            { id: "16-1", productCode: "BR033", productName: "Mango Beer", quantity: 4, unitPrice: 58.00, totalPrice: 232.00, returnable: false },
            { id: "16-2", productCode: "BR034", productName: "Pineapple Beer", quantity: 3, unitPrice: 74.917, totalPrice: 224.75, returnable: false },
        ]
    },
    {
        id: "17",
        orderID: "ORD-2023-317",
        date: "2023-12-30",
        customer: "Oliver Store",
        totalAmount: 2890.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 38,
        items: [
            { id: "17-1", productCode: "BR035", productName: "Coconut Beer", quantity: 18, unitPrice: 65.00, totalPrice: 1170.00, returnable: false },
            { id: "17-2", productCode: "BR036", productName: "Tropical Beer", quantity: 20, unitPrice: 86.00, totalPrice: 1720.00, returnable: false },
        ]
    },
    {
        id: "18",
        orderID: "ORD-2023-318",
        date: "2023-12-29",
        customer: "Penny Shop",
        totalAmount: 1123.50,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 16,
        items: [
            { id: "18-1", productCode: "BR037", productName: "Winter Ale", quantity: 8, unitPrice: 78.00, totalPrice: 624.00, returnable: true },
            { id: "18-2", productCode: "BR038", productName: "Spring Lager", quantity: 8, unitPrice: 62.438, totalPrice: 499.50, returnable: true },
        ]
    },
    {
        id: "19",
        orderID: "ORD-2023-319",
        date: "2023-12-28",
        customer: "Quinn Market",
        totalAmount: 3678.00,
        paymentStatus: "partial",
        deliveryStatus: "delivered",
        itemCount: 48,
        items: [
            { id: "19-1", productCode: "BR039", productName: "Summer IPA", quantity: 25, unitPrice: 82.00, totalPrice: 2050.00, returnable: true },
            { id: "19-2", productCode: "BR040", productName: "Autumn Stout", quantity: 23, unitPrice: 70.783, totalPrice: 1628.00, returnable: true },
        ]
    },
    {
        id: "20",
        orderID: "ORD-2023-320",
        date: "2023-12-27",
        customer: "Rachel Retail",
        totalAmount: 234.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 4,
        items: [
            { id: "20-1", productCode: "BR041", productName: "Limited Edition", quantity: 2, unitPrice: 95.00, totalPrice: 190.00, returnable: false },
            { id: "20-2", productCode: "BR042", productName: "Special Release", quantity: 2, unitPrice: 22.00, totalPrice: 44.00, returnable: false },
        ]
    },
    {
        id: "21",
        orderID: "ORD-2023-321",
        date: "2023-12-26",
        customer: "Sam Store",
        totalAmount: 1456.00,
        paymentStatus: "pending",
        deliveryStatus: "delivered",
        itemCount: 19,
        items: [
            { id: "21-1", productCode: "BR043", productName: "Classic Lager", quantity: 10, unitPrice: 48.00, totalPrice: 480.00, returnable: true },
            { id: "21-2", productCode: "BR044", productName: "Traditional Ale", quantity: 9, unitPrice: 108.444, totalPrice: 976.00, returnable: true },
        ]
    },
    {
        id: "22",
        orderID: "ORD-2023-322",
        date: "2023-12-25",
        customer: "Tina Shop",
        totalAmount: 789.00,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 13,
        items: [
            { id: "22-1", productCode: "BR045", productName: "Holiday Brew", quantity: 7, unitPrice: 85.00, totalPrice: 595.00, returnable: false },
            { id: "22-2", productCode: "BR046", productName: "Festive Beer", quantity: 6, unitPrice: 32.333, totalPrice: 194.00, returnable: false },
        ]
    },
    {
        id: "23",
        orderID: "ORD-2023-323",
        date: "2023-12-24",
        customer: "Uma Market",
        totalAmount: 3123.00,
        paymentStatus: "paid",
        deliveryStatus: "in-transit",
        itemCount: 41,
        items: [
            { id: "23-1", productCode: "BR047", productName: "Anniversary Beer", quantity: 20, unitPrice: 95.00, totalPrice: 1900.00, returnable: false },
            { id: "23-2", productCode: "BR048", productName: "Celebration Ale", quantity: 21, unitPrice: 58.238, totalPrice: 1223.00, returnable: false },
        ]
    },
    {
        id: "24",
        orderID: "ORD-2023-324",
        date: "2023-12-23",
        customer: "Victor Retail",
        totalAmount: 567.50,
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        itemCount: 8,
        items: [
            { id: "24-1", productCode: "BR049", productName: "Vintage Beer", quantity: 5, unitPrice: 68.00, totalPrice: 340.00, returnable: true },
            { id: "24-2", productCode: "BR050", productName: "Reserve Beer", quantity: 3, unitPrice: 75.833, totalPrice: 227.50, returnable: true },
        ]
    },
    {
        id: "25",
        orderID: "ORD-2023-325",
        date: "2023-12-22",
        customer: "Wendy Store",
        totalAmount: 1890.00,
        paymentStatus: "partial",
        deliveryStatus: "delivered",
        itemCount: 25,
        items: [
            { id: "25-1", productCode: "BR051", productName: "Barrel Aged", quantity: 15, unitPrice: 88.00, totalPrice: 1320.00, returnable: true },
            { id: "25-2", productCode: "BR052", productName: "Oak Aged", quantity: 10, unitPrice: 57.00, totalPrice: 570.00, returnable: true },
        ]
    },
]

const ITEMS_PER_PAGE = 20

export default function CompletedOrders() {
    const [orders, setOrders] = useState<CompletedOrder[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)
    const [dateRange, setDateRange] = useState<Range[]>([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // 30 days ago
            endDate: new Date(),
            key: 'selection'
        }
    ])
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // Fetch orders (using mock data for now)
    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true)
            // Simulate API call
            setTimeout(() => {
                setOrders(mockCompletedOrders)
                setLoading(false)
            }, 500)
        }
        fetchOrders()
    }, [])

    // Filter orders based on search and date range
    const filteredOrders = orders.filter(order => {
        // Search filter
        const matchesSearch = order.orderID.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              order.customer.toLowerCase().includes(searchTerm.toLowerCase())

        // Date range filter
        const orderDate = new Date(order.date)
        const selectedRange = dateRange[0]
        const matchesDateRange = (!selectedRange?.startDate || orderDate >= selectedRange.startDate) &&
                                (!selectedRange?.endDate || orderDate <= selectedRange.endDate)

        return matchesSearch && matchesDateRange
    })

    // Pagination
    const totalItems = filteredOrders.length
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems)
    const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

    // Handle view order details
    const handleViewOrder = (orderId: string) => {
        alert(`Viewing details for order ${orderId}`)
    }

    // Handle print order
    const handlePrintOrder = (orderId: string) => {
        alert(`Printing order ${orderId}`)
    }

    // Handle export order
    const handleExportOrder = (orderId: string) => {
        alert(`Exporting order ${orderId}`)
    }

    // Handle row expand/collapse
    const toggleRowExpansion = (orderId: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev)
            if (newSet.has(orderId)) {
                newSet.delete(orderId)
            } else {
                newSet.add(orderId)
            }
            return newSet
        })
    }

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, dateRange])

    // Get payment status badge variant
    const getPaymentStatusBadgeVariant = (status: CompletedOrder["paymentStatus"]) => {
        switch (status) {
            case "paid":
                return "default"
            case "partial":
                return "outline"
            case "pending":
                return "destructive"
            default:
                return "outline"
        }
    }

    // Get delivery status badge variant
    const getDeliveryStatusBadgeVariant = (status: CompletedOrder["deliveryStatus"]) => {
        switch (status) {
            case "delivered":
                return "default"
            case "in-transit":
                return "outline"
            case "pending":
                return "destructive"
            default:
                return "outline"
        }
    }

    // Format date
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString()
    }

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount)
    }

    // Format date range for display
    const formatDateRangeDisplay = () => {
        const selectedRange = dateRange[0]
        if (!selectedRange?.startDate) return "Select date range"
        
        const start = new Date(selectedRange.startDate).toLocaleDateString()
        if (!selectedRange?.endDate) return start
        
        const end = new Date(selectedRange.endDate).toLocaleDateString()
        return start === end ? start : `${start} - ${end}`
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center">
                    <h1 className="text-lg font-semibold md:text-2xl">Completed Orders</h1>
                </div>
                <div className="flex items-center justify-center h-64">
                    <p>Loading orders...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Completed Orders</h2>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search orders..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Date Range Picker */}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full md:w-auto justify-start text-left font-normal">
                            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                            {formatDateRangeDisplay()}
                            <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <DateRangePicker
                            value={dateRange}
                            onChange={(ranges: RangeKeyDict) => {
                                const { selection } = ranges
                                setDateRange([selection])
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Orders Table */}
            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Payment Status</TableHead>
                            <TableHead>Delivery Status</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedOrders.length > 0 ? (
                            paginatedOrders.map((order) => (
                                <React.Fragment key={order.id}>
                                    <TableRow>
                                        <TableCell className="font-medium">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 mr-2"
                                                onClick={() => toggleRowExpansion(order.id)}
                                            >
                                                {expandedRows.has(order.id) ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                            </Button>
                                            {order.orderID}
                                        </TableCell>
                                        <TableCell>{formatDate(order.date)}</TableCell>
                                        <TableCell>{order.customer}</TableCell>
                                        <TableCell className="font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                                        <TableCell>
                                            <Badge variant={getPaymentStatusBadgeVariant(order.paymentStatus)}>
                                                {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1).replace('-', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getDeliveryStatusBadgeVariant(order.deliveryStatus)}>
                                                {order.deliveryStatus.charAt(0).toUpperCase() + order.deliveryStatus.slice(1).replace('-', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{order.itemCount}</TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <span className="sr-only">Open menu</span>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleViewOrder(order.id)}>
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => handlePrintOrder(order.id)}>
                                                        Print Order
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleExportOrder(order.id)}>
                                                        Export Order
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                    {expandedRows.has(order.id) && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="bg-gray-50 p-4">
                                                <div className="space-y-4">
                                                    <h4 className="font-semibold text-sm text-gray-700">Order Items</h4>
                                                    <div className="rounded-md border">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead className="w-[100px]">Product Code</TableHead>
                                                                    <TableHead>Product Name</TableHead>
                                                                    <TableHead className="text-right">Quantity</TableHead>
                                                                    <TableHead className="text-right">Unit Price</TableHead>
                                                                    <TableHead className="text-right">Total Price</TableHead>
                                                                    <TableHead>Returnable</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {order.items.map((item) => (
                                                                    <TableRow key={item.id}>
                                                                        <TableCell className="font-medium">{item.productCode}</TableCell>
                                                                        <TableCell>{item.productName}</TableCell>
                                                                        <TableCell className="text-right">{item.quantity}</TableCell>
                                                                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                                                                        <TableCell className="text-right font-medium">{formatCurrency(item.totalPrice)}</TableCell>
                                                                        <TableCell>
                                                                            <Badge variant={item.returnable ? "default" : "outline"}>
                                                                                {item.returnable ? "Yes" : "No"}
                                                                            </Badge>
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
                                <TableCell colSpan={8} className="h-24 text-center">
                                    No orders found.
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
                        Showing {startIndex + 1} to {endIndex} of {totalItems} orders
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
        </div>
    )
}