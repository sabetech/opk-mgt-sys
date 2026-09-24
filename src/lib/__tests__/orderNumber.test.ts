import { beforeEach, describe, expect, it, vi } from "vitest";
import { pb } from "../pocketbase";
import { formatOrderNumber, generateOrderNumber } from "../orderNumber";

describe("generateOrderNumber (max+1 sequence)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns max+1", async () => {
    vi.spyOn(pb, "collection").mockReturnValue({
      getList: vi.fn(async () => ({ items: [{ order_number: 100007 }] })),
    } as never);
    await expect(generateOrderNumber()).resolves.toBe(100008);
  });

  it("falls back to 100001 when empty or on error (documents collision risk)", async () => {
    vi.spyOn(pb, "collection").mockReturnValue({
      getList: vi.fn(async () => ({ items: [] })),
    } as never);
    await expect(generateOrderNumber()).resolves.toBe(100001);

    vi.spyOn(pb, "collection").mockReturnValue({
      getList: vi.fn(async () => {
        throw new Error("offline");
      }),
    } as never);
    await expect(generateOrderNumber()).resolves.toBe(100001);
  });
});

describe("formatOrderNumber", () => {
  it("prefixes #", () => {
    expect(formatOrderNumber(100001)).toBe("#100001");
  });
});
