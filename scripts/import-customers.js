// One-off customer import from data/opk-products - customers.csv.
//
// Rules:
// - Name whose last token is "VSE" (case-insensitive) -> type 'Retailer (VSE)'.
// - Everyone else -> type 'Wholesaler'.
// - Phone stored verbatim (string).
// - Exact (name + phone) duplicates inside the file are imported once.
// - Names already in the DB (case-insensitive) are skipped, never duplicated.
//
// Usage:
//   node scripts/import-customers.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]
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
    console.error("  node scripts/import-customers.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]");
    process.exit(1);
}

const CSV_PATH = path.resolve(__dirname, '../data/opk-products - customers.csv');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isVse = (name) => norm(name).split(' ').slice(-1)[0] === 'vse';

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
        const name = String(r.Customer ?? '').trim();
        const phone = String(r.phone ?? '').trim();
        if (!name) {
            console.error(`Row ${i + 2}: missing Customer name`);
            process.exit(1);
        }
        return { line: i + 2, name, phone };
    });
}

async function main() {
    const dryRun = !apply;
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log(`Connected to ${PB_URL}${dryRun ? ' (DRY RUN — no writes)' : ''}.`);

    const rows = parseCsv();
    console.log(`Parsed ${rows.length} rows from ${path.basename(CSV_PATH)}.`);

    const [vseType, wholesaleType] = await Promise.all([
        pb.collection('customer_types').getFirstListItem('name = "Retailer (VSE)"', { fields: 'id' }),
        pb.collection('customer_types').getFirstListItem('name = "Wholesaler"', { fields: 'id' }),
    ]);

    const existing = await pb.collection('customers').getFullList({ fields: 'id, name' });
    const existingNames = new Set(existing.map((c) => norm(c.name)));

    const seen = new Set();
    let vseCount = 0, wholesaleCount = 0, skippedDupe = 0, skippedExists = 0;
    const plan = [];

    for (const r of rows) {
        const key = `${norm(r.name)}|${r.phone}`;
        if (seen.has(key)) {
            skippedDupe += 1;
            plan.push({ action: 'SKIP-DUPE', ...r });
            continue;
        }
        seen.add(key);
        if (existingNames.has(norm(r.name))) {
            skippedExists += 1;
            plan.push({ action: 'SKIP-EXISTS', ...r });
            continue;
        }
        const vse = isVse(r.name);
        if (vse) vseCount += 1; else wholesaleCount += 1;
        plan.push({
            action: vse ? 'CREATE-VSE' : 'CREATE-WHOLESALE',
            ...r,
            run: async () => {
                await pb.collection('customers').create({
                    name: r.name,
                    phone: r.phone || null,
                    type_id: vse ? vseType.id : wholesaleType.id,
                });
            },
        });
    }

    console.log('');
    for (const step of plan) {
        if (step.action.startsWith('CREATE')) console.log(`${step.action.padEnd(15)} | ${step.name} | ${step.phone}`);
    }
    const skips = plan.filter((s) => s.action.startsWith('SKIP'));
    if (skips.length > 0) {
        console.log('--- skipped ---');
        for (const s of skips) console.log(`${s.action.padEnd(15)} | ${s.name} | ${s.phone}`);
    }
    console.log('');
    console.log(`Summary: ${vseCount} VSE(s), ${wholesaleCount} wholesaler(s), ${skippedDupe} file-dupe(s), ${skippedExists} already-in-DB.`);

    if (dryRun) {
        console.log('Dry run — no changes made. Rerun with --apply to execute.');
        return;
    }
    for (const step of plan) {
        if (step.run) await step.run();
    }
    console.log('Import complete.');
}

main().catch((err) => {
    console.error('Import failed:', err?.message || err);
    process.exit(1);
});
