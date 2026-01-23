import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import bgImage from "@/assets/guinness-bg.png"

export default function Login() {
    return (
        <div
            className="min-h-screen flex items-center justify-center bg-cover bg-center"
            style={{ backgroundImage: `url(${bgImage})` }}
        >
            {/* Overlay for better readability if needed, though the image is already blurred/darkened */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

            <Card className="w-full max-w-md relative z-10 bg-white/90 dark:bg-slate-950/90 border-amber-900/20 shadow-2xl backdrop-blur-md">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-3xl font-bold tracking-tight text-amber-950 dark:text-amber-500">
                        Oppong Kyekyeku Guinness Distributor
                    </CardTitle>
                    <CardDescription className="text-amber-900/60 dark:text-amber-400/60">
                        Enter your credentials to access the portal
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="m@example.com" className="border-amber-900/20 focus-visible:ring-amber-500" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" className="border-amber-900/20 focus-visible:ring-amber-500" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button className="w-full bg-amber-900 hover:bg-amber-800 text-white font-semibold">
                        Sign In
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
