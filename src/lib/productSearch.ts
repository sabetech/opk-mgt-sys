import Fuse from "fuse.js";

export interface SearchableProduct {
    id: string;
    sku_name: string;
    code_name?: string | null;
}

export interface ProductMatch {
    product: SearchableProduct;
    /** 0 = exact, higher = fuzzier. Only matches under threshold are returned. */
    score: number;
}

const FUSE_OPTIONS = {
    keys: [
        { name: "sku_name", weight: 0.7 },
        { name: "code_name", weight: 0.3 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
};

/** Typo-tolerant product lookup. Exact substring hits always rank first. */
export function searchProducts(products: SearchableProduct[], query: string, limit = 8): ProductMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const exact = products
        .filter((p) => p.sku_name.toLowerCase().includes(q) || (p.code_name || "").toLowerCase().includes(q))
        .map((product) => ({ product, score: 0 }));
    if (exact.length >= limit) return exact.slice(0, limit);

    const fuse = new Fuse(products, FUSE_OPTIONS);
    const fuzzy = fuse
        .search(query.trim())
        .filter((r) => !exact.some((e) => e.product.id === r.item.id))
        .map((r) => ({ product: r.item, score: r.score ?? 1 }));
    return [...exact, ...fuzzy].slice(0, limit);
}

/** Best single suggestion for "Did you mean…?" prompts. Null when nothing close. */
export function suggestProduct(products: SearchableProduct[], query: string): SearchableProduct | null {
    const hits = searchProducts(products, query, 1);
    return hits.length > 0 ? hits[0].product : null;
}
