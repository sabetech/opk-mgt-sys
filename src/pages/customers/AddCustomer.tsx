import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { FileSpreadsheet, Save, Upload } from "lucide-react"

export default function AddCustomer() {
    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Add Customer</h2>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <FileSpreadsheet className="h-4 w-4" />
                            Import from Excel
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Import Customers</DialogTitle>
                            <DialogDescription>
                                Upload an Excel file containing customer data.
                                <br />
                                <a href="/sample_customers.csv" download className="text-primary hover:underline">
                                    Download sample file
                                </a>
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="dropzone-file"
                                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                                        <p className="mb-2 text-sm text-muted-foreground">
                                            <span className="font-semibold">Click to upload</span> or drag and drop
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            XLSX or CSV (MAX. 10MB)
                                        </p>
                                    </div>
                                    <input id="dropzone-file" type="file" className="hidden" accept=".xlsx,.xls,.csv" />
                                </label>
                            </div>
                            <Button type="button" className="w-full">
                                Upload File
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-t-4 border-t-amber-600">
                <CardHeader>
                    <CardTitle>Customer Details</CardTitle>
                    <CardDescription>
                        Enter the new customer's information manually.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Customer Name</Label>
                            <Input id="name" placeholder="Enter full name" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input id="phone" placeholder="054XXXXXXX" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Customer Type</Label>
                        <Select>
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="retailer">Retailer</SelectItem>
                                <SelectItem value="wholesaler">Wholesaler</SelectItem>
                                <SelectItem value="retailer-vse">Retailer (VSE)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="balance">Initial Crates Balance</Label>
                        <Input id="balance" type="number" defaultValue="0" min="0" />
                        <p className="text-[0.8rem] text-muted-foreground">
                            Number of empty crates currently with the customer.
                        </p>
                    </div>

                    <div className="pt-4">
                        <Button className="w-full md:w-auto bg-amber-700 hover:bg-amber-800 gap-2">
                            <Save className="h-4 w-4" />
                            Save Customer
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
