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

// Mock balance data for products (would come from a crates_inventory table in real implementation)
const MOCK_PRODUCT_BALANCES: Record<number, number> = {}

export default function CratesOverview() {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [stats] = useState<CrateStats>(MOCK_CRATE_STATS)

    useEffect(() => {
        async function fetchReturnableProducts() {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, sku_name, code_name')
                    .eq('returnable', true)
                    .order('sku_name')

                if (error) throw error
                if (data) setProducts(data)
            } catch (error) {
                console.error("Error fetching returnable products:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchReturnableProducts()
    }, [])

    // Generate mock balances for products
    const getProductBalance = (productId: number): number => {
        if (!(productId in MOCK_PRODUCT_BALANCES)) {
            // Generate random balance between 0 and 500
            MOCK_PRODUCT_BALANCES[productId] = Math.floor(Math.random() * 500)
        }
        return MOCK_PRODUCT_BALANCES[productId]
    }

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

                <div className="rounded-md border bg-white dark:bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Code Name</TableHead>
                                <TableHead className="text-right">Balance (Crates)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        Loading products...
                                    </TableCell>
                                </TableRow>
                            ) : products.length > 0 ? (
                                products.map((product) => (
                                    <TableRow key={product.id}>
                                        <TableCell className="font-medium">
                                            {product.sku_name}
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono text-sm">
                                                {product.code_name || "—"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {getProductBalance(product.id)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
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
