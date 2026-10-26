// Types mirroring the Store REST API DTOs (see backend: products, carts,
// orders, users, auth, payments packages). The backend publishes Springdoc
// OpenAPI at /v3/api-docs; a generated client can replace these by hand
// later, but these types are kept deliberately 1:1 with the DTOs so the
// mapping stays obvious.

export interface Product {
  id: number
  name: string
  description: string
  price: number
  categoryId: number
}

export interface CartItem {
  product: Product
  quantity: number
  totalPrice: number
}

export interface Cart {
  id: string
  items: CartItem[]
  totalPrice: number
}

export interface OrderItem {
  product: Product
  quantity: number
  totalPrice: number
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'

export interface Order {
  id: number
  status: PaymentStatus
  createdAt: string
  items: OrderItem[]
  totalPrice: number
}

export interface User {
  id: number
  name: string
  email: string
}

export interface CheckoutResponse {
  orderId: number
  checkoutUrl: string
}

// Category ids are the V5 seed order in the backend repo
// (db/migration/V5__populate_database.sql). There is no
// GET /categories endpoint yet, so this list is the source of truth
// for the UI until one is added. Verify against your DB if you reseed.
export const CATEGORIES: { id: number; name: string; emoji: string }[] = [
  { id: 1, name: 'Fruits', emoji: '🍎' },
  { id: 2, name: 'Vegetables', emoji: '🥕' },
  { id: 3, name: 'Dairy', emoji: '🥛' },
  { id: 4, name: 'Bakery', emoji: '🍞' },
  { id: 5, name: 'Beverages', emoji: '🧃' },
  { id: 6, name: 'Pantry Staples', emoji: '🍚' },
  { id: 7, name: 'Snacks', emoji: '🍿' },
  { id: 8, name: 'Frozen Foods', emoji: '🧊' },
  { id: 9, name: 'Personal Care', emoji: '🧴' },
  { id: 10, name: 'Household Essentials', emoji: '🧹' },
]

export const categoryFor = (id: number) =>
  CATEGORIES.find((c) => c.id === id)

export const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n)

// --- Auth token storage -------------------------------------------------
// Access token: 15 min. Refresh token: HttpOnly cookie (7 days), set by
// POST /auth/login, path /auth/refresh. The browser sends it automatically
// on same-origin requests (which is what the Vite dev proxy gives us).
const TOKEN_KEY = 'store.accessToken'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

// --- Fetch wrapper with one silent refresh ------------------------------
let refreshPromise: Promise<string | null> | null = null

async function refreshToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch('/auth/refresh', { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) return null
        const data = (await r.json()) as { token: string }
        setToken(data.token)
        return data.token
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 401 && !retried && getToken()) {
    const fresh = await refreshToken()
    if (fresh) return api<T>(path, init, true)
    setToken(null)
    // Tell AuthProvider the session is gone. Previously the provider's
    // hasToken state stayed true after this, so back/forward navigation
    // kept rendering as "logged in" while every request failed, and a
    // later /auth/me error left the UI in a half-logged-in state.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('store:auth-cleared'))
    }
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
      else if (body?.message) message = body.message
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

// --- Endpoint helpers ----------------------------------------------------
export const fetchProducts = (categoryId?: number) =>
  api<Product[]>(
    categoryId ? `/products?categoryId=${categoryId}` : '/products',
  )
export const fetchProduct = (id: number) => api<Product>(`/products/${id}`)
export const createProduct = (body: {
  name: string
  description: string
  price: number
  categoryId: number
}) => api<Product>('/products', { method: 'POST', body: JSON.stringify(body) })
export const updateProduct = (
  id: number,
  body: { name: string; description: string; price: number; categoryId: number },
) => api<void>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const deleteProduct = (id: number) =>
  api<void>(`/products/${id}`, { method: 'DELETE' })

export const createCart = () => api<Cart>('/carts', { method: 'POST' })
export const fetchCart = (cartId: string) => api<Cart>(`/carts/${cartId}`)
export const addToCart = (cartId: string, productId: number) =>
  api<CartItem>(`/carts/${cartId}/items`, {
    method: 'POST',
    body: JSON.stringify({ productId }),
  })
export const updateCartItem = (
  cartId: string,
  productId: number,
  quantity: number,
) =>
  api<CartItem>(`/carts/${cartId}/items/${productId}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity }),
  })
export const removeCartItem = (cartId: string, productId: number) =>
  api<void>(`/carts/${cartId}/items/${productId}`, { method: 'DELETE' })
export const clearCartApi = (cartId: string) =>
  api<void>(`/carts/${cartId}/items`, { method: 'DELETE' })

export const login = (email: string, password: string) =>
  api<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
export const register = (name: string, email: string, password: string) =>
  api<User>('/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
export const fetchMe = () => api<User>('/auth/me')
export const updateUser = (id: number, name: string, email: string) =>
  api<User>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, email }),
  })
export const changePassword = (
  id: number,
  oldPassword: string,
  newPassword: string,
) =>
  api<void>(`/users/${id}/change-password`, {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  })

export const fetchOrders = () => api<Order[]>('/orders')
export const fetchOrder = (id: number) => api<Order>(`/orders/${id}`)
export const checkout = (cartId: string) =>
  api<CheckoutResponse>('/checkout', {
    method: 'POST',
    body: JSON.stringify({ cartId }),
  })
