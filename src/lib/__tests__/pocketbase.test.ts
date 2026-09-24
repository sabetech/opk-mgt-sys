import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOT_DELETED,
  dayFilter,
  endOfDay,
  getFullListInBatches,
  pb,
  startOfDay,
} from "../pocketbase";

describe("pocketbase date helpers (SQLite string-compare contract)", () => {
  it("uses space separator, never ISO T", () => {
    const d = new Date(2026, 8, 19, 12, 0, 0);
    expect(startOfDay(d)).toContain(" ");
    expect(startOfDay(d)).not.toContain("T");
    expect(endOfDay(d)).toContain(" ");
    expect(endOfDay(d)).not.toContain("T");
  });

  it("dayFilter bounds a full day on the given field", () => {
    const f = dayFilter("date", new Date(2026, 8, 19, 12));
    expect(f).toMatch(/^date >= ".*" && date <= ".*"$/);
    expect(f).not.toContain("T00:00");
  });

  it("regression: T-separated bounds would never match (documents why space matters)", () => {
    // SQLite compares date strings lexicographically: " " (0x20) < "T" (0x54),
    // so a stored "2026-09-19 00:00..." is always < a "T" lower bound.
    expect("2026-09-19 00:00:00.000Z" < "2026-09-19T00:00:00.000Z").toBe(true);
  });

  it("NOT_DELETED matches empty-string soft-delete convention", () => {
    expect(NOT_DELETED).toBe('deleted_at = ""');
  });
});

describe("getFullListInBatches (Cloudflare URL-length safety)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] without hitting network for empty ids", async () => {
    const spy = vi.spyOn(pb, "collection");
    await expect(getFullListInBatches("orders", "customer_id", [])).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fans out in chunks of 25 and merges filters", async () => {
    const calls: string[] = [];
    vi.spyOn(pb, "collection").mockReturnValue({
      getFullList: vi.fn(async (opts: { filter: string }) => {
        calls.push(opts.filter);
        return [{ f: opts.filter }];
      }),
    } as never);

    const ids = Array.from({ length: 30 }, (_, i) => `id${i}`);
    const rows = await getFullListInBatches("empties_log", "customer_id", ids, {
      fields: "customer_id",
    });

    expect(calls).toHaveLength(2); // 25 + 5
    expect(calls[0]).toContain('customer_id = "id0"');
    expect(calls[1]).toContain('customer_id = "id29"');
    expect(rows).toHaveLength(2);
  });

  it("ANDs caller filter with chunk filter", async () => {
    let seen = "";
    vi.spyOn(pb, "collection").mockReturnValue({
      getFullList: vi.fn(async (opts: { filter: string }) => {
        seen = opts.filter;
        return [];
      }),
    } as never);
    await getFullListInBatches("x", "customer_id", ["a"], { filter: 'activity = "x"' });
    expect(seen).toContain('(activity = "x")');
    expect(seen).toContain('customer_id = "a"');
  });
});
