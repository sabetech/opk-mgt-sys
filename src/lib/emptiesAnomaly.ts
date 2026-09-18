// Empties variance anomaly scoring. Pure functions — no PocketBase, no LLM.
// Scores a single count line from its frozen take values plus live drift,
// so the report can surface the lines most likely to indicate loss.

export type AnomalySeverity = "info" | "warn" | "critical";

export interface AnomalyInput {
    systemAtTake: number;
    counted: number;
    varianceAtTake: number;
    /** Live on-ground minus counted (movement since the take). */
    drift: number;
    /** Number of recent takes where this product also had non-zero variance. */
    repeatOffenses?: number;
}

export interface AnomalyResult {
    score: number;
    severity: AnomalySeverity;
    flags: string[];
    /** Deterministic plain-English explanation (works offline; AI layered on top). */
    explanation: string;
}

const RATIO_WARN = 0.1;
const RATIO_CRITICAL = 0.3;
const DRIFT_WARN = 10;
const DRIFT_CRITICAL = 30;
const ABS_WARN = 12;
const ABS_CRITICAL = 40;

/**
 * Score one comparison row. Returns info for exact matches so callers can
 * filter to warn/critical for the "flagged only" view.
 */
export function scoreEmptiesRow(input: AnomalyInput, productName = "This product"): AnomalyResult {
    const { systemAtTake, counted, varianceAtTake, drift } = input;
    const flags: string[] = [];
    let score = 0;

    const base = Math.max(systemAtTake, 1);
    const ratio = Math.abs(varianceAtTake) / base;
    const abs = Math.abs(varianceAtTake);
    const driftAbs = Math.abs(drift);

    if (varianceAtTake === 0 && driftAbs === 0) {
        return { score: 0, severity: "info", flags: [], explanation: `${productName} matched the system count exactly with no movement since.` };
    }

    if (ratio >= RATIO_CRITICAL || abs >= ABS_CRITICAL) {
        score += 50;
        flags.push("large variance");
    } else if (ratio >= RATIO_WARN || abs >= ABS_WARN) {
        score += 25;
        flags.push("notable variance");
    } else if (varianceAtTake !== 0) {
        score += 10;
        flags.push("small variance");
    }

    if (driftAbs >= DRIFT_CRITICAL) {
        score += 30;
        flags.push("heavy drift since take");
    } else if (driftAbs >= DRIFT_WARN) {
        score += 15;
        flags.push("drift since take");
    }

    // Variance and drift in the same direction compounds suspicion (e.g.
    // counted short AND stock kept falling afterwards).
    if (varianceAtTake !== 0 && drift !== 0 && Math.sign(varianceAtTake) === Math.sign(drift)) {
        score += 10;
        flags.push("trend continuing");
    }

    const repeats = input.repeatOffenses ?? 0;
    if (repeats > 0 && varianceAtTake !== 0) {
        score += Math.min(20, repeats * 10);
        flags.push(repeats === 1 ? "repeated 2 takes running" : `repeated ${repeats + 1} takes running`);
    }

    score = Math.min(100, score);
    const severity: AnomalySeverity = score >= 60 ? "critical" : score >= 25 ? "warn" : "info";

    const direction = varianceAtTake > 0 ? "over" : "under";
    const parts = [
        `${productName}: counted ${counted} vs system ${systemAtTake} (${direction} by ${abs}).`,
    ];
    if (driftAbs > 0) {
        parts.push(`Since the take, on-ground moved ${drift > 0 ? "+" : ""}${drift} to ${counted + drift}.`);
    }
    if (varianceAtTake < 0) {
        parts.push("Possible unlogged customer returns or misplaced crates — check empties_log around the take date.");
    } else if (varianceAtTake > 0) {
        parts.push("Possible double-counted stacks or unlogged supplier receipts — verify the yard sections.");
    }

    return { score, severity, flags, explanation: parts.join(" ") };
}

/** Convenience: fraction of rows flagged warn or worse. */
export function flaggedShare(results: AnomalyResult[]): number {
    if (results.length === 0) return 0;
    return results.filter((r) => r.severity !== "info").length / results.length;
}
