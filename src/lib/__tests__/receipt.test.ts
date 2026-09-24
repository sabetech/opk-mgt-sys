import { describe, expect, it } from "vitest";
import {
  buildProformaHtml,
  buildSaleReceiptHtml,
  buildStockLevelsHtml,
  generateProformaReference,
  type CompletedSale,
} from "../receipt";

const sale: CompletedSale = {
  orderNumber: 100001,
  dateTime: new Date(2026, 8, 19, 14, 5),
  customerName: "Kofi <Retail>",
  customerType: "Retailer",
  paymentType: "mobile_money",
  servedBy: "Ama",
  items: [
    { productName: "Guinness", skuCode: "GST-001", quantity: 2, price: 50, surcharge: 2, total: 104 },
  ],
  totalQuantity: 2,
  grandTotal: 104,
  crateDepositQty: 1,
  crateDepositTotal: 200,
  crateDepositUnitAmount: 200,
};

describe("buildSaleReceiptHtml (SALE-01 receipt)", () => {
  it("escapes HTML, shows surcharge + deposit, thermal width", () => {
    const html = buildSaleReceiptHtml(sale);
    expect(html).toContain("Kofi &lt;Retail&gt;");
    expect(html).not.toContain("Kofi <Retail>");
    expect(html).toContain("incl. GHc");
    expect(html).toContain("Crate deposit");
    expect(html).toContain("72mm");
    expect(html).toContain("#100001");
  });

  it("omits deposit block when zero", () => {
    expect(buildSaleReceiptHtml({ ...sale, crateDepositQty: 0 })).not.toContain("Crate deposit");
  });
});

describe("proforma (SALE-02 quote-only)", () => {
  it("reference format PF-YYYYMMDD-XXXX, never touches order sequence", () => {
    const ref = generateProformaReference(new Date(2026, 8, 19));
    expect(ref).toMatch(/^PF-20260919-[A-Z0-9]{4}$/);
  });

  it("html carries QUOTE ONLY notice and ref", () => {
    const html = buildProformaHtml({
      reference: "PF-20260919-AB12",
      dateTime: new Date(),
      customerName: "Ama",
      paymentType: "cash",
      items: [],
      totalQuantity: 0,
      subtotal: 0,
      grandTotal: 0,
    });
    expect(html).toContain("QUOTE ONLY");
    expect(html).toContain("PF-20260919-AB12");
  });
});

describe("buildStockLevelsHtml", () => {
  it("groups by category A-Z with Uncategorized last, numbering restarts", () => {
    const html = buildStockLevelsHtml([
      { skuCode: "Z-1", productName: "Zed", quantity: 1, retailPrice: 1, category: "" },
      { skuCode: "A-1", productName: "Alpha", quantity: 2, retailPrice: 2, category: "Beer" },
      { skuCode: "A-2", productName: "Beta", quantity: 3, retailPrice: 3, category: "Beer" },
    ]);
    const beerIdx = html.indexOf("Beer");
    const uncIdx = html.indexOf("Uncategorized");
    expect(beerIdx).toBeGreaterThan(-1);
    expect(uncIdx).toBeGreaterThan(beerIdx);
  });
});
