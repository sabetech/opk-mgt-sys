import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { pb } from "@/lib/pocketbase"
import FieldSaleForm from "@/components/field-sale-form"
import { toast } from "sonner"

export default function RecordFieldSale() {
    const { user } = useAuth()
    const vseCustomerId: string = (user as any)?.vse_customer_id || ""
    const [vseName, setVseName] = useState("")
    const [loadingVse, setLoadingVse] = useState(true)
    const [formKey, setFormKey] = useState(0)

    useEffect(() => {
        if (!vseCustomerId) {
            setLoadingVse(false)
            return
        }
        let cancelled = false
        pb.collection('customers')
            .getOne(vseCustomerId, { fields: 'id, name' })
            .then((c) => {
                if (!cancelled) setVseName(c.name)
            })
            .catch(() => {
                if (!cancelled) toast.error('Failed to load your VSE profile')
            })
            .finally(() => {
                if (!cancelled) setLoadingVse(false)
            })
        return () => {
            cancelled = true
        }
    }, [vseCustomerId])

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Record Field Sale</h2>
                <p className="text-sm text-muted-foreground">
                    Enter what you sold today. It goes for approval before it counts.
                </p>
            </div>

            {loadingVse ? (
                <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">Loading...</p>
                </div>
            ) : !vseCustomerId ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    No VSE customer is linked to this login. Please contact your admin.
                </div>
            ) : (
                <FieldSaleForm
                    key={formKey}
                    vseCustomerId={vseCustomerId}
                    vseCustomerName={vseName || "Your route"}
                    submitLabel="Submit for Approval"
                    onSaved={() => setFormKey((k) => k + 1)}
                />
            )}
        </div>
    )
}
