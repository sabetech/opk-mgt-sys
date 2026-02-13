import { useState, useEffect } from "react"
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Edit, Trash2, Search, Loader2, History } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"
import { useAuth } from "@/context/AuthContext"
import CustomerHistorySheet from "./CustomerHistorySheet"

interface Customer {
    id: number
    name: string
    phone: string | null
    balance: number
    has_mou: boolean
    type_id: number
    customer_types: {
        id: number
        name: string
    }
}

interface CustomerType {
    id: number
    name: string
}

export default function CustomerList() {
    const { profile } = useAuth()
    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState("All")
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])

    // Edit State
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
    const [editForm, setEditForm] = useState({
        name: "",
        phone: "",
        type_id: "",
        has_mou: false
    })
    const [saving, setSaving] = useState(false)

    // History Sheet State
    const [isHistoryOpen, setIsHistoryOpen] = useState(false)
    const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)

    // Fetch Customers
    const fetchCustomers = async () => {
        try {
            const { data: customersData, error: customersError } = await supabase
                .from('customers')
                .select('id, name, phone, balance, type_id, has_mou, customer_types(id, name)')
                .is('deleted_at', null)
                .order('name', { ascending: true })

            if (customersError) throw customersError
            setCustomers(customersData as any || [])

            const { data: typesData, error: typesError } = await supabase
                .from('customer_types')
                .select('id, name')
                .order('name', { ascending: true })

            if (typesError) throw typesError
            setCustomerTypes(typesData || [])

        } catch (err) {
            console.error("Error fetching customers:", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchCustomers()
    }, [])

    const filteredCustomers = customers.filter(customer => {
        const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesFilter = filterType === "All" || customer.customer_types?.name === filterType
        return matchesSearch && matchesFilter
    })

    const getBadgeVariant = (type: string) => {
        if (type === "Wholesaler") return "default"
        if (type === "Retailer (VSE)") return "secondary"
        return "outline"
    }

    const handleEditClick = (customer: Customer) => {
        setEditingCustomer(customer)
        setEditForm({
            name: customer.name,
            phone: customer.phone || "",
            type_id: customer.type_id.toString(),
            has_mou: customer.has_mou || false
        })
        setIsEditOpen(true)
    }

    const handleHistoryClick = (customer: Customer) => {
        setHistoryCustomer(customer)
        setIsHistoryOpen(true)
    }

    const handleSaveEdit = async () => {
        if (!editingCustomer) return
        if (!editForm.name) {
            toast.error("Name is required.")
            return
        }

        setSaving(true)
        try {
            const { error } = await supabase
                .from('customers')
                .update({
                    name: editForm.name,
                    phone: editForm.phone || null,
                    type_id: parseInt(editForm.type_id),
                    has_mou: editForm.has_mou
                })
                .eq('id', editingCustomer.id)

            if (error) throw error

            toast.success("Customer updated successfully!")
            setIsEditOpen(false)
            fetchCustomers() // Refresh list
        } catch (err) {
            console.error("Error updating customer:", err)
            toast.error("Failed to update customer.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Customer List</h2>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
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

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={filterType === "All" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterType("All")}
                    >
                        All
                    </Button>
                    {customerTypes.map(type => (
                        <Button
                            key={type.id}
                            variant={filterType === type.name ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilterType(type.name)}
                        >
                            {type.name}
                        </Button>
                    ))}
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
                            {profile?.role !== 'auditor' && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        <span>Loading customers...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredCustomers.length > 0 ? (
                            filteredCustomers.map((customer) => (
                                <TableRow key={customer.id}>
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell>{customer.phone || "N/A"}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge variant={getBadgeVariant(customer.customer_types?.name) as any}>
                                                {customer.customer_types?.name}
                                            </Badge>
                                            {customer.has_mou && (
                                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                                    MOU Signed
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">{customer.balance}</TableCell>
                                    {profile?.role !== 'auditor' && (
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                    onClick={() => handleHistoryClick(customer)}
                                                >
                                                    <History className="h-4 w-4" />
                                                    <span className="sr-only">History</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                    onClick={() => handleEditClick(customer)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                    <span className="sr-only">Edit</span>
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                                                    <Trash2 className="h-4 w-4" />
                                                    <span className="sr-only">Delete</span>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
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

            {/* History Sheet */}
            <CustomerHistorySheet
                customer={historyCustomer}
                open={isHistoryOpen}
                onOpenChange={setIsHistoryOpen}
            />

            {/* Edit Customer Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit Customer</DialogTitle>
                        <DialogDescription>
                            Make changes to the customer's profile here. Click save when you're done.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-name">Name</Label>
                            <Input
                                id="edit-name"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-phone">Phone</Label>
                            <Input
                                id="edit-phone"
                                value={editForm.phone}
                                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-type">Customer Type</Label>
                            <Select
                                value={editForm.type_id}
                                onValueChange={(val) => setEditForm({ ...editForm, type_id: val })}
                            >
                                <SelectTrigger id="edit-type">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {customerTypes.map((type) => (
                                        <SelectItem key={type.id} value={type.id.toString()}>
                                            {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {customerTypes.find(t => t.id.toString() === editForm.type_id)?.name === "Wholesaler" && (
                            <div className="flex items-center space-x-2 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900">
                                <input
                                    id="edit-has-mou"
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    checked={editForm.has_mou}
                                    onChange={(e) => setEditForm({ ...editForm, has_mou: e.target.checked })}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <Label htmlFor="edit-has-mou" className="text-sm font-bold">
                                        Signed MOU
                                    </Label>
                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                        Allows negative balance.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
