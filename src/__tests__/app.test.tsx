import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const PRODUCTS = [
  { id: 1, name: 'Fresh Apples (1 kg)', description: 'Crisp apples.', price: 180, categoryId: 1 },
  { id: 6, name: 'Fresh Tomatoes (1 kg)', description: 'Ripe tomatoes.', price: 40, categoryId: 2 },
]

beforeEach(() => {
  window.localStorage.clear()
  window.history.pushState({}, '', '/')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/products') return jsonResponse(200, PRODUCTS)
    if (url === '/auth/refresh') return jsonResponse(401, '')
    if (url.startsWith('/products/')) {
      const found = PRODUCTS.find((p) => p.id === Number(url.split('/').pop()))
      return found ? jsonResponse(200, found) : jsonResponse(404, '')
    }
    return jsonResponse(404, '')
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('routing and theme (live catalogue, mocked network)', () => {
  it('renders the ORCHARD home page with a shopping call to action', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /a little closer/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Fresh Apples (1 kg)').length).toBeGreaterThan(0))
    expect(screen.getAllByRole('link', { name: /shop the market/i }).length).toBeGreaterThan(0)
  })

  it('shows a not-found state for an unknown route', () => {
    window.history.pushState({}, '', '/no-such-page')
    render(<App />)
    expect(screen.getByRole('heading', { name: /isn.t in the market/i })).toBeInTheDocument()
  })

  it('shows a not-found state for an unknown product id', async () => {
    window.history.pushState({}, '', '/products/999')
    render(<App />)
    expect(await screen.findByRole('heading', { name: /product not found/i })).toBeInTheDocument()
  })

  it('shows a graceful state for direct navigation to the checkout result', () => {
    window.history.pushState({}, '', '/checkout/result')
    render(<App />)
    expect(screen.getByRole('heading', { name: /no order to show/i })).toBeInTheDocument()
  })

  it('shows the Stripe return pages without claiming payment', () => {
    window.history.pushState({}, '', '/checkout-cancel')
    render(<App />)
    expect(screen.getByRole('heading', { name: /checkout cancelled/i })).toBeInTheDocument()
  })

  it('cycles the theme and persists the preference', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('orchard.theme', '"light"')
    render(<App />)
    const toggle = screen.getByRole('button', { name: /theme:/i })
    await user.click(toggle) // light -> dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('orchard.theme')).toBe('"dark"')
  })

  it('handles malformed persisted cart id and theme without crashing', () => {
    window.localStorage.setItem('orchard.cartId', 'not-a-uuid')
    window.localStorage.setItem('orchard.theme', '"banana"')
    render(<App />)
    expect(screen.getByRole('heading', { name: /a little closer/i })).toBeInTheDocument()
  })
})

describe('form validation', () => {
  it('shows inline validation on the login form', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/login')
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument()
  })
})
