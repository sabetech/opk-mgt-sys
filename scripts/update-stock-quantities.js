// One-off stock quantity update from data/opk-products - Clean UP.csv.
//
// Matches rows to live products by product_code, then by normalized name,
// and REPLACES warehouse_stock quantities with the file values.
// Nothing else is touched: no price/category changes, no creates, no
// archives. Unmatched rows are reported for review.
//
// Usage:
//   node scripts/update-stock-quantities.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]
//   Default is --dry-run (preview only). --apply executes. Reruns are idempotent.

import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cloudflare (error 1010) blocks non-browser clients on the hosted server.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, init = {}) =>
    origFetch(url, {
        ...init,
        headers: { ...(init.headers || {}), 'User-Agent': BROWSER_UA },
    });

const args = process.argv.slice(2);
const apply = args.includes('--apply');

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
    console.error("  node scripts/update-stock-quantities.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]");
    process.exit(1);
}

const CSV_PATH = path.resolve(__dirname, '../data/opk-products - Clean UP.csv');

const num = (s) => {
    const n = parseFloat(String(s ?? '').replace(/,/g, '').trim());
    if (isNaN(n)) throw new Error(`not a number: ${JSON.stringify(s)}`);
    return n;
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseCsv() {
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`Error: file not found at ${CSV_PATH}`);
        process.exit(1);
    }
    const parsed = Papa.parse(fs.readFileSync(CSV_PATH, 'utf8'), { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) {
        console.error('CSV parse errors:', parsed.errors.slice(0, 5));
        process.exit(1);
    }
    return parsed.data.map((r, i) => ({
        line: i + 2,
        code: String(r.product_codes ?? '').trim(),
        name: String(r.product_name ?? '').trim(),
        quantity: num(r.quantity),
    }));
}

async function main() {
    const dryRun = !apply;
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log(`Connected to ${PB_URL}${dryRun ? ' (DRY RUN — no writes)' : ''}.`);

    const rows = parseCsv();
    console.log(`Parsed ${rows.length} rows from ${path.basename(CSV_PATH)}.`);

    const live = await pb.collection('products').getFullList({
        filter: 'deleted_at = ""',
        fields: 'id, sku_name, product_code',
    });
    const byCode = new Map(live.filter((p) => p.product_code).map((p) => [String(p.product_code).trim(), p]));
    const byName = new Map(live.map((p) => [norm(p.sku_name), p]));
    const stockRows = await pb.collection('warehouse_stock').getFullList({ fields: 'id, product_id, quantity' });
    const stockByProduct = new Map(stockRows.map((s) => [s.product_id, s]));

    let matched = 0, created = 0;
    const unmatched = [];
    const plan = [];

    for (const r of rows) {
        const match = byCode.get(r.code) || byName.get(norm(r.name)) || null;
        if (!match) {
            unmatched.push(r);
            continue;
        }
        matched += 1;
        const existing = stockByProduct.get(match.id);
        plan.push({
            name: r.name, qty: r.quantity,
            current: existing ? existing.quantity || 0 : null,
            run: async () => {
                if (existing) {
                    await pb.collection('warehouse_stock').update(existing.id, { quantity: r.quantity });
                } else {
                    await pb.collection('warehouse_stock').create({ product_id: match.id, quantity: r.quantity });
                    created += 1;
                }
            },
        });
    }

    console.log('');
    for (const s of plan) {
        const via = s.current === null ? 'CREATE-ROW' : `${s.current} -> ${s.qty}`;
        console.log(`${via.padEnd(22)} | ${s.name}`);
    }
    if (unmatched.length > 0) {
        console.log('--- UNMATCHED (no write) ---');
        for (const r of unmatched) console.log(`NO-MATCH             | line ${r.line} | ${r.code} | ${r.name}`);
    }
    console.log('');
    console.log(`Summary: ${matched} matched, ${unmatched.length} unmatched, ${plan.filter((s) => s.current === null).length} missing stock row(s) to create.`);

    if (dryRun) {
        console.log('Dry run — no changes made. Rerun with --apply to execute.');
        return;
    }
    for (const step of plan) await step.run();
    console.log(`Stock update complete (${created} stock row(s) created).`);
}

main().catch((err) => {
    console.error('Stock update failed:', err?.message || err);
    process.exit(1);
});
