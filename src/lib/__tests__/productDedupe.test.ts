import { describe, expect, it } from "vitest";
import { checkProductDuplicates, normalizeName } from "../productDedupe";
import type { SearchableProduct } from "../productSearch";

const existing: SearchableProduct[] = [
  { id: "1", sku_name: "Guinness Stout 750ml", code_name: "GST" },
  { id: "2", sku_name: "Malta Guinness Can", code_name: "MGC" },
];

describe("normalizeName", () => {
  it("lowercases and strips non-alnum", () => {
    expect(normalizeName("Guinness-Stout 750ml!")).toBe("guinnessstout750ml");
  });
});

describe("checkProductDuplicates (CUST-01 / Setup CSV warn-only)", () => {
  it("exact normalized name warns with existingId", () => {
    const w = checkProductDuplicates({ sku_name: "guinness stout-750ML" }, existing);
    expect(w.some((x) => x.kind === "near_dupe_name" && x.existingId === "1")).toBe(true);
  });

  it("selfId excluded", () => {
    expect(
      checkProductDuplicates({ sku_name: "Guinness Stout 750ml" }, existing, "1").filter(
        (w) => w.existingId === "1",
      ),
    ).toHaveLength(0);
  });

  it("wholesale above retail warns; zero price warns", () => {
    const w = checkProductDuplicates(
      { sku_name: "Brand New Thing", wholesale_price: 10, retail_price: 8 },
      existing,
    );
    expect(w.some((x) => x.kind === "price_outlier")).toBe(true);
    const z = checkProductDuplicates(
      { sku_name: "Brand New Thing", wholesale_price: 0, retail_price: 5 },
      existing,
    );
    expect(z.some((x) => x.kind === "price_outlier")).toBe(true);
  });

  it("healthy prices do not warn", () => {
    expect(
      checkProductDuplicates(
        { sku_name: "Totally Unique 12345", wholesale_price: 5, retail_price: 8 },
        existing,
      ),
    ).toEqual([]);
  });

  it("code_name reuse never warns (shared category label)", () => {
    const w = checkProductDuplicates({ sku_name: "Totally Unique 12345", code_name: "GST" }, existing);
    expect(w.filter((x) => x.kind === "near_dupe_name")).toEqual([]);
  });
});
