import { describe, expect, it } from "vitest";
import { signedQuantity, summarizeProductLogs } from "../inventoryLog";

describe("signedQuantity", () => {
  it("passes through true-signed writer quantities", () => {
    expect(signedQuantity({ type: "retail_sale", quantity: -3 })).toBe(-3);
    expect(signedQuantity({ type: "retail_sale", quantity: 3 })).toBe(3);
    expect(signedQuantity({ type: "customer_return", quantity: 2 })).toBe(2);
    expect(signedQuantity({ type: "adjustment_increase", quantity: 4 })).toBe(4);
    expect(signedQuantity({ type: "breakage", quantity: -1 })).toBe(-1);
  });

  it("negates unsigned adjustment_decrease magnitudes", () => {
    expect(signedQuantity({ type: "adjustment_decrease", quantity: 4 })).toBe(-4);
    expect(signedQuantity({ type: "adjustment_decrease", quantity: 0 })).toBe(0);
  });

  it("passes unknown types through signed so the day net stays exact", () => {
    expect(signedQuantity({ type: "future_type", quantity: -2 })).toBe(-2);
  });
});

describe("summarizeProductLogs", () => {
  it("cancel reversals net out of Total Sold and are tracked as reverted", () => {
    const s = summarizeProductLogs([
      { id: 1, product_id: "p", type: "retail_sale", quantity: -5, created: "2026-10-01T10:00:00.000Z" },
      { id: 2, product_id: "p", type: "retail_sale", quantity: 5, created: "2026-10-01T11:00:00.000Z" },
    ]);
    expect(s.totalSold).toBe(0);
    expect(s.reverted).toBe(5);
    expect(s.dayNet).toBe(0);
  });

  it("buckets customer returns and signed adjustments", () => {
    const s = summarizeProductLogs([
      { id: 1, product_id: "p", type: "customer_return", quantity: 3 },
      { id: 2, product_id: "p", type: "adjustment_increase", quantity: 4 },
      { id: 3, product_id: "p", type: "adjustment_decrease", quantity: 1 },
    ]);
    expect(s.customerReturns).toBe(3);
    expect(s.adjustmentsNet).toBe(3);
    expect(s.dayNet).toBe(6);
  });

  it("unbucketed types still feed the day net and transactions", () => {
    const s = summarizeProductLogs([
      { id: 1, product_id: "p", type: "opening_stock", quantity: 7 },
    ]);
    expect(s.dayNet).toBe(7);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].balance).toBe(7);
  });
});
