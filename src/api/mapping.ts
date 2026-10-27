import type { CartDto, OrderDto, ProductDto } from './contracts'
import { parsePrice } from './contracts'
import { imageForProduct } from './categories'
import type { Product, RealOrder } from '../domain/types'

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'product'
}

/** Backend ProductDto -> ORCHARD view model. Price that cannot be parsed
 *  becomes NaN-safe: the caller filters such rows out rather than showing
 *  a fabricated ₹0 price (see services.listProducts). */
export function toProduct(dto: ProductDto): Product {
  const price = parsePrice(dto.price)
  return {
    id: dto.id,
    name: dto.name,
    slug: slugify(dto.name),
    description: dto.description ?? '',
    price: price ?? 0,
    unitLabel: '',
    categoryId: dto.categoryId,
    image: imageForProduct(dto.name, dto.categoryId),
    isFeatured: false,
    isSeasonal: false,
  }
}

export function toOrder(dto: OrderDto): RealOrder {
  return {
    id: dto.id,
    status: dto.status,
    createdAt: dto.createdAt,
    items: (dto.items ?? []).map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      unitLabel: '',
      image: imageForProduct(item.product.name, 0),
      unitPrice: parsePrice(item.product.price) ?? 0,
      quantity: item.quantity,
    })),
    total: parsePrice(dto.totalPrice) ?? 0,
  }
}

/** Server cart -> local lines + server total. Items whose product id is
 *  missing are dropped (a deleted product cannot be displayed or priced). */
export function cartLinesFromDto(dto: CartDto): { lines: { productId: number; quantity: number }[]; total: number } {
  const lines = (dto.items ?? [])
    .filter((item) => item.product && typeof item.product.id === 'number')
    .map((item) => ({ productId: item.product.id, quantity: item.quantity }))
  return { lines, total: parsePrice(dto.totalPrice) ?? 0 }
}
