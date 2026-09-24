import { pb } from "./pocketbase";
import { fetchCustomerBalance } from "./customerBalance";

/**
 * Hook-free replacement for the `empties_log` server hook's purchase guard.
 *
 * Semantics (unchanged from the app's ledger model):
 * - `customers.balance` is an *opening* figure and is never written here.
 *   The live position is opening + `empties_log` ledger (see
 *   `fetchCustomerBalance`).
 * - Only Wholesalers with an MOU may drive their balance negative.
 * - Everyone else must cover the purchase with live balance + any
 *   refundable crate deposit collected on the same sale. (The old hook was
 *   deposit-blind; this guard honors the deposit the POS UI enforces.)
 *
 * Throws an Error with the same message the hook produced so existing
 * error handling keeps working.
 */
export async function assertEmptiesPurchaseAllowed(
    customerId: string,
    totalQuantity: number,
    depositCover = 0
): Promise<void> {
    if (!customerId || totalQuantity <= 0) return;

    interface EmptiesCustomer {
        balance?: number | null;
        has_mou?: boolean | null;
        expand?: { type_id?: { name?: string | null } | null } | null;
    }

    const customer: EmptiesCustomer | null = await pb
        .collection("customers")
        .getOne(customerId, {
            expand: "type_id",
            fields: "id, balance, has_mou, type_id, expand",
        })
        .catch(() => null);

    const opening = customer?.balance || 0;
    const live = await fetchCustomerBalance(customerId, opening).catch(
        () => opening
    );

    const isMouWholesaler =
        customer?.expand?.type_id?.name === "Wholesaler" &&
        customer?.has_mou === true;

    if (!isMouWholesaler && live - totalQuantity + (depositCover || 0) < 0) {
        throw new Error(
            `Insufficient empties balance. Customer is not a Wholesaler with an MOU. Current balance: ${live}, requested: ${totalQuantity}`
        );
    }
}
