/**
 * ORCHARD view models (Phase 2: backed by the real Store REST API).
 *
 * Product.id is the real backend Long id — never a slug or a mock id.
 * Product.categoryId is the real backend Byte category id (seed order
 * 1–10; see api/categories.ts). The backend sends NO image, NO unit,
 * NO stock, NO rating, NO seasonal/featured flag:
 * - image: frontend asset mapping by product name (api/categories.ts).
 * - unitLabel: always '' for real products. Pack sizes already appear in
 *   the backend product name itself (e.g. "Fresh Apples (1 kg)"); the UI
 *   must not invent a separate unit claim.
 * - isFeatured / isSeasonal: retained only so old component code does not
 *   break type-checking; the mapper always sets them false and no UI
 *   badge may be driven by them as if they were backend data.
 */
export interface Category {
  id: number
  name: string
  blurb: string
  image: string
  accent: string
}

export interface Product {
  id: number
  name: string
  slug: string
  description: string
  price: number // INR, as sent by the backend (BigDecimal)
  unitLabel: string
  categoryId: number
  image: string
  isFeatured: boolean
  isSeasonal: boolean
  tagline?: string
}

export interface CartLine {
  productId: number
  quantity: number
}

export interface OrderItem {
  productId: number
  name: string
  unitLabel: string
  image: string
  unitPrice: number
  quantity: number
}

/** Real order from GET /orders. status is a PAYMENT status. */
export interface RealOrder {
  id: number
  status: string
  createdAt: string
  items: OrderItem[]
  total: number
}

export interface RealUser {
  id: number
  name: string
  email: string
}

export type ThemePreference = 'light' | 'dark' | 'system'
