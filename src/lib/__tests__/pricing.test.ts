import { describe, expect, it } from "vitest";
import { isRetailPricingApplicable, resolveUnitPrice } from "../pricing";

const product = { retail_price: 60, wholesale_price: 50 };
const config = { product_ids: ["p1"], customer_ids: ["c1"] };

describe("resolveUnitPrice", () => {
  it("eligible wholesaler × product pays retail", () => {
    expect(resolveUnitPrice(product, "Wholesaler", "c1", "p1", config)).toBe(60);
  });

  it("other wholesalers pay wholesale, other customers pay retail", () => {
    expect(resolveUnitPrice(product, "Wholesaler", "c2", "p1", config)).toBe(50);
    expect(resolveUnitPrice(product, "Wholesaler", "c1", "p2", config)).toBe(50);
    expect(resolveUnitPrice(product, "Retailer", "c1", "p1", config)).toBe(60);
    expect(resolveUnitPrice(product, null, null, "p1", config)).toBe(60);
  });

  it("empty config or missing ids never trigger the override", () => {
    expect(resolveUnitPrice(product, "Wholesaler", "c1", "p1", null)).toBe(50);
    expect(resolveUnitPrice(product, "Wholesaler", "c1", "p1", { product_ids: [], customer_ids: [] })).toBe(50);
    expect(resolveUnitPrice(product, "Wholesaler", null, "p1", config)).toBe(50);
  });

  it("null retail falls back to wholesale instead of zeroing the sale", () => {
    expect(resolveUnitPrice({ retail_price: null, wholesale_price: 50 }, "Wholesaler", "c1", "p1", config)).toBe(50);
    expect(resolveUnitPrice({ retail_price: null, wholesale_price: null }, "Retailer", "c9", "p9", config)).toBe(0);
  });
});

describe("isRetailPricingApplicable", () => {
  it("requires wholesaler type plus both allow-lists", () => {
    expect(isRetailPricingApplicable("Wholesaler", "c1", "p1", config)).toBe(true);
    expect(isRetailPricingApplicable("Retailer", "c1", "p1", config)).toBe(false);
    expect(isRetailPricingApplicable("Wholesaler", "c2", "p1", config)).toBe(false);
    expect(isRetailPricingApplicable("Wholesaler", "c1", "p2", config)).toBe(false);
    expect(isRetailPricingApplicable("Wholesaler", null, "p1", config)).toBe(false);
  });
});
