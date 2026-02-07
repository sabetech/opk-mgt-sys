import { useState, useEffect } from "react"
import { Package2, PackageOpen, PackagePlus, Users, Building2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/supabase"

interface Product {
    id: number
    sku_name: string
    code_name: string
    full_quantity: number
    empty_quantity: number
}

interface CrateStats {
    total: number
    empty: number
    full: number
    inTrade: number
    ownedByOPK: number
}

// Mock data for crate statistics (since backend doesn't exist yet)
const MOCK_CRATE_STATS: CrateStats = {
    total: 12450,
    empty: 3200,
    full: 5800,
    inTrade: 2950,
    ownedByOPK: 500,
}

export default function CratesOverview() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [stats] = useState<CrateStats>(MOCK_CRATE_STATS)

    useEffect(() => {
        async function fetchCrateData() {
            try {
                // Fetch products with their stock and empties data
                const { data, error } = await supabase
                    .from('products')
                    .select(`
                        id, 
                        sku_name, 
                        code_name,
                        warehouse_stock (quantity),
                        empties (quantity_on_ground)
                    `)
                    .eq('returnable', true)
                    .order('sku_name')

                if (error) throw error

                if (data) {
                    const mappedProducts: Product[] = data.map((item: any) => ({
                        id: item.id,
                        sku_name: item.sku_name,
                        code_name: item.code_name,
                        full_quantity: item.warehouse_stock?.[0]?.quantity || 0,
                        empty_quantity: item.empties?.[0]?.quantity_on_ground || 0
                    }))
                    setProducts(mappedProducts)
                }
            } catch (error) {
                console.error("Error fetching crate data:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchCrateData()
    }, [])

    const statsCards = [
        {
            title: "Total Crates",
            value: stats.total.toLocaleString(),
            icon: Package2,
            color: "text-blue-600",
            bgColor: "bg-blue-50",
        },
        {
            title: "Crates with Empty Bottles",
            value: stats.empty.toLocaleString(),
            icon: PackageOpen,
            color: "text-amber-600",
            bgColor: "bg-amber-50",
        },
        {
            title: "Crates with Full Bottles",
            value: stats.full.toLocaleString(),
            icon: PackagePlus,
            color: "text-green-600",
            bgColor: "bg-green-50",
        },
        {
            title: "Crates in Trade",
            value: stats.inTrade.toLocaleString(),
            icon: Users,
            color: "text-purple-600",
            bgColor: "bg-purple-50",
        },
        {
            title: "Crates Owned by OPK",
            value: stats.ownedByOPK.toLocaleString(),
            icon: Building2,
            color: "text-indigo-600",
            bgColor: "bg-indigo-50",
        },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Crates Overview</h2>
                <p className="text-muted-foreground">
                    Monitor crate inventory and returnable products
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {statsCards.map((card, index) => (
                    <Card key={index}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {card.title}
                            </CardTitle>
                            <div className={`${card.bgColor} p-2 rounded-lg`}>
                                <card.icon className={`h-4 w-4 ${card.color}`} />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Returnable Products Table */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-xl font-semibold">Returnable Products Balance</h3>
                    <p className="text-sm text-muted-foreground">
                        Current quantity of crates for each returnable product
                    </p>
                </div>

                <div className="rounded-md border bg-white dark:bg-card overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[30%]">Product Name</TableHead>
                                <TableHead>Code Name</TableHead>
                                <TableHead className="text-right">Crates with Full bottles</TableHead>
                                <TableHead className="text-right">Crates with Empty bottles</TableHead>
                                <TableHead className="text-right font-bold">Total Empties</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            Loading crate inventory...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : products.length > 0 ? (
                                products.map((product) => {
                                    const totalEmpties = product.full_quantity + product.empty_quantity
                                    return (
                                        <TableRow key={product.id} className="hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-medium">
                                                {product.sku_name}
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {product.code_name || "—"}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {product.full_quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {product.empty_quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-primary">
                                                {totalEmpties.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No returnable products found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    )
}
