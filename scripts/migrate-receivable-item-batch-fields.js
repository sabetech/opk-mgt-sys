// One-off migration: add batch_number (text) + expiry_date (date) to the
// existing `inventory_receivable_items` collection, then backfill each item
// from its parent `inventory_receivables` record (batch/expiry used to live
// on the delivery record). Items whose parent has no value are left blank —
// the fields are optional at the PB level and the app enforces them for new
// records only.
//
// Usage:
//   PB_URL=https://<host> PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//     node scripts/migrate-receivable-item-batch-fields.js [--dry-run]

import PocketBase from 'pocketbase';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const PB_URL = process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;

if (!EMAIL || !PASSWORD) {
    console.error('Error: PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars are required.');
    process.exit(1);
}

const pb = new PocketBase(PB_URL);

// Cloudflare (error 1010) blocks non-browser clients on the hosted server,
// so send a browser User-Agent on every request (same as setup-pocketbase.js).
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, init = {}) =>
    origFetch(url, {
        ...init,
        headers: { ...(init.headers || {}), 'User-Agent': BROWSER_UA },
    });

function textField(name) {
    return {
        system: false, name, type: 'text', required: false, unique: false,
        presentable: false, max: 0, min: 0, pattern: '', autogeneratePattern: '', primaryKey: false,
    };
}

function dateField(name) {
    return { system: false, name, type: 'date', required: false, min: '', max: '' };
}

async function getFullList(collection, options) {
    const records = [];
    let page = 1;
    for (;;) {
        const batch = await pb.collection(collection).getList(page, 500, options);
        records.push(...batch.items);
        if (batch.page >= batch.totalPages) break;
        page += 1;
    }
    return records;
}

try {
    await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);

    // 1. Ensure the fields exist on inventory_receivable_items
    const itemsCollection = await pb.collections.getOne('inventory_receivable_items');
    const existing = new Set((itemsCollection.fields || []).map((f) => f.name));

    const missing = [];
    if (!existing.has('batch_number')) missing.push(textField('batch_number'));
    if (!existing.has('expiry_date')) missing.push(dateField('expiry_date'));

    if (missing.length === 0) {
        console.log('[ok] inventory_receivable_items already has batch_number + expiry_date.');
    } else {
        console.log(`[plan] adding fields: ${missing.map((f) => f.name).join(', ')}`);
        if (dryRun) {
            console.log('[dry-run] no changes made.');
        } else {
            await pb.collections.update(itemsCollection.id, {
                fields: [...itemsCollection.fields, ...missing],
            });
            console.log('[ok] fields added.');
        }
    }

    // 2. Backfill items from their parent receivable's legacy batch/expiry.
    const items = await getFullList('inventory_receivable_items', {
        fields: 'id, receivable_id, batch_number, expiry_date',
    });
    const receivables = await getFullList('inventory_receivables', {
        fields: 'id, batch_number, expiry_date',
    });

    const parentById = new Map(receivables.map((r) => [r.id, r]));
    let backfilled = 0;
    let skipped = 0;
    let blankParent = 0;

    for (const item of items) {
        const parent = parentById.get(
            typeof item.receivable_id === 'string' ? item.receivable_id : item.receivable_id?.id,
        );
        const batch = parent?.batch_number || '';
        const expiry = parent?.expiry_date || '';

        if (!batch && !expiry) {
            blankParent += 1;
            continue;
        }
        if (item.batch_number === batch && item.expiry_date === expiry) {
            skipped += 1;
            continue;
        }

        if (!dryRun) {
            await pb.collection('inventory_receivable_items').update(item.id, {
                batch_number: batch,
                expiry_date: expiry,
            });
        }
        backfilled += 1;
    }

    console.log(`[ok] backfill ${dryRun ? 'plan' : 'complete'}: ${backfilled} ${dryRun ? 'to update' : 'updated'}, ${skipped} already up to date, ${blankParent} left blank (parent had no batch/expiry).`);
    if (dryRun) {
        console.log('[dry-run] no changes made.');
        process.exit(0);
    }

    console.log('[ok] migration complete.');
} catch (err) {
    console.error('[fail]', err?.message || err);
    process.exit(1);
}
