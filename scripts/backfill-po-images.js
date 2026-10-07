// One-off backfill: upload PO images still stored as PocketBase files to
// Cloudinary and save the resulting URL in purchase_order_img_url.
// Idempotent — records that already have a URL (or no image) are skipped.
// Original PocketBase files are left in place; delete them by hand later
// if you want to reclaim disk on the PB host.
//
// Usage:
//   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//   PB_URL=https://<host> PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... \
//     node scripts/backfill-po-images.js [--dry-run]
//
// CLOUDINARY_URL (cloudinary://key:secret@cloud) is accepted instead of the
// three CLOUDINARY_* vars.

import crypto from 'node:crypto';
import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const PB_URL = process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const FOLDER = 'purchase-orders';

let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
let apiKey = process.env.CLOUDINARY_API_KEY;
let apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName && process.env.CLOUDINARY_URL) {
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    const match = process.env.CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
        apiKey = apiKey || match[1];
        apiSecret = apiSecret || match[2];
        cloudName = cloudName || match[3];
    }
}

if (!EMAIL || !PASSWORD) {
    console.error('Error: PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars are required.');
    process.exit(1);
}
if (!cloudName || !apiKey || !apiSecret) {
    console.error('Error: Cloudinary credentials are required (CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET).');
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

function sign(params) {
    const skip = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);
    const sorted = Object.keys(params).filter((k) => !skip.has(k)).sort();
    const base = sorted.map((k) => `${k}=${params[k]}`).join('&') + apiSecret;
    return crypto.createHash('sha1').update(base).digest('hex');
}

async function uploadToCloudinary(bytes, filename) {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder: FOLDER, timestamp };
    const body = new FormData();
    body.append('file', new Blob([bytes]), filename);
    body.append('api_key', apiKey);
    body.append('timestamp', String(timestamp));
    body.append('folder', FOLDER);
    body.append('signature', sign(params));

    const res = await origFetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.secure_url) {
        throw new Error(payload?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
    }
    return payload.secure_url;
}

try {
    await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);

    const records = await pb.collection('inventory_receivables').getFullList();

    const pending = records.filter((rec) => rec.purchase_order_img && !rec.purchase_order_img_url);
    console.log(`[plan] ${pending.length} of ${records.length} receivable(s) still need a Cloudinary URL`);

    if (dryRun) {
        for (const rec of pending) {
            console.log(`[dry-run] ${rec.id} PO ${rec.purchase_order_number} -> ${rec.purchase_order_img}`);
        }
        console.log('[dry-run] no changes made.');
        process.exit(0);
    }

    let done = 0;
    for (const rec of pending) {
        const fileUrl = pb.files.getURL(rec, rec.purchase_order_img);
        const res = await origFetch(fileUrl);
        if (!res.ok) {
            console.error(`[skip] ${rec.id}: cannot download PocketBase file (HTTP ${res.status})`);
            continue;
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        const url = await uploadToCloudinary(bytes, rec.purchase_order_img);
        await pb.collection('inventory_receivables').update(rec.id, { purchase_order_img_url: url });
        done += 1;
        console.log(`[ok] ${rec.id} PO ${rec.purchase_order_number} -> ${url}`);
    }

    console.log(`[done] backfilled ${done} record(s).`);
} catch (err) {
    console.error('[fail]', err?.message || err);
    process.exit(1);
}
