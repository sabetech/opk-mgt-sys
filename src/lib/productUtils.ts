import type { StockLevel } from './productTypes'

export const getMockQuantity = (productId: number): number => {
  const seed = productId * 17
  return (seed % 95) + 5 // Range: 5-99
}

export const getStockLevel = (quantity: number): StockLevel => {
  if (quantity > 50) return 'high'
  if (quantity >= 20) return 'medium'
  return 'low'
}

export const formatPrice = (price: number | null): string => {
  return price !== null ? `GHc ${price.toFixed(2)}` : 'GHc 0.00'
}

export const getStockBadgeVariant = (level: StockLevel) => {
  switch (level) {
    case 'high': return 'default'
    case 'medium': return 'secondary'
    case 'low': return 'destructive'
  }
}

export const getStockBadgeText = (level: StockLevel) => {
  switch (level) {
    case 'high': return 'High Stock'
    case 'medium': return 'Medium Stock'
    case 'low': return 'Low Stock'
  }
}

export const validateProductForm = (formData: any): Record<string, string> => {
  const errors: Record<string, string> = {}
  
  if (!formData.sku_name?.trim()) {
    errors.sku_name = 'Product name is required'
  } else if (formData.sku_name.trim().length < 2) {
    errors.sku_name = 'Product name must be at least 2 characters'
  }
  
  if (formData.wholesale_price && isNaN(parseFloat(formData.wholesale_price))) {
    errors.wholesale_price = 'Invalid wholesale price'
  }
  
  if (formData.retail_price && isNaN(parseFloat(formData.retail_price))) {
    errors.retail_price = 'Invalid retail price'
  }
  
  if (formData.code_name && !/^[A-Z0-9]+$/i.test(formData.code_name)) {
    errors.code_name = 'SKU code must be alphanumeric'
  }
  
  return errors
}