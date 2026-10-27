import { apiRequest, setAccessToken } from './http'
import type {
  CartDto,
  CheckoutResponseDto,
  JwtResponseDto,
  OrderDto,
  ProductDto,
  UserDto,
} from './contracts'
import { parsePrice } from './contracts'
import { toOrder, toProduct } from './mapping'
import type { Product, RealOrder, RealUser } from '../domain/types'

/** All endpoint calls go through here. Components never build URLs. */

// --- Products (public GET; POST/PUT/DELETE are ADMIN-only server-side) ---
export async function listProducts(): Promise<Product[]> {
  const dtos = await apiRequest<ProductDto[]>('/products')
  if (!Array.isArray(dtos)) throw new Error('Unexpected product response from the server.')
  // Drop rows with an unparseable price rather than inventing ₹0.
  return dtos.filter((d) => parsePrice(d.price) !== null).map(toProduct)
}

export async function getProduct(id: number): Promise<Product> {
  const dto = await apiRequest<ProductDto>(`/products/${id}`)
  return toProduct(dto)
}

export interface ProductInput {
  name: string
  description: string
  price: number
  categoryId: number
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const dto = await apiRequest<ProductDto>('/products', { method: 'POST', body: input })
  return toProduct(dto)
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  await apiRequest<null>(`/products/${id}`, { method: 'PUT', body: input })
}

export async function deleteProduct(id: number): Promise<void> {
  await apiRequest<null>(`/products/${id}`, { method: 'DELETE' })
}

// --- Auth ---
export async function login(email: string, password: string): Promise<RealUser> {
  const res = await apiRequest<JwtResponseDto>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  if (!res?.token) throw new Error('Login did not return a token.')
  setAccessToken(res.token)
  return getMe()
}

/** POST /users is the registration endpoint (there is NO /auth/register).
 *  It returns 201 + UserDto and NO token, so callers log in afterwards. */
export async function registerUser(name: string, email: string, password: string): Promise<UserDto> {
  return apiRequest<UserDto>('/users', { method: 'POST', body: { name, email, password } })
}

export async function getMe(): Promise<RealUser> {
  const dto = await apiRequest<UserDto>('/auth/me')
  return { id: dto.id, name: dto.name, email: dto.email }
}

/** Admin probe (UI hint only, never authorisation): GET /admin/hello
 *  returns 200 for ADMIN, 403 otherwise, 401 when signed out. The backend
 *  still enforces every management call with 403. */
export async function probeAdmin(): Promise<boolean> {
  try {
    await apiRequest<unknown>('/admin/hello')
    return true
  } catch {
    return false
  }
}

export function clearSessionToken(): void {
  setAccessToken(null)
}

// --- Users (own account only; the backend has no ownership check, so the
// frontend must never call these with anyone else's id, and must never
// expose GET /users, the user list, to any customer UI.) ---
export async function updateUser(id: number, name: string, email: string): Promise<RealUser> {
  const dto = await apiRequest<UserDto>(`/users/${id}`, { method: 'PUT', body: { name, email } })
  return { id: dto.id, name: dto.name, email: dto.email }
}

export async function changePassword(id: number, oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest<null>(`/users/${id}/change-password`, {
    method: 'POST',
    body: { oldPassword, newPassword },
  })
}

// --- Cart (public, anonymous UUID; not linked to a user; no merge) ---
export async function createCart(): Promise<CartDto> {
  return apiRequest<CartDto>('/carts', { method: 'POST' })
}

export async function getCart(cartId: string): Promise<CartDto> {
  return apiRequest<CartDto>(`/carts/${cartId}`)
}

/** Backend add increments by exactly 1 per call and returns the item. */
export async function addCartItem(cartId: string, productId: number): Promise<void> {
  await apiRequest<unknown>(`/carts/${cartId}/items`, { method: 'POST', body: { productId } })
}

/** Quantity bounds are the backend's: 1..1000 (UpdateItemRequestDto). */
export async function updateCartItem(cartId: string, productId: number, quantity: number): Promise<void> {
  await apiRequest<unknown>(`/carts/${cartId}/items/${productId}`, {
    method: 'PUT',
    body: { quantity },
  })
}

export async function removeCartItem(cartId: string, productId: number): Promise<void> {
  await apiRequest<null>(`/carts/${cartId}/items/${productId}`, { method: 'DELETE' })
}

export async function clearCartItems(cartId: string): Promise<void> {
  await apiRequest<null>(`/carts/${cartId}/items`, { method: 'DELETE' })
}

// --- Checkout / orders ---
export interface CheckoutResult {
  orderId: number
  checkoutUrl: string
}

export async function checkout(cartId: string): Promise<CheckoutResult> {
  const res = await apiRequest<CheckoutResponseDto>('/checkout', {
    method: 'POST',
    body: { cartId },
  })
  return { orderId: res.orderId, checkoutUrl: res.checkoutUrl }
}

export async function listOrders(): Promise<RealOrder[]> {
  const dtos = await apiRequest<OrderDto[]>('/orders')
  if (!Array.isArray(dtos)) throw new Error('Unexpected orders response from the server.')
  return dtos.map(toOrder)
}

export async function getOrder(orderId: number): Promise<RealOrder> {
  const dto = await apiRequest<OrderDto>(`/orders/${orderId}`)
  return toOrder(dto)
}
