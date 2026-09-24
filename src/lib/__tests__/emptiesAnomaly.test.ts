import { describe, expect, it } from "vitest";
import { flaggedShare, scoreEmptiesRow } from "../emptiesAnomaly";

describe("scoreEmptiesRow", () => {
  it("AUTH-adjacent sanity: exact match is info with zero score", () => {
    const r = scoreEmptiesRow(
      { systemAtTake: 100, counted: 100, varianceAtTake: 0, drift: 0 },
      "Guinness Crate",
    );
    expect(r.score).toBe(0);
    expect(r.severity).toBe("info");
    expect(r.flags).toEqual([]);
  });

  it("SALE-adjacent: small variance is info, notable variance is warn", () => {
    const small = scoreEmptiesRow({ systemAtTake: 100, counted: 102, varianceAtTake: 2, drift: 0 });
    expect(small.flags).toContain("small variance");
    expect(small.severity).toBe("info");

    const notable = scoreEmptiesRow({ systemAtTake: 100, counted: 112, varianceAtTake: 12, drift: 0 });
    expect(notable.flags).toContain("notable variance");
    expect(notable.severity).toBe("warn");
  });

  it("CRATE-01: large variance (>=30% ratio or >=40 abs) scores 50 -> warn alone", () => {
    const r = scoreEmptiesRow({ systemAtTake: 100, counted: 60, varianceAtTake: -40, drift: 0 });
    expect(r.flags).toContain("large variance");
    expect(r.score).toBe(50);
    expect(r.severity).toBe("warn");
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("CRATE-02: heavy drift adds 30 and compounds when same direction", () => {
    const r = scoreEmptiesRow({ systemAtTake: 100, counted: 60, varianceAtTake: -40, drift: -35 });
    expect(r.flags).toContain("heavy drift since take");
    expect(r.flags).toContain("trend continuing");
    expect(r.severity).toBe("critical");
  });

  it("CRATE-03: repeat offenses add up to +20 and label running count", () => {
    const r = scoreEmptiesRow(
      { systemAtTake: 100, counted: 90, varianceAtTake: -10, drift: 0, repeatOffenses: 2 },
      "Crate",
    );
    expect(r.flags.some((f) => f.startsWith("repeated"))).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(25);
  });

  it("CRATE-04: under-counts suggest unlogged returns, over-counts suggest double-count", () => {
    const under = scoreEmptiesRow({ systemAtTake: 50, counted: 40, varianceAtTake: -10, drift: 0 });
    expect(under.explanation).toMatch(/unlogged customer returns/i);
    const over = scoreEmptiesRow({ systemAtTake: 50, counted: 60, varianceAtTake: 10, drift: 0 });
    expect(over.explanation).toMatch(/double-counted/i);
  });

  it("score never exceeds 100", () => {
    const r = scoreEmptiesRow(
      { systemAtTake: 10, counted: -50, varianceAtTake: -60, drift: -100, repeatOffenses: 5 },
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("flaggedShare", () => {
  it("returns 0 for empty, fraction otherwise", () => {
    expect(flaggedShare([])).toBe(0);
    const rows = [
      scoreEmptiesRow({ systemAtTake: 10, counted: 10, varianceAtTake: 0, drift: 0 }),
      scoreEmptiesRow({ systemAtTake: 10, counted: 0, varianceAtTake: -10, drift: 0 }),
    ];
    expect(flaggedShare(rows)).toBe(0.5);
  });
});
