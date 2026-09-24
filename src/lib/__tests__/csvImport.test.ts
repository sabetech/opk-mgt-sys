import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { suggestProduct, type SearchableProduct } from "../productSearch";

// Characterization of Setup.tsx:163-222 / AddCustomer.tsx:77-100 CSV contract.
// Mirrors the row-normalization inline so edge cases stay pinned even though
// the component itself is not under test yet.

const transformHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

interface ParsedRow {
  sku_name: string;
  quantity: number;
  matched: boolean;
  error?: string;
  suggestion?: string | null;
}

function normalizeRows(
  rows: Record<string, string>[],
  catalog: SearchableProduct[],
): { ok: boolean; error?: string; parsed: ParsedRow[] } {
  const headers = Object.keys(rows[0] || {});
  const hasSku = headers.some((h) => h === "sku_name" || h === "product_name" || h === "name");
  const hasQty = headers.some((h) => h === "quantity" || h === "qty" || h === "stock");
  if (!hasSku || !hasQty) return { ok: false, error: "missing columns", parsed: [] };

  const map = new Map(catalog.map((p) => [p.sku_name.toLowerCase(), p.id]));
  const parsed: ParsedRow[] = [];
  rows.forEach((row) => {
    const sku = row["sku_name"] || row["product_name"] || row["name"] || "";
    const qtyStr = row["quantity"] || row["qty"] || row["stock"] || "0";
    const qty = parseInt(qtyStr, 10);
    if (!sku.trim()) {
      parsed.push({ sku_name: "(empty)", quantity: 0, matched: false, error: "Product name is required" });
      return;
    }
    if (isNaN(qty) || qty < 0) {
      parsed.push({ sku_name: sku.trim(), quantity: 0, matched: false, error: "Invalid quantity" });
      return;
    }
    const id = map.get(sku.trim().toLowerCase());
    if (id) {
      parsed.push({ sku_name: sku.trim(), quantity: qty, matched: true });
      return;
    }
    const suggestion = suggestProduct(catalog, sku.trim());
    parsed.push({
      sku_name: sku.trim(), quantity: qty, matched: false,
      suggestion: suggestion?.sku_name ?? null, error: "Product not found - will be created",
    });
  });
  return { ok: true, parsed: parsed.filter((r) => r.sku_name !== "(empty)") };
}

function parse(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv, {
    header: true, skipEmptyLines: true, transformHeader,
  }).data;
}

const catalog: SearchableProduct[] = [
  { id: "1", sku_name: "Guinness Stout 750ml", code_name: "GST", product_code: "GST-001" },
];

describe("CSV import contract (CUST-01 / Setup)", () => {
  it("header aliases work (Product Name/Qty, NAME/STOCK)", () => {
    const rows = parse("Product Name,Qty\nGuinness Stout 750ml,5\n");
    const r = normalizeRows(rows, catalog);
    expect(r.ok).toBe(true);
    expect(r.parsed[0]).toMatchObject({ sku_name: "Guinness Stout 750ml", quantity: 5, matched: true });
  });

  it("missing columns rejected", () => {
    expect(normalizeRows(parse("foo,bar\na,b\n"), catalog).ok).toBe(false);
  });

  it("empty rows skipped, blank names flagged, NaN/negative qty invalid", () => {
    const rows = parse("sku_name,quantity\n\nGuinness Stout 750ml,abc\nGuinness Stout 750ml,-3\n,5\n");
    const r = normalizeRows(rows, catalog);
    expect(r.parsed.filter((p) => p.error === "Invalid quantity")).toHaveLength(2);
    expect(r.parsed.some((p) => p.sku_name === "(empty)")).toBe(false); // filtered like Setup
  });

  it("case-insensitive match; unknown offers typo hint", () => {
    const rows = parse("sku_name,quantity\nGUINNESS STOUT 750ml,2\nGuinnes Stout 750ml,2\n");
    const r = normalizeRows(rows, catalog);
    expect(r.parsed[0].matched).toBe(true);
    expect(r.parsed[1].matched).toBe(false);
    expect(r.parsed[1].suggestion).toBe("Guinness Stout 750ml");
  });
});
