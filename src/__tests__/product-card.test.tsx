import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { ProductCard } from '../components/ProductCard'
import { useApp } from '../state/AppContext'
import type { CartLine, Product } from '../domain/types'

// ProductCard only reads cart/addToCart/setCartQuantity from the app state,
// so mocking the hook keeps these tests hermetic (no network, no router app).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

const PRODUCT: Product = {
  id: 7,
  name: 'Whole Milk (1 L)',
  slug: 'whole-milk-1-l',
  description: 'Fresh pasteurized whole milk from local dairies.',
  price: 65,
  unitLabel: '1 L',
  categoryId: 3, // Dairy
  image: '/images/whole-milk-1-l.jpg',
  isFeatured: false,
  isSeasonal: false,
  tagline: 'Farm fresh daily',
}

function setAppState(partial: {
  cart?: CartLine[]
  addToCart?: (productId: number, quantity: number) => Promise<void>
  setCartQuantity?: (productId: number, quantity: number) => Promise<void>
}) {
  const addToCart = vi.fn(partial.addToCart ?? (async () => {}))
  const setCartQuantity = vi.fn(partial.setCartQuantity ?? (async () => {}))
  mockUseApp.mockReturnValue({
    cart: partial.cart ?? [],
    addToCart,
    setCartQuantity,
  } as unknown as ReturnType<typeof useApp>)
  return { addToCart, setCartQuantity }
}

function renderCard() {
  return render(
    <MemoryRouter>
      <ProductCard product={PRODUCT} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// A stateful harness proving the Add -> stepper flip end to end at the
// component level: the mock cart updates the way the real optimistic
// AppContext does, so the UI must react the same way.
function StatefulHarness() {
  const [cart, setCart] = useState<CartLine[]>([])
  mockUseApp.mockReturnValue({
    cart,
    addToCart: async (id: number, qty: number) => {
      setCart((c) => {
        const line = c.find((l) => l.productId === id)
        return line
          ? c.map((l) => (l.productId === id ? { ...l, quantity: l.quantity + qty } : l))
          : [...c, { productId: id, quantity: qty }]
      })
    },
    setCartQuantity: async (id: number, qty: number) => {
      setCart((c) =>
        qty <= 0
          ? c.filter((l) => l.productId !== id)
          : c.map((l) => (l.productId === id ? { ...l, quantity: qty } : l)),
      )
    },
  } as unknown as ReturnType<typeof useApp>)
  return (
    <MemoryRouter>
      <ProductCard product={PRODUCT} />
    </MemoryRouter>
  )
}

describe('ProductCard rendering', () => {
  it('shows the product name, price, description, category and image', () => {
    setAppState({})
    renderCard()
    expect(screen.getByRole('heading', { name: 'Whole Milk (1 L)' })).toBeInTheDocument()
    expect(screen.getByText('₹65')).toBeInTheDocument()
    expect(screen.getByText('Fresh pasteurized whole milk from local dairies.')).toBeInTheDocument()
    expect(screen.getByText('Dairy')).toBeInTheDocument()
    expect(screen.getByText('Farm fresh daily')).toBeInTheDocument()
    const img = screen.getByRole('img', { name: 'Whole Milk (1 L)' })
    expect(img).toHaveAttribute('src', '/images/whole-milk-1-l.jpg')
  })

  it('links the image and title to the product detail page', () => {
    setAppState({})
    renderCard()
    const links = screen.getAllByRole('link', { name: /whole milk \(1 l\)/i })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '/products/7')
  })

  it('shows an Add button when the product is not in the basket', () => {
    setAppState({ cart: [] })
    renderCard()
    expect(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /quantity in basket/i })).not.toBeInTheDocument()
  })

  it('shows the stepper with the current quantity when the product is in the basket', () => {
    setAppState({ cart: [{ productId: 7, quantity: 3 }] })
    renderCard()
    const stepper = screen.getByRole('group', { name: 'Whole Milk (1 L) quantity in basket' })
    expect(stepper).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add whole milk.*to basket/i })).not.toBeInTheDocument()
  })

  it('ignores basket lines for other products', () => {
    setAppState({ cart: [{ productId: 999, quantity: 2 }] })
    renderCard()
    expect(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' })).toBeInTheDocument()
  })
})

describe('ProductCard basket interactions', () => {
  it('calls addToCart with (id, 1) when Add is clicked', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({})
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' }))
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(7, 1)
  })

  it('flips from Add to a live stepper as the basket fills (optimistic UI)', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness />)
    // Starts as Add...
    await user.click(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' }))
    // ...flips to the stepper showing 1...
    expect(await screen.findByRole('group', { name: 'Whole Milk (1 L) quantity in basket' })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    // ...and the stepper + button increments the visible quantity.
    await user.click(screen.getByRole('button', { name: 'Add one more Whole Milk (1 L) to basket' }))
    expect(await screen.findByText('2')).toBeInTheDocument()
  })

  it('stepper minus drops back to the Add button at zero', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness />)
    await user.click(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' }))
    await screen.findByRole('group', { name: 'Whole Milk (1 L) quantity in basket' })
    await user.click(screen.getByRole('button', { name: 'Remove one Whole Milk (1 L) from basket' }))
    expect(await screen.findByRole('button', { name: 'Add Whole Milk (1 L) to basket' })).toBeInTheDocument()
  })

  it('calls setCartQuantity(productId, qty - 1) on stepper minus', async () => {
    const user = userEvent.setup()
    const { setCartQuantity } = setAppState({ cart: [{ productId: 7, quantity: 2 }] })
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Remove one Whole Milk (1 L) from basket' }))
    expect(setCartQuantity).toHaveBeenCalledTimes(1)
    expect(setCartQuantity).toHaveBeenCalledWith(7, 1)
  })

  it('surfaces a failed add as an inline error without breaking the card', async () => {
    const user = userEvent.setup()
    setAppState({
      addToCart: async () => {
        throw new Error('The request timed out.')
      },
    })
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The request timed out.')
    // The card stays usable: the Add button is still there for a retry.
    expect(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' })).toBeInTheDocument()
  })

  it('surfaces a failed quantity change as an inline error', async () => {
    const user = userEvent.setup()
    setAppState({
      cart: [{ productId: 7, quantity: 1 }],
      setCartQuantity: async () => {
        throw new Error('Basket update failed.')
      },
    })
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Remove one Whole Milk (1 L) from basket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Basket update failed.')
  })
})
