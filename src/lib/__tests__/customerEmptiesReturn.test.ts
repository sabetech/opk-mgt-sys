import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return { ...actual, pb: { collection: vi.fn() } };
});
vi.mock("@/lib/emptiesStock", () => ({ moveYardStock: vi.fn() }));

import { pb } from "@/lib/pocketbase";
import { moveYardStock } from "@/lib/emptiesStock";
import {
  findRecentDuplicateReturn,
  findReturnByRef,
  generateReturnRef,
  submitCustomerReturn,
} from "../customerEmptiesReturn";

const collection = vi.mocked(pb.collection);
const moveYard = vi.mocked(moveYardStock);

const notFound = () => Object.assign(new Error("Not found"), { status: 404 });
const badRequest = () => Object.assign(new Error("Bad request"), { status: 400 });

interface FakeLog {
  id: string;
  client_ref?: string;
  total_quantity?: number;
  refund_qty?: number | null;
  refund_amount?: number | null;
  yard_applied?: boolean;
  [key: string]: unknown;
}

interface FakeDeposit {
  id: string;
  quantity: number;
  refunded_qty: number;
  amount_per_crate: number;
  status: string;
  [key: string]: unknown;
}

interface FakeState {
  logs: FakeLog[];
  details: { id: string; log_id: string; product_id: string; quantity: number }[];
  deposits: FakeDeposit[];
  logCreates: number;
  logDeletes: string[];
  logUpdates: { id: string; data: Record<string, unknown> }[];
  detailCreates: Record<string, unknown>[];
  detailDeletes: string[];
  depositUpdates: { id: string; data: Record<string, unknown> }[];
  refLookups: number;
}

interface FakeOpts {
  log?: FakeLog;
  details?: FakeState["details"];
  deposits?: FakeDeposit[];
  failLogCreate?: boolean;
  failDetailCreate?: boolean;
  raceExisting?: FakeLog;
}

function installFake(opts: FakeOpts = {}): FakeState {
  const state: FakeState = {
    logs: opts.log ? [{ ...opts.log }] : opts.raceExisting ? [{ ...opts.raceExisting }] : [],
    details: [...(opts.details || [])],
    deposits: [...(opts.deposits || [])],
    logCreates: 0,
    logDeletes: [],
    logUpdates: [],
    detailCreates: [],
    detailDeletes: [],
    depositUpdates: [],
    refLookups: 0,
  };

  collection.mockImplementation(((name: string) => {
    if (name === "empties_log") {
      return {
        create: vi.fn(async (data: Record<string, unknown>) => {
          if (opts.failLogCreate) throw new Error("log create fail");
          state.logCreates += 1;
          const log: FakeLog = {
            id: `log-${state.logCreates}`,
            refund_qty: null,
            refund_amount: null,
            yard_applied: false,
            ...data,
          };
          state.logs.push(log);
          return { ...log };
        }),
        getFirstListItem: vi.fn(async (filter: string) => {
          state.refLookups += 1;
          // Simulates the unique-key race: the row is invisible until the
          // losing create attempt re-reads by key.
          if (opts.raceExisting && state.refLookups === 1) throw notFound();
          const ref = filter.match(/client_ref = "([^"]+)"/)?.[1];
          const found = state.logs.find((l) => l.client_ref === ref);
          if (!found) throw notFound();
          return { ...found };
        }),
        getFullList: vi.fn(async () => state.logs.map((l) => ({ ...l }))),
        update: vi.fn(async (id: string, data: Record<string, unknown>) => {
          state.logUpdates.push({ id, data });
          const log = state.logs.find((l) => l.id === id);
          if (!log) throw notFound();
          Object.assign(log, data);
          return { ...log };
        }),
        delete: vi.fn(async (id: string) => {
          state.logDeletes.push(id);
          state.logs = state.logs.filter((l) => l.id !== id);
        }),
      };
    }
    if (name === "empties_log_detail") {
      return {
        getFullList: vi.fn(async (opts2: { filter?: string } = {}) => {
          const logId = String(opts2.filter || "").match(/log_id = "([^"]+)"/)?.[1];
          return state.details.filter((d) => d.log_id === logId).map((d) => ({ ...d }));
        }),
        create: vi.fn(async (data: Record<string, unknown>) => {
          if (opts.failDetailCreate) throw new Error("detail fail");
          const detail = { id: `d-${state.detailCreates.length + 1}`, ...data };
          state.detailCreates.push(detail);
          state.details.push(detail as unknown as (typeof state.details)[number]);
          return { ...detail };
        }),
        delete: vi.fn(async (id: string) => {
          state.detailDeletes.push(id);
          state.details = state.details.filter((d) => d.id !== id);
        }),
      };
    }
    if (name === "crate_deposits") {
      return {
        getFullList: vi.fn(async () => state.deposits.map((d) => ({ ...d }))),
        update: vi.fn(async (id: string, data: Record<string, unknown>) => {
          state.depositUpdates.push({ id, data });
          const dep = state.deposits.find((d) => d.id === id);
          if (!dep) throw notFound();
          Object.assign(dep, data);
          return { ...dep };
        }),
      };
    }
    throw new Error(`Unexpected collection ${name}`);
  }) as never);

  return state;
}

const baseInput = {
  clientRef: "CER-20261014-AAAA",
  customerId: "cust1",
  date: "2026-10-14",
  items: [{ productId: "p1", quantity: 5 }],
  refundQty: 0,
  refundMethod: "cash",
  applyRefund: false,
};

beforeEach(() => {
  collection.mockReset();
  moveYard.mockReset();
  moveYard.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateReturnRef", () => {
  it("matches CER-YYYYMMDD-XXXX", () => {
    expect(generateReturnRef()).toMatch(/^CER-\d{8}-[A-Z0-9]{4}$/);
  });
});

describe("findReturnByRef", () => {
  it("returns null on 404 and a setup hint on 400 (unpatched schema)", async () => {
    collection.mockImplementation((() => {
      return { getFirstListItem: vi.fn(async () => { throw notFound(); }) };
    }) as never);
    await expect(findReturnByRef("CER-1")).resolves.toBeNull();

    collection.mockImplementation((() => {
      return { getFirstListItem: vi.fn(async () => { throw badRequest(); }) };
    }) as never);
    await expect(findReturnByRef("CER-1")).rejects.toThrow(/setup-pocketbase/);
  });
});

describe("submitCustomerReturn validation", () => {
  it("rejects empty/non-positive items before touching PocketBase", async () => {
    await expect(
      submitCustomerReturn({ ...baseInput, items: [] }),
    ).rejects.toThrow(/at least one product/i);
    await expect(
      submitCustomerReturn({ ...baseInput, items: [{ productId: "p1", quantity: 0 }] }),
    ).rejects.toThrow(/greater than 0/i);
    expect(collection).not.toHaveBeenCalled();
  });
});

describe("submitCustomerReturn fresh submission", () => {
  it("creates keyed header with return_page attribution, details, and yard move", async () => {
    const state = installFake();

    const result = await submitCustomerReturn(baseInput);

    expect(state.logCreates).toBe(1);
    expect(state.logs[0]).toMatchObject({
      client_ref: "CER-20261014-AAAA",
      source: "return_page",
      activity: "customer_empties_return",
      total_quantity: 5,
    });
    expect(state.detailCreates).toHaveLength(1);
    expect(state.detailCreates[0]).toMatchObject({ log_id: "log-1", product_id: "p1", quantity: 5 });
    expect(moveYard).toHaveBeenCalledWith([{ productId: "p1", groundDelta: 5, tradeDelta: -5 }]);
    expect(result).toMatchObject({ logId: "log-1", resumed: false, refundedCrates: 0, yardFailed: false });
    expect(state.logDeletes).toHaveLength(0);
  });

  it("rolls the header back when detail creation fails", async () => {
    const state = installFake({ failDetailCreate: true });

    await expect(submitCustomerReturn(baseInput)).rejects.toThrow(/detail fail/);
    expect(state.logDeletes).toEqual(["log-1"]);
    expect(moveYard).not.toHaveBeenCalled();
  });

  it("keeps the header when refunds already progressed (no rollback)", async () => {
    const state = installFake({
      log: { id: "log-9", client_ref: baseInput.clientRef, refund_qty: 2, total_quantity: 5 },
      failDetailCreate: true,
    });

    await expect(submitCustomerReturn(baseInput)).rejects.toThrow(/detail fail/);
    expect(state.logDeletes).toHaveLength(0);
  });
});

describe("submitCustomerReturn idempotent resume", () => {
  it("reuses the keyed header instead of creating a second one and repairs details", async () => {
    const state = installFake({
      log: { id: "log-7", client_ref: baseInput.clientRef, total_quantity: 5 },
      details: [
        { id: "old-1", log_id: "log-7", product_id: "p1", quantity: 99 },
        { id: "old-2", log_id: "log-7", product_id: "p9", quantity: 1 },
      ],
    });

    const result = await submitCustomerReturn(baseInput);

    expect(state.logCreates).toBe(0);
    expect(state.detailDeletes.sort()).toEqual(["old-1", "old-2"]);
    expect(state.detailCreates).toHaveLength(1);
    expect(state.detailCreates[0]).toMatchObject({ log_id: "log-7", product_id: "p1", quantity: 5 });
    expect(result.resumed).toBe(true);
    expect(result.logId).toBe("log-7");
  });

  it("re-syncs a stale total_quantity on the header", async () => {
    const state = installFake({
      log: { id: "log-7", client_ref: baseInput.clientRef, total_quantity: 99 },
    });

    await submitCustomerReturn(baseInput);

    expect(state.logUpdates).toContainEqual({ id: "log-7", data: { total_quantity: 5 } });
  });

  it("resumes the winner when the keyed create loses a unique race", async () => {
    const state = installFake({
      raceExisting: { id: "log-winner", client_ref: baseInput.clientRef, total_quantity: 5 },
      failLogCreate: true,
    });

    const result = await submitCustomerReturn(baseInput);

    expect(result).toMatchObject({ logId: "log-winner", resumed: true });
    expect(state.logDeletes).toHaveLength(0);
  });

  it("skips the yard move when a prior attempt already applied it", async () => {
    installFake({
      log: { id: "log-7", client_ref: baseInput.clientRef, total_quantity: 5, yard_applied: true },
    });

    const result = await submitCustomerReturn(baseInput);

    expect(moveYard).not.toHaveBeenCalled();
    expect(result.yardFailed).toBe(false);
  });

  it("warns without failing when the yard tally fails", async () => {
    const state = installFake();
    moveYard.mockRejectedValue(new Error("yard down"));

    const result = await submitCustomerReturn(baseInput);

    expect(result.yardFailed).toBe(true);
    // Ledger work already happened — nothing is rolled back.
    expect(state.logCreates).toBe(1);
    expect(state.detailCreates).toHaveLength(1);
    expect(state.logDeletes).toHaveLength(0);
  });
});

describe("submitCustomerReturn FIFO refunds", () => {
  const deposits: FakeDeposit[] = [
    { id: "dep1", quantity: 10, refunded_qty: 0, amount_per_crate: 5, status: "held" },
    { id: "dep2", quantity: 5, refunded_qty: 0, amount_per_crate: 6, status: "held" },
  ];

  it("refunds oldest-first and stamps progress on the log", async () => {
    const state = installFake({ deposits });

    const result = await submitCustomerReturn({
      ...baseInput,
      applyRefund: true,
      refundQty: 12,
    });

    expect(state.depositUpdates).toEqual([
      { id: "dep1", data: expect.objectContaining({ refunded_qty: 10, status: "refunded", refund_log_id: "log-1" }) },
      { id: "dep2", data: expect.objectContaining({ refunded_qty: 2, status: "partial" }) },
    ]);
    expect(state.logUpdates).toContainEqual({
      id: "log-1",
      data: { refund_qty: 12, refund_amount: 10 * 5 + 2 * 6 },
    });
    expect(result).toMatchObject({ refundedCrates: 12, refundedAmount: 62 });
  });

  it("on resume refunds only the remaining crates, never re-refunding prior progress", async () => {
    const state = installFake({
      log: { id: "log-7", client_ref: baseInput.clientRef, total_quantity: 5, refund_qty: 3, refund_amount: 15 },
      deposits: [
        { id: "dep1", quantity: 10, refunded_qty: 3, amount_per_crate: 5, status: "partial" },
        { id: "dep2", quantity: 5, refunded_qty: 0, amount_per_crate: 6, status: "held" },
      ],
    });

    const result = await submitCustomerReturn({
      ...baseInput,
      clientRef: "CER-20261014-AAAA",
      applyRefund: true,
      refundQty: 12,
    });

    // remaining = 12 − 3 already refunded → 7 + 2, not another 12
    expect(state.depositUpdates).toEqual([
      { id: "dep1", data: expect.objectContaining({ refunded_qty: 10, status: "refunded" }) },
      { id: "dep2", data: expect.objectContaining({ refunded_qty: 2, status: "partial" }) },
    ]);
    expect(state.logUpdates).toContainEqual({
      id: "log-7",
      data: { refund_qty: 12, refund_amount: 15 + 7 * 5 + 2 * 6 },
    });
    expect(result.refundedCrates).toBe(9);
  });

  it("skips the refund phase entirely when applyRefund is off (no deposit fetch)", async () => {
    const state = installFake({ deposits });

    const result = await submitCustomerReturn({ ...baseInput, applyRefund: false, refundQty: 12 });

    expect(state.depositUpdates).toHaveLength(0);
    expect(result.refundedCrates).toBe(0);
  });
});

describe("findRecentDuplicateReturn", () => {
  it("matches same customer/date/qty under a different key and skips own key and voided rows", async () => {
    const since = Date.now();
    collection.mockImplementation((() => {
      return {
        getFullList: vi.fn(async () => [
          { id: "a", created: new Date(since).toISOString().replace("T", " "), total_quantity: 8, client_ref: "CER-OTHER" },
        ]),
      };
    }) as never);

    const dup = await findRecentDuplicateReturn({
      customerId: "cust1",
      date: "2026-10-14",
      totalQuantity: 8,
      excludeClientRef: "CER-MINE",
    });
    expect(dup).toEqual({ id: "a", created: expect.any(String) });

    // own key excluded
    const own = await findRecentDuplicateReturn({
      customerId: "cust1",
      date: "2026-10-14",
      totalQuantity: 8,
      excludeClientRef: "CER-OTHER",
    });
    expect(own).toBeNull();
  });

  it("filters on voided_at = \"\" so voided entries no longer count", async () => {
    collection.mockImplementation((() => {
      return {
        getFullList: vi.fn(async (opts2: { filter?: string }) => {
          expect(opts2.filter).toContain('voided_at = ""');
          return [];
        }),
      };
    }) as never);

    await expect(
      findRecentDuplicateReturn({ customerId: "c", date: "2026-10-14", totalQuantity: 1, excludeClientRef: "x" }),
    ).resolves.toBeNull();
  });

  it("never blocks the submission when the lookup fails", async () => {
    collection.mockImplementation((() => {
      return { getFullList: vi.fn(async () => { throw new Error("boom"); }) };
    }) as never);

    await expect(
      findRecentDuplicateReturn({ customerId: "c", date: "2026-10-14", totalQuantity: 1, excludeClientRef: "x" }),
    ).resolves.toBeNull();
  });
});
