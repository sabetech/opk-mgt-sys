import { useState } from "react"
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
import { Edit, Trash2, Search } from "lucide-react"

// Mock Data
const MOCK_CUSTOMERS = [
    { id: 1, name: "John Doe", phone: "0541234567", type: "Retailer", balance: 5 },
    { id: 2, name: "Jane Smith", phone: "0209876543", type: "Wholesaler", balance: 50 },
    { id: 3, name: "Kwame Mensah", phone: "0555555555", type: "Retailer (VSE)", balance: 12 },
    { id: 4, name: "Ama Osei", phone: "0244123123", type: "Retailer", balance: 0 },
    { id: 5, name: "Kofi Boateng", phone: "0277888999", type: "Wholesaler", balance: 120 },
]

export default function CustomerList() {
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState("All")

    const filteredCustomers = MOCK_CUSTOMERS.filter(customer => {
        const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesFilter = filterType === "All" || customer.type === filterType
        return matchesSearch && matchesFilter
    })

    // Helper for badge color
    const getBadgeVariant = (type: string) => {
        if (type === "Wholesaler") return "default" // Primary color
        if (type === "Retailer (VSE)") return "secondary"
        return "outline"
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Customer List</h2>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
                {/* Search */}
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search customers..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={filterType === "All" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterType("All")}
                    >
                        All
                    </Button>
                    <Button
                        variant={filterType === "Retailer" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterType("Retailer")}
                    >
                        Retailer
                    </Button>
                    <Button
                        variant={filterType === "Wholesaler" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterType("Wholesaler")}
                    >
                        Wholesaler
                    </Button>
                    <Button
                        variant={filterType === "Retailer (VSE)" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterType("Retailer (VSE)")}
                    >
                        Retailer (VSE)
                    </Button>
                </div>
            </div>

            <div className="rounded-md border bg-white dark:bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Customer Type</TableHead>
                            <TableHead className="text-right">Crates Balance</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredCustomers.length > 0 ? (
                            filteredCustomers.map((customer) => (
                                <TableRow key={customer.id}>
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell>{customer.phone}</TableCell>
                                    <TableCell>
                                        <Badge variant={getBadgeVariant(customer.type) as any}>
                                            {customer.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{customer.balance}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Edit</span>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Delete</span>
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No customers found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
