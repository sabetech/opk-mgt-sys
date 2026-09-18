// Client helper for the AI proxy (Netlify Function -> OpenRouter).
// Never holds API keys or model IDs that matter: the proxy decides.
// All callers MUST degrade gracefully when the proxy is unavailable
// (503 no-key, network error, timeout) by using local deterministic text.

export interface AskResult {
    answer: string;
    model: string;
    /** True when the answer came from a local fallback, not the LLM. */
    isFallback: boolean;
}

const PROXY_URL = "/.netlify/functions/ai-ask";

export async function askAI(question: string, context: unknown, fallback: string, timeoutMs = 20000): Promise<AskResult> {
    try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(PROXY_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ question: question.slice(0, 1000), context }),
            signal: controller.signal,
        });
        window.clearTimeout(timer);

        if (!res.ok) return { answer: fallback, model: "local", isFallback: true };
        const data = await res.json();
        if (!data?.answer) return { answer: fallback, model: "local", isFallback: true };
        return { answer: data.answer, model: data.model ?? "proxy", isFallback: data.model === "guardrail" };
    } catch {
        return { answer: fallback, model: "local", isFallback: true };
    }
}
