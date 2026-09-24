// One-off empties-balance import from data/customers-empties-balance.csv.
//
// Business scale (per ops): the CSV "Empties balance" is DEBIT-scale —
// positive means the customer OWES OPK that many empty crates, negative
// means the customer holds empties CREDIT with OPK. The app keeps
// credit-scale values (purchases subtract), so this script stores the
// NEGATED value: balance = -(csv value).
//
// Rules:
// - Match customers by normalized (name + phone), same as import-customers.js.
// - Exact-duplicate rows inside the file are applied once.
// - Matched: set balance = -value. If value > 0, also set has_mou = true
//   (these are wholesalers trading on crate credit; without MOU the POS
//   guard would block their stored-negative balance).
// - Zero-value rows: no write (balances are already zero post-reset).
// - Unmatched: CREATE the customer (type by name: ends in "VSE" ->
//   'Retailer (VSE)', else 'Wholesaler'), with balance = -value and
//   has_mou = (value > 0).
// - DB customers absent from the CSV are left untouched.
//
// Usage:
//   node scripts/import-empties-balances.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]
//   Default is --dry-run (preview only). --apply executes.

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
    console.error("  node scripts/import-empties-balances.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]");
    process.exit(1);
}

const CSV_PATH = path.resolve(__dirname, '../data/customers-empties-balance.csv');
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
        const raw = String(r['Empties balance'] ?? '').trim().replace(/,/g, '');
        if (!name) {
            console.error(`Row ${i + 2}: missing Customer name`);
            process.exit(1);
        }
        const value = raw === '' ? 0 : Number(raw);
        if (!Number.isFinite(value)) {
            console.error(`Row ${i + 2} (${name}): invalid Empties balance "${r['Empties balance']}"`);
            process.exit(1);
        }
        return { line: i + 2, name, phone, value };
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

    const existing = await pb.collection('customers').getFullList({ fields: 'id, name, phone, type_id, balance, has_mou, deleted_at' });
    const dbByName = new Map();
    for (const c of existing) {
        const k = norm(c.name);
        if (!dbByName.has(k)) dbByName.set(k, []);
        dbByName.get(k).push(c);
    }
    const consumed = new Set();
    const takeRecord = (nameKey, phone) => {
        const list = (dbByName.get(nameKey) || []).filter((c) => !c.deleted_at && !consumed.has(c.id));
        const exact = list.find((c) => String(c.phone || '') === String(phone));
        if (exact) {
            consumed.add(exact.id);
            return exact;
        }
        return null;
    };

    const seen = new Set();
    let updated = 0, mouSet = 0, created = 0, skippedZero = 0, skippedDupe = 0, skippedSame = 0;
    const plan = [];
    const vseNamed = [];

    for (const r of rows) {
        const key = `${norm(r.name)}|${r.phone}|${r.value}`;
        if (seen.has(key)) {
            skippedDupe += 1;
            continue;
        }
        seen.add(key);
        if (isVse(r.name)) vseNamed.push(r);

        const stored = -r.value; // negate: debit-scale CSV -> credit-scale stored
        const match = takeRecord(norm(r.name), r.phone);
        if (match) {
            const patch = {};
            if ((match.balance || 0) !== stored) patch.balance = stored;
            if (r.value > 0 && !match.has_mou) {
                patch.has_mou = true;
                mouSet += 1;
            }
            if (Object.keys(patch).length === 0) {
                if (r.value === 0) skippedZero += 1;
                else {
                    skippedSame += 1;
                    plan.push({ action: 'SKIP-SAME', ...r, stored });
                }
                continue;
            }
            updated += 1;
            plan.push({
                action: 'UPDATE', ...r, stored,
                run: async () => {
                    await pb.collection('customers').update(match.id, patch);
                },
            });
            continue;
        }
        // Unmatched: create (zero rows included so the roster is complete)
        created += 1;
        const typeId = isVse(r.name) ? vseType.id : wholesaleType.id;
        plan.push({
            action: 'CREATE', ...r, stored,
            run: async () => {
                await pb.collection('customers').create({
                    name: r.name,
                    phone: r.phone || null,
                    type_id: typeId,
                    balance: stored,
                    has_mou: r.value > 0,
                });
            },
        });
    }

    console.log('');
    for (const s of plan) {
        console.log(`${s.action.padEnd(10)} | ${s.name} | ${s.phone} | csv=${s.value} -> stored=${s.stored}`);
    }
    console.log('');
    console.log(`Summary: ${updated} update(s) [${mouSet} with MOU set], ${created} create(s), ${skippedSame} already-correct, ${skippedZero} zero no-ops, ${skippedDupe} file-dupe(s).`);
    if (vseNamed.length > 0) {
        console.log('--- rows with VSE-style names (check type!) ---');
        for (const r of vseNamed) console.log(`VSE-NAME    | ${r.name} | ${r.phone} | csv=${r.value}`);
    }

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
