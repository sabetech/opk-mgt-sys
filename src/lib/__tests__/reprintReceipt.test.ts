import { beforeEach, describe, expect, it, vi } from "vitest";
import { pb } from "../pocketbase";
import { buildCompletedSaleForReprint } from "../reprintReceipt";

const order = {
    id: "order-1",
    order_number: 100008,
    date_time: "2026-10-01 16:02:54.657Z",
    total_amount: 230,
    payment_type: "cash",
    created_by: "user-9",
    crate_deposit_qty: 0,
    crate_deposit_total: 0,
    expand: { customer_id: { id: "cust-1", name: "Kofi" } },
};

const lines = [
    {
        // plain line: 2 x 50 = 100
        quantity: 2, unit_price: 50, sub_total: 100, discount: 0,
        expand: { product_id: { sku_name: "Guinness", product_code: "GST-001" } },
    },
    {
        // discount line: 2 x (50 - 2) = 96, discount stored as line total 4
        quantity: 2, unit_price: 50, sub_total: 96, discount: 4,
        expand: { product_id: { sku_name: "Star", product_code: "ST-001" } },
    },
    {
        // surcharge line: 2 x (10 + 2) = 24
        quantity: 2, unit_price: 10, sub_total: 24, discount: 0,
        expand: { product_id: { sku_name: "Orijin", product_code: "OR-001" } },
    },
];

function mockDb(overrides: { order?: any; lines?: any[] } = {}) {
    vi.spyOn(pb, "collection").mockImplementation((name: string) => {
        if (name === "orders") {
            return { getOne: vi.fn(async () => overrides.order ?? order) } as never;
        }
        if (name === "sales") {
            return { getFullList: vi.fn(async () => overrides.lines ?? lines) } as never;
        }
        // customers / users lookups fail (e.g. role view rules) -> null fallbacks
        return {
            getOne: vi.fn(async () => { throw new Error("forbidden"); }),
        } as never;
    });
}

describe("buildCompletedSaleForReprint", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("maps lines, derives surcharge, reconciles totals", async () => {
        mockDb();
        const sale = await buildCompletedSaleForReprint("order-1");
        expect(sale.orderNumber).toBe(100008);
        expect(sale.customerName).toBe("Kofi");
        expect(sale.servedBy).toBeNull();
        expect(sale.items).toHaveLength(3);

        const [plain, discounted, surcharged] = sale.items;
        expect(plain.surcharge).toBe(0);
        expect(plain.discount).toBe(0);
        expect(discounted.surcharge).toBe(0);
        expect(discounted.discount).toBeCloseTo(2);
        expect(surcharged.surcharge).toBeCloseTo(2);
        // displayed line totals reconcile to stored sub_totals
        expect(plain.quantity * (plain.price + plain.surcharge - (plain.discount || 0))).toBeCloseTo(100);
        expect(discounted.quantity * (discounted.price + discounted.surcharge - (discounted.discount || 0))).toBeCloseTo(96);
        expect(surcharged.quantity * (surcharged.price + surcharged.surcharge - (surcharged.discount || 0))).toBeCloseTo(24);

        expect(sale.totalQuantity).toBe(6);
        expect(sale.grandTotal).toBe(230);
    });

    it("falls back to Walk-in without customer and throws with no lines", async () => {
        mockDb({ order: { ...order, expand: {} } });
        const sale = await buildCompletedSaleForReprint("order-1");
        expect(sale.customerName).toBe("Walk-in");

        mockDb({ lines: [] });
        await expect(buildCompletedSaleForReprint("order-1")).rejects.toThrow("No sale lines");
    });
});
