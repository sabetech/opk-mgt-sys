// One-off catalog refresh from data/opk-products - Clean UP.csv.
//
// Matches rows to live products by product_code, then by normalized name;
// updates matches in place (history stays linked), creates the rest, and
// soft-deletes active products absent from the file (zeroing their stock).
// Warehouse stock is REPLACED with the file quantities.
//
// Usage:
//   node scripts/refresh-products.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]
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
    console.error('Usage:');
    console.error("  node scripts/refresh-products.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]");
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
    return parsed.data.map((r, i) => {
        const line = i + 2;
        for (const col of ['product_codes', 'product_name', 'product_category', 'quantity', 'exfactory_price', 'retailer_price', 'wholesaler_price', 'returnable']) {
            if (r[col] === undefined || r[col] === null || String(r[col]).trim() === '') {
                console.error(`Row ${line}: missing value for column "${col}"`);
                process.exit(1);
            }
        }
        const flag = String(r.returnable).trim().toUpperCase();
        if (flag !== 'YES' && flag !== 'NO') {
            console.error(`Row ${line}: returnable must be YES/NO, got ${JSON.stringify(r.returnable)}`);
            process.exit(1);
        }
        return {
            line,
            product_code: String(r.product_codes).trim(),
            sku_name: String(r.product_name).trim(),
            code_name: String(r.product_category).trim(),
            quantity: num(r.quantity),
            ex_factory_price: num(r.exfactory_price),
            retail_price: num(r.retailer_price),
            wholesale_price: num(r.wholesaler_price),
            returnable: flag === 'YES',
        };
    });
}

async function setStock(pb, productId, qty, dryRun) {
    if (dryRun) return 'set';
    const existing = await pb.collection('warehouse_stock').getFullList({ filter: `product_id = "${productId}"`, fields: 'id' });
    if (existing.length > 0) {
        for (const s of existing) await pb.collection('warehouse_stock').update(s.id, { quantity: qty });
    } else {
        await pb.collection('warehouse_stock').create({ product_id: productId, quantity: qty });
    }
    return 'set';
}

async function main() {
    const dryRun = !apply;
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log(`Connected to ${PB_URL}${dryRun ? ' (DRY RUN — no writes)' : ''}.`);

    const rows = parseCsv();
    console.log(`Parsed ${rows.length} rows from ${path.basename(CSV_PATH)}.`);
    const dupes = rows.map((r) => r.product_code).filter((c, i, a) => a.indexOf(c) !== i);
    if (dupes.length > 0) {
        console.error(`Duplicate product_codes in file: ${[...new Set(dupes)].join(', ')}`);
        process.exit(1);
    }

    const live = await pb.collection('products').getFullList({
        filter: 'deleted_at = ""',
        fields: 'id, sku_name, code_name, product_code',
    });
    const byCode = new Map(live.filter((p) => p.product_code).map((p) => [String(p.product_code).trim(), p]));
    const byName = new Map(live.map((p) => [norm(p.sku_name), p]));

    let created = 0, updated = 0, archived = 0;
    const usedIds = new Set();
    const plan = [];

    for (const r of rows) {
        const match = byCode.get(r.product_code) || byName.get(norm(r.sku_name)) || null;
        const fields = {
            sku_name: r.sku_name,
            code_name: r.code_name,
            product_code: r.product_code,
            ex_factory_price: r.ex_factory_price,
            wholesale_price: r.wholesale_price,
            retail_price: r.retail_price,
            returnable: r.returnable,
        };
        if (match) {
            usedIds.add(match.id);
            plan.push({ action: 'UPDATE', code: r.product_code, name: r.sku_name, id: match.id, run: async () => {
                await pb.collection('products').update(match.id, fields);
                await setStock(pb, match.id, r.quantity, false);
            }});
            updated += 1;
        } else {
            plan.push({ action: 'CREATE', code: r.product_code, name: r.sku_name, id: null, run: async () => {
                const createdRec = await pb.collection('products').create(fields);
                await setStock(pb, createdRec.id, r.quantity, false);
                if (r.returnable) {
                    await pb.collection('empties').create({ product_id: createdRec.id, quantity_in_trade: 0, quantity_on_ground: 0 });
                }
            }});
            created += 1;
        }
    }

    const leftovers = live.filter((p) => !usedIds.has(p.id));
    for (const p of leftovers) {
        plan.push({ action: 'ARCHIVE', code: p.product_code || '—', name: p.sku_name, id: p.id, run: async () => {
            await pb.collection('products').update(p.id, { deleted_at: new Date().toISOString() });
            const stock = await pb.collection('warehouse_stock').getFullList({ filter: `product_id = "${p.id}"`, fields: 'id' });
            for (const s of stock) await pb.collection('warehouse_stock').update(s.id, { quantity: 0 });
        }});
        archived += 1;
    }

    console.log('');
    console.log('ACTION  | CODE       | NAME');
    for (const step of plan) {
        console.log(`${step.action.padEnd(7)} | ${String(step.code).padEnd(10)} | ${step.name}${step.id ? `  [${step.id}]` : ''}`);
    }
    console.log('');
    console.log(`Summary: ${updated} update(s), ${created} create(s), ${archived} archive(s).`);

    if (dryRun) {
        console.log('Dry run — no changes made. Rerun with --apply to execute.');
        return;
    }
    for (const step of plan) await step.run();
    console.log('Refresh complete.');
}

main().catch((err) => {
    console.error('Refresh failed:', err?.message || err);
    process.exit(1);
});
