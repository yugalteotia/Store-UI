import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Home } from '../pages/Home'
import { useApp } from '../state/AppContext'
import { CATEGORIES } from '../api/categories'
import type { CartLine, Product } from '../domain/types'

// Home only reads products/productsStatus/productsError/reloadProducts
// (plus the cart fields ProductCard needs) from the app state, so mocking
// the hook keeps these tests hermetic (no network, no router app).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

function mk(id: number, name: string, categoryId: number, price: number): Product {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: `${name} from the market.`,
    price,
    unitLabel: '1 pack',
    categoryId,
    image: `/images/product-${id}.jpg`,
    isFeatured: false,
    isSeasonal: false,
  }
}

// 10 products: 3 fruit (the seasonal picks), 7 more so the popular and
// featured strips (capped at 8 each) leave 2 products out.
const PRODUCTS: Product[] = [
  mk(1, 'Fresh Apples (1 kg)', 1, 120),
  mk(2, 'Bananas (1 dozen)', 1, 60),
  mk(3, 'Alphonso Mangoes (1 kg)', 1, 350),
  mk(4, 'Fresh Tomatoes (1 kg)', 2, 40),
  mk(5, 'Potatoes (1 kg)', 2, 35),
  mk(6, 'Whole Milk (1 L)', 3, 65),
  mk(7, 'Paneer (200 g)', 3, 90),
  mk(8, 'Whole Wheat Bread (400 g)', 4, 55),
  mk(9, 'Tata Tea Premium (250 g)', 5, 150),
  mk(10, 'Toor Dal (1 kg)', 6, 140),
]
const FIRST_EIGHT = PRODUCTS.slice(0, 8).map((p) => p.name)

interface AppOverrides {
  products?: Product[]
  productsStatus?: 'loading' | 'ready' | 'error'
  productsError?: string | null
  reloadProducts?: () => Promise<void>
  cart?: CartLine[]
  addToCart?: (productId: number, quantity: number) => Promise<void>
  setCartQuantity?: (productId: number, quantity: number) => Promise<void>
}

function setAppState(partial: AppOverrides) {
  const addToCart = vi.fn(partial.addToCart ?? (async () => {}))
  const setCartQuantity = vi.fn(partial.setCartQuantity ?? (async () => {}))
  const reloadProducts = vi.fn(partial.reloadProducts ?? (async () => {}))
  mockUseApp.mockReturnValue({
    products: partial.products ?? PRODUCTS,
    productsStatus: partial.productsStatus ?? 'ready',
    productsError: partial.productsError ?? null,
    reloadProducts,
    cart: partial.cart ?? [],
    addToCart,
    setCartQuantity,
  } as unknown as ReturnType<typeof useApp>)
  return { addToCart, setCartQuantity, reloadProducts }
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Home />
    </MemoryRouter>,
  )
}

// Product names render as h3s in ProductCard, so their document order is
// the strip order (popular first, then featured).
function cardNames() {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
}

function sectionFor(headingName: string) {
  const heading = screen.getByRole('heading', { name: headingName })
  const section = heading.closest('section')
  if (!section) throw new Error(`No section found for heading ${headingName}`)
  return section
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Home hero', () => {
  it('renders the badge, headline, intro and both CTAs', () => {
    setAppState({})
    renderHome()
    expect(screen.getByText('A neighbourhood market, online')).toBeInTheDocument()
    // The <br> in the headline contributes no space to the accessible
    // name, so it computes as "closerto" - match loosely on purpose.
    expect(screen.getByRole('heading', { name: /A little closer\s*to the good stuff\./ })).toBeInTheDocument()
    expect(screen.getByText(/Fresh fruit, everyday vegetables and market staples/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Shop the market/ })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: 'Fruit aisle' })).toHaveAttribute('href', '/shop?categoryId=1')
  })

  it('renders the hero image and the market note', () => {
    setAppState({})
    renderHome()
    expect(screen.getByRole('img', { name: 'Ripe Alphonso mangoes at a market stall' })).toBeInTheDocument()
    expect(screen.getByText("Today's market note")).toBeInTheDocument()
    expect(screen.getByText(/priced live from the Store API/)).toBeInTheDocument()
  })

  it('shows the error alert with the backend message and no alert when ready', () => {
    setAppState({ products: [], productsStatus: 'error', productsError: 'Down.' })
    renderHome()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("The live catalogue couldn't load (Down.).")
    expect(alert).toHaveTextContent('Retry')
  })

  it('Retry calls reloadProducts', async () => {
    const user = userEvent.setup()
    const { reloadProducts } = setAppState({ products: [], productsStatus: 'error', productsError: 'Down.' })
    renderHome()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reloadProducts).toHaveBeenCalledTimes(1)
  })

  it('shows no alert when the catalogue loads', () => {
    setAppState({})
    renderHome()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Home category discovery', () => {
  it('renders all ten category tiles with names, blurbs and filtered-shop links', () => {
    setAppState({})
    renderHome()
    expect(screen.getByRole('heading', { name: 'Wander the aisles' })).toBeInTheDocument()
    for (const c of CATEGORIES) {
      expect(screen.getByRole('link', { name: new RegExp(c.name) })).toHaveAttribute(
        'href',
        `/shop?categoryId=${c.id}`,
      )
      expect(screen.getByText(c.blurb)).toBeInTheDocument()
    }
  })

  it('View everything and the basket card link to the unfiltered shop', () => {
    setAppState({})
    renderHome()
    expect(screen.getByRole('link', { name: /View everything/ })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: /Everything, in one basket/ })).toHaveAttribute('href', '/shop')
  })
})

describe('Home seasonal', () => {
  it('shows up to three fruit products with prices, linking to their detail pages', () => {
    setAppState({})
    renderHome()
    const section = sectionFor("What's bright right now")
    expect(within(section).getByText('From the fruit aisle')).toBeInTheDocument()
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAttribute('href', '/products/1')
    expect(links[1]).toHaveAttribute('href', '/products/2')
    expect(links[2]).toHaveAttribute('href', '/products/3')
    expect(within(section).getByText('From ₹120')).toBeInTheDocument()
    expect(within(section).getByText('From ₹60')).toBeInTheDocument()
    expect(within(section).getByText('From ₹350')).toBeInTheDocument()
  })

  it('shows no seasonal links when there are no fruit products', () => {
    setAppState({ products: PRODUCTS.filter((p) => p.categoryId !== 1) })
    renderHome()
    const section = sectionFor("What's bright right now")
    expect(within(section).queryAllByRole('link')).toHaveLength(0)
  })
})

describe('Home editorial and promo', () => {
  it('renders the philosophy section', () => {
    setAppState({})
    renderHome()
    expect(screen.getByRole('heading', { name: 'A market, not a warehouse.' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Fresh green spinach leaves' })).toBeInTheDocument()
    expect(screen.getByText(/ORCHARD is imagined as the stall/)).toBeInTheDocument()
    expect(screen.getByText(/Colour first - find things by looking/)).toBeInTheDocument()
    expect(screen.getByText(/No invented ratings, stock counts or delivery promises/)).toBeInTheDocument()
  })

  it('renders the promo banner with a Start shopping link', () => {
    setAppState({})
    renderHome()
    expect(screen.getByText('Build a week of cooking in one basket.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start shopping' })).toHaveAttribute('href', '/shop')
  })
})

describe('Home popular and featured strips', () => {
  it('popular strip shows the first eight products in catalogue order', () => {
    setAppState({})
    renderHome()
    const section = sectionFor('Popular in the market')
    expect(within(section).getByText(/A slice of the live catalogue/)).toBeInTheDocument()
    const names = within(section)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(names).toEqual(FIRST_EIGHT)
  })

  it('featured strip shows the same first eight products', () => {
    setAppState({})
    renderHome()
    const section = sectionFor('Market picks')
    const names = within(section)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(names).toEqual(FIRST_EIGHT)
  })

  it('products beyond the first eight appear in neither strip', () => {
    setAppState({})
    renderHome()
    expect(cardNames()).toHaveLength(16)
    expect(screen.queryByRole('heading', { name: 'Tata Tea Premium (250 g)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Toor Dal (1 kg)' })).not.toBeInTheDocument()
  })

  it('Add on a popular card calls addToCart with the product id', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({})
    renderHome()
    await user.click(screen.getAllByRole('button', { name: 'Add Whole Milk (1 L) to basket' })[0])
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(6, 1)
  })
})

describe('Home loading and empty states', () => {
  it('loading state renders the hero with no product cards and no alert', () => {
    setAppState({ products: [], productsStatus: 'loading' })
    renderHome()
    // See the hero test: the <br> collapses out of the accessible name.
    expect(screen.getByRole('heading', { name: /A little closer\s*to the good stuff\./ })).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('empty catalogue renders section headings but no cards or seasonal links', () => {
    setAppState({ products: [] })
    renderHome()
    expect(screen.getByRole('heading', { name: 'Wander the aisles' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "What's bright right now" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Popular in the market' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Market picks' })).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    const seasonal = sectionFor("What's bright right now")
    expect(within(seasonal).queryAllByRole('link')).toHaveLength(0)
  })
})
