import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return { ...actual, getFullListInBatches: vi.fn() };
});

import { getFullListInBatches } from "@/lib/pocketbase";
import { emptiesActivityEffect, fetchCustomerBalance, fetchCustomerBalances } from "../customerBalance";

const batch = vi.mocked(getFullListInBatches);

beforeEach(() => {
  batch.mockReset();
});

describe("fetchCustomerBalances (ledger: opening + returns - purchases)", () => {
  it("empty input short-circuits without PB call", async () => {
    await expect(fetchCustomerBalances({})).resolves.toEqual({});
    expect(batch).not.toHaveBeenCalled();
  });

  it("opening-only when no logs", async () => {
    batch.mockResolvedValue([]);
    const r = await fetchCustomerBalances({ c1: 5 });
    expect(r.c1).toEqual({ opening: 5, ledger: 0, balance: 5 });
  });

  it("returns credit, purchases debit, other activities ignored", async () => {
    batch.mockResolvedValue([
      { customer_id: "c1", activity: "customer_empties_return", total_quantity: 10 },
      { customer_id: "c1", activity: "customer_purchase", total_quantity: 4 },
      { customer_id: "c1", activity: "empties_to_supplier", total_quantity: 999 },
      { customer_id: "ghost", activity: "customer_purchase", total_quantity: 1 },
    ]);
    const r = await fetchCustomerBalances({ c1: 3 });
    expect(r.c1).toEqual({ opening: 3, ledger: 6, balance: 9 });
  });

  it("opening_balance detail rows never move the ledger (no double count)", async () => {
    batch.mockResolvedValue([
      { customer_id: "c1", activity: "opening_balance", total_quantity: 12 },
      { customer_id: "c1", activity: "customer_empties_return", total_quantity: 2 },
    ]);
    const r = await fetchCustomerBalances({ c1: 12 });
    expect(r.c1).toEqual({ opening: 12, ledger: 2, balance: 14 });
  });

  it("fetchCustomerBalance single wrapper falls back to opening", async () => {
    batch.mockResolvedValue([]);
    await expect(fetchCustomerBalance("c9", 7)).resolves.toBe(7);
  });
});

describe("emptiesActivityEffect", () => {
  it("returns credit, opening scores zero, everything else debits", () => {
    expect(emptiesActivityEffect("customer_empties_return")).toBe(1);
    expect(emptiesActivityEffect("opening_balance")).toBe(0);
    expect(emptiesActivityEffect("customer_purchase")).toBe(-1);
    expect(emptiesActivityEffect("empties_to_supplier")).toBe(-1);
    expect(emptiesActivityEffect("something_new")).toBe(-1);
  });
});
