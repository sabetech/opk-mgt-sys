import { pb } from "./pocketbase";
import type { CompletedSale, ReceiptItem } from "./receipt";

/**
 * Rebuilds a printable CompletedSale from a persisted order so a receipt
 * can be reprinted long after the sale (e.g. from the Orders list).
 *
 * Stored `sales` rows keep the base unit price, the line discount total
 * and the line subtotal, but not the per-unit surcharge. Since a line gets
 * either a surcharge or a discount (never both), the surcharge is derived:
 *   surcharge = sub_total / quantity - unit_price + discount / quantity
 * which is 0 for plain/discounted lines and the surcharge amount otherwise.
 * Displayed line totals always reconcile to the stored sub_total.
 */
export async function buildCompletedSaleForReprint(orderId: string): Promise<CompletedSale> {
    const order: any = await pb.collection("orders").getOne(orderId, {
        expand: "customer_id",
    });
    if (!order) throw new Error("Order not found.");

    const customer = order.expand?.customer_id ?? null;

    // Customer type (best-effort: used for the receipt header only).
    let customerType: string | null = customer?.expand?.type_id?.name ?? null;
    if (!customerType && customer?.id) {
        try {
            const full: any = await pb.collection("customers").getOne(customer.id, {
                expand: "type_id",
                // NOTE: `expand` must be listed in `fields` or this host drops it
                fields: "id, type_id, expand",
            });
            customerType = full?.expand?.type_id?.name ?? null;
        } catch {
            customerType = null;
        }
    }

    // Server who recorded the sale (best-effort: users view rules may hide
    // other users from non-admin roles; the receipt omits the line then).
    let servedBy: string | null = null;
    if (order.created_by) {
        try {
            const user: any = await pb.collection("users").getOne(order.created_by, {
                fields: "id, name",
            });
            servedBy = user?.name ?? null;
        } catch {
            servedBy = null;
        }
    }

    const lines: any[] = await pb.collection("sales").getFullList({
        filter: `order_id = "${orderId}" && deleted_at = ""`,
        expand: "product_id",
    });
    if (lines.length === 0) throw new Error("No sale lines found for this order.");

    const items: ReceiptItem[] = lines.map((r) => {
        const product = r.expand?.product_id ?? null;
        const quantity = r.quantity || 0;
        const discountTotal = r.discount || 0;
        const discount = quantity > 0 ? discountTotal / quantity : 0;
        const subTotal = r.sub_total ?? (r.unit_price || 0) * quantity;
        const surcharge = quantity > 0 ? subTotal / quantity - (r.unit_price || 0) + discount : 0;
        return {
            productName: product?.sku_name ?? "Unknown product",
            skuCode: product?.product_code ?? product?.code_name ?? "",
            quantity,
            price: r.unit_price || 0,
            // Guard float dust so plain lines never print a surcharge note.
            surcharge: Math.abs(surcharge) < 0.005 ? 0 : surcharge,
            discount,
            total: subTotal,
        };
    });

    const depositQty = order.crate_deposit_qty ?? 0;
    const depositTotal = order.crate_deposit_total ?? 0;

    return {
        orderNumber: order.order_number,
        dateTime: order.date_time ? new Date(order.date_time) : new Date(),
        customerName: customer?.name ?? "Walk-in",
        customerType,
        paymentType: order.payment_type ?? "cash",
        servedBy,
        items,
        totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        grandTotal: order.total_amount ?? items.reduce((sum, i) => sum + i.total, 0),
        crateDepositQty: depositQty,
        crateDepositTotal: depositTotal,
        crateDepositUnitAmount: depositQty > 0 ? depositTotal / depositQty : 0,
    };
}
