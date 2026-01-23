import { Outlet } from "react-router-dom"
import { AppSidebar } from "@/components/AppSidebar"

export default function DashboardLayout() {
    return (
        <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
            <AppSidebar />
            <div className="flex flex-col">
                {/* Mobile header spacer if needed, or put global search/header here */}
                {/* For now, just the content */}
                <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 pt-16 md:pt-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
