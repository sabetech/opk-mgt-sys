import { describe, expect, it } from "vitest";
import { applyYardMove } from "../emptiesStock";

describe("applyYardMove (empties ground/trade, no clamping)", () => {
  it("customer return: ground up, trade down", () => {
    expect(applyYardMove({ ground: 10, trade: 8 }, { groundDelta: 3, tradeDelta: -3 }))
      .toEqual({ ground: 13, trade: 5 });
  });

  it("POS sale: trade up, ground untouched (full goods leave via warehouse_stock)", () => {
    expect(applyYardMove({ ground: 10, trade: 8 }, { groundDelta: 0, tradeDelta: 4 }))
      .toEqual({ ground: 10, trade: 12 });
  });

  it("negative trade is preserved as a reconciliation signal, never floored", () => {
    expect(applyYardMove({ ground: 5, trade: 1 }, { groundDelta: 4, tradeDelta: -4 }))
      .toEqual({ ground: 9, trade: -3 });
  });

  it("treats missing/zero baselines as zero", () => {
    expect(applyYardMove({ ground: 0, trade: 0 }, { groundDelta: 2, tradeDelta: 2 }))
      .toEqual({ ground: 2, trade: 2 });
  });
});
