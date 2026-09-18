import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { usePendingAdjustmentCount } from "@/hooks/usePendingAdjustments"
import { toast } from "sonner"

export default function PendingApprovalBanner() {
    const { profile } = useAuth()
    const { count } = usePendingAdjustmentCount()
    const navigate = useNavigate()
    const [dismissed, setDismissed] = useState(false)
    const toastedRef = useRef(false)

    useEffect(() => {
        if (profile?.role === "admin" && count > 0 && !toastedRef.current) {
            toastedRef.current = true
            toast.warning(
                `${count} pending stock adjustment request${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} your approval`,
                {
                    action: {
                        label: "Review",
                        onClick: () => navigate("/dashboard/admin/stock-adjustment-requests"),
                    },
                    duration: 8000,
                }
            )
        }
    }, [count, profile?.role, navigate])

    if (profile?.role !== "admin" || count === 0 || dismissed) return null

    return (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="flex-1">
                <span className="font-semibold">{count} pending stock adjustment request{count === 1 ? "" : "s"}</span>{" "}
                {count === 1 ? "needs" : "need"} your approval before stock values change.
            </p>
            <Button
                size="sm"
                className="bg-amber-700 hover:bg-amber-800 shrink-0"
                onClick={() => navigate("/dashboard/admin/stock-adjustment-requests")}
            >
                Review
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setDismissed(true)}>
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
