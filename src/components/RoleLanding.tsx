import { Navigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import DashboardOverview from "@/pages/DashboardOverview"

/** Role-aware post-login landing. Everyone else sees the dashboard. */
export default function RoleLanding() {
    const { profile, loading } = useAuth()

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (profile?.role === "vse") {
        return <Navigate to="/dashboard/field-sales/record" replace />
    }
    if (profile?.role === "account_manager") {
        return <Navigate to="/dashboard/approvals/vse-sales" replace />
    }
    return <DashboardOverview />
}
