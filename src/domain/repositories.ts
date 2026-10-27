import type { CartLine, Product } from './types'

/**
 * Pure, client-side query helpers over data already loaded from the real
 * API. These are NOT a data source: the backend has no search, sort or
 * pagination, so Shop filters/sorts the loaded catalogue locally. That
 * covers the complete catalogue only because the backend returns the full
 * list in one response (see docs/api-contract-matrix.md).
 */

export type SortKey = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'default'

export interface ShopQuery {
  search: string
  categoryId: string | 'all'
  sort: SortKey
}

export const ProductRepository = {
  list(products: Product[]): Product[] {
    return [...products]
  },
  getById(products: Product[], id: number): Product | undefined {
    return products.find((p) => p.id === id)
  },
  filterSort(products: Product[], query: ShopQuery): Product[] {
    const q = query.search.trim().toLowerCase()
    let out = products.filter((p) => {
      const matchesSearch =
        q === '' ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      const matchesCategory = query.categoryId === 'all' || String(p.categoryId) === query.categoryId
      return matchesSearch && matchesCategory
    })
    switch (query.sort) {
      case 'name-asc':
        out = [...out].sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name-desc':
        out = [...out].sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'price-asc':
        out = [...out].sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        out = [...out].sort((a, b) => b.price - a.price)
        break
      case 'default':
        break
    }
    return out
  },
  related(products: Product[], product: Product, limit = 4): Product[] {
    return products
      .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
      .slice(0, limit)
  },
}

export const CartRepository = {
  count(lines: CartLine[]): number {
    return lines.reduce((sum, l) => sum + l.quantity, 0)
  },
  subtotal(lines: CartLine[], products: Product[]): number {
    return lines.reduce((sum, l) => {
      const p = products.find((x) => x.id === l.productId)
      return sum + (p ? p.price * l.quantity : 0)
    }, 0)
  },
  detailed(lines: CartLine[], products: Product[]): { product: Product; quantity: number }[] {
    return lines
      .map((l) => ({ product: products.find((p) => p.id === l.productId), quantity: l.quantity }))
      .filter((x): x is { product: Product; quantity: number } => Boolean(x.product))
  },
}
