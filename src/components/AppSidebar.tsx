import {
    Beer,
    LayoutDashboard,
    Users,
    Package2,
    Warehouse,
    ShoppingCart,
    FileBarChart,
    ChevronDown,
    Menu,
    LogOut,
    User
} from "lucide-react"
import { useNavigate, NavLink, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/context/AuthContext"
import { toast } from "sonner"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function AppSidebar({ className }: SidebarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { profile, loading, signOut } = useAuth();

    const handleLogout = async () => {
        try {
            await signOut();
            toast.success("Logged out successfully");
            navigate("/login");
        } catch (error: any) {
            console.error("Logout error:", error);
            toast.error(error.message || "Failed to log out");
        }
    };

    const menuItems = [
        {
            title: "Dashboard",
            icon: LayoutDashboard,
            href: "/dashboard",
            exact: true,
            roles: ["admin", "empties_manager", "operations_manager", "sales_manager", "cashier", "auditor"]
        },
        {
            title: "Customers",
            icon: Users,
            href: "/dashboard/customers",
            roles: ["admin", "empties_manager", "sales_manager", "auditor"],
            children: [
                { title: "Add Customer", href: "/dashboard/customers/add", roles: ["admin", "empties_manager", "sales_manager"] },
                { title: "All Customers", href: "/dashboard/customers/all", roles: ["admin", "empties_manager", "sales_manager", "auditor"] },
                { title: "Return Empty Crates", href: "/dashboard/customers/return-crates", roles: ["admin", "empties_manager", "sales_manager"] },
            ],
        },
        {
            title: "Crates Mgt",
            icon: Package2,
            href: "/dashboard/crates",
            roles: ["admin", "empties_manager", "auditor"],
            children: [
                { title: "Crates Overview", href: "/dashboard/crates/overview", roles: ["admin", "empties_manager", "auditor"] },
                { title: "Crates Brought In", href: "/dashboard/crates/brought-in", roles: ["admin", "empties_manager", "auditor"] },
                { title: "Crates Returned", href: "/dashboard/crates/returned", roles: ["admin", "empties_manager", "auditor"] },
                { title: "Return Crates", href: "/dashboard/crates/return-crates", roles: ["admin", "empties_manager"] },
            ],
        },
        {
            title: "Warehouse",
            icon: Warehouse,
            href: "/dashboard/warehouse",
            roles: ["admin", "operations_manager", "auditor"],
            children: [
                { title: "Products", href: "/dashboard/warehouse/products", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Pending Orders", href: "/dashboard/warehouse/pending-orders", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Completed Orders", href: "/dashboard/warehouse/completed-orders", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Adjust Stock", href: "/dashboard/warehouse/adjust-stock", roles: ["admin", "operations_manager"] },
                { title: "Record Receivable", href: "/dashboard/warehouse/record-receivable", roles: ["admin", "operations_manager"] },
                { title: "Receivables Log", href: "/dashboard/warehouse/receivables-log", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Inventory Log", href: "/dashboard/warehouse/inventory-log", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Add Loadout", href: "/dashboard/warehouse/add-loadout", roles: ["admin", "operations_manager"] },
                { title: "Loadout", href: "/dashboard/warehouse/loadout", roles: ["admin", "operations_manager", "auditor"] },
                { title: "Take Stock", href: "/dashboard/warehouse/take-stock", roles: ["admin", "operations_manager"] },
                { title: "Breakages", href: "/dashboard/warehouse/breakages", roles: ["admin", "operations_manager"] },
                { title: "Stock Reports", href: "/dashboard/warehouse/stock-reports", roles: ["admin", "operations_manager", "auditor"] },
            ],
        },
        {
            title: "POS",
            icon: ShoppingCart,
            href: "/dashboard/pos",
            roles: ["admin", "sales_manager", "cashier", "auditor"],
            children: [
                { title: "Sale", href: "/dashboard/pos/sale", roles: ["admin", "sales_manager"] },
                { title: "Orders", href: "/dashboard/pos/orders", roles: ["admin", "cashier", "auditor"] },
            ],
        },
        {
            title: "Reports",
            icon: FileBarChart,
            href: "/dashboard/reports",
            roles: ["admin", "sales_manager", "cashier", "auditor"],
            children: [
                { title: "Sales Report", href: "/dashboard/reports/sales", roles: ["admin", "sales_manager", "cashier", "auditor"] },
            ],
        },
        {
            title: "Admin",
            icon: User,
            href: "/dashboard/admin",
            roles: ["admin"],
            children: [
                { title: "Add User", href: "/dashboard/admin/add-user", roles: ["admin"] },
            ],
        },
    ]

    const filteredMenuItems = menuItems.filter(item => {
        if (!item.roles) return true;
        if (loading) return false;
        if (!profile) return false;
        return item.roles.includes(profile.role);
    }).map(item => ({
        ...item,
        children: item.children?.filter(child => {
            if (!child.roles) return true;
            if (loading) return false;
            if (!profile) return false;
            return child.roles.includes(profile.role);
        })
    }))

    const SidebarContent = () => (
        <div className="flex h-full flex-col gap-2">
            <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
                <div className="flex items-center gap-2 font-semibold">
                    <Beer className="h-6 w-6 text-amber-600" />
                    <span className="">OPK Distributor</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {profile && (
                        <div className="hidden lg:block text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full capitalize font-bold">
                            {profile.role.replace('_', ' ')}
                        </div>
                    )}
                    <ThemeToggle />
                </div>
            </div>
            <div className="flex-1 overflow-auto py-2">
                <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                            <ThemeToggle />
                            <span className="text-xs italic">Loading menu...</span>
                        </div>
                    ) : !profile ? (
                        <div className="px-3 py-6 text-center space-y-4">
                            <p className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded border border-red-100">
                                Profile not found. Please contact admin or try logging in again.
                            </p>
                            <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    ) : (
                        filteredMenuItems.map((item, index) => (
                            item.children ? (
                                <Collapsible
                                    key={index}
                                    defaultOpen={location.pathname.startsWith(item.href || "")}
                                    className="group/collapsible"
                                >
                                    <CollapsibleTrigger asChild>
                                        <div className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary cursor-pointer",
                                            location.pathname.startsWith(item.href || "") ? "bg-muted text-primary" : ""
                                        )}>
                                            <item.icon className="h-4 w-4" />
                                            {item.title}
                                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <div className="ml-6 mt-1 flex flex-col gap-1 border-l pl-2">
                                            {item.children.map((child, childIndex) => (
                                                <NavLink
                                                    key={childIndex}
                                                    to={child.href}
                                                    className={({ isActive }) =>
                                                        cn(
                                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
                                                            isActive ? "bg-muted text-primary font-medium" : ""
                                                        )
                                                    }
                                                >
                                                    {child.title}
                                                </NavLink>
                                            ))}
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            ) : (
                                <NavLink
                                    key={index}
                                    to={item.href}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary",
                                            isActive ? "bg-muted text-primary" : ""
                                        )
                                    }
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.title}
                                </NavLink>
                            )
                        ))
                    )}
                </nav>
            </div>
            <div className="mt-auto p-4 border-t">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start gap-2 px-2">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src="" />
                                <AvatarFallback>
                                    {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AD'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col items-start">
                                <span className="text-sm font-medium leading-none">
                                    {profile?.full_name || 'Admin User'}
                                </span>
                                <span className="text-[10px] text-muted-foreground capitalize">
                                    {profile?.role?.replace('_', ' ') || 'Admin'}
                                </span>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <User className="mr-2 h-4 w-4" />
                            Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {profile?.role === 'admin' && (
                            <DropdownMenuItem onClick={() => navigate("/dashboard/admin/manage-users")} className="cursor-pointer">
                                <Users className="mr-2 h-4 w-4" />
                                Manage Users
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600 cursor-pointer" onSelect={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Logout
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <div className={cn("hidden border-r bg-muted/40 md:block", className)}>
                <SidebarContent />
            </div>

            {/* Mobile Sidebar */}
            <Sheet>
                <SheetTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 md:hidden fixed left-4 top-4 z-40 bg-background"
                    >
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col p-0">
                    <SheetTitle className="px-4 py-2 border-b text-left sr-only">Navigation Menu</SheetTitle>
                    <SheetDescription className="sr-only">Main Navigation</SheetDescription>
                    <SidebarContent />
                </SheetContent>
            </Sheet>
        </>
    )
}
