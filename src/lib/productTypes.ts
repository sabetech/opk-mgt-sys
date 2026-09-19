export interface Product {
  id: string
  sku_name: string
  code_name: string | null
  /** Generated unique code (e.g. ALVP-001). Null for legacy rows pre-backfill. */
  product_code: string | null
  ex_factory_price: number | null
  wholesale_price: number | null
  retail_price: number | null
  returnable: boolean
  created: string
  deleted_at: string | null
  quantity: number
}

export interface ProductForm {
  sku_name: string
  code_name: string
  /** Set by callers on create (generated). Preserved on update. */
  product_code?: string | null
  ex_factory_price: string
  wholesale_price: string
  retail_price: string
  returnable: boolean
}

export type StockLevel = 'high' | 'medium' | 'low'