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
import { NavLink, useLocation } from "react-router-dom"
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

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

export function AppSidebar({ className }: SidebarProps) {
    const location = useLocation();

    const menuItems = [
        {
            title: "Dashboard",
            icon: LayoutDashboard,
            href: "/dashboard",
            exact: true,
        },
        {
            title: "Customers",
            icon: Users,
            href: "/dashboard/customers",
            children: [
                { title: "Add Customer", href: "/dashboard/customers/add" },
                { title: "All Customers", href: "/dashboard/customers/all" },
                { title: "Return Empty Crates", href: "/dashboard/customers/return-crates" },
            ],
        },
        {
            title: "Crates Mgt",
            icon: Package2,
            href: "/dashboard/crates",
            children: [
                { title: "Crates Overview", href: "/dashboard/crates/overview" },
                { title: "Crates Brought In", href: "/dashboard/crates/brought-in" },
                { title: "Crates Returned", href: "/dashboard/crates/returned" },
                { title: "Return Crates", href: "/dashboard/crates/return-crates" },
            ],
        },
        {
            title: "Warehouse",
            icon: Warehouse,
            href: "/dashboard/warehouse",
            children: [
                { title: "Products", href: "/dashboard/warehouse/products" },
                { title: "Pending Orders", href: "/dashboard/warehouse/pending-orders" },
                { title: "Completed Orders", href: "/dashboard/warehouse/completed-orders" },
                { title: "Adjust Stock", href: "/dashboard/warehouse/adjust-stock" },
                { title: "Record Receivable", href: "/dashboard/warehouse/record-receivable" },
                { title: "Receivables Log", href: "/dashboard/warehouse/receivables-log" },
                { title: "Inventory Log", href: "/dashboard/warehouse/inventory-log" },
                { title: "Add Loadout", href: "/dashboard/warehouse/add-loadout" },
                { title: "Loadout", href: "/dashboard/warehouse/loadout" },
                { title: "Take Stock", href: "/dashboard/warehouse/take-stock" },
                { title: "Stock Reports", href: "/dashboard/warehouse/stock-reports" },
            ],
        },
        {
            title: "POS",
            icon: ShoppingCart,
            href: "/dashboard/pos",
            children: [
                { title: "Sale", href: "/dashboard/pos/sale" },
                { title: "Orders", href: "/dashboard/pos/orders" },
            ],
        },
        {
            title: "Reports",
            icon: FileBarChart,
            href: "/dashboard/reports",
            children: [
                { title: "Sales Report", href: "/dashboard/reports/sales" },
            ],
        },
    ]

    const SidebarContent = () => (
        <div className="flex h-full flex-col gap-2">
            <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
                <div className="flex items-center gap-2 font-semibold">
                    <Beer className="h-6 w-6 text-amber-600" />
                    <span className="">OPK Distributor</span>
                </div>
                <div className="ml-auto">
                    <ThemeToggle />
                </div>
            </div>
            <div className="flex-1 overflow-auto py-2">
                <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
                    {menuItems.map((item, index) => (
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
                    ))}
                </nav>
            </div>
            <div className="mt-auto p-4 border-t">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="w-full justify-start gap-2 px-2">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src="" />
                                <AvatarFallback>AD</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">Admin User</span>
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
                        <DropdownMenuItem className="text-red-600">
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
