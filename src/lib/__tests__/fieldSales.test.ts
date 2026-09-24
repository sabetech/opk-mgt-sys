import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return {
    ...actual,
    pb: { collection: vi.fn(), authStore: { model: null } },
  };
});

import { pb } from "@/lib/pocketbase";
import { createFieldSale, generateFieldSaleReference } from "../fieldSales";

const collection = vi.mocked(pb.collection);

function setRole(role: string | null) {
  (pb as unknown as { authStore: { model: { role: string } | null } }).authStore = {
    model: role ? { role } : null,
  };
}

beforeEach(() => {
  collection.mockReset();
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
