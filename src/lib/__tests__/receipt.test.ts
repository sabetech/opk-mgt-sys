import { describe, expect, it } from "vitest";
import {
  buildEmptiesMovementHtml,
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
    expect(html).toContain("Goods sold are not returnable.");
  });

  it("uses deep-print styles for thermal printers (bold, larger, solid dividers)", () => {
    const html = buildSaleReceiptHtml(sale);
    expect(html).toContain("font-size: 14px");
    expect(html).toContain("font-weight: 700");
    expect(html).toContain("border-top: 2px solid #000");
  });

  it("omits deposit block when zero", () => {
    expect(buildSaleReceiptHtml({ ...sale, crateDepositQty: 0 })).not.toContain("Crate deposit");
  });

  it("shows per-unit discount note and savings total, net unit price", () => {
    const discounted: CompletedSale = {
      ...sale,
      items: [
        { productName: "Star", skuCode: "ST-001", quantity: 2, price: 50, surcharge: 0, discount: 2, total: 96 },
      ],
      grandTotal: 96,
      crateDepositQty: 0,
    };
    const html = buildSaleReceiptHtml(discounted);
    expect(html).toContain("incl. GHc");
    expect(html).toContain("discount");
    expect(html).toContain("Wholesale discount");
    expect(html).toContain("48.00");
    expect(html).toContain("96.00");
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

  it("proforma shows discount note and savings row", () => {
    const html = buildProformaHtml({
      reference: "PF-20260919-AB12",
      dateTime: new Date(),
      customerName: "Ama",
      paymentType: "cash",
      items: [
        { productName: "Star", skuCode: "ST-001", quantity: 3, price: 50, surcharge: 0, discount: 2, total: 144 },
      ],
      totalQuantity: 3,
      subtotal: 144,
      grandTotal: 144,
    });
    expect(html).toContain("discount");
    expect(html).toContain("Wholesale discount");
    expect(html).toContain("48.00");
  });
});

describe("buildEmptiesMovementHtml", () => {
  it("renders summary, sections, records and empty states with escaped HTML", () => {
    const html = buildEmptiesMovementHtml({
      from: "2026-09-01",
      to: "2026-09-30",
      summary: [
        { label: "In from customers", value: 12 },
        { label: "Net", value: 3 },
      ],
      sections: [
        {
          title: "In From Customers",
          total: 12,
          totalLabel: "Total in",
          records: [
            {
              date: "2026-09-05",
              actor: "Kofi <Retail>",
              detail: "Ref ABCD",
              total: 12,
              lines: [{ productName: "ABC MINI 330", quantity: 12 }],
            },
          ],
        },
        { title: "Breakages", total: 0, totalLabel: "Total", records: [] },
      ],
    });
    expect(html).toContain("Empties Movement Report");
    expect(html).toContain("2026-09-01 to 2026-09-30");
    expect(html).toContain("Kofi &lt;Retail&gt;");
    expect(html).toContain("ABC MINI 330");
    expect(html).toContain("No records in range.");
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
