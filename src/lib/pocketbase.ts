import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_POCKETBASE_URL;
if (!url) throw new Error('Missing VITE_POCKETBASE_URL environment variable');

export const pb = new PocketBase(url);

// PocketBase stores date fields as RFC3339 strings. For day-range filters we
// need explicit start/end-of-day ISO bounds.
export function startOfDay(date: Date | string): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

export function endOfDay(date: Date | string): string {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
}

// Builds a PocketBase filter string for records whose `field` falls within `date`.
export function dayFilter(field: string, date: Date | string): string {
    return `${field} >= "${startOfDay(date)}" && ${field} <= "${endOfDay(date)}"`;
}

// Soft-deleted rows keep an empty deleted_at value.
export const NOT_DELETED = 'deleted_at = ""';