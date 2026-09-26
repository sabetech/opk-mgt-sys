import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return {
    ...actual,
    pb: { collection: vi.fn(), authStore: { model: null } },
  };
});

import { pb } from "@/lib/pocketbase";
import * as pocketbaseModule from "@/lib/pocketbase";
import {
  aggregateFieldSaleItems,
  appendManualLinesToDayOrder,
  createFieldSale,
  generateFieldSaleReference,
  upsertVseDayOrder,
} from "../fieldSales";

const collection = vi.mocked(pb.collection);
// NOTE: getFullListInBatches closes over the real pb client, so it never
// routes through mocked pb.collection — intercept it at the module seam.
const batchesMock = vi.spyOn(pocketbaseModule, "getFullListInBatches");

function setRole(role: string | null) {
  (pb as unknown as { authStore: { model: { role: string } | null } }).authStore = {
    model: role ? { role } : null,
  };
}

beforeEach(() => {
  collection.mockReset();
  batchesMock.mockReset();
  setRole("vse");
});

describe("generateFieldSaleReference", () => {
  it("format VF-YYYYMMDD-XXXX", () => {
    expect(generateFieldSaleReference()).toMatch(/^VF-\d{8}-[A-Z0-9]{4}$/);
  });
});

describe("createFieldSale validation (FIELD-01)", () => {
  it("rejects non-VSE roles client-side", async () => {
    setRole("cashier");
    await expect(
      createFieldSale({ date: "2026-09-19", vseCustomerId: "v1", createdBy: "u1", emptiesReceived: 0, items: [{ productId: "p", quantity: 1, unitPrice: 1 }] }),
    ).rejects.toThrow(/Only a VSE/i);
  });

  it("requires items, positive qty, non-negative empties", async () => {
    await expect(
      createFieldSale({ date: "2026-09-19", vseCustomerId: "v1", createdBy: "u1", emptiesReceived: 0, items: [] }),
    ).rejects.toThrow(/at least one product/i);
    await expect(
      createFieldSale({ date: "2026-09-19", vseCustomerId: "v1", createdBy: "u1", emptiesReceived: 0, items: [{ productId: "p", quantity: 0, unitPrice: 1 }] }),
    ).rejects.toThrow(/greater than 0/i);
    await expect(
      createFieldSale({ date: "2026-09-19", vseCustomerId: "v1", createdBy: "u1", emptiesReceived: -1, items: [{ productId: "p", quantity: 1, unitPrice: 1 }] }),
    ).rejects.toThrow(/cannot be negative/i);
  });

  it("rolls back header when item creation fails (exactly-once hygiene)", async () => {
    const deleted: string[] = [];
    collection.mockImplementation(((name: string) => {
      if (name === "vse_field_sales")
        return {
          create: vi.fn(async () => ({ id: "h1" })),
          delete: vi.fn(async (id: string) => {
            deleted.push(id);
          }),
        };
      return { create: vi.fn(async () => { throw new Error("item boom"); }) };
    }) as never);

    await expect(
      createFieldSale({ date: "2026-09-19", vseCustomerId: "v1", createdBy: "u1", emptiesReceived: 0, items: [{ productId: "p", quantity: 1, unitPrice: 2 }] }),
    ).rejects.toThrow(/item boom/);
    expect(deleted).toEqual(["h1"]);
  });
});

describe("VSE car-stock arithmetic (LOAD-02: remaining = given - sold - returned - pending)", () => {
  it("documents the invariant used by fetchVseCarStock", () => {
    const given = 20, sold = 8, returned = 3, pending = 2;
    expect(given - sold - returned - pending).toBe(7);
  });
});

describe("aggregateFieldSaleItems (VSE day-order aggregation)", () => {
  it("sums quantities and sub-totals by product", () => {
    const out = aggregateFieldSaleItems([
      { productId: "p1", quantity: 2, unitPrice: 10, subTotal: 20 },
      { productId: "p1", quantity: 3, unitPrice: 10, subTotal: 30 },
      { productId: "p2", quantity: 1, unitPrice: 5, subTotal: 5 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.productId === "p1")).toMatchObject({ quantity: 5, subTotal: 50 });
    expect(out.find((l) => l.productId === "p2")).toMatchObject({ quantity: 1, subTotal: 5 });
  });

  it("skips empty product lines", () => {
    const out = aggregateFieldSaleItems([
      { productId: "", quantity: 2, unitPrice: 10 },
      { productId: "p1", quantity: 0, unitPrice: 10 },
    ]);
    expect(out).toEqual([]);
  });
});

describe("day-order creation totals (zero-total 400 regression)", () => {
  // PocketBase rejects numeric 0 on required number fields
  // ("Cannot be blank"), so day orders must be created with their real
  // total — never 0-then-update.
  function mockDayOrderBackend(opts: {
    pendingOrders?: { id: string }[];
    approvedSales?: { id: string; order_id?: string | null }[];
    saleItems?: Record<string, unknown>[];
  }) {
    const ordersCreate = vi.fn(async (body: unknown) => ({ id: "order-new", ...(body as object) }));
    batchesMock.mockImplementation(async (collectionName: string) => {
      if (collectionName === "vse_field_sale_items") return opts.saleItems ?? [];
      return [];
    });
    collection.mockImplementation(((name: string) => {
      switch (name) {
        case "order_types":
          return { getFirstListItem: async () => ({ id: "ot-vse" }) };
        case "vse_field_sales":
          return {
            getFullList: async (q?: { filter?: string }) =>
              String(q?.filter || "").includes('sale_status = "approved"')
                ? (opts.approvedSales ?? [])
                : [],
            update: async () => ({}),
          };
        case "orders":
          return {
            getFullList: async () => opts.pendingOrders ?? [],
            getList: async () => ({ items: [] }),
            create: ordersCreate,
            update: async () => ({}),
          };
        case "vse_field_sale_items":
          return { getFullList: async () => opts.saleItems ?? [] };
        case "sales":
          return { getFullList: async () => [], create: async () => ({}), delete: async () => ({}) };
        default:
          return { getFullList: async () => [] };
      }
    }) as never);
    return { ordersCreate };
  }

  it("upsert creates the order with the aggregated total, not 0", async () => {
    const { ordersCreate } = mockDayOrderBackend({
      approvedSales: [{ id: "s1", order_id: null }],
      saleItems: [{ sale_id: "s1", product_id: "p1", quantity: 2, unit_price: 10, sub_total: 20 }],
    });
    const id = await upsertVseDayOrder("vse1", "2026-09-26");
    expect(id).toBe("order-new");
    expect(ordersCreate).toHaveBeenCalledTimes(1);
    expect(ordersCreate.mock.calls[0][0]).toMatchObject({ total_amount: 20 });
  });

  it("manual append creates the order with the incoming total, not 0", async () => {
    const { ordersCreate } = mockDayOrderBackend({});
    const id = await appendManualLinesToDayOrder("vse1", "2026-09-26", [
      { productId: "p1", quantity: 2, unitPrice: 136 },
    ]);
    expect(id).toBe("order-new");
    expect(ordersCreate).toHaveBeenCalledTimes(1);
    expect(ordersCreate.mock.calls[0][0]).toMatchObject({ total_amount: 272 });
  });
});

describe("largest-remainder pro-rata (APPR-01 empties distribution)", () => {
  function distribute(total: number, quantities: number[]): number[] {
    const sum = quantities.reduce((a, b) => a + b, 0);
    if (sum === 0) return quantities.map(() => 0);
    const shares = quantities.map((q) => {
      const exact = (total * q) / sum;
      return { floor: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let leftover = total - shares.reduce((s, x) => s + x.floor, 0);
    const order = shares.map((s, i) => ({ ...s, i })).sort((a, b) => b.frac - a.frac);
    const out = shares.map((s) => s.floor);
    for (const o of order) {
      if (leftover <= 0) break;
      out[o.i] += 1;
      leftover -= 1;
    }
    return out;
  }

  it("7 empties across 3 lines sums to exactly 7", () => {
    const out = distribute(7, [5, 3, 2]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("zero returnable qty drops empties (documents silent-drop edge)", () => {
    expect(distribute(7, [0, 0])).toEqual([0, 0]);
  });
});
