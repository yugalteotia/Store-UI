/**
 * Backend transport DTOs, verified against the Store REST API source
 * (see docs/api-contract-matrix.md). These shapes are the wire format —
 * they are NOT the view models used by components. Mapping lives in
 * mapping.ts. Nothing here is invented: fields the backend does not send
 * (images, units, stock, ratings, categories list) simply do not appear.
 */

export interface ProductDto {
  id: number
  name: string
  description: string | null
  /** Jackson serialises BigDecimal as a JSON number; accept a string too
   *  so a differently-configured backend cannot break parsing. */
  price: number | string
  categoryId: number
}

export interface CartProductDto {
  id: number
  name: string
  price: number | string
}

export interface CartItemDto {
  product: CartProductDto
  quantity: number
  totalPrice: number | string
}

export interface CartDto {
  id: string
  items: CartItemDto[]
  totalPrice: number | string
}

export interface OrderItemDto {
  product: CartProductDto
  quantity: number
  totalPrice: number | string
}

/** status is a payment status (PENDING | PAID | FAILED | CANCELLED), not a
 *  delivery status. createdAt is a LocalDateTime serialised by Jackson. */
export interface OrderDto {
  id: number
  status: string
  createdAt: string
  items: OrderItemDto[]
  totalPrice: number | string
}

/** /auth/me and /users return only these three fields. There is NO role
 *  field in UserDto — the frontend cannot learn a role from identity. */
export interface UserDto {
  id: number
  name: string
  email: string
}

export interface JwtResponseDto {
  token: string
}

export interface CheckoutResponseDto {
  orderId: number
  checkoutUrl: string
}

/** Parse a backend decimal (number or string) into a JS number, or null
 *  when it is not a finite number. Never silently substitutes 0 for a
 *  malformed price — callers decide how to surface it. */
export function parsePrice(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : null
}
