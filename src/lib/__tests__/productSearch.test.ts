import { describe, expect, it } from "vitest";
import { searchProducts, suggestProduct, type SearchableProduct } from "../productSearch";

const products: SearchableProduct[] = [
  { id: "1", sku_name: "Guinness Stout 750ml", code_name: "GST", product_code: "GST-001" },
  { id: "2", sku_name: "Guinness Smooth 500ml", code_name: "GSM", product_code: "GSM-001" },
  { id: "3", sku_name: "Malta Guinness Can", code_name: "MGC", product_code: "MGC-001" },
];

describe("searchProducts (SALE-01 POS lookup)", () => {
  it("empty query -> []", () => {
    expect(searchProducts(products, "   ")).toEqual([]);
  });

  it("exact substring ranks first with score 0", () => {
    const hits = searchProducts(products, "smooth");
    expect(hits[0].product.id).toBe("2");
    expect(hits[0].score).toBe(0);
  });

  it("matches product_code with top priority", () => {
    expect(searchProducts(products, "MGC-001")[0].product.id).toBe("3");
  });

  it("typo-tolerant fuzzy finds close names", () => {
    const hits = searchProducts(products, "Guinnes Stout");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].product.id).toBe("1");
  });

  it("respects limit", () => {
    expect(searchProducts(products, "guinness", 2)).toHaveLength(2);
  });
});

describe("suggestProduct", () => {
  it("returns best hit or null", () => {
    expect(suggestProduct(products, "malta")?.id).toBe("3");
    expect(suggestProduct(products, "zzz-no-such-product")).toBeNull();
  });
});
