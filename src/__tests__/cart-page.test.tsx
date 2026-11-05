import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { CartPage } from '../pages/CartPage'
import { useApp } from '../state/AppContext'
import type { CartLine, Product } from '../domain/types'

// CartPage only reads cart/products/setCartQuantity/removeFromCart/
// clearCart/cartSubtotal/cartStatus/cartError/refreshCart from the app
// state, so mocking the hook keeps these tests hermetic (no network).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

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

interface AppOverrides {
  cart?: CartLine[]
  products?: Product[]
  setCartQuantity?: (productId: number, quantity: number) => Promise<void>
  removeFromCart?: (productId: number) => Promise<void>
  clearCart?: () => Promise<void>
  cartSubtotal?: number
  cartStatus?: 'loading' | 'ready' | 'error'
  cartError?: string | null
  refreshCart?: () => Promise<void>
}

function setAppState(partial: AppOverrides) {
  const setCartQuantity = vi.fn(partial.setCartQuantity ?? (async () => {}))
  const removeFromCart = vi.fn(partial.removeFromCart ?? (async () => {}))
  const clearCart = vi.fn(partial.clearCart ?? (async () => {}))
  const refreshCart = vi.fn(partial.refreshCart ?? (async () => {}))
  mockUseApp.mockReturnValue({
    cart: partial.cart ?? CART,
    products: partial.products ?? PRODUCTS,
    setCartQuantity,
    removeFromCart,
    clearCart,
    cartSubtotal: partial.cartSubtotal ?? 250,
    cartStatus: partial.cartStatus ?? 'ready',
    cartError: partial.cartError ?? null,
    refreshCart,
  } as unknown as ReturnType<typeof useApp>)
  return { setCartQuantity, removeFromCart, clearCart, refreshCart }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// A stateful harness proving the basket flows end to end at the component
// level: the mock cart updates the way the real optimistic AppContext
// does, so the UI must react the same way.
function StatefulHarness() {
  const [cart, setCart] = useState<CartLine[]>(CART)
  const subtotal = cart.reduce((sum, l) => {
    const p = PRODUCTS.find((x) => x.id === l.productId)
    return sum + (p ? p.price * l.quantity : 0)
  }, 0)
  mockUseApp.mockReturnValue({
    cart,
    products: PRODUCTS,
    setCartQuantity: async (id: number, qty: number) => {
      setCart((c) =>
        qty <= 0
          ? c.filter((l) => l.productId !== id)
          : c.map((l) => (l.productId === id ? { ...l, quantity: qty } : l)),
      )
    },
    removeFromCart: async (id: number) => {
      setCart((c) => c.filter((l) => l.productId !== id))
    },
    clearCart: async () => {
      setCart([])
    },
    cartSubtotal: subtotal,
    cartStatus: 'ready',
    cartError: null,
    refreshCart: async () => {},
  } as unknown as ReturnType<typeof useApp>)
  return (
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>
  )
}

describe('CartPage rendering', () => {
  it('shows the empty state with a return-to-shopping link when the basket is empty', () => {
    setAppState({ cart: [] })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Your basket is empty' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to shopping' })).toHaveAttribute('href', '/shop')
    expect(screen.queryByRole('link', { name: 'Go to checkout' })).not.toBeInTheDocument()
  })

  it('lists each line with name, unit price, line total, image and detail link', () => {
    setAppState({})
    renderPage()
    expect(screen.getByRole('heading', { name: 'Your basket' })).toBeInTheDocument()
    const milkLink = screen.getByRole('link', { name: /whole milk \(1 l\)/i })
    expect(milkLink).toHaveAttribute('href', '/products/7')
    expect(within(milkLink).getByRole('img', { name: 'Whole Milk (1 L)' })).toHaveAttribute(
      'src',
      '/images/whole-milk-1-l.jpg',
    )
    expect(screen.getByText('₹65')).toBeInTheDocument()
    expect(screen.getByText('₹130')).toBeInTheDocument()
    const bananasLink = screen.getByRole('link', { name: /bananas \(1 kg\)/i })
    expect(bananasLink).toHaveAttribute('href', '/products/9')
    expect(screen.getByText('₹40')).toBeInTheDocument()
    expect(screen.getByText('₹120')).toBeInTheDocument()
  })

  it('shows the server subtotal, a checkout link and a clear button', () => {
    setAppState({})
    renderPage()
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('₹250')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to checkout' })).toHaveAttribute('href', '/checkout')
    expect(screen.getByRole('button', { name: 'Clear basket' })).toBeInTheDocument()
  })

  it('ignores basket lines for products missing from the catalogue', () => {
    setAppState({ cart: [{ productId: 999, quantity: 2 }] })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Your basket is empty' })).toBeInTheDocument()
  })

  it('shows a loading status while the basket is loading', () => {
    setAppState({ cartStatus: 'loading' })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your basket…')
    // Lines still render underneath the loading note.
    expect(screen.getByRole('heading', { name: 'Your basket' })).toBeInTheDocument()
  })

  it('labels each quantity stepper with its product and current quantity', () => {
    setAppState({})
    renderPage()
    const milkStepper = screen.getByRole('group', { name: 'Quantity for Whole Milk (1 L)' })
    expect(within(milkStepper).getByText('2')).toBeInTheDocument()
    const bananasStepper = screen.getByRole('group', { name: 'Quantity for Bananas (1 kg)' })
    expect(within(bananasStepper).getByText('3')).toBeInTheDocument()
  })

  it('shows a cart error alert with a retry button that reloads the basket', async () => {
    const user = userEvent.setup()
    const { refreshCart } = setAppState({ cartError: 'The basket could not be loaded.' })
    renderPage()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Basket update failed: The basket could not be loaded.')
    await user.click(screen.getByRole('button', { name: 'Retry loading the basket' }))
    expect(refreshCart).toHaveBeenCalledTimes(1)
  })
})

describe('CartPage basket interactions', () => {
  it('calls setCartQuantity(id, qty + 1) on increase', async () => {
    const user = userEvent.setup()
    const { setCartQuantity } = setAppState({})
    renderPage()
    const stepper = screen.getByRole('group', { name: 'Quantity for Whole Milk (1 L)' })
    await user.click(within(stepper).getByRole('button', { name: 'Increase quantity' }))
    expect(setCartQuantity).toHaveBeenCalledTimes(1)
    expect(setCartQuantity).toHaveBeenCalledWith(7, 3)
  })

  it('calls setCartQuantity(id, qty - 1) on decrease', async () => {
    const user = userEvent.setup()
    const { setCartQuantity } = setAppState({})
    renderPage()
    const stepper = screen.getByRole('group', { name: 'Quantity for Bananas (1 kg)' })
    await user.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    expect(setCartQuantity).toHaveBeenCalledTimes(1)
    expect(setCartQuantity).toHaveBeenCalledWith(9, 2)
  })

  it('calls setCartQuantity(id, 0) when decreasing a quantity of one', async () => {
    const user = userEvent.setup()
    const { setCartQuantity } = setAppState({ cart: [{ productId: 7, quantity: 1 }] })
    renderPage()
    const stepper = screen.getByRole('group', { name: 'Quantity for Whole Milk (1 L)' })
    await user.click(within(stepper).getByRole('button', { name: 'Decrease quantity' }))
    expect(setCartQuantity).toHaveBeenCalledWith(7, 0)
  })

  it('calls removeFromCart(id) on the remove button', async () => {
    const user = userEvent.setup()
    const { removeFromCart } = setAppState({})
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Remove Bananas (1 kg)' }))
    expect(removeFromCart).toHaveBeenCalledTimes(1)
    expect(removeFromCart).toHaveBeenCalledWith(9)
  })

  it('asks for confirmation before clearing, and Keep it cancels without clearing', async () => {
    const user = userEvent.setup()
    const { clearCart } = setAppState({})
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Clear basket' }))
    expect(screen.getByText('Clear everything?')).toBeInTheDocument()
    expect(clearCart).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.getByRole('button', { name: 'Clear basket' })).toBeInTheDocument()
    expect(clearCart).not.toHaveBeenCalled()
  })

  it('calls clearCart only after confirming Yes, clear', async () => {
    const user = userEvent.setup()
    const { clearCart } = setAppState({})
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Clear basket' }))
    await user.click(screen.getByRole('button', { name: 'Yes, clear' }))
    expect(clearCart).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed quantity change as an inline error without losing the basket', async () => {
    const user = userEvent.setup()
    setAppState({
      setCartQuantity: async () => {
        throw new Error('Basket update failed.')
      },
    })
    renderPage()
    const stepper = screen.getByRole('group', { name: 'Quantity for Whole Milk (1 L)' })
    await user.click(within(stepper).getByRole('button', { name: 'Increase quantity' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Basket update failed: Basket update failed.')
    // The basket stays on screen for a retry.
    expect(screen.getByRole('heading', { name: 'Your basket' })).toBeInTheDocument()
  })

  it('updates the displayed quantity and line total when the basket changes', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness />)
    const stepper = screen.getByRole('group', { name: 'Quantity for Whole Milk (1 L)' })
    await user.click(within(stepper).getByRole('button', { name: 'Increase quantity' }))
    expect(await within(stepper).findByText('3')).toBeInTheDocument()
    expect(screen.getByText('₹195')).toBeInTheDocument()
  })

  it('confirming clear empties the basket to the empty state', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness />)
    await user.click(screen.getByRole('button', { name: 'Clear basket' }))
    await user.click(screen.getByRole('button', { name: 'Yes, clear' }))
    expect(await screen.findByRole('heading', { name: 'Your basket is empty' })).toBeInTheDocument()
  })
})
