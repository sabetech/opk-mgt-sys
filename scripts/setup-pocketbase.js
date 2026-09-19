// PocketBase setup script for OPK Management System.
// Creates all collections, seeds reference data, imports products from CSV,
// seeds empties rows and creates the initial app admin user.
//
// Usage:
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... node scripts/setup-pocketbase.js [OPTIONS]
//
// Options:
//   --force       Delete existing collections and data before recreating
//   --dry-run     Show what would be done without making changes
//   --yes         Skip confirmation prompts (for CI/CD)
//
// Env vars:
//   PB_SUPERUSER_EMAIL    (required) PocketBase admin email
//   PB_SUPERUSER_PASSWORD (required) PocketBase admin password
//   VITE_POCKETBASE_URL   (default http://127.0.0.1:8090)
//   PB_URL                (alias for VITE_POCKETBASE_URL)
//   OPK_ADMIN_PASSWORD    (default "blender3D")
//
// Examples:
//   # Local dev (default)
//   PB_SUPERUSER_EMAIL=admin@example.com PB_SUPERUSER_PASSWORD=password123 node scripts/setup-pocketbase.js
//
//   # Remote one-time override
//   PB_URL=https://pocketbase.firstlovegallery.com \
//   PB_SUPERUSER_EMAIL=admin@domain.com PB_SUPERUSER_PASSWORD=xxx \
//   node scripts/setup-pocketbase.js --force --yes

import PocketBase from 'pocketbase';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes'),
};

function getArg(name) {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PB_URL = getArg('url') || process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = getArg('email') || process.env.PB_SUPERUSER_EMAIL;
const SUPERUSER_PASSWORD = getArg('password') || process.env.PB_SUPERUSER_PASSWORD;
const ADMIN_PASSWORD = process.env.OPK_ADMIN_PASSWORD || 'blender3D';

if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
    console.error('Error: PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars are required.');
    console.error('');
    console.error('Usage:');
    console.error('  PB_SUPERUSER_EMAIL=admin@example.com PB_SUPERUSER_PASSWORD=password123 node scripts/setup-pocketbase.js --force');
    process.exit(1);
}

const isRemote = !PB_URL.includes('127.0.0.1') && !PB_URL.includes('localhost');

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

async function confirm(message) {
    if (flags.yes) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => {
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

// ---------------------------------------------------------------------------
// PocketBase client
// ---------------------------------------------------------------------------

const pb = new PocketBase(PB_URL);

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

let fieldCounter = 0;
function fld(type, name, opts = {}) {
    fieldCounter += 1;
    return {
        system: false,
        id: opts.id || `fld_${Date.now().toString(36)}_${fieldCounter}`,
        name,
        type,
        required: !!opts.required,
        unique: !!opts.unique,
        ...(type === 'text' && { presentable: false, max: 0, min: 0, pattern: '', autogeneratePattern: '', primaryKey: false }),
        ...(type === 'number' && { min: null, max: null, step: null }),
        ...(type === 'date' && { min: '', max: '' }),
        ...(type === 'select' && { maxSelect: opts.maxSelect ?? 1, values: opts.values || [] }),
        ...(type === 'relation' && { maxSelect: opts.maxSelect ?? 1, collectionId: opts.collectionId, cascadeDelete: !!opts.cascadeDelete, minSelect: null }),
        ...(type === 'file' && { maxSelect: opts.maxSelect ?? 1, maxSize: opts.maxSize ?? 5242880, mimeTypes: opts.mimeTypes || [], thumbs: [] }),
    };
}

const AUTH_RULE = '@request.auth.id != ""';
const ADMIN_RULE = '@request.auth.role = "admin"';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getCollectionsMap() {
    const cols = await pb.collections.getFullList();
    const map = {};
    for (const c of cols) map[c.name] = c;
    return map;
}

async function wipeCollection(name) {
    if (flags.dryRun) {
        console.log(`  [dry-run] would delete collection "${name}"`);
        return;
    }
    const existing = (await pb.collections.getFullList()).find((c) => c.name === name);
    if (existing) {
        await pb.collections.delete(existing.id);
        console.log(`  [wipe] deleted collection "${name}"`);
    }
}

async function wipeCollectionData(name) {
    if (flags.dryRun) {
        console.log(`  [dry-run] would delete all records in "${name}"`);
        return;
    }
    try {
        const records = await pb.collection(name).getFullList();
        for (const r of records) {
            await pb.collection(name).delete(r.id);
        }
        if (records.length > 0) {
            console.log(`  [wipe] deleted ${records.length} records from "${name}"`);
        }
    } catch {
        // Collection may not exist yet
    }
}

async function ensureCollection(name, type, fields, rules = {}, force = false) {
    const existing = (await pb.collections.getFullList()).find((c) => c.name === name);

    if (existing && force) {
        await wipeCollection(name);
    } else if (existing) {
        console.log(`  [skip] collection "${name}" already exists`);
        return;
    }

    if (flags.dryRun) {
        console.log(`  [dry-run] would create collection "${name}"`);
        return;
    }

    await pb.collections.create({
        name,
        type,
        fields,
        listRule: rules.listRule ?? AUTH_RULE,
        viewRule: rules.viewRule ?? AUTH_RULE,
        createRule: rules.createRule ?? AUTH_RULE,
        updateRule: rules.updateRule ?? AUTH_RULE,
        deleteRule: rules.deleteRule ?? AUTH_RULE,
        indexes: [],
    });
    console.log(`  [ok] created collection "${name}"`);
}

async function seedIfEmpty(collectionName, rows, force = false) {
    if (force) {
        await wipeCollectionData(collectionName);
    } else {
        const count = await pb.collection(collectionName).getList(1, 1, { perPage: 1 });
        if (count.totalItems > 0) {
            console.log(`  [skip] seeding "${collectionName}" (already has data)`);
            return;
        }
    }

    if (flags.dryRun) {
        console.log(`  [dry-run] would seed "${collectionName}" with ${rows.length} rows`);
        return;
    }

    for (const row of rows) {
        await pb.collection(collectionName).create(row);
    }
    console.log(`  [ok] seeded "${collectionName}" with ${rows.length} rows`);
}

function parseProductsCsv() {
    const csvFilePath = path.resolve(__dirname, '../data/products.csv');
    if (!fs.existsSync(csvFilePath)) {
        console.error(`Error: File not found at ${csvFilePath}`);
        process.exit(1);
    }
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    let products = [];
    Papa.parse(fileContent, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
            const rows = results.data;
            const dataRows = rows.slice(2);
            products = dataRows
                .map((row) => {
                    const skuName = row[0]?.trim();
                    if (!skuName) return null;
                    return {
                        sku_name: skuName,
                        returnable: (row[1]?.trim() || '').toLowerCase() === 'returnable',
                        code_name: row[2]?.trim() || null,
                        wholesale_price: parseFloat((row[3]?.trim() || '0').replace(/,/g, '')),
                        retail_price: parseFloat((row[4]?.trim() || '0').replace(/,/g, '')),
                    };
                })
                .filter((p) => p !== null);
        },
    });
    return products;
}

// Mirror of src/lib/productCode.ts for seeding: category prefix + per-prefix
// sequence (ALV P -> ALVP-001, ALVP-002, ...; blank -> PRD-001, ...).
function buildSeedPrefix(codeName) {
    const cleaned = (codeName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned || 'PRD';
}

function assignSeedProductCodes(products) {
    const counters = {};
    return products.map((p) => {
        const prefix = buildSeedPrefix(p.code_name);
        counters[prefix] = (counters[prefix] || 0) + 1;
        return { ...p, product_code: `${prefix}-${String(counters[prefix]).padStart(3, '0')}` };
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('='.repeat(60));
    console.log('OPK Management System - PocketBase Setup');
    console.log('='.repeat(60));
    console.log(`  URL:       ${PB_URL}`);
    console.log(`  Remote:    ${isRemote ? 'YES' : 'NO (local)'}`);
    console.log(`  Force:     ${flags.force ? 'YES (override existing)' : 'NO (skip existing)'}`);
    console.log(`  Dry run:   ${flags.dryRun ? 'YES' : 'NO'}`);
    console.log('');

    if (isRemote && flags.force && !flags.yes) {
        console.log('WARNING: You are about to DELETE ALL DATA on the remote server!');
        console.log(`    Server: ${PB_URL}`);
        console.log('');
        const approved = await confirm('Do you want to continue?');
        if (!approved) {
            console.log('Aborted.');
            process.exit(0);
        }
        console.log('');
    }

    console.log(`Connecting to PocketBase at ${PB_URL}...`);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log('Superuser authenticated.');

    console.log('\n[1/4] Creating collections...');

    await ensureCollection('customer_types', 'base', [
        fld('text', 'name', { required: true, unique: true }),
    ], {}, flags.force);

    await ensureCollection('order_types', 'base', [
        fld('text', 'name', { required: true, unique: true }),
    ], {}, flags.force);

    await ensureCollection('products', 'base', [
        fld('text', 'sku_name', { required: true }),
        fld('bool', 'returnable'),
        fld('text', 'code_name'),
        // Generated unique product code (e.g. ALVP-001). code_name stays as
        // the shared category label and is intentionally NOT unique.
        fld('text', 'product_code', { unique: true }),
        fld('number', 'ex_factory_price'),
        fld('number', 'wholesale_price'),
        fld('number', 'retail_price'),
        fld('date', 'deleted_at'),
    ], {}, flags.force);

    await ensureCollection('inventory_receivables', 'base', [
        fld('date', 'date', { required: true }),
        fld('text', 'purchase_order_number', { required: true }),
        fld('text', 'received_by', { required: true }),
        fld('text', 'delivered_by', { required: true }),
        fld('text', 'vehicle_no', { required: true }),
        fld('number', 'num_of_pallets'),
        fld('number', 'num_of_pcs'),
        fld('file', 'purchase_order_img', {
            mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        }),
    ], {}, flags.force);

    const { customer_types, order_types, products, inventory_receivables } = await getCollectionsMap();

    await ensureCollection('customers', 'base', [
        fld('text', 'name', { required: true }),
        fld('text', 'phone'),
        fld('relation', 'type_id', { collectionId: customer_types.id }),
        fld('number', 'balance'),
        fld('bool', 'has_mou'),
        fld('date', 'deleted_at'),
    ], {}, flags.force);

    await ensureCollection('empties', 'base', [
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity_in_trade'),
        fld('number', 'quantity_on_ground'),
    ], {}, flags.force);

    await ensureCollection('warehouse_stock', 'base', [
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ], {}, flags.force);

    await ensureCollection('inventory_logs', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('select', 'type', {
            required: true,
            values: ['supplier_receipt', 'vse_loadout', 'retail_sale', 'wholesale_sale', 'breakage', 'promo_out', 'promo_reimbursement', 'opening_stock', 'adjustment_increase', 'adjustment_decrease', 'customer_return'],
        }),
        fld('number', 'quantity', { required: true }),
        fld('text', 'reference_id'),
        fld('text', 'reference_table'),
        fld('text', 'description'),
    ], {}, flags.force);

    await ensureCollection('inventory_receivable_items', 'base', [
        fld('relation', 'receivable_id', { collectionId: inventory_receivables.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'qty', { required: true }),
        fld('date', 'date', { required: true }),
    ], {}, flags.force);

    const { customers, warehouse_stock, inventory_logs } = await getCollectionsMap();

    await ensureCollection('empties_log', 'base', [
        fld('date', 'date', { required: true }),
        fld('number', 'total_quantity', { required: true }),
        fld('select', 'activity', {
            required: true,
            values: ['customer_empties_return', 'empties_to_supplier', 'customer_purchase'],
        }),
        fld('relation', 'customer_id', { collectionId: customers.id, maxSelect: 1 }),
        fld('text', 'vehicle_no'),
        fld('text', 'returned_by'),
        fld('number', 'num_of_pallets'),
        fld('number', 'num_of_pcs'),
        fld('number', 'deposit_qty'),
        fld('number', 'deposit_total'),
    ], {}, flags.force);

    await ensureCollection('orders', 'base', [
        fld('relation', 'customer_id', { collectionId: customers.id, maxSelect: 1 }),
        fld('number', 'order_number', { required: true, unique: true }),
        fld('number', 'total_amount', { required: true }),
        fld('number', 'amount_tendered'),
        fld('text', 'payment_type'),
        fld('text', 'transaction_id'),
        fld('relation', 'order_type_id', { collectionId: order_types.id, maxSelect: 1 }),
        fld('date', 'date_time', { required: true }),
        fld('select', 'status', { required: true, values: ['pending', 'approved', 'cancelled'] }),
        fld('date', 'deleted_at'),
        fld('number', 'crate_deposit_qty'),
        fld('number', 'crate_deposit_total'),
    ], {}, flags.force);

    const { empties_log, orders } = await getCollectionsMap();

    // Refundable crate deposits held per order (cash-out on empties return,
    // FIFO). amount_per_crate is frozen at sale time so later Settings
    // changes don't rewrite history.
    await ensureCollection('crate_deposits', 'base', [
        fld('relation', 'customer_id', { collectionId: customers.id, maxSelect: 1 }),
        fld('relation', 'order_id', { collectionId: orders.id, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
        fld('number', 'amount_per_crate', { required: true }),
        fld('number', 'total_amount', { required: true }),
        fld('number', 'refunded_qty'),
        fld('select', 'status', { required: true, values: ['held', 'partial', 'refunded'] }),
        fld('date', 'created', { required: true }),
        fld('date', 'refunded_at'),
        fld('relation', 'refund_log_id', { collectionId: empties_log.id, maxSelect: 1 }),
        fld('text', 'refund_method'),
        fld('text', 'handled_by'),
    ], {}, flags.force);

    await ensureCollection('empties_log_detail', 'base', [
        fld('relation', 'log_id', { collectionId: empties_log.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ], {}, flags.force);

    await ensureCollection('sales', 'base', [
        fld('relation', 'order_id', { collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'discount'),
        fld('number', 'quantity', { required: true }),
        fld('number', 'unit_price', { required: true }),
        fld('number', 'sub_total', { required: true }),
        fld('date', 'deleted_at'),
    ], {}, flags.force);

    await ensureCollection('warehouse_orders', 'base', [
        fld('relation', 'order_id', { collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('select', 'status', { required: true, values: ['pending', 'ready', 'cancelled'] }),
    ], {}, flags.force);

    await ensureCollection('loadouts', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'vse_id', { collectionId: customers.id, required: true, maxSelect: 1 }),
        fld('select', 'status', { required: true, values: ['pending', 'approved', 'cancelled'] }),
    ], {}, flags.force);

    const { warehouse_orders, loadouts, sales } = await getCollectionsMap();

    await ensureCollection('warehouse_order_items', 'base', [
        fld('relation', 'warehouse_order_id', { collectionId: warehouse_orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
    ], {}, flags.force);

    await ensureCollection('loadout_items', 'base', [
        fld('relation', 'loadout_id', { collectionId: loadouts.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ], {}, flags.force);

    // Per-VSE field performance: stock sold to end customers and unsold stock
    // returned, recorded per VSE per day. Powers the Loadout Summary page
    // (Quantity Sold / Quantity Returned columns). No warehouse_stock mutation:
    // stock already left the warehouse via the loadout.
    await ensureCollection('vse_movements', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'vse_id', { collectionId: customers.id, required: true, maxSelect: 1 }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
        fld('select', 'movement_type', { required: true, values: ['sold', 'returned'] }),
    ], {}, flags.force);

    await ensureCollection('breakages', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'quantity'),
        fld('text', 'reason'),
    ], {}, flags.force);

    const { users } = await getCollectionsMap();

    // Stock adjustment approval workflow (request header + line items).
    // Requests are created as pending and only mutate warehouse_stock /
    // inventory_logs when an admin approves them.
    const REQUESTER_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager"';
    const ADJUST_VIEW_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager" || @request.auth.role = "auditor"';

    await ensureCollection('stock_adjustment_requests', 'base', [
        fld('date', 'date', { required: true }),
        fld('text', 'reference', { required: true, unique: true }),
        fld('select', 'direction', { required: true, values: ['increase', 'decrease'] }),
        fld('text', 'reason'),
        fld('text', 'notes'),
        fld('select', 'status', { required: true, values: ['pending', 'approved', 'rejected'] }),
        fld('text', 'requested_by', { required: true }),
        fld('text', 'requested_by_id'),
        fld('text', 'reviewed_by'),
        fld('date', 'reviewed_at'),
        fld('text', 'reject_reason'),
    ], {
        listRule: ADJUST_VIEW_RULE,
        viewRule: ADJUST_VIEW_RULE,
        createRule: REQUESTER_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    const { stock_adjustment_requests } = await getCollectionsMap();

    await ensureCollection('stock_adjustment_items', 'base', [
        fld('relation', 'request_id', { collectionId: stock_adjustment_requests.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
    ], {
        listRule: ADJUST_VIEW_RULE,
        viewRule: ADJUST_VIEW_RULE,
        createRule: REQUESTER_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    // Physical stock-take snapshots. system_qty is frozen at take time so the
    // Stock Report can compare take-time counts against current warehouse_stock.
    // warehouse_stock is never mutated by a take; corrections go through the
    // stock_adjustment_requests approval flow.
    const TAKE_VIEW_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager" || @request.auth.role = "auditor"';
    const TAKE_CREATE_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager"';

    await ensureCollection('stock_takes', 'base', [
        fld('date', 'date', { required: true }),
        fld('text', 'taken_by', { required: true }),
        fld('text', 'taken_by_id'),
        fld('text', 'notes'),
        fld('select', 'status', { required: true, values: ['submitted'] }),
    ], {
        listRule: TAKE_VIEW_RULE,
        viewRule: TAKE_VIEW_RULE,
        createRule: TAKE_CREATE_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    const { stock_takes } = await getCollectionsMap();

    await ensureCollection('stock_take_items', 'base', [
        fld('relation', 'take_id', { collectionId: stock_takes.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'system_qty', { required: true }),
        fld('number', 'physical_qty', { required: true }),
        fld('number', 'variance', { required: true }),
    ], {
        listRule: TAKE_VIEW_RULE,
        viewRule: TAKE_VIEW_RULE,
        createRule: TAKE_CREATE_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    // Monthly empties-on-ground counts. system_qty is frozen from
    // empties.quantity_on_ground at submit time so the report can compare
    // take-time counts against the live dynamic value. A take never mutates
    // the empties collection — variances are report-only.
    const EMPTIES_COUNT_VIEW_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager" || @request.auth.role = "auditor" || @request.auth.role = "empties_manager"';
    const EMPTIES_COUNT_CREATE_RULE = '@request.auth.role = "admin" || @request.auth.role = "operations_manager" || @request.auth.role = "warehouse_manager" || @request.auth.role = "empties_manager"';

    await ensureCollection('empties_count_takes', 'base', [
        fld('date', 'date', { required: true }),
        fld('text', 'taken_by', { required: true }),
        fld('text', 'taken_by_id'),
        fld('text', 'notes'),
        fld('select', 'status', { required: true, values: ['submitted'] }),
    ], {
        listRule: EMPTIES_COUNT_VIEW_RULE,
        viewRule: EMPTIES_COUNT_VIEW_RULE,
        createRule: EMPTIES_COUNT_CREATE_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    const { empties_count_takes } = await getCollectionsMap();

    await ensureCollection('empties_count_items', 'base', [
        fld('relation', 'take_id', { collectionId: empties_count_takes.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'system_qty', { required: true }),
        fld('number', 'physical_qty', { required: true }),
        fld('number', 'variance', { required: true }),
    ], {
        listRule: EMPTIES_COUNT_VIEW_RULE,
        viewRule: EMPTIES_COUNT_VIEW_RULE,
        createRule: EMPTIES_COUNT_CREATE_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    await ensureCollection('returns', 'base', [
        fld('relation', 'order_id', { collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
        fld('number', 'unit_price', { required: true }),
        fld('number', 'refund_amount', { required: true }),
        fld('text', 'reason'),
        fld('relation', 'handled_by', { collectionId: users.id, maxSelect: 1 }),
        fld('date', 'date', { required: true }),
    ], {}, flags.force);

    // Add 'created_by' + crate deposit fields to orders collection if missing on existing DBs
    const ordersCol = (await pb.collections.getFullList()).find((c) => c.name === 'orders');
    if (ordersCol) {
        const existingFieldNames = ordersCol.fields.map((f) => f.name);
        const extraOrderFields = [];
        if (!existingFieldNames.includes('created_by')) extraOrderFields.push(fld('relation', 'created_by', { collectionId: users.id, maxSelect: 1 }));
        if (!existingFieldNames.includes('crate_deposit_qty')) extraOrderFields.push(fld('number', 'crate_deposit_qty'));
        if (!existingFieldNames.includes('crate_deposit_total')) extraOrderFields.push(fld('number', 'crate_deposit_total'));
        if (extraOrderFields.length > 0) {
            if (!flags.dryRun) {
                await pb.collections.update(ordersCol.id, {
                    fields: [...ordersCol.fields, ...extraOrderFields],
                });
                console.log(`  [ok] added ${extraOrderFields.length} missing field(s) to orders`);
            } else {
                console.log(`  [dry-run] would add ${extraOrderFields.length} field(s) to orders`);
            }
        }
    }

    // Add deposit fields to empties_log on existing DBs so the POS can flag
    // which customer_purchase quantities were covered by a cash deposit.
    // The external empties-balance hook should allow projectedBalance >= -deposit_qty.
    const emptiesLogCol = (await pb.collections.getFullList()).find((c) => c.name === 'empties_log');
    if (emptiesLogCol) {
        const existingFieldNames = emptiesLogCol.fields.map((f) => f.name);
        const extraFields = [];
        if (!existingFieldNames.includes('deposit_qty')) extraFields.push(fld('number', 'deposit_qty'));
        if (!existingFieldNames.includes('deposit_total')) extraFields.push(fld('number', 'deposit_total'));
        if (extraFields.length > 0) {
            if (!flags.dryRun) {
                await pb.collections.update(emptiesLogCol.id, {
                    fields: [...emptiesLogCol.fields, ...extraFields],
                });
                console.log(`  [ok] added ${extraFields.length} missing field(s) to empties_log`);
            } else {
                console.log(`  [dry-run] would add ${extraFields.length} field(s) to empties_log`);
            }
        }
    }

    // Add the generated unique product_code to products on existing DBs.
    // code_name remains the shared category label (not unique).
    const productsCodeCol = (await pb.collections.getFullList()).find((c) => c.name === 'products');
    if (productsCodeCol) {
        const existingFieldNames = productsCodeCol.fields.map((f) => f.name);
        if (!existingFieldNames.includes('product_code')) {
            if (!flags.dryRun) {
                await pb.collections.update(productsCodeCol.id, {
                    fields: [...productsCodeCol.fields, fld('text', 'product_code', { unique: true })],
                });
                console.log('  [ok] added missing field product_code to products');
            } else {
                console.log('  [dry-run] would add missing field product_code to products');
            }
        }
    }

    await ensureCollection('app_settings', 'base', [
        fld('text', 'key', { required: true, unique: true }),
        { system: false, id: `fld_${Date.now().toString(36)}_${++fieldCounter}`, name: 'value', type: 'json', required: false, unique: false },
    ], {
        listRule: ADMIN_RULE,
        viewRule: ADMIN_RULE,
        createRule: ADMIN_RULE,
        updateRule: ADMIN_RULE,
        deleteRule: ADMIN_RULE,
    }, flags.force);

    // Seed default app_settings if empty
    const settingsCount = await pb.collection('app_settings').getList(1, 1, { perPage: 1 });
    if (settingsCount.totalItems === 0 && !flags.dryRun) {
        await pb.collection('app_settings').create({
            key: 'stock_thresholds',
            value: { low_max: 20, medium_max: 50 }
        });
        await pb.collection('app_settings').create({
            key: 'wholesale_surcharge',
            value: { amount: 2, product_ids: [] }
        });
        await pb.collection('app_settings').create({
            key: 'crate_deposit',
            value: { amount: 200 }
        });
        console.log('  [ok] seeded default app_settings');
    }

    // Seed crate_deposit setting on existing DBs that already have other settings
    if (!flags.dryRun) {
        try {
            await pb.collection('app_settings').getFirstListItem('key = "crate_deposit"');
        } catch {
            try {
                await pb.collection('app_settings').create({
                    key: 'crate_deposit',
                    value: { amount: 200 }
                });
                console.log('  [ok] seeded crate_deposit app_setting (200 GHc/crate)');
            } catch {
                // app_settings collection may not exist in dry-run / fresh flows
            }
        }
    }

    // Also create inventory_logs fields that may be missing on existing DBs
    const inventoryLogsCol = (await pb.collections.getFullList()).find((c) => c.name === 'inventory_logs');
    if (inventoryLogsCol) {
        const existingFieldNames = inventoryLogsCol.fields.map((f) => f.name);
        const extraFields = [];
        if (!existingFieldNames.includes('reference')) extraFields.push(fld('text', 'reference'));
        if (!existingFieldNames.includes('notes')) extraFields.push(fld('text', 'notes'));
        if (!existingFieldNames.includes('reason')) extraFields.push(fld('text', 'reason'));
        if (!existingFieldNames.includes('adjusted_by')) extraFields.push(fld('text', 'adjusted_by'));
        if (extraFields.length > 0 && !flags.dryRun) {
            await pb.collections.update(inventoryLogsCol.id, { fields: [...inventoryLogsCol.fields, ...extraFields] });
            console.log(`  [ok] added ${extraFields.length} missing field(s) to inventory_logs`);
        } else if (extraFields.length > 0) {
            console.log(`  [dry-run] would add ${extraFields.length} field(s) to inventory_logs`);
        }

        // Add 'customer_return' to the type select values if missing
        const typeField = inventoryLogsCol.fields.find((f) => f.name === 'type');
        if (typeField && Array.isArray(typeField.values) && !typeField.values.includes('customer_return')) {
            const updatedValues = [...typeField.values, 'customer_return'];
            const updatedFields = inventoryLogsCol.fields.map((f) =>
                f.name === 'type' ? { ...f, values: updatedValues } : f
            );
            if (!flags.dryRun) {
                await pb.collections.update(inventoryLogsCol.id, { fields: updatedFields });
                console.log('  [ok] added "customer_return" to inventory_logs.type values');
            } else {
                console.log('  [dry-run] would add "customer_return" to inventory_logs.type values');
            }
        }
    }

    // Add ex_factory_price to products collection if missing on existing DBs
    const productsCol = (await pb.collections.getFullList()).find((c) => c.name === 'products');
    if (productsCol) {
        const existingFieldNames = productsCol.fields.map((f) => f.name);
        if (!existingFieldNames.includes('ex_factory_price')) {
            if (!flags.dryRun) {
                await pb.collections.update(productsCol.id, {
                    fields: [...productsCol.fields, fld('number', 'ex_factory_price')]
                });
                console.log('  [ok] added ex_factory_price field to products');
            } else {
                console.log('  [dry-run] would add ex_factory_price field to products');
            }
        }
    }

    console.log('\n[2/4] Configuring users collection (role field + rules)...');
    const usersCol = (await pb.collections.getFullList()).find((c) => c.name === 'users');
    if (!usersCol) {
        console.error('Error: users auth collection not found.');
        process.exit(1);
    }
    const ROLE_VALUES = ['admin', 'empties_manager', 'operations_manager', 'warehouse_manager', 'sales_manager', 'cashier', 'auditor'];
    const hasRole = usersCol.fields.some((f) => f.name === 'role');
    const fields = hasRole
        ? usersCol.fields.map((f) => (f.name === 'role' && f.type === 'select' && !(f.values || []).includes('warehouse_manager')
            ? { ...f, values: [...(f.values || []), 'warehouse_manager'] }
            : f))
        : [...usersCol.fields, fld('select', 'role', { values: ROLE_VALUES, maxSelect: 1 })];
    if (!flags.dryRun) {
        await pb.collections.update(usersCol.id, {
            fields,
            listRule: ADMIN_RULE,
            viewRule: `@request.auth.id = id || ${ADMIN_RULE}`,
            createRule: ADMIN_RULE,
            updateRule: `@request.auth.id = id || ${ADMIN_RULE}`,
            deleteRule: ADMIN_RULE,
        });
        console.log('  [ok] users collection configured');
    } else {
        console.log('  [dry-run] would configure users collection');
    }

    console.log('\n[3/4] Seeding reference data...');
    await seedIfEmpty('customer_types', ['Retailer', 'Wholesaler', 'Retailer (VSE)'].map((name) => ({ name })), flags.force);
    await seedIfEmpty('order_types', ['sale', 'vse', 'promo', 'protocol'].map((name) => ({ name })), flags.force);

    const productCount = await pb.collection('products').getList(1, 1, { perPage: 1 });
    if (productCount.totalItems === 0 || flags.force) {
        if (flags.force) {
            await wipeCollectionData('products');
        }
        const productsToInsert = assignSeedProductCodes(parseProductsCsv());
        if (productsToInsert.length > 0 && !flags.dryRun) {
            for (const product of productsToInsert) {
                await pb.collection('products').create(product);
            }
            console.log(`  [ok] imported ${productsToInsert.length} products from CSV`);
        } else if (productsToInsert.length > 0) {
            console.log(`  [dry-run] would import ${productsToInsert.length} products from CSV`);
        } else {
            console.log('  [skip] products CSV was empty');
        }
    } else {
        console.log('  [skip] products already imported');
    }

    // Seed empties rows for returnable products (quantity defaults to 0)
    const emptiesCount = await pb.collection('empties').getList(1, 1, { perPage: 1 });
    if (emptiesCount.totalItems === 0 || flags.force) {
        if (flags.force) {
            await wipeCollectionData('empties');
        }
        const returnable = await pb.collection('products').getFullList({ filter: 'returnable = true' });
        if (returnable.length > 0 && !flags.dryRun) {
            for (const p of returnable) {
                await pb.collection('empties').create({
                    product_id: p.id,
                    quantity_in_trade: 0,
                    quantity_on_ground: 0,
                });
            }
            console.log(`  [ok] seeded ${returnable.length} empties rows`);
        } else if (returnable.length > 0) {
            console.log(`  [dry-run] would seed ${returnable.length} empties rows`);
        } else {
            console.log('  [skip] no returnable products to seed empties for');
        }
    } else {
        console.log('  [skip] empties already seeded');
    }

    // Seed warehouse_stock for all products
    const stockCount = await pb.collection('warehouse_stock').getList(1, 1, { perPage: 1 });
    if (stockCount.totalItems === 0 || flags.force) {
        if (flags.force) {
            await wipeCollectionData('warehouse_stock');
        }
        const allProducts = await pb.collection('products').getFullList({ filter: 'deleted_at = ""' });
        if (allProducts.length > 0 && !flags.dryRun) {
            for (const p of allProducts) {
                await pb.collection('warehouse_stock').create({
                    product_id: p.id,
                    quantity: 0,
                });
            }
            console.log(`  [ok] seeded ${allProducts.length} warehouse_stock rows`);
        } else if (allProducts.length > 0) {
            console.log(`  [dry-run] would seed ${allProducts.length} warehouse_stock rows`);
        }
    } else {
        console.log('  [skip] warehouse_stock already seeded');
    }

    console.log('\n[4/4] Creating app admin user...');
    const adminExists = await pb.collection('users').getFullList({ filter: 'email = "adminopk@mail.com"' });
    if (adminExists.length === 0 || flags.force) {
        if (flags.force && adminExists.length > 0 && !flags.dryRun) {
            await pb.collection('users').delete(adminExists[0].id);
            console.log('  [wipe] deleted existing admin user');
        }
        if (!flags.dryRun) {
            await pb.collection('users').create({
                email: 'adminopk@mail.com',
                password: ADMIN_PASSWORD,
                passwordConfirm: ADMIN_PASSWORD,
                name: 'Admin User',
                role: 'admin',
            });
            console.log('  [ok] created admin user adminopk@mail.com');
        } else {
            console.log('  [dry-run] would create admin user adminopk@mail.com');
        }
    } else {
        console.log('  [skip] admin user already exists');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Setup complete. Collections are ready.');
    console.log('='.repeat(60));
}

main().catch((err) => {
    console.error('Setup failed:', err?.message || err);
    process.exit(1);
});
