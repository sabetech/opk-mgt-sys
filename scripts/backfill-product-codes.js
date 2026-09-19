// One-off backfill: assign generated unique product_code values
// (e.g. ALVP-001) to products missing one. Safe to rerun (skips rows that
// already have a code).
//
// Usage:
//   node scripts/backfill-product-codes.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run]
//   (or PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD / PB_URL env vars)
//   PB_URL env alias: VITE_POCKETBASE_URL (default http://127.0.0.1:8090)
//
// Requires the `product_code` field migration (setup-pocketbase.js) to have run.

import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function getArg(name) {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}

const PB_URL = getArg('url') || process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = getArg('email') || process.env.PB_SUPERUSER_EMAIL;
const SUPERUSER_PASSWORD = getArg('password') || process.env.PB_SUPERUSER_PASSWORD;

if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
    console.error('Error: superuser credentials are required.');
    console.error('');
    console.error('Usage:');
    console.error("  node scripts/backfill-product-codes.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run]");
    console.error('  or set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars.');
    process.exit(1);
}

// Mirror of src/lib/productCode.ts
function buildPrefix(codeName) {
    const cleaned = (codeName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned || 'PRD';
}

async function main() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log(`Connected to ${PB_URL}${dryRun ? ' (dry run)' : ''}.`);

    const all = await pb.collection('products').getFullList({ fields: 'id, code_name, product_code' });

    // Per-prefix high-water marks from codes already assigned
    const counters = {};
    for (const p of all) {
        if (!p.product_code) continue;
        const m = String(p.product_code).trim().match(/^([A-Z0-9]+)-(\d+)$/i);
        if (m) {
            const prefix = m[1].toUpperCase();
            counters[prefix] = Math.max(counters[prefix] || 0, parseInt(m[2], 10));
        }
    }

    // Deterministic order: category, then id
    const missing = all
        .filter((p) => !p.product_code)
        .sort((a, b) => buildPrefix(a.code_name).localeCompare(buildPrefix(b.code_name)) || a.id.localeCompare(b.id));

    if (missing.length === 0) {
        console.log('Nothing to do — every product already has a product_code.');
        return;
    }

    let updated = 0;
    for (const p of missing) {
        const prefix = buildPrefix(p.code_name);
        counters[prefix] = (counters[prefix] || 0) + 1;
        const code = `${prefix}-${String(counters[prefix]).padStart(3, '0')}`;
        if (dryRun) {
            console.log(`  [dry-run] would set ${code} on "${p.id}"`);
        } else {
            await pb.collection('products').update(p.id, { product_code: code });
            console.log(`  [ok] ${code}`);
        }
        updated += 1;
    }
    console.log(dryRun ? `Would assign ${updated} code(s).` : `Assigned ${updated} code(s).`);
}

main().catch((err) => {
    console.error('Backfill failed:', err?.message || err);
    process.exit(1);
});
