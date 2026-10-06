// One-off migration: add batch_number (text) + expiry_date (date) to the
// existing `inventory_receivables` collection without touching data.
// (scripts/setup-pocketbase.js only creates missing collections, so it
// cannot migrate production. The old num_of_pallets / num_of_pcs columns
// are left in place intentionally — historical rows keep their values and
// the app no longer reads them; drop them via the admin UI if desired.)
//
// Usage:
//   PB_URL=https://<host> PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//     node scripts/migrate-receivable-batch-fields.js [--dry-run]

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

try {
    await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);

    const collection = await pb.collections.getOne('inventory_receivables');
    const existing = new Set((collection.fields || []).map((f) => f.name));

    const missing = [];
    if (!existing.has('batch_number')) missing.push(textField('batch_number'));
    if (!existing.has('expiry_date')) missing.push(dateField('expiry_date'));

    if (missing.length === 0) {
        console.log('[ok] inventory_receivables already has batch_number + expiry_date — nothing to do.');
        process.exit(0);
    }

    console.log(`[plan] adding fields: ${missing.map((f) => f.name).join(', ')}`);
    if (dryRun) {
        console.log('[dry-run] no changes made.');
        process.exit(0);
    }

    await pb.collections.update(collection.id, {
        fields: [...collection.fields, ...missing],
    });
    console.log('[ok] migration complete.');
} catch (err) {
    console.error('[fail]', err?.message || err);
    process.exit(1);
}
