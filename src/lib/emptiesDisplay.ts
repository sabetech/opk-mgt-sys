import { pb } from "./pocketbase";

export type EmptiesDisplayMode = "debit" | "raw";

/**
 * How empties balances are shown on read-only screens (customer list,
 * history sheet). Stored values are credit-scale (purchases subtract),
 * while the business reads debit-scale (positive = crates the customer
 * owes, negative = credit with OPK).
 *
 * - "debit" (default): negate for display and append Dr/Cr, so screens
 *   match the empties-balance spreadsheet.
 * - "raw": show stored values exactly as kept.
 *
 * Operational screens (POS checkout) always use stored-scale math and are
 * unaffected by this setting.
 */
export async function fetchEmptiesDisplayMode(): Promise<EmptiesDisplayMode> {
    try {
        const record = await pb
            .collection("app_settings")
            .getFirstListItem('key = "empties_display"');
        const mode = (record.value as { mode?: unknown } | null)?.mode;
        return mode === "raw" ? "raw" : "debit";
    } catch {
        return "debit";
    }
}

export interface FormattedEmpties {
    text: string;
    tone: "debit" | "credit" | "zero";
}

export function formatEmptiesBalance(
    stored: number,
    mode: EmptiesDisplayMode
): FormattedEmpties {
    const value = mode === "debit" ? -stored : stored;
    if (value > 0)
        return {
            text: mode === "debit" ? `${value} Dr` : `${value}`,
            tone: "debit",
        };
    if (value < 0)
        return {
            text: mode === "debit" ? `${Math.abs(value)} Cr` : `${value}`,
            tone: "credit",
        };
    return { text: "0", tone: "zero" };
}
