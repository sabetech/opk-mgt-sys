import { useState } from "react"
import { Sparkles, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { askAI } from "@/lib/aiClient"
import { answerLocally, type SalesSummary } from "@/lib/askData"

interface AskDataProps {
    /** Fresh summary of the currently filtered rows (recomputed by parent). */
    summary: SalesSummary;
}

const SUGGESTIONS = [
    "What are total sales for this period?",
    "Who are the top customers?",
    "Which products sell best?",
    "What is the average order value?",
];

export default function AskData({ summary }: AskDataProps) {
    const [open, setOpen] = useState(false)
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState<string | null>(null)
    const [model, setModel] = useState<string | null>(null)
    const [isFallback, setIsFallback] = useState(false)
    const [asking, setAsking] = useState(false)

    const handleAsk = async (q: string) => {
        const query = q.trim()
        if (!query || asking) return
        setAsking(true)
        setQuestion(query)
        try {
            // Instant deterministic answer first — zero LLM cost.
            const local = answerLocally(query, summary)
            if (local) {
                setAnswer(local)
                setModel("local")
                setIsFallback(false)
                return
            }
            // Open-ended: OpenRouter proxy with the pre-aggregated summary as context.
            const result = await askAI(
                query,
                { range: summary.rangeLabel, ...summary },
                "The AI service is unavailable right now. Try one of the suggested questions for an instant summary.",
            )
            setAnswer(result.answer)
            setModel(result.model)
            setIsFallback(result.isFallback)
        } finally {
            setAsking(false)
        }
    }

    if (!open) {
        return (
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Ask about this report
            </Button>
        )
    }

    return (
        <Card className="border-amber-200 dark:border-amber-900">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-600" />
                        Ask about this report
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                        Close
                    </Button>
                </div>
                <CardDescription>
                    Instant answers for totals, tops and averages. Anything else goes to AI with only this filtered summary — never raw records.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => handleAsk(s)}
                            disabled={asking}
                            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleAsk(question)
                    }}
                >
                    <Input
                        placeholder="e.g. How are wholesalers doing vs retailers?"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        disabled={asking}
                    />
                    <Button type="submit" disabled={asking || !question.trim()} className="gap-1.5">
                        {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Ask
                    </Button>
                </form>
                {answer && (
                    <div className="rounded-md bg-muted/30 p-3 text-sm space-y-2">
                        <div className="flex items-center gap-2">
                            <Badge variant={model === "local" ? "secondary" : "outline"}>
                                {model === "local" ? "Instant" : `AI · ${model}`}
                            </Badge>
                            {isFallback && model !== "local" && (
                                <span className="text-xs text-muted-foreground">AI unavailable — fallback text</span>
                            )}
                        </div>
                        <p className="whitespace-pre-line leading-relaxed">{answer}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
