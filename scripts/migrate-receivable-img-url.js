// One-off migration: add purchase_order_img_url (text) to the existing
// `inventory_receivables` collection without touching data. New PO images
// are uploaded straight to Cloudinary and only the URL is stored here;
// the old purchase_order_img file field stays for records uploaded before.
// (scripts/setup-pocketbase.js only creates missing collections, so it
// cannot migrate production.)
//
// Usage:
//   PB_URL=https://<host> PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//     node scripts/migrate-receivable-img-url.js [--dry-run]

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

try {
    await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);

    const collection = await pb.collections.getOne('inventory_receivables');
    const existing = new Set((collection.fields || []).map((f) => f.name));

    if (existing.has('purchase_order_img_url')) {
        console.log('[ok] inventory_receivables already has purchase_order_img_url — nothing to do.');
        process.exit(0);
    }

    console.log('[plan] adding field: purchase_order_img_url (text)');
    if (dryRun) {
        console.log('[dry-run] no changes made.');
        process.exit(0);
    }

    await pb.collections.update(collection.id, {
        fields: [...collection.fields, textField('purchase_order_img_url')],
    });
    console.log('[ok] migration complete.');
} catch (err) {
    console.error('[fail]', err?.message || err);
    process.exit(1);
}
