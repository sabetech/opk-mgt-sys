// One-off yard-stock baseline: seeds `empties.quantity_on_ground` and
// `empties.quantity_in_trade` per product from recorded history.
//
// Rules:
// - TRADE per product = sum over customers of per-product debt:
//   opening_balance details (+) + customer_purchase details (+)
//   - customer_empties_return details (-). Supplier logs (no customer_id)
//   are ignored. No clamping — negatives are reconciliation signals.
// - LEGACY openings: pre-breakdown `customers.balance` totals have no
//   product split, so each such balance is allocated across that customer's
//   products pro-rata by their all-time purchase-detail mix. Customers that
//   already have opening_balance detail rows are skipped (their balance is
//   covered by the details above — allocating again would double count).
//   Customers with no purchase history at all get their full opening
//   attributed to the DEFAULT_PRODUCT (ABC MINI 330) instead of being left
//   unattributed.
// - GROUND per product = latest physical count (empties_count_items by take
//   date), falling back to the currently stored quantity_on_ground.
//
// Usage:
//   node scripts/backfill-empties-yard.js --email=admin@opk.com --password='secret' [--url=...] [--dry-run|--apply]
//   Default is --dry-run (preview only). --apply executes.

import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config();

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
    console.error('  node scripts/backfill-empties-yard.js --email=admin@opk.com --password=\'secret\' [--url=...] [--dry-run|--apply]');
    process.exit(1);
}

function effectOf(activity) {
    if (activity === 'customer_purchase') return 1;
    if (activity === 'opening_balance') return 1;
    if (activity === 'customer_empties_return') return -1;
    return 0;
}

async function main() {
    const dryRun = !apply;
    const pb = new PocketBase(PB_URL);
    await pb.collection('_superusers').authWithPassword(SUPERUSER_EMAIL, SUPERUSER_PASSWORD);

    const [headers, details, customers, takes, takeItems, currentRows, products] = await Promise.all([
        pb.collection('empties_log').getFullList({ fields: 'id, customer_id, activity, total_quantity' }),
        pb.collection('empties_log_detail').getFullList({ fields: 'log_id, product_id, quantity' }),
        pb.collection('customers').getFullList({ fields: 'id, balance, deleted_at' }),
        pb.collection('empties_count_takes').getFullList({ fields: 'id, date' }).catch(() => []),
        pb.collection('empties_count_items').getFullList({ fields: 'take_id, product_id, physical_qty' }).catch(() => []),
        pb.collection('empties').getFullList({ fields: 'id, product_id, quantity_on_ground, quantity_in_trade' }).catch(() => []),
        pb.collection('products').getFullList({ filter: 'deleted_at = ""', fields: 'id, sku_name' }).catch(() => []),
    ]);

    const headerById = new Map(headers.map((h) => [h.id, h]));
    const names = new Map(products.map((p) => [p.id, p.sku_name || p.id]));
    const label = (pid) => names.get(pid) || pid.slice(0, 8);

    // Default product for openings with no product split (no purchase mix
    // to allocate by). Resolved by name so no ID is hardcoded.
    const defaultProduct = products.find(
        (p) => String(p.sku_name || '').trim().toLowerCase() === 'abc mini 330'
    );
    const defaultPid = defaultProduct?.id || null;
    if (!defaultPid) {
        console.error('Error: default product "ABC MINI 330" not found — cannot attribute unsplit openings.');
        process.exit(1);
    }

    // Per-product trade from customer ledger details.
    const trade = new Map();
    const addTrade = (pid, qty) => {
        if (!pid || !qty) return;
        trade.set(pid, (trade.get(pid) || 0) + qty);
    };
    // Per-customer purchase mix (for legacy opening allocation) + customers
    // that already carry opening_balance detail rows.
    const purchaseMix = new Map(); // customerId -> Map(productId -> qty)
    const hasOpeningDetails = new Set();
    for (const d of details) {
        const h = headerById.get(d.log_id);
        if (!h || !h.customer_id) continue; // supplier / unlinked logs
        const eff = effectOf(h.activity);
        if (eff !== 0) addTrade(d.product_id, eff * (d.quantity || 0));
        if (h.activity === 'opening_balance') hasOpeningDetails.add(h.customer_id);
        if (h.activity === 'customer_purchase') {
            if (!purchaseMix.has(h.customer_id)) purchaseMix.set(h.customer_id, new Map());
            const mix = purchaseMix.get(h.customer_id);
            mix.set(d.product_id, (mix.get(d.product_id) || 0) + (d.quantity || 0));
        }
    }

    // Legacy total-only openings, allocated pro-rata by purchase mix —
    // or to the default product when there is no mix to allocate by.
    const defaultedCustomers = [];
    for (const c of customers) {
        const opening = c.balance || 0;
        if (!(opening > 0) || hasOpeningDetails.has(c.id)) continue;
        const mix = purchaseMix.get(c.id);
        const mixTotal = mix ? [...mix.values()].reduce((a, b) => a + b, 0) : 0;
        if (!mix || mixTotal <= 0) {
            addTrade(defaultPid, opening);
            defaultedCustomers.push({ id: c.id, opening });
            continue;
        }
        let assigned = 0;
        const entries = [...mix.entries()];
        entries.forEach(([pid, qty], idx) => {
            const share = idx === entries.length - 1
                ? opening - assigned // last line absorbs rounding
                : Math.floor((opening * qty) / mixTotal);
            assigned += share;
            addTrade(pid, share);
        });
    }

    // Ground baseline: latest physical count per product, else stored value.
    const takeDate = new Map(takes.map((t) => [t.id, String(t.date || '').slice(0, 10)]));
    const latestCount = new Map(); // productId -> { date, qty }
    for (const item of takeItems) {
        const date = takeDate.get(item.take_id) || '';
        const prev = latestCount.get(item.product_id);
        if (!prev || date >= prev.date) {
            latestCount.set(item.product_id, { date, qty: item.physical_qty || 0 });
        }
    }
    const stored = new Map(currentRows.map((r) => [r.product_id, r]));
    const productIds = new Set([...trade.keys(), ...latestCount.keys(), ...stored.keys()]);

    const plan = [];
    for (const pid of productIds) {
        const cur = stored.get(pid);
        const ground = latestCount.has(pid) ? latestCount.get(pid).qty : (cur?.quantity_on_ground || 0);
        const newTrade = trade.get(pid) || 0;
        const oldTrade = cur?.quantity_in_trade || 0;
        const oldGround = cur?.quantity_on_ground || 0;
        if (ground !== oldGround || newTrade !== oldTrade || !cur) {
            plan.push({ pid, ground, newTrade, oldGround, oldTrade, exists: !!cur, id: cur?.id });
        }
    }

    console.log(`Products with yard changes: ${plan.length}`);
    for (const p of plan.sort((a, b) => label(a.pid).localeCompare(label(b.pid)))) {
        console.log(
            `  ${p.exists ? 'update' : 'create'} ${label(p.pid)}: ` +
            `ground ${p.oldGround} -> ${p.ground}, trade ${p.oldTrade} -> ${p.newTrade}`
        );
    }
    const tradeTotal = [...trade.values()].reduce((a, b) => a + b, 0);
    console.log(`Trade total across products: ${tradeTotal}`);
    if (defaultedCustomers.length > 0) {
        const defaultedQty = defaultedCustomers.reduce((a, c) => a + c.opening, 0);
        console.log(`Openings with no product split defaulted to ${label(defaultPid)}: ${defaultedQty} crates across ${defaultedCustomers.length} customer(s):`);
        for (const c of defaultedCustomers) console.log(`  customer ${c.id} (${c.opening} crates)`);
    }

    if (dryRun) {
        console.log('Dry run — no changes made. Rerun with --apply to execute.');
        return;
    }
    for (const p of plan) {
        if (p.exists) {
            await pb.collection('empties').update(p.id, {
                quantity_on_ground: p.ground,
                quantity_in_trade: p.newTrade,
            });
        } else {
            await pb.collection('empties').create({
                product_id: p.pid,
                quantity_on_ground: p.ground,
                quantity_in_trade: p.newTrade,
            });
        }
    }
    console.log(`Applied ${plan.length} yard row(s).`);
}

main().catch((err) => {
    console.error('Backfill failed:', err?.message || err);
    process.exit(1);
});
