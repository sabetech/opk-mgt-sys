import { describe, expect, it } from "vitest";
import { answerLocally, buildSalesSummary, type SummaryRow } from "../askData";

const rows: SummaryRow[] = [
  { order_id: "o1", customer_name: "Kofi", customer_type: "Retailer", product_name: "Guinness", quantity: 10, returned_qty: 2, sub_total: 100, refund_amount: 5, payment_type: "cash" },
  { order_id: "o1", customer_name: "Kofi", customer_type: "Retailer", product_name: "Malta", quantity: 5, returned_qty: 0, sub_total: 50, refund_amount: 0, payment_type: "cash" },
  { order_id: "o2", customer_name: "Ama", customer_type: "Wholesaler", product_name: "Guinness", quantity: 4, returned_qty: 0, sub_total: 40, refund_amount: 0, payment_type: "momo" },
];

describe("buildSalesSummary (RPT-01)", () => {
  it("aggregates orders, net units, refunds, rankings", () => {
    const s = buildSalesSummary(rows, "Sep 2026");
    expect(s.totalOrders).toBe(2);
    expect(s.totalSales).toBe(190);
    expect(s.avgOrderValue).toBeCloseTo(95);
    expect(s.itemsSold).toBe(8 + 5 + 4);
    expect(s.totalRefunds).toBe(5);
    expect(s.topCustomers[0].name).toBe("Kofi");
    expect(s.topProducts[0].name).toBe("Guinness");
    expect(s.byCustomerType).toHaveLength(2);
  });

  it("empty rows -> zeros", () => {
    const s = buildSalesSummary([], "Sep 2026");
    expect(s.totalOrders).toBe(0);
    expect(s.avgOrderValue).toBe(0);
  });
});

describe("answerLocally", () => {
  const s = buildSalesSummary(rows, "Sep 2026");

  it("empty summary short-circuits", () => {
    const empty = buildSalesSummary([], "Sep 2026");
    expect(answerLocally("total sales?", empty)).toMatch(/nothing to summarize/i);
  });

  it.each([
    ["who are the top customers?", /top customers/i],
    ["best selling products?", /top products/i],
    ["what is the average order value?", /average order value/i],
    ["how many refunds?", /refunds/i],
    ["how many orders?", /order\(s\) in/i],
    ["units sold?", /units sold/i],
    ["total revenue?", /total sales/i],
  ])("answers %p", (q, re) => {
    expect(answerLocally(q, s)).toMatch(re);
  });

  it("unknown intent -> null (caller routes to LLM proxy)", () => {
    expect(answerLocally("will it rain tomorrow?", s)).toBeNull();
  });
});
