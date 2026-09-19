import { pb } from "./pocketbase";

export interface CustomerBalance {
    /** Stored opening balance (customers.balance) — set at creation/import. */
    opening: number;
    /** Net empties_log movement: returns (+) minus purchases (−). */
    ledger: number;
    /** Live crates balance: opening + ledger. */
    balance: number;
}

/**
 * Live per-customer crates balance.
 *
 * `customers.balance` is only ever an *opening* figure — no checkout, return
 * or cancellation flow writes it. The live position lives in `empties_log`
 * (`customer_purchase` debits returnable crates, `customer_empties_return`
 * credits them back), so every display of a customer's balance must go
 * through here instead of reading the stored field directly.
 */
export async function fetchCustomerBalances(
    openings: Record<string, number>
): Promise<Record<string, CustomerBalance>> {
    const ids = Object.keys(openings);
    const result: Record<string, CustomerBalance> = {};
    for (const id of ids) {
        const opening = openings[id] || 0;
        result[id] = { opening, ledger: 0, balance: opening };
    }
    if (ids.length === 0) return result;

    const logs = await pb.collection("empties_log").getFullList({
        filter: ids.map((id) => `customer_id = "${id}"`).join(" || "),
        fields: "customer_id, activity, total_quantity",
    });
    for (const log of logs) {
        const entry = result[log.customer_id];
        if (!entry) continue;
        if (log.activity === "customer_empties_return") {
            entry.ledger += log.total_quantity || 0;
        } else if (log.activity === "customer_purchase") {
            entry.ledger -= log.total_quantity || 0;
        }
    }
    for (const id of ids) {
        result[id].balance = result[id].opening + result[id].ledger;
    }
    return result;
}

/** Convenience wrapper for a single customer. */
export async function fetchCustomerBalance(
    customerId: string,
    opening: number
): Promise<number> {
    const map = await fetchCustomerBalances({ [customerId]: opening });
    return map[customerId]?.balance ?? opening;
}
