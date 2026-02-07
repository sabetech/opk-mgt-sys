import { useState } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// Mock Data
const LOADOUT_DATA = [
    { id: 1, vseName: "John Doe (VSE 1)", given: 500, sold: 450, returned: 50, balance: 0 },
    { id: 2, vseName: "Sarah Smith (VSE 2)", given: 300, sold: 200, returned: 50, balance: 50 },
    { id: 3, vseName: "Michael Brown (VSE 3)", given: 450, sold: 400, returned: 40, balance: 10 },
    { id: 4, vseName: "Emily White (VSE 4)", given: 600, sold: 580, returned: 20, balance: 0 },
    { id: 5, vseName: "David Wilson (VSE 5)", given: 350, sold: 150, returned: 150, balance: 50 },
]

export default function Loadout() {
    const [date, setDate] = useState<Date | undefined>(new Date())
    const [calendarOpen, setCalendarOpen] = useState(false)

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Loadout Summary</h2>
                    <p className="text-muted-foreground">
                        Daily summary of VSE sales performance.
                    </p>
                </div>
            </div>

            {/* Date Selector */}
            <div className="flex justify-start">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn(
                                "w-[240px] justify-start text-left font-normal",
                                !date && "text-muted-foreground"
                            )}
                            onClick={() => setCalendarOpen(true)}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <DatePicker
                            value={date}
                            onChange={(newDate) => {
                                setDate(newDate)
                                setCalendarOpen(false)
                            }}
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Loadout Table */}
            <Card>
                <CardHeader>
                    <CardTitle>VSE Performance</CardTitle>
                    <CardDescription>
                        Overview of products given, sold, and returned by each VSE.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name of VSE</TableHead>
                                <TableHead className="text-right">Quantity Given</TableHead>
                                <TableHead className="text-right">Quantity Sold</TableHead>
                                <TableHead className="text-right">Quantity Returned</TableHead>
                                <TableHead className="text-right">Outstanding Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {LOADOUT_DATA.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">{row.vseName}</TableCell>
                                    <TableCell className="text-right">{row.given}</TableCell>
                                    <TableCell className="text-right">{row.sold}</TableCell>
                                    <TableCell className="text-right">{row.returned}</TableCell>
                                    <TableCell className={cn(
                                        "text-right font-bold",
                                        row.balance > 0 ? "text-red-500" : "text-green-500"
                                    )}>
                                        {row.balance}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
