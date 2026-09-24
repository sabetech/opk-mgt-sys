import { describe, expect, it } from "vitest";
import {
  formatPrice,
  getMockQuantity,
  getStockBadgeText,
  getStockBadgeVariant,
  getStockLevel,
  validateProductForm,
} from "../productUtils";

describe("getStockLevel (IN / StockReport thresholds)", () => {
  it("defaults: low<=20, medium<=50, high>50", () => {
    expect(getStockLevel(0)).toBe("low");
    expect(getStockLevel(20)).toBe("low");
    expect(getStockLevel(21)).toBe("medium");
    expect(getStockLevel(50)).toBe("medium");
    expect(getStockLevel(51)).toBe("high");
  });

  it("honours custom app_settings thresholds", () => {
    expect(getStockLevel(10, 5, 15)).toBe("medium");
    expect(getStockLevel(4, 5, 15)).toBe("low");
    expect(getStockLevel(99, 5, 15)).toBe("high");
  });
});

describe("badges + price", () => {
  it("variant/text map", () => {
    expect(getStockBadgeVariant("high")).toBe("default");
    expect(getStockBadgeVariant("medium")).toBe("secondary");
    expect(getStockBadgeVariant("low")).toBe("destructive");
    expect(getStockBadgeText("low")).toBe("Low Stock");
  });

  it("formatPrice null-safe", () => {
    expect(formatPrice(null)).toBe("GHc 0.00");
    expect(formatPrice(2)).toBe("GHc 2.00");
  });

  it("getMockQuantity deterministic in 5..99", () => {
    const a = getMockQuantity("abc");
    expect(getMockQuantity("abc")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(5);
    expect(a).toBeLessThanOrEqual(99);
  });
});

describe("validateProductForm (CUST/Setup validation)", () => {
  it("requires name >= 2 chars", () => {
    expect(validateProductForm({})).toMatchObject({ sku_name: expect.any(String) });
    expect(validateProductForm({ sku_name: "x" }).sku_name).toMatch(/at least 2/i);
    expect(validateProductForm({ sku_name: "Guinness" })).not.toHaveProperty("sku_name");
  });

  it("rejects NaN prices, accepts blanks", () => {
    expect(validateProductForm({ sku_name: "ok", retail_price: "abc" })).toHaveProperty("retail_price");
    expect(validateProductForm({ sku_name: "ok", retail_price: "" })).not.toHaveProperty("retail_price");
  });

  it("code_name charset only (shared category label, never unique)", () => {
    expect(validateProductForm({ sku_name: "ok", code_name: "H/L KEG" })).not.toHaveProperty("code_name");
    expect(validateProductForm({ sku_name: "ok", code_name: "!!!" })).toHaveProperty("code_name");
  });
});
