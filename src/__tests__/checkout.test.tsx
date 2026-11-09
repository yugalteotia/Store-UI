import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { Checkout } from '../pages/Checkout'
import App from '../App'
import { useApp } from '../state/AppContext'
import { checkout } from '../api/services'
import type { CheckoutResult } from '../api/services'
import { ApiError } from '../api/http'
import type { CartLine, Product, RealUser, ThemePreference } from '../domain/types'

// Checkout only reads cart/products/cartSubtotal/setLastCheckoutOrderId/
// refreshCart from the app state, and the guard only reads
// session/sessionStatus, so mocking the hook keeps these tests hermetic
// (no network). AppProvider is a passthrough so the guard tests can render
// the real <App/> router with the mocked hook.
vi.mock('../state/AppContext', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useApp: vi.fn(),
}))
const mockUseApp = vi.mocked(useApp)

// Only `checkout` is mocked: it is the only services function any component
// under test calls, and the real one would hit the network.
vi.mock('../api/services', () => ({ checkout: vi.fn() }))
const mockCheckout = vi.mocked(checkout)

const MILK: Product = {
  id: 7,
  name: 'Whole Milk (1 L)',
  slug: 'whole-milk-1-l',
  description: 'Fresh pasteurized whole milk from local dairies.',
  price: 65,
  unitLabel: '1 L',
  categoryId: 3,
  image: '/images/whole-milk-1-l.jpg',
  isFeatured: false,
  isSeasonal: false,
  tagline: 'Farm fresh daily',
}

const BANANAS: Product = {
  id: 9,
  name: 'Bananas (1 kg)',
  slug: 'bananas-1-kg',
  description: 'Sweet ripe bananas.',
  price: 40,
  unitLabel: '1 kg',
  categoryId: 2,
  image: '/images/bananas-1-kg.jpg',
  isFeatured: false,
  isSeasonal: false,
}

const PRODUCTS = [MILK, BANANAS]
const CART: CartLine[] = [
  { productId: 7, quantity: 2 },
  { productId: 9, quantity: 3 },
]
const CART_ID = '123e4567-e89b-12d3-a456-426614174000'
const STRIPE_URL = 'https://checkout.stripe.com/c/pay/cs_test_abc'
const SIGNED_IN: RealUser = { id: 1, name: 'Yugal', email: 'yugal@example.com' }

interface AppOverrides {
  cart?: CartLine[]
  products?: Product[]
  cartSubtotal?: number
  setLastCheckoutOrderId?: (id: number | null) => void
  refreshCart?: () => Promise<void>
  session?: RealUser | null
  sessionStatus?: 'loading' | 'ready' | 'error'
  cartCount?: number
  justAdded?: number
  theme?: ThemePreference
  setTheme?: (t: ThemePreference) => void
  isAdminHint?: boolean
  cartError?: string | null
  login?: (email: string, password: string) => Promise<RealUser>
}

function setAppState(partial: AppOverrides) {
  const setLastCheckoutOrderId = vi.fn(partial.setLastCheckoutOrderId ?? (() => {}))
  const refreshCart = vi.fn(partial.refreshCart ?? (async () => {}))
  const setTheme = vi.fn(partial.setTheme ?? (() => {}))
  const login = vi.fn(partial.login ?? (async () => SIGNED_IN))
  mockUseApp.mockReturnValue({
    cart: partial.cart ?? CART,
    products: partial.products ?? PRODUCTS,
    cartSubtotal: partial.cartSubtotal ?? 250,
    setLastCheckoutOrderId,
    refreshCart,
    session: partial.session ?? null,
    sessionStatus: partial.sessionStatus ?? 'ready',
    cartCount: partial.cartCount ?? 5,
    justAdded: partial.justAdded ?? 0,
    theme: partial.theme ?? 'light',
    setTheme,
    isAdminHint: partial.isAdminHint ?? false,
    cartError: partial.cartError ?? null,
    login,
  } as unknown as ReturnType<typeof useApp>)
  return { setLastCheckoutOrderId, refreshCart, setTheme, login }
}

function renderCheckout() {
  return render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>,
  )
}

function renderAppAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

// jsdom does not implement navigation, so assigning window.location.href
// in Checkout would only log "Not implemented" and keep the old URL. Swap
// in a stub that records the assignment, and restore the real location
// afterwards so the guard tests (BrowserRouter reads window.location) keep
// working.
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')

function stubLocationHref() {
  let href = 'http://localhost/'
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return href
      },
      set href(next: string) {
        href = next
      },
    },
  })
  return {
    get href() {
      return href
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseApp.mockReset()
  mockCheckout.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  if (originalLocationDescriptor) Object.defineProperty(window, 'location', originalLocationDescriptor)
  window.history.pushState({}, '', '/')
})

// A stateful harness proving the post-checkout flow end to end at the
// component level: the mock refreshCart clears the basket the way the real
// AppContext does after the server clears it, so the UI must land on the
// empty state.
function StatefulCheckoutHarness() {
  const [cart, setCart] = useState<CartLine[]>(CART)
  mockUseApp.mockReturnValue({
    cart,
    products: PRODUCTS,
    cartSubtotal: 250,
    setLastCheckoutOrderId: () => {},
    refreshCart: async () => {
      setCart([])
    },
    session: SIGNED_IN,
    sessionStatus: 'ready',
    cartCount: 5,
    justAdded: 0,
    theme: 'light',
    setTheme: () => {},
    isAdminHint: false,
    cartError: null,
    login: async () => SIGNED_IN,
  } as unknown as ReturnType<typeof useApp>)
  return (
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>
  )
}

describe('Checkout rendering', () => {
  it('shows the empty state with a return-to-shopping link when the basket is empty', () => {
    setAppState({ cart: [] })
    renderCheckout()
    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeInTheDocument()
    expect(screen.getByText("Your basket is empty, so there's nothing to check out.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop the market' })).toHaveAttribute('href', '/shop')
    expect(screen.queryByRole('button', { name: 'Continue to secure Stripe checkout' })).not.toBeInTheDocument()
  })

  it('lists each line with name, quantity × unit price, line total and image', () => {
    setAppState({})
    renderCheckout()
    expect(screen.getByRole('heading', { name: 'Basket summary' })).toBeInTheDocument()
    expect(screen.getByText('Whole Milk (1 L)')).toBeInTheDocument()
    expect(screen.getByText('2 × ₹65')).toBeInTheDocument()
    expect(screen.getByText('₹130')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Whole Milk (1 L)' })).toHaveAttribute(
      'src',
      '/images/whole-milk-1-l.jpg',
    )
    expect(screen.getByText('Bananas (1 kg)')).toBeInTheDocument()
    expect(screen.getByText('3 × ₹40')).toBeInTheDocument()
    expect(screen.getByText('₹120')).toBeInTheDocument()
  })

  it('shows the server total and explains what happens next', () => {
    setAppState({})
    renderCheckout()
    expect(screen.getByText('Total (server)')).toBeInTheDocument()
    expect(screen.getByText('₹250')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument()
    expect(screen.getByText(/You confirm below/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/Real checkout, via the Store API/)
    expect(screen.getByRole('note')).toHaveTextContent(/never asks for, sees or stores card details/)
  })

  it('keeps the checkout button enabled: sign-in is a step before this page, not a dead end here', () => {
    setAppState({})
    renderCheckout()
    expect(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' })).toBeEnabled()
  })

  it('ignores basket lines for products missing from the catalogue', () => {
    setAppState({ cart: [{ productId: 999, quantity: 2 }] })
    renderCheckout()
    expect(screen.getByText("Your basket is empty, so there's nothing to check out.")).toBeInTheDocument()
  })
})

describe('Checkout submission', () => {
  it('shows an error and never calls the API when no basket id is stored', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No basket was found on the server. Add an item first, then try again.')
    expect(mockCheckout).not.toHaveBeenCalled()
  })

  it('creates the order, records the order id, refreshes the basket and hands off to Stripe', async () => {
    const user = userEvent.setup()
    const loc = stubLocationHref()
    mockCheckout.mockResolvedValue({ orderId: 42, checkoutUrl: STRIPE_URL })
    const { setLastCheckoutOrderId, refreshCart } = setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    await waitFor(() => expect(mockCheckout).toHaveBeenCalledWith(CART_ID))
    expect(setLastCheckoutOrderId).toHaveBeenCalledWith(42)
    expect(refreshCart).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(loc.href).toBe(STRIPE_URL))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the button with a pending label while the checkout request is in flight', async () => {
    const user = userEvent.setup()
    const loc = stubLocationHref()
    let resolveCheckout!: (value: CheckoutResult) => void
    mockCheckout.mockImplementation(
      () =>
        new Promise<CheckoutResult>((resolve) => {
          resolveCheckout = resolve
        }),
    )
    setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const pendingButton = screen.getByRole('button', { name: 'Creating your Stripe checkout…' })
    expect(pendingButton).toBeDisabled()
    resolveCheckout({ orderId: 42, checkoutUrl: STRIPE_URL })
    await waitFor(() => expect(loc.href).toBe(STRIPE_URL))
  })

  it('refuses a non-Stripe checkout URL: no order id, no refresh, no navigation, button re-enabled', async () => {
    const user = userEvent.setup()
    const loc = stubLocationHref()
    mockCheckout.mockResolvedValue({ orderId: 42, checkoutUrl: 'https://evil.example.com/pay' })
    const { setLastCheckoutOrderId, refreshCart } = setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'The server returned a checkout address that is not a Stripe address. Nothing was opened - this is a safety stop, not a payment.',
    )
    expect(setLastCheckoutOrderId).not.toHaveBeenCalled()
    expect(refreshCart).not.toHaveBeenCalled()
    expect(loc.href).toBe('http://localhost/')
    expect(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' })).toBeEnabled()
  })

  it('treats a network failure as uncertain and points at the orders page', async () => {
    const user = userEvent.setup()
    mockCheckout.mockRejectedValue(new ApiError('network', 'Network timeout'))
    setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'The checkout request did not complete cleanly. The order may already exist - check your orders before trying again.',
    )
    expect(screen.getByRole('link', { name: 'Check my orders' })).toHaveAttribute('href', '/account/orders')
    expect(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' })).toBeEnabled()
  })

  it('asks the user to sign in when the API reports an auth failure', async () => {
    const user = userEvent.setup()
    mockCheckout.mockRejectedValue(new ApiError('auth', 'Unauthorized'))
    setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Please sign in to check out - checkout requires an account.')
    expect(screen.queryByRole('link', { name: 'Check my orders' })).not.toBeInTheDocument()
  })

  it('surfaces a generic checkout failure message', async () => {
    const user = userEvent.setup()
    mockCheckout.mockRejectedValue(new Error('Card declined by gateway.'))
    setAppState({})
    window.localStorage.setItem('orchard.cartId', CART_ID)
    renderCheckout()
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Card declined by gateway.')
  })

  it('lands on the empty state after a successful checkout clears the basket', async () => {
    const user = userEvent.setup()
    const loc = stubLocationHref()
    mockCheckout.mockResolvedValue({ orderId: 42, checkoutUrl: STRIPE_URL })
    window.localStorage.setItem('orchard.cartId', CART_ID)
    render(<StatefulCheckoutHarness />)
    await user.click(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' }))
    expect(await screen.findByText("Your basket is empty, so there's nothing to check out.")).toBeInTheDocument()
    expect(loc.href).toBe(STRIPE_URL)
  })
})

describe('RequireAuth guard (via App)', () => {
  it('shows a loading state while the session is still restoring', () => {
    setAppState({ sessionStatus: 'loading' })
    renderAppAt('/checkout')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('heading', { name: 'Checkout' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument()
  })

  it('redirects a guest to login, remembering /checkout as next', async () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderAppAt('/checkout')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(window.location.search).toBe('?next=%2Fcheckout')
  })

  it('keeps the query string in the remembered next path', async () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderAppAt('/checkout?source=cart')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(window.location.search).toBe('?next=%2Fcheckout%3Fsource%3Dcart')
  })

  it('lets a signed-in user reach the checkout page', () => {
    setAppState({ session: SIGNED_IN, sessionStatus: 'ready' })
    renderAppAt('/checkout')
    expect(screen.getByRole('heading', { name: 'Basket summary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to secure Stripe checkout' })).toBeEnabled()
  })
})
