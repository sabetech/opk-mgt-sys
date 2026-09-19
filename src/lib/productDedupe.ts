import { searchProducts, type SearchableProduct } from "./productSearch";

export interface DuplicateWarning {
    kind: "near_dupe_name" | "price_outlier";
    message: string;
    /** ID of the existing product involved (for near-dupe). */
    existingId?: string;
}

export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Warn-only duplicate/quality checks for a product form or CSV row.
 * NEVER merges — callers display warnings and let staff decide.
 *
 * NOTE: code_name (SKU Code) is a shared *category* label, not a unique
 * identifier, so re-use across products is normal and never warned about.
 * Uniqueness lives in the generated product_code field instead.
 */
export function checkProductDuplicates(
    candidate: { sku_name: string; code_name?: string | null; wholesale_price?: number | null; retail_price?: number | null },
    existing: SearchableProduct[],
    selfId?: string,
): DuplicateWarning[] {
    const warnings: DuplicateWarning[] = [];
    const pool = selfId ? existing.filter((p) => p.id !== selfId) : existing;

    const normCandidate = normalizeName(candidate.sku_name);
    if (normCandidate) {
        const exactName = pool.find((p) => normalizeName(p.sku_name) === normCandidate);
        if (exactName) {
            warnings.push({
                kind: "near_dupe_name",
                message: `A product with the same name already exists: "${exactName.sku_name}".`,
                existingId: exactName.id,
            });
        } else {
            // Fuzzy near-dupe (typos, spacing, abbreviations)
            const fuzzy = searchProducts(pool, candidate.sku_name, 3).filter(
                (m) => m.score > 0 && m.score < 0.25,
            );
            for (const m of fuzzy.slice(0, 2)) {
                warnings.push({
                    kind: "near_dupe_name",
                    message: `Similar product exists: "${m.product.sku_name}"${m.product.code_name ? ` (${m.product.code_name})` : ""}. Is this a duplicate?`,
                    existingId: m.product.id,
                });
            }
        }
    }

    const ws = candidate.wholesale_price ?? null;
    const rt = candidate.retail_price ?? null;
    if (ws !== null && rt !== null && ws > 0 && rt > 0 && ws > rt) {
        warnings.push({
            kind: "price_outlier",
            message: `Wholesale price (GHc ${ws.toFixed(2)}) is above retail price (GHc ${rt.toFixed(2)}).`,
        });
    }
    if ((ws !== null && ws === 0) || (rt !== null && rt === 0)) {
        warnings.push({ kind: "price_outlier", message: "A price is GHc 0.00 — confirm this is intentional." });
    }

    return warnings;
}
