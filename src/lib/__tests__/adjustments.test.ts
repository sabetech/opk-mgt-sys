import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pocketbase")>();
  return { ...actual, pb: { collection: vi.fn() } };
});

import { pb } from "@/lib/pocketbase";
import { createAdjustmentRequest, generateAdjustmentId } from "../adjustments";

const collection = vi.mocked(pb.collection);

beforeEach(() => collection.mockReset());

describe("generateAdjustmentId", () => {
  it("format ADJ-YYYYMMDD-XXXX", () => {
    expect(generateAdjustmentId()).toMatch(/^ADJ-\d{8}-[A-Z0-9]{4}$/);
  });
});

describe("createAdjustmentRequest validation (ADJ-01)", () => {
  it("requires items and positive qty before touching PB", async () => {
    await expect(
      createAdjustmentRequest({ date: "2026-09-19", direction: "increase", reason: "x", reference: "ADJ-1", requestedBy: "ops", items: [] }),
    ).rejects.toThrow(/at least one product/i);
    await expect(
      createAdjustmentRequest({ date: "2026-09-19", direction: "increase", reason: "x", reference: "ADJ-1", requestedBy: "ops", items: [{ productId: "p", quantity: 0 }] }),
    ).rejects.toThrow(/greater than 0/i);
    expect(collection).not.toHaveBeenCalled();
  });

  it("rolls back header when item creation fails", async () => {
    const deleted: string[] = [];
    collection.mockImplementation(((name: string) => {
      if (name === "stock_adjustment_requests")
        return {
          create: vi.fn(async () => ({ id: "r1" })),
          delete: vi.fn(async (id: string) => {
            deleted.push(id);
          }),
        };
      return { create: vi.fn(async () => { throw new Error("item fail"); }) };
    }) as never);

    await expect(
      createAdjustmentRequest({ date: "2026-09-19", direction: "decrease", reason: "x", reference: "ADJ-1", requestedBy: "ops", items: [{ productId: "p", quantity: 2 }] }),
    ).rejects.toThrow(/item fail/);
    expect(deleted).toEqual(["r1"]);
  });
});
