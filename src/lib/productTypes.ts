export interface Product {
  id: number
  sku_name: string
  code_name: string | null
  wholesale_price: number | null
  retail_price: number | null
  returnable: boolean
  created_at: string
  deleted_at: string | null
  quantity: number // Mocked quantity
}

export interface ProductForm {
  sku_name: string
  code_name: string
  wholesale_price: string
  retail_price: string
  returnable: boolean
}

export type StockLevel = 'high' | 'medium' | 'low'