import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return { ...actual, pb: { collection: vi.fn() } };
});
vi.mock("@/lib/customerBalance", () => ({ fetchCustomerBalance: vi.fn() }));

import { pb } from "@/lib/pocketbase";
import { fetchCustomerBalance } from "@/lib/customerBalance";
import { assertEmptiesPurchaseAllowed } from "../emptiesGuard";

const collection = vi.mocked(pb.collection);
const liveBalance = vi.mocked(fetchCustomerBalance);

function customerAs(typeName: string, hasMou: boolean, balance = 0) {
  collection.mockReturnValue({
    getOne: vi.fn(async () => ({
      balance,
      has_mou: hasMou,
      expand: { type_id: { name: typeName } },
    })),
  } as never);
}

beforeEach(() => {
  collection.mockReset();
  liveBalance.mockReset();
});

describe("assertEmptiesPurchaseAllowed (SALE-03 / CUST return guard)", () => {
  it("no-op for empty customer or non-positive qty", async () => {
    await expect(assertEmptiesPurchaseAllowed("", 5)).resolves.toBeUndefined();
    await expect(assertEmptiesPurchaseAllowed("c1", 0)).resolves.toBeUndefined();
    expect(collection).not.toHaveBeenCalled();
  });

  it("MOU wholesaler may go negative", async () => {
    customerAs("Wholesaler", true, 0);
    liveBalance.mockResolvedValue(0);
    await expect(assertEmptiesPurchaseAllowed("c1", 10)).resolves.toBeUndefined();
  });

  it("non-MOU blocked when live - qty + deposit < 0", async () => {
    customerAs("Retailer", false, 2);
    liveBalance.mockResolvedValue(2);
    await expect(assertEmptiesPurchaseAllowed("c1", 10, 0)).rejects.toThrow(
      /Insufficient empties balance/,
    );
  });

  it("deposit cover satisfies the guard (POS collects deposit on same sale)", async () => {
    customerAs("Retailer", false, 2);
    liveBalance.mockResolvedValue(2);
    await expect(assertEmptiesPurchaseAllowed("c1", 10, 8)).resolves.toBeUndefined();
  });

  it("Wholesaler WITHOUT mou still blocked (both conditions required)", async () => {
    customerAs("Wholesaler", false, 100);
    liveBalance.mockResolvedValue(0);
    await expect(assertEmptiesPurchaseAllowed("c1", 5)).rejects.toThrow(/Insufficient/);
  });

  it("ledger fetch failure falls back to opening balance (documents stale-balance risk)", async () => {
    customerAs("Retailer", false, 50);
    liveBalance.mockRejectedValue(new Error("offline"));
    await expect(assertEmptiesPurchaseAllowed("c1", 5)).resolves.toBeUndefined();
  });
});
