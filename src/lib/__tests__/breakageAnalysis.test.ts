import { describe, expect, it } from "vitest";
import {
  analyzeBreakages,
  classifyBreakageTopic,
  pareto,
  type BreakageEvent,
} from "../breakageAnalysis";

describe("classifyBreakageTopic", () => {
  it.each([
    ["truck hit pothole on delivery", "transit"],
    ["dropped during offloading", "offloading"],
    ["pallet stack collapsed", "stacking"],
    ["bottles leaked and burst", "spillage"],
    ["mishandled by loader, broke", "handling"],
    ["factory defect crack", "defect"],
  ])("classifies %p as %s", (reason, topic) => {
    expect(classifyBreakageTopic(reason)).toBe(topic);
  });

  it("empty/unknown -> other", () => {
    expect(classifyBreakageTopic("")).toBe("other");
    expect(classifyBreakageTopic(null)).toBe("other");
    expect(classifyBreakageTopic(undefined)).toBe("other");
    expect(classifyBreakageTopic("sunshine and rainbows")).toBe("other");
  });
});

describe("pareto", () => {
  const events: BreakageEvent[] = [
    { productName: "A", quantity: 10, reason: "truck", date: "2026-09-01" },
    { productName: "B", quantity: 5, reason: "spill", date: "2026-09-02" },
    { productName: "A", quantity: 5, reason: "truck", date: "2026-09-03" },
  ];

  it("aggregates, ranks desc, shares sum to 1", () => {
    const ranked = pareto(events, (e) => ({ key: e.productName, label: e.productName }));
    expect(ranked[0]).toMatchObject({ key: "A", quantity: 15 });
    expect(ranked[1]).toMatchObject({ key: "B", quantity: 5 });
    const share = ranked.reduce((s, r) => s + r.share, 0);
    expect(share).toBeCloseTo(1);
  });

  it("respects topN and zero-grand safety", () => {
    expect(pareto(events, (e) => ({ key: e.productName, label: e.productName }), 1)).toHaveLength(1);
    expect(pareto([], (e) => ({ key: e.productName, label: e.productName }))).toEqual([]);
  });
});

describe("analyzeBreakages (BRK-01)", () => {
  it("totals, counts, and top share", () => {
    const events: BreakageEvent[] = [
      { productName: "Guinness", productCode: "G-001", quantity: 8, reason: "truck accident", date: "2026-09-20" },
      { productName: "Guinness", productCode: "G-001", quantity: 2, reason: "truck accident", date: "2026-09-21" },
      { productName: "Malta", productCode: "M-001", quantity: 2, reason: "spillage on pallet", date: "2026-09-22" },
    ];
    const a = analyzeBreakages(events);
    expect(a.totalQty).toBe(12);
    expect(a.eventCount).toBe(3);
    expect(a.byProduct[0].key).toBe("Guinness");
    expect(a.topProductShare).toBeCloseTo(10 / 12);
    expect(a.byTopic.length).toBeGreaterThan(0);
    expect(a.byWeekday.length).toBeGreaterThan(0);
  });

  it("invalid dates bucket to Sun without throwing", () => {
    const a = analyzeBreakages([
      { productName: "X", quantity: 1, reason: "?", date: "not-a-date" },
    ]);
    expect(a.byWeekday[0].key).toBe("Sun");
  });
});
