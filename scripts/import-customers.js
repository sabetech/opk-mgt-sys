// One-off customer import from data/opk-products - customers.csv.
//
// Rules:
// - Name whose last token is "VSE" (case-insensitive) -> type 'Retailer (VSE)'.
// - Everyone else -> type 'Wholesaler'.
// - Phone stored verbatim (string).
// - Exact (name + phone) duplicates inside the file are imported once.
// - Reruns OVERWRITE: name matches update phone/type in place (and restore
//   soft-deleted records that reappear in the file).
// - With --sync, customers present in the last committed version of the file
//   but missing from the current one are soft-deleted. Customers that were
//   never in any committed version (pre-existing) are always left alone.
//
// Usage:
//   node scripts/import-customers.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply] [--sync]
//   Default is --dry-run (preview only). --apply executes. Reruns are idempotent.

import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sync = args.includes('--sync');

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
const CSV_REL = 'data/opk-products - customers.csv';
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const isVse = (name) => norm(name).split(' ').slice(-1)[0] === 'vse';

/** Names from the last committed version of the file (for --sync removals). */
function committedNames() {
    try {
        const out = execSync(`git show HEAD:"${CSV_REL}"`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const parsed = Papa.parse(out, { header: true, skipEmptyLines: true });
        return new Set(parsed.data.map((r) => norm(r.Customer)).filter(Boolean));
    } catch {
        return null;
    }
}

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

    const existing = await pb.collection('customers').getFullList({ fields: 'id, name, phone, type_id, deleted_at' });
    // DB records grouped by normalized name (names are not unique in the DB)
    const dbByName = new Map();
    for (const c of existing) {
        const k = norm(c.name);
        if (!dbByName.has(k)) dbByName.set(k, []);
        dbByName.get(k).push(c);
    }
    const consumed = new Set();
    const takeRecord = (nameKey, phone) => {
        const list = (dbByName.get(nameKey) || []).filter((c) => !consumed.has(c.id));
        if (phone !== undefined) {
            const exact = list.find((c) => String(c.phone || '') === String(phone));
            if (exact) {
                consumed.add(exact.id);
                return exact;
            }
            return null;
        }
        if (list.length > 0) {
            consumed.add(list[0].id);
            return list[0];
        }
        return null;
    };

    const seen = new Set();
    let createdVse = 0, createdWs = 0, updated = 0, restored = 0, archived = 0, skippedDupe = 0;
    const plan = [];
    const pending = [];

    for (const r of rows) {
        const key = `${norm(r.name)}|${r.phone}`;
        if (seen.has(key)) {
            skippedDupe += 1;
            plan.push({ action: 'SKIP-DUPE', ...r });
            continue;
        }
        seen.add(key);
        // Pass 1: exact (name + phone) match -> unchanged, consume the record
        const exact = takeRecord(norm(r.name), r.phone);
        if (exact) {
            const vse = isVse(r.name);
            const typeId = vse ? vseType.id : wholesaleType.id;
            if (!exact.deleted_at && exact.type_id === typeId) {
                plan.push({ action: 'SKIP-UNCHANGED', ...r });
            } else {
                // Same pair but wrong type or archived -> fix in place
                if (exact.deleted_at) restored += 1; else updated += 1;
                plan.push({
                    action: exact.deleted_at ? 'RESTORE+UPDATE' : 'UPDATE', ...r,
                    run: async () => {
                        await pb.collection('customers').update(exact.id, {
                            phone: r.phone || null,
                            type_id: typeId,
                            deleted_at: '',
                        });
                    },
                });
            }
            continue;
        }
        pending.push(r);
    }

    // Pass 2: leftover rows match a leftover same-name record -> overwrite it
    for (const r of pending) {
        const vse = isVse(r.name);
        const typeId = vse ? vseType.id : wholesaleType.id;
        const found = takeRecord(norm(r.name));
        if (found) {
            if (found.deleted_at) restored += 1; else updated += 1;
            plan.push({
                action: found.deleted_at ? 'RESTORE+UPDATE' : 'UPDATE', ...r,
                run: async () => {
                    await pb.collection('customers').update(found.id, {
                        phone: r.phone || null,
                        type_id: typeId,
                        deleted_at: '',
                    });
                },
            });
            continue;
        }
        if (vse) createdVse += 1; else createdWs += 1;
        plan.push({
            action: vse ? 'CREATE-VSE' : 'CREATE-WHOLESALE',
            ...r,
            run: async () => {
                await pb.collection('customers').create({
                    name: r.name,
                    phone: r.phone || null,
                    type_id: typeId,
                });
            },
        });
    }

    // --sync: soft-delete records that were in the last committed file
    // version but are gone now. Anything never in the file is left alone.
    const leftAlone = [];
    if (sync) {
        const oldNames = committedNames();
        if (!oldNames) {
            console.error('Cannot --sync: no committed version of the file found. Commit it first.');
            process.exit(1);
        }
        const newNames = new Set(rows.map((r) => norm(r.name)));
        for (const c of existing) {
            if (c.deleted_at) continue;
            if (newNames.has(norm(c.name))) continue;
            if (!oldNames.has(norm(c.name))) {
                leftAlone.push(c.name);
                continue;
            }
            archived += 1;
            plan.push({
                action: 'ARCHIVE', name: c.name, phone: c.phone || '',
                run: async () => {
                    await pb.collection('customers').update(c.id, { deleted_at: new Date().toISOString() });
                },
            });
        }
    }

    console.log('');
    for (const step of plan) {
        if (!step.action.startsWith('SKIP')) console.log(`${step.action.padEnd(15)} | ${step.name} | ${step.phone}`);
    }
    const skips = plan.filter((s) => s.action.startsWith('SKIP'));
    if (skips.length > 0) {
        console.log('--- skipped/unchanged ---');
        for (const s of skips) console.log(`${s.action.padEnd(15)} | ${s.name} | ${s.phone}`);
    }
    if (leftAlone.length > 0) {
        console.log('--- left alone (never in file) ---');
        for (const n of leftAlone) console.log(`LEFT-ALONE      | ${n}`);
    }
    console.log('');
    console.log(`Summary: ${createdVse} VSE create(s), ${createdWs} wholesaler create(s), ${updated} update(s), ${restored} restore(s), ${archived} archive(s), ${skippedDupe} file-dupe(s).`);

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
