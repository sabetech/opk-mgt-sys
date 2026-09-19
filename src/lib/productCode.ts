import { pb } from "./pocketbase";

/**
 * Unique product codes.
 *
 * `code_name` (SKU Code) is a *shared category label* (e.g. "ALV P" covers
 * several Alvaro products) and must never be treated as unique. Each product
 * instead gets a generated `product_code` of the form `<PREFIX>-<SEQ>`, where
 * PREFIX derives from the category label and SEQ is a per-prefix counter:
 *   "ALV P" -> ALVP-001, ALVP-002, ...
 *   "H/L KEG" -> HLKEG-001, ...
 *   (blank category) -> PRD-001, ...
 */

/** Strip a category label down to an uppercase alphanumeric prefix. */
export function buildProductPrefix(codeName?: string | null, fallback = "PRD"): string {
    const cleaned = (codeName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return cleaned || fallback;
}

export function formatProductCode(prefix: string, seq: number): string {
    return `${prefix}-${String(seq).padStart(3, "0")}`;
}

/** Next free code for a prefix given already-taken codes (pure, testable). */
export function nextProductCode(prefix: string, existingCodes: (string | null | undefined)[]): string {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}-(\\d+)$`, "i");
    let max = 0;
    for (const c of existingCodes) {
        if (!c) continue;
        const m = c.trim().match(re);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return formatProductCode(prefix, max + 1);
}

/** Primary code display: unique code first, category fallback for legacy rows. */
export function displayProductCode(p: { product_code?: string | null; code_name?: string | null }): string {
    return p.product_code || p.code_name || "N/A";
}

/**
 * Query PocketBase for the next free code under a category label.
 * Requires the `product_code` field migration to have run (see setup script).
 */
export async function assignProductCode(codeName?: string | null): Promise<string> {
    const prefix = buildProductPrefix(codeName);
    try {
        const rows = await pb.collection("products").getFullList({
            filter: `product_code ~ "${prefix}-"`,
            fields: "product_code",
        });
        return nextProductCode(prefix, rows.map((r) => r.product_code));
    } catch {
        // Field may not exist yet on older DBs — caller should run the migration.
        return formatProductCode(prefix, 1);
    }
}
