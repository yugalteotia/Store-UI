import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductDetail } from '../pages/ProductDetail'
import { useApp } from '../state/AppContext'
import { getProduct } from '../api/services'
import { ApiError } from '../api/http'
import type { CartLine, Product } from '../domain/types'

// ProductDetail only reads products/productsStatus/addToCart from the app
// state; the catalogue fetch it falls back to (getProduct) is mocked, so
// these tests stay hermetic (no network, no router app).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

// Only `getProduct` is mocked: it is the only services function the page
// calls (when the product is missing from the loaded catalogue).
vi.mock('../api/services', () => ({ getProduct: vi.fn() }))
const mockGetProduct = vi.mocked(getProduct)

function mk(
  id: number,
  name: string,
  categoryId: number,
  price: number,
  tagline?: string,
): Product {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: `${name} from the market.`,
    price,
    unitLabel: '',
    categoryId,
    image: `/images/product-${id}.jpg`,
    isFeatured: false,
    isSeasonal: false,
    ...(tagline ? { tagline } : {}),
  }
}

const MILK: Product = {
  ...mk(6, 'Whole Milk (1 L)', 3, 65, 'Farm fresh daily'),
  description: 'Fresh pasteurized whole milk from local dairies.',
}

// Six more Dairy products (related is capped at four) plus one Fruits
// product, which must never appear in the related section.
const DAIRY: Product[] = [
  mk(7, 'Paneer (200 g)', 3, 90),
  mk(17, 'Curd (400 g)', 3, 45),
  mk(18, 'Butter (100 g)', 3, 55),
  mk(19, 'Cheese Slices (200 g)', 3, 120),
  mk(20, 'Ghee (500 ml)', 3, 320),
  mk(21, 'Yogurt (100 g)', 3, 25),
]
const APPLES = mk(1, 'Fresh Apples (1 kg)', 1, 120)
const PRODUCTS: Product[] = [APPLES, MILK, ...DAIRY]

interface AppOverrides {
  products?: Product[]
  productsStatus?: 'loading' | 'ready' | 'error'
  cart?: CartLine[]
  addToCart?: (productId: number, quantity: number) => Promise<void>
  setCartQuantity?: (productId: number, quantity: number) => Promise<void>
}

function setAppState(partial: AppOverrides) {
  const addToCart = vi.fn(partial.addToCart ?? (async () => {}))
  const setCartQuantity = vi.fn(partial.setCartQuantity ?? (async () => {}))
  mockUseApp.mockReturnValue({
    products: partial.products ?? PRODUCTS,
    productsStatus: partial.productsStatus ?? 'ready',
    cart: partial.cart ?? [],
    addToCart,
    setCartQuantity,
  } as unknown as ReturnType<typeof useApp>)
  return { addToCart, setCartQuantity }
}

function renderDetail(entry = '/products/6') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/products/:productId" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Related products render as ProductCards, so their names are h3s.
function relatedNames() {
  const section = screen.getByRole('heading', { name: 'You may also like' }).closest('section')
  return within(section as HTMLElement)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetProduct.mockRejectedValue(new ApiError('not-found', 'No such product.'))
})

describe('ProductDetail rendering (from the loaded catalogue)', () => {
  it('renders the name, tagline, description, price, category and image', () => {
    setAppState({})
    renderDetail()
    expect(screen.getByRole('heading', { name: 'Whole Milk (1 L)', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Farm fresh daily')).toBeInTheDocument()
    expect(screen.getByText('Fresh pasteurized whole milk from local dairies.')).toBeInTheDocument()
    expect(screen.getByText('₹65')).toBeInTheDocument()
    // 'Dairy' appears six times: the category label above the name, the
    // breadcrumb link, and the category label on each of the four related
    // cards.
    expect(screen.getAllByText('Dairy')).toHaveLength(6)
    expect(screen.getByRole('img', { name: 'Whole Milk (1 L)' })).toHaveAttribute(
      'src',
      '/images/product-6.jpg',
    )
  })

  it('shows the breadcrumb with Home, Shop and category links and the product as current page', () => {
    setAppState({})
    renderDetail()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop')
    expect(within(nav).getByRole('link', { name: 'Dairy' })).toHaveAttribute(
      'href',
      '/shop?categoryId=3',
    )
    expect(within(nav).getByText('Whole Milk (1 L)')).toHaveAttribute('aria-current', 'page')
  })

  it('shows the pack-size and live-catalogue notes and a View basket link', () => {
    setAppState({})
    renderDetail()
    expect(screen.getByText(/Pack size is stated in the product name/)).toBeInTheDocument()
    expect(screen.getByText(/Live catalogue data: name, description and price come from the Store API/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View basket' })).toHaveAttribute('href', '/cart')
  })

  it('shows related products from the same category, excluding itself and capped at four', () => {
    setAppState({})
    renderDetail()
    expect(screen.getByRole('heading', { name: 'You may also like' })).toBeInTheDocument()
    expect(relatedNames()).toEqual([
      'Paneer (200 g)',
      'Curd (400 g)',
      'Butter (100 g)',
      'Cheese Slices (200 g)',
    ])
    expect(screen.queryByRole('heading', { name: 'Fresh Apples (1 kg)' })).not.toBeInTheDocument()
  })

  it('hides the related section when there are no same-category products', () => {
    setAppState({ products: [APPLES, MILK] })
    renderDetail()
    expect(screen.queryByRole('heading', { name: 'You may also like' })).not.toBeInTheDocument()
  })

  it('hides the category label and breadcrumb link for an unknown category', () => {
    setAppState({ products: [mk(99, 'Mystery Item', 99, 10)] })
    renderDetail('/products/99')
    expect(screen.queryByText('Dairy')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByRole('link', { name: 'Dairy' })).not.toBeInTheDocument()
    expect(within(nav).getByText('Mystery Item')).toHaveAttribute('aria-current', 'page')
  })

  it('renders no tagline when the product has none', () => {
    setAppState({ products: [APPLES] })
    renderDetail('/products/1')
    expect(screen.getByRole('heading', { name: 'Fresh Apples (1 kg)', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Farm fresh daily')).not.toBeInTheDocument()
  })

  it('does not call getProduct when the product is already in the list', () => {
    setAppState({})
    renderDetail()
    expect(mockGetProduct).not.toHaveBeenCalled()
  })
})

describe('ProductDetail loading and not-found states', () => {
  it('shows the loading heading while the catalogue is still loading', () => {
    setAppState({ products: [], productsStatus: 'loading' })
    renderDetail()
    expect(screen.getByRole('heading', { name: 'Loading product…' })).toBeInTheDocument()
    expect(mockGetProduct).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })

  it('shows Product not found with the backend message when the fetch fails', async () => {
    mockGetProduct.mockRejectedValue(new ApiError('not-found', 'Product 99 does not exist.'))
    setAppState({ products: [], productsStatus: 'ready' })
    renderDetail('/products/99')
    expect(await screen.findByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
    expect(screen.getByText('Product 99 does not exist.')).toBeInTheDocument()
    expect(mockGetProduct).toHaveBeenCalledWith(99)
  })

  it('shows the generic message when the fetch fails with a non-ApiError', async () => {
    mockGetProduct.mockRejectedValue(new Error('boom'))
    setAppState({ products: [], productsStatus: 'ready' })
    renderDetail('/products/99')
    expect(await screen.findByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
    expect(screen.getByText('Could not load this product.')).toBeInTheDocument()
  })

  it('shows Product not found for a non-numeric id without calling getProduct', () => {
    setAppState({ products: [], productsStatus: 'ready' })
    renderDetail('/products/abc')
    expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
    expect(mockGetProduct).not.toHaveBeenCalled()
    // With no fetch attempted there is no detail error, so the default
    // not-found copy shows.
    expect(screen.getByText(/isn't in the live catalogue/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/shop')
  })
})

describe('ProductDetail fallback fetch', () => {
  it('fetches and renders a product missing from the loaded list', async () => {
    mockGetProduct.mockResolvedValue(MILK)
    setAppState({ products: [APPLES, ...DAIRY], productsStatus: 'ready' })
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Whole Milk (1 L)', level: 1 })).toBeInTheDocument()
    expect(mockGetProduct).toHaveBeenCalledTimes(1)
    expect(mockGetProduct).toHaveBeenCalledWith(6)
    expect(screen.getByText('₹65')).toBeInTheDocument()
  })

  it('shows related products from the loaded list for a fetched product', async () => {
    mockGetProduct.mockResolvedValue(MILK)
    setAppState({ products: [APPLES, ...DAIRY], productsStatus: 'ready' })
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'You may also like' })).toBeInTheDocument()
    expect(relatedNames()).toEqual([
      'Paneer (200 g)',
      'Curd (400 g)',
      'Butter (100 g)',
      'Cheese Slices (200 g)',
    ])
  })
})

describe('ProductDetail quantity and basket', () => {
  it('stepper increases and decreases the quantity but never below 1', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderDetail()
    expect(screen.getByText('1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(screen.getByText('3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    expect(screen.getByText('2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    await user.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('Add to basket calls addToCart with the chosen quantity and confirms', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({})
    renderDetail()
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await user.click(screen.getByRole('button', { name: 'Add to basket' }))
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(6, 3)
    expect(await screen.findByRole('status')).toHaveTextContent('Added to your basket.')
  })

  it('Add to basket shows the error when addToCart fails', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({
      addToCart: async () => {
        throw new Error('Basket is full.')
      },
    })
    renderDetail()
    await user.click(screen.getByRole('button', { name: 'Add to basket' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Basket is full.')
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Add on a related card calls addToCart with that product id', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({})
    renderDetail()
    await user.click(screen.getByRole('button', { name: 'Add Paneer (200 g) to basket' }))
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(7, 1)
  })
})
