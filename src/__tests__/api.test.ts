import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, apiRequest, isValidStripeCheckoutUrl, setAccessToken } from '../api/http'
import { parsePrice } from '../api/contracts'
import { toOrder, toProduct } from '../api/mapping'
import {
  addCartItem,
  checkout,
  deleteProduct,
  getProduct,
  listProducts,
  login,
  registerUser,
  updateCartItem,
} from '../api/services'

function jsonResponse(status: number, body: unknown, contentType = 'application/json') {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  })
}

function mockFetchSequence(responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error(`Unexpected fetch call: ${url}`)
    return next
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

beforeEach(() => {
  setAccessToken(null)
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('http client', () => {
  it('returns parsed JSON on success and sends the bearer token', async () => {
    const { calls } = mockFetchSequence([jsonResponse(200, { id: 1, name: 'Apples' })])
    setAccessToken('tok-123')
    const out = await apiRequest<{ id: number }>('/products/1')
    expect(out.id).toBe(1)
    const headers = new Headers(calls[0].init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer tok-123')
  })

  it('returns null for a 204 empty response', async () => {
    mockFetchSequence([new Response(null, { status: 204 })])
    await expect(apiRequest('/products/1', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('normalises field-error maps to validation with fieldErrors', async () => {
    mockFetchSequence([jsonResponse(400, { email: 'Email must be in lowercase' })])
    try {
      await apiRequest('/users', { method: 'POST', body: {} })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).kind).toBe('validation')
      expect((err as ApiError).fieldErrors.email).toBe('Email must be in lowercase')
    }
  })

  it('normalises {error} bodies, 403, 404 and 500 distinctly', async () => {
    mockFetchSequence([jsonResponse(400, { error: 'Cart is empty.' })])
    await expect(apiRequest('/checkout', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'validation' })

    mockFetchSequence([jsonResponse(403, '')])
    await expect(apiRequest('/products', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'authz' })

    mockFetchSequence([jsonResponse(404, '')])
    await expect(apiRequest('/products/999')).rejects.toMatchObject({ kind: 'not-found' })

    mockFetchSequence([jsonResponse(500, { error: 'Error creating a checkout session.' })])
    await expect(apiRequest('/checkout', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'server' })
  })

  it('maps a network failure to kind network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(apiRequest('/products')).rejects.toMatchObject({ kind: 'network' })
  })

  it('retries once after a successful silent refresh, then fails cleanly when refresh fails', async () => {
    // First: 401, refresh succeeds, retry succeeds.
    mockFetchSequence([
      jsonResponse(401, ''),
      jsonResponse(200, { token: 'fresh-token' }),
      jsonResponse(200, [{ id: 1 }]),
    ])
    setAccessToken('stale')
    const out = await apiRequest<unknown[]>('/products')
    expect(out).toEqual([{ id: 1 }])

    // Second: 401, refresh fails -> auth error and token cleared.
    mockFetchSequence([jsonResponse(401, ''), jsonResponse(401, '')])
    setAccessToken('stale-2')
    await expect(apiRequest('/products')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('does not retry the refresh endpoint itself', async () => {
    const { fetchMock } = mockFetchSequence([jsonResponse(401, '')])
    await expect(apiRequest('/auth/refresh', { method: 'POST', retryOnAuth: false })).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('checkout redirect validation', () => {
  it('accepts Stripe checkout URLs and rejects everything else', () => {
    expect(isValidStripeCheckoutUrl('https://checkout.stripe.com/pay/cs_test_123')).toBe(true)
    expect(isValidStripeCheckoutUrl('https://pay.stripe.com/x')).toBe(true)
    expect(isValidStripeCheckoutUrl('http://checkout.stripe.com/pay/x')).toBe(false)
    expect(isValidStripeCheckoutUrl('https://checkout.stripe.com.evil.example/x')).toBe(false)
    expect(isValidStripeCheckoutUrl('https://evil.example/checkout')).toBe(false)
    expect(isValidStripeCheckoutUrl('not a url')).toBe(false)
  })
})

describe('DTO mapping', () => {
  it('maps a product DTO, parsing string prices and mapping images by name', () => {
    const p = toProduct({ id: 1, name: 'Fresh Apples (1 kg)', description: 'Crisp.', price: '180.00', categoryId: 1 })
    expect(p.id).toBe(1)
    expect(p.price).toBe(180)
    expect(p.image).toBe('/images/fresh-apples.jpg')
    expect(p.unitLabel).toBe('')
    expect(p.isFeatured).toBe(false)
  })

  it('falls back to the category photo for an unknown product name', () => {
    const p = toProduct({ id: 99, name: 'Something New (1 kg)', description: null, price: 50, categoryId: 2 })
    expect(p.image).toBe('/images/category-vegetables.jpg')
    expect(p.description).toBe('')
  })

  it('maps an order DTO, preserving payment status (not delivery status)', () => {
    const o = toOrder({
      id: 7,
      status: 'PENDING',
      createdAt: '2026-10-27T10:00:00',
      items: [{ product: { id: 1, name: 'Fresh Apples (1 kg)', price: 180 }, quantity: 2, totalPrice: 360 }],
      totalPrice: 360,
    })
    expect(o.status).toBe('PENDING')
    expect(o.total).toBe(360)
    expect(o.items[0].unitPrice).toBe(180)
  })

  it('rejects unparseable prices instead of inventing a price', () => {
    expect(parsePrice('not-a-number')).toBeNull()
    expect(parsePrice(null)).toBeNull()
    expect(parsePrice(42)).toBe(42)
  })
})

describe('services use the verified contracts', () => {
  it('listProducts drops rows with unparseable prices', async () => {
    mockFetchSequence([
      jsonResponse(200, [
        { id: 1, name: 'Fresh Apples (1 kg)', description: 'x', price: 180, categoryId: 1 },
        { id: 2, name: 'Broken', description: 'x', price: 'nope', categoryId: 1 },
      ]),
    ])
    const out = await listProducts()
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(1)
  })

  it('login posts to /auth/login then fetches /auth/me with the token', async () => {
    const { calls } = mockFetchSequence([
      jsonResponse(200, { token: 'abc' }),
      jsonResponse(200, { id: 5, name: 'Asha', email: 'asha@example.com' }),
    ])
    const user = await login('asha@example.com', 'secret1')
    expect(user).toEqual({ id: 5, name: 'Asha', email: 'asha@example.com' })
    expect(calls[0].url).toBe('/auth/login')
    expect(calls[1].url).toBe('/auth/me')
    expect(new Headers(calls[1].init?.headers).get('Authorization')).toBe('Bearer abc')
  })

  it('registration posts to /users — there is no /auth/register', async () => {
    const { calls } = mockFetchSequence([jsonResponse(201, { id: 6, name: 'Asha', email: 'asha@example.com' })])
    await registerUser('Asha', 'asha@example.com', 'secret1')
    expect(calls[0].url).toBe('/users')
    expect(calls[0].init?.method).toBe('POST')
  })

  it('cart mutations send the verified request bodies', async () => {
    const { calls } = mockFetchSequence([
      jsonResponse(201, { product: { id: 1, name: 'x', price: 10 }, quantity: 1, totalPrice: 10 }),
      jsonResponse(200, { product: { id: 1, name: 'x', price: 10 }, quantity: 3, totalPrice: 30 }),
    ])
    await addCartItem('11111111-2222-3333-4444-555555555555', 1)
    await updateCartItem('11111111-2222-3333-4444-555555555555', 1, 3)
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ productId: 1 })
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ quantity: 3 })
  })

  it('checkout sends only {cartId} and returns orderId + checkoutUrl', async () => {
    const { calls } = mockFetchSequence([jsonResponse(200, { orderId: 9, checkoutUrl: 'https://checkout.stripe.com/pay/x' })])
    const out = await checkout('11111111-2222-3333-4444-555555555555')
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({ cartId: '11111111-2222-3333-4444-555555555555' })
    expect(out).toEqual({ orderId: 9, checkoutUrl: 'https://checkout.stripe.com/pay/x' })
  })

  it('management 403 is surfaced as authz, never as success', async () => {
    mockFetchSequence([jsonResponse(403, '')])
    await expect(deleteProduct(1)).rejects.toMatchObject({ kind: 'authz' })
  })

  it('unknown product is surfaced as not-found', async () => {
    mockFetchSequence([jsonResponse(404, '')])
    await expect(getProduct(999)).rejects.toMatchObject({ kind: 'not-found' })
  })
})
