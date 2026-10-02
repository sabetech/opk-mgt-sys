export interface PriceProduct {
    retail_price: number | null
    wholesale_price: number | null
}

export interface RetailPricingConfig {
    product_ids: string[]
    customer_ids: string[]
}

/**
 * Resolves the POS unit price basis.
 *
 * Select wholesalers pay RETAIL price on select products (configured in
 * Settings as wholesale_retail_pricing); every other wholesaler line uses
 * wholesale, and non-wholesalers always use retail. A null retail price
 * falls back to wholesale so a missing retail can never zero a sale.
 */
export function resolveUnitPrice(
    product: PriceProduct,
    customerTypeName: string | null | undefined,
    customerId: string | null | undefined,
    productId: string,
    retailPricing: RetailPricingConfig | null | undefined
): number {
    const retail = product.retail_price ?? 0
    const wholesale = product.wholesale_price ?? 0
    const isWholesaler = customerTypeName === "Wholesaler"
    if (!isWholesaler) return retail || 0
    const override =
        !!customerId &&
        !!productId &&
        (retailPricing?.customer_ids ?? []).includes(customerId) &&
        (retailPricing?.product_ids ?? []).includes(productId)
    if (override) return retail || wholesale || 0
    return wholesale || retail || 0
}

/** Whether the retail-pricing override hits this wholesaler × product pair. */
export function isRetailPricingApplicable(
    customerTypeName: string | null | undefined,
    customerId: string | null | undefined,
    productId: string | null | undefined,
    retailPricing: RetailPricingConfig | null | undefined
): boolean {
    return (
        customerTypeName === "Wholesaler" &&
        !!customerId &&
        !!productId &&
        (retailPricing?.customer_ids ?? []).includes(customerId) &&
        (retailPricing?.product_ids ?? []).includes(productId)
    )
}
