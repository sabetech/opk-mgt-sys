import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    DialogTrigger,
} from "@/components/ui/dialog"
import { FileSpreadsheet, Save, Upload, Loader2, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { CustomerType, CustomerForm } from "@/lib/customerTypes"
import Papa from "papaparse"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function AddCustomer() {
    const navigate = useNavigate()
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    const [loading, setLoading] = useState(false)
    const [importing, setImporting] = useState(false)
    const [fetchingTypes, setFetchingTypes] = useState(true)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [dragActive, setDragActive] = useState(false)

    // Form State
    const [formData, setFormData] = useState<CustomerForm>({
        name: "",
        phone: "",
        type_id: "",
        balance: 0,
        has_mou: false
    })

    // Fetch customer types
    useEffect(() => {
        const fetchTypes = async () => {
            try {
                const { data, error } = await supabase
                    .from('customer_types')
                    .select('*')
                    .order('name', { ascending: true })

                if (error) throw error
                setCustomerTypes(data || [])
            } catch (err) {
                console.error("Error fetching customer types:", err)
            } finally {
                setFetchingTypes(false)
            }
        }
        fetchTypes()
    }, [])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0])
        }
    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true)
        } else if (e.type === "dragleave") {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0]
            if (file.name.endsWith('.csv')) {
                setSelectedFile(file)
            } else {
                toast.error("Please upload a CSV file.")
            }
        }
    }

    const processImport = async () => {
        if (!selectedFile) return

        setImporting(true)
        Papa.parse(selectedFile, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const parsedData = results.data as any[]

                    // Create a map for quick type lookup: name -> id
                    const typeMap = new Map(customerTypes.map(t => [t.name.toLowerCase(), t.id]))

                    const customersToInsert = parsedData.map(row => {
                        // Support both capitalized and lowercase headers
                        const name = row.Name || row.name || row.customer_name || row.Customer_Name
                        const phone = row.Phone || row.phone || row.phone_number || row.Phone_Number
                        const typeName = row.Type || row.type || row.customer_type || row.Customer_Type || ""
                        const balance = row.Balance || row.balance || row.initial_balance || row.Initial_Balance

                        const typeId = typeMap.get(typeName.toString().toLowerCase().trim())

                        return {
                            name: name,
                            phone: phone ? phone.toString() : null,
                            type_id: typeId || null,
                            balance: parseInt(balance) || 0
                        }
                    }).filter(c => c.name) // Ensure name exists

                    if (customersToInsert.length === 0) {
                        toast.error("No valid customer data found in CSV.")
                        return
                    }

                    const { error } = await supabase
                        .from('customers')
                        .insert(customersToInsert)

                    if (error) throw error

                    toast.success(`Successfully imported ${customersToInsert.length} customers!`)
                    setIsDialogOpen(false)
                    setSelectedFile(null)
                    // Refresh current view logic if necessary or just redirect
                    navigate("/dashboard/customers/all")
                } catch (err) {
                    console.error("Import error:", err)
                    toast.error("Failed to import customers. Check your CSV format.")
                } finally {
                    setImporting(false)
                }
            },
            error: (err) => {
                console.error("Parse error:", err)
                toast.error("Failed to parse CSV file.")
                setImporting(false)
            }
        })
    }

    const handleSaveCustomer = async () => {
        // Validation
        if (!formData.name) {
            toast.error("Customer name is required.")
            return
        }
        if (!formData.type_id) {
            toast.error("Please select a customer type.")
            return
        }

        setLoading(true)
        try {
            const { error } = await supabase
                .from('customers')
                .insert([{
                    name: formData.name,
                    phone: formData.phone || null,
                    type_id: parseInt(formData.type_id),
                    balance: formData.balance || 0,
                    has_mou: formData.has_mou
                }])

            if (error) throw error

            toast.success("Customer saved successfully!")
            // Redirect to list page
            navigate("/dashboard/customers/all")
        } catch (err) {
            console.error("Error saving customer:", err)
            toast.error("Failed to save customer. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Add Customer</h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <FileSpreadsheet className="h-4 w-4" />
                            Import from CSV
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Import Customers</DialogTitle>
                            <DialogDescription>
                                Upload a CSV file with headers: <code className="bg-muted px-1 rounded text-red-500">name, phone, type, balance</code>.
                                <br />
                                <span className="text-xs text-muted-foreground italic">Note: Type should match existing customer types (Retailer, Wholesaler, etc.)</span>
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="dropzone-file"
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    className={cn(
                                        "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors relative overflow-hidden",
                                        dragActive && "border-amber-600 bg-amber-100/50",
                                        selectedFile && !dragActive && "border-amber-500 bg-amber-50/50"
                                    )}
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                                        {importing ? (
                                            <>
                                                <Loader2 className="w-8 h-8 mb-4 text-amber-600 animate-spin" />
                                                <p className="text-sm font-medium">Processing import...</p>
                                            </>
                                        ) : selectedFile ? (
                                            <>
                                                <CheckCircle2 className="w-8 h-8 mb-4 text-green-600" />
                                                <p className="mb-2 text-sm text-green-700 font-semibold truncate max-w-full">
                                                    {selectedFile.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground font-mono">
                                                    {(selectedFile.size / 1024).toFixed(1)} KB
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                                                <p className="mb-2 text-sm text-muted-foreground">
                                                    <span className="font-semibold">Click to upload</span> or drag and drop
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    CSV Files Only
                                                </p>
                                            </>
                                        )}
                                    </div>
                                    <input
                                        id="dropzone-file"
                                        type="file"
                                        className="hidden"
                                        accept=".csv"
                                        onChange={handleFileChange}
                                        disabled={importing}
                                    />
                                </label>
                            </div>
                            <Button
                                type="button"
                                className="w-full bg-amber-700 hover:bg-amber-800"
                                onClick={processImport}
                                disabled={!selectedFile || importing}
                            >
                                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {importing ? "Importing..." : "Start Import"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-t-4 border-t-amber-600">
                <CardHeader>
                    <CardTitle>Customer Details</CardTitle>
                    <CardDescription>
                        Enter the new customer's information manually.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Customer Name</Label>
                            <Input
                                id="name"
                                placeholder="Enter full name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input
                                id="phone"
                                placeholder="054XXXXXXX"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Customer Type</Label>
                        <Select
                            value={formData.type_id}
                            onValueChange={(val) => setFormData({ ...formData, type_id: val })}
                            disabled={loading || fetchingTypes}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={fetchingTypes ? "Loading types..." : "Select type"} />
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

                    <div className="space-y-2">
                        <Label htmlFor="balance">Initial Crates Balance</Label>
                        <Input
                            id="balance"
                            type="number"
                            min="0"
                            value={formData.balance}
                            onChange={(e) => setFormData({ ...formData, balance: parseInt(e.target.value) || 0 })}
                            disabled={loading}
                        />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Number of empty crates currently with the customer.
                        </p>
                    </div>

                    {customerTypes.find(t => t.id.toString() === formData.type_id)?.name === "Wholesaler" && (
                        <div className="flex items-center space-x-2 bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1">
                            <input
                                id="has-mou"
                                type="checkbox"
                                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                checked={formData.has_mou}
                                onChange={(e) => setFormData({ ...formData, has_mou: e.target.checked })}
                                disabled={loading}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label
                                    htmlFor="has-mou"
                                    className="text-sm font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-amber-900 dark:text-amber-100"
                                >
                                    Signed MOU
                                </Label>
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Allows this wholesaler to have a negative balance.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <Button
                            className="w-full md:w-auto bg-amber-700 hover:bg-amber-800 gap-2"
                            onClick={handleSaveCustomer}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {loading ? "Saving..." : "Save Customer"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
