// PocketBase setup script for OPK Management System.
// Creates all collections, seeds reference data, imports products from CSV,
// seeds empties rows and creates the initial app admin user.
//
// Usage:
//   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... node scripts/setup-pocketbase.js
//
// Optional env vars:
//   VITE_POCKETBASE_URL  (default http://127.0.0.1:8090)
//   OPK_ADMIN_PASSWORD   (default "blender3D")
//
// The script is idempotent: existing collections are skipped.

import PocketBase from 'pocketbase';
import fs from 'fs';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PB_URL = process.env.VITE_POCKETBASE_URL || process.env.PB_URL || 'http://127.0.0.1:8090';
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL;
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD;
const ADMIN_PASSWORD = process.env.OPK_ADMIN_PASSWORD || 'blender3D';

if (!SUPERUSER_EMAIL || !SUPERUSER_PASSWORD) {
    console.error('Error: PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD env vars are required.');
    process.exit(1);
}

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

async function ensureCollection(name, type, fields, rules = {}) {
    const existing = await pb.collections.getFullList();
    if (existing.some((c) => c.name === name)) {
        console.log(`  [skip] collection "${name}" already exists`);
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

async function seedIfEmpty(collectionName, rows) {
    const count = await pb.collection(collectionName).getList(1, 1, { perPage: 1 });
    if (count.totalItems > 0) {
        console.log(`  [skip] seeding "${collectionName}" (already has data)`);
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log(`Connecting to PocketBase at ${PB_URL}...`);
    await pb.admins.authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);
    console.log('Superuser authenticated.');

    console.log('\n[1/4] Creating collections...');

    // No dependencies
    await ensureCollection('customer_types', 'base', [
        fld('text', 'name', { required: true, unique: true }),
    ]);

    await ensureCollection('order_types', 'base', [
        fld('text', 'name', { required: true, unique: true }),
    ]);

    await ensureCollection('products', 'base', [
        fld('text', 'sku_name', { required: true }),
        fld('bool', 'returnable'),
        fld('text', 'code_name'),
        fld('number', 'wholesale_price'),
        fld('number', 'retail_price'),
        fld('date', 'deleted_at'),
    ]);

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
    ]);

    // Depends on: customer_types
    const { customer_types, order_types, products, inventory_receivables } = await getCollectionsMap();

    await ensureCollection('customers', 'base', [
        fld('text', 'name', { required: true }),
        fld('text', 'phone'),
        fld('relation', 'type_id', { collectionId: customer_types.id }),
        fld('number', 'balance'),
        fld('bool', 'has_mou'),
        fld('date', 'deleted_at'),
    ]);

    // Depends on: products
    await ensureCollection('empties', 'base', [
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity_in_trade'),
        fld('number', 'quantity_on_ground'),
    ]);

    // Depends on: products
    await ensureCollection('warehouse_stock', 'base', [
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ]);

    // Depends on: products
    await ensureCollection('inventory_logs', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('select', 'type', {
            required: true,
            values: ['supplier_receipt', 'vse_loadout', 'retail_sale', 'wholesale_sale', 'breakage', 'promo_out', 'promo_reimbursement', 'opening_stock'],
        }),
        fld('number', 'quantity', { required: true }),
        fld('text', 'reference_id'),
        fld('text', 'reference_table'),
        fld('text', 'description'),
    ]);

    // Depends on: inventory_receivables, products
    await ensureCollection('inventory_receivable_items', 'base', [
        fld('relation', 'receivable_id', { collectionId: inventory_receivables.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'qty', { required: true }),
        fld('date', 'date', { required: true }),
    ]);

    // Depends on: customers
    const { customers, empties, warehouse_stock, inventory_logs } = await getCollectionsMap();

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
    ]);

    // Depends on: order_types, customers
    await ensureCollection('orders', 'base', [
        fld('relation', 'customer_id', { collectionId: customers.id, maxSelect: 1 }),
        fld('number', 'total_amount', { required: true }),
        fld('number', 'amount_tendered'),
        fld('text', 'payment_type'),
        fld('text', 'transaction_id'),
        fld('relation', 'order_type_id', { collectionId: order_types.id, maxSelect: 1 }),
        fld('date', 'date_time', { required: true }),
        fld('select', 'status', { required: true, values: ['pending', 'approved', 'cancelled'] }),
        fld('date', 'deleted_at'),
    ]);

    // Depends on: loadouts... (order first) then warehouse_orders, loadouts
    const { empties_log, orders } = await getCollectionsMap();

    await ensureCollection('empties_log_detail', 'base', [
        fld('relation', 'log_id', { collectionId: empties_log.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ]);

    await ensureCollection('sales', 'base', [
        fld('relation', 'order_id', { collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'discount'),
        fld('number', 'quantity', { required: true }),
        fld('number', 'unit_price', { required: true }),
        fld('number', 'sub_total', { required: true }),
        fld('date', 'deleted_at'),
    ]);

    await ensureCollection('warehouse_orders', 'base', [
        fld('relation', 'order_id', { collectionId: orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('select', 'status', { required: true, values: ['pending', 'ready', 'cancelled'] }),
    ]);

    // Depends on: customers (VSE customers)
    await ensureCollection('loadouts', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'vse_id', { collectionId: customers.id, required: true, maxSelect: 1 }),
        fld('select', 'status', { required: true, values: ['pending', 'approved', 'cancelled'] }),
    ]);

    const { warehouse_orders, loadouts, sales } = await getCollectionsMap();

    await ensureCollection('warehouse_order_items', 'base', [
        fld('relation', 'warehouse_order_id', { collectionId: warehouse_orders.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'quantity', { required: true }),
    ]);

    await ensureCollection('loadout_items', 'base', [
        fld('relation', 'loadout_id', { collectionId: loadouts.id, required: true, maxSelect: 1, cascadeDelete: true }),
        fld('relation', 'product_id', { collectionId: products.id, required: true, maxSelect: 1 }),
        fld('number', 'quantity'),
    ]);

    await ensureCollection('breakages', 'base', [
        fld('date', 'date', { required: true }),
        fld('relation', 'product_id', { collectionId: products.id, maxSelect: 1 }),
        fld('number', 'quantity'),
        fld('text', 'reason'),
    ]);

    console.log('\n[2/4] Configuring users collection (role field + rules)...');
    const usersCol = (await pb.collections.getFullList()).find((c) => c.name === 'users');
    if (!usersCol) {
        console.error('Error: users auth collection not found.');
        process.exit(1);
    }
    const hasRole = usersCol.fields.some((f) => f.name === 'role');
    const fields = hasRole
        ? usersCol.fields
        : [...usersCol.fields, fld('select', 'role', { values: ['admin', 'empties_manager', 'operations_manager', 'sales_manager', 'cashier', 'auditor'], maxSelect: 1 })];
    await pb.collections.update(usersCol.id, {
        fields,
        listRule: ADMIN_RULE,
        viewRule: `@request.auth.id = id || ${ADMIN_RULE}`,
        createRule: ADMIN_RULE,
        updateRule: `@request.auth.id = id || ${ADMIN_RULE}`,
        deleteRule: ADMIN_RULE,
    });
    console.log('  [ok] users collection configured');

    console.log('\n[3/4] Seeding reference data...');
    await seedIfEmpty('customer_types', ['Retailer', 'Wholesaler', 'Retailer (VSE)'].map((name) => ({ name })));
    await seedIfEmpty('order_types', ['sale', 'vse', 'promo', 'protocol'].map((name) => ({ name })));

    const productCount = await pb.collection('products').getList(1, 1, { perPage: 1 });
    if (productCount.totalItems === 0) {
        const productsToInsert = parseProductsCsv();
        if (productsToInsert.length > 0) {
            for (const product of productsToInsert) {
                await pb.collection('products').create(product);
            }
            console.log(`  [ok] imported ${productsToInsert.length} products from CSV`);
        } else {
            console.log('  [skip] products CSV was empty');
        }
    } else {
        console.log('  [skip] products already imported');
    }

    // Seed empties rows for returnable products (quantity defaults to 0)
    const emptiesCount = await pb.collection('empties').getList(1, 1, { perPage: 1 });
    if (emptiesCount.totalItems === 0) {
        const returnable = await pb.collection('products').getFullList({ filter: 'returnable = true' });
        if (returnable.length > 0) {
            for (const p of returnable) {
                await pb.collection('empties').create({
                    product_id: p.id,
                    quantity_in_trade: 0,
                    quantity_on_ground: 0,
                });
            }
            console.log(`  [ok] seeded ${returnable.length} empties rows`);
        } else {
            console.log('  [skip] no returnable products to seed empties for');
        }
    } else {
        console.log('  [skip] empties already seeded');
    }

    console.log('\n[4/4] Creating app admin user...');
    const adminExists = await pb.collection('users').getFullList({ filter: 'email = "adminopk@mail.com"' });
    if (adminExists.length === 0) {
        await pb.collection('users').create({
            email: 'adminopk@mail.com',
            password: ADMIN_PASSWORD,
            passwordConfirm: ADMIN_PASSWORD,
            name: 'Admin User',
            role: 'admin',
        });
        console.log('  [ok] created admin user adminopk@mail.com');
    } else {
        console.log('  [skip] admin user already exists');
    }

    console.log('\nSetup complete. Collections are ready.');
}

main().catch((err) => {
    console.error('Setup failed:', err?.message || err);
    process.exit(1);
});