import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_POCKETBASE_URL;
if (!url) throw new Error('Missing VITE_POCKETBASE_URL environment variable');

export const pb = new PocketBase(url);

// PocketBase stores date fields as "YYYY-MM-DD HH:mm:ss.SSSZ" (space
// separator, not the ISO "T"). Day-range bounds MUST use the same format:
// SQLite compares these values as strings, so a "T" bound never matches
// ("2026-09-19 00:00:00.000Z" < "2026-09-19T00:00:00.000Z").
export function startOfDay(date: Date | string): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().replace("T", " ");
}

export function endOfDay(date: Date | string): string {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString().replace("T", " ");
}

// Builds a PocketBase filter string for records whose `field` falls within `date`.
export function dayFilter(field: string, date: Date | string): string {
    return `${field} >= "${startOfDay(date)}" && ${field} <= "${endOfDay(date)}"`;
}

export interface BatchListOptions {
    fields?: string;
    expand?: string;
    sort?: string;
    filter?: string;
    $autoCancel?: boolean;
}

/**
 * Bulk ID lookup with URL-length safety.
 *
 * One giant `a = "1" || a = "2" || ...` filter exceeds request-URL limits
 * behind proxies (production sits behind Cloudflare) while working fine
 * locally. Always fan out through here when the ID list grows with data.
 */
export async function getFullListInBatches(
    collection: string,
    field: string,
    ids: string[],
    options?: BatchListOptions,
    chunkSize = 25
): Promise<any[]> {
    if (ids.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        chunks.push(ids.slice(i, i + chunkSize));
    }
    const pages = await Promise.all(
        chunks.map((chunk) => {
            const inner = chunk.map((id) => `${field} = "${id}"`).join(" || ");
            const { filter, ...rest } = options ?? {};
            return pb.collection(collection).getFullList({
                ...rest,
                filter: filter ? `(${filter}) && (${inner})` : inner,
            } as any);
        })
    );
    return pages.flat();
}

// Soft-deleted rows keep an empty deleted_at value.
export const NOT_DELETED = 'deleted_at = ""';