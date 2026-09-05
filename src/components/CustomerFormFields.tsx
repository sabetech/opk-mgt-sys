import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
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
import { Save, Loader2 } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import type { CustomerType, CustomerForm } from "@/lib/customerTypes"
import { toast } from "sonner"

interface CustomerFormFieldsProps {
    onSuccess?: (customer: { id: string; name: string }) => void
}

export default function CustomerFormFields({ onSuccess }: CustomerFormFieldsProps) {
    const navigate = useNavigate()
    const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
    const [loading, setLoading] = useState(false)
    const [fetchingTypes, setFetchingTypes] = useState(true)

    const [formData, setFormData] = useState<CustomerForm>({
        name: "",
        phone: "",
        type_id: "",
        balance: 0,
        has_mou: false
    })

    useEffect(() => {
        const fetchTypes = async () => {
            try {
                const data = await pb.collection('customer_types').getFullList({ sort: 'name' })
                setCustomerTypes(data.map((t) => ({ id: t.id, name: t.name })))
            } catch (err) {
                console.error("Error fetching customer types:", err)
                toast.error("Failed to load customer types. Please try refreshing or logging in again.")
            } finally {
                setFetchingTypes(false)
            }
        }
        fetchTypes()
    }, [])

    const handleSaveCustomer = async () => {
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
            const record = await pb.collection('customers').create({
                name: formData.name,
                phone: formData.phone || null,
                type_id: formData.type_id,
                balance: formData.balance || 0,
                has_mou: formData.has_mou
            })

            toast.success("Customer saved successfully!")
            if (onSuccess) {
                onSuccess({ id: record.id, name: record.name })
            } else {
                navigate("/dashboard/customers/all")
            }
        } catch (err) {
            console.error("Error saving customer:", err)
            toast.error("Failed to save customer. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="cf-name">Customer Name</Label>
                    <Input
                        id="cf-name"
                        placeholder="Enter full name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={loading}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="cf-phone">Phone Number</Label>
                    <Input
                        id="cf-phone"
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
                <Label htmlFor="cf-balance">Initial Crates Balance</Label>
                <Input
                    id="cf-balance"
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
                        id="cf-has-mou"
                        type="checkbox"
                        className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                        checked={formData.has_mou}
                        onChange={(e) => setFormData({ ...formData, has_mou: e.target.checked })}
                        disabled={loading}
                    />
                    <div className="grid gap-1.5 leading-none">
                        <Label
                            htmlFor="cf-has-mou"
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
        </div>
    )
}
