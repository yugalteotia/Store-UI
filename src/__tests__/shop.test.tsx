import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Shop } from '../pages/Shop'
import { useApp } from '../state/AppContext'
import type { CartLine, Product } from '../domain/types'

// Shop only reads products/productsStatus/productsError/reloadProducts
// (plus the cart fields ProductCard needs) from the app state, so mocking
// the hook keeps these tests hermetic (no network, no router app).
vi.mock('../state/AppContext', () => ({ useApp: vi.fn() }))
const mockUseApp = vi.mocked(useApp)

function mk(
  id: number,
  name: string,
  categoryId: number,
  price: number,
  description?: string,
): Product {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: description ?? `${name} from the market.`,
    price,
    unitLabel: '1 pack',
    categoryId,
    image: `/images/product-${id}.jpg`,
    isFeatured: false,
    isSeasonal: false,
  }
}

// 16 products across all 10 categories: 12 on page 1, 4 behind Load more.
const PRODUCTS: Product[] = [
  mk(1, 'Fresh Apples (1 kg)', 1, 120),
  mk(2, 'Bananas (1 dozen)', 1, 60),
  mk(3, 'Alphonso Mangoes (1 kg)', 1, 350),
  mk(4, 'Fresh Tomatoes (1 kg)', 2, 40),
  mk(5, 'Potatoes (1 kg)', 2, 35),
  mk(6, 'Whole Milk (1 L)', 3, 65, 'Fresh pasteurized whole milk from local dairies.'),
  mk(7, 'Paneer (200 g)', 3, 90),
  mk(8, 'Whole Wheat Bread (400 g)', 4, 55),
  mk(9, 'Tata Tea Premium (250 g)', 5, 150),
  mk(10, 'Toor Dal (1 kg)', 6, 140),
  mk(11, 'Tata Salt (1 kg)', 6, 28),
  mk(12, 'Lays Classic Salted Chips (52 g)', 7, 20),
  mk(13, 'Parle-G Biscuits (250 g)', 7, 25),
  mk(14, 'McCain French Fries (420 g)', 8, 130),
  mk(15, 'Dove Beauty Bathing Bar (100 g)', 9, 45),
  mk(16, 'Vim Dishwash Liquid (250 ml)', 10, 85),
]
const PRODUCT_NAMES = PRODUCTS.map((p) => p.name)

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

function renderShop(initialEntry = '/shop') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Shop />
    </MemoryRouter>,
  )
}

// Product names render as h3s, so their document order is the grid order.
function cardNames() {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Shop rendering', () => {
  it('renders the heading, intro and the first page of the catalogue in order', () => {
    setAppState({})
    renderShop()
    expect(screen.getByRole('heading', { name: 'Shop the market' })).toBeInTheDocument()
    expect(screen.getByText(/Live catalogue from the Store API/)).toBeInTheDocument()
    expect(screen.getByText('16 results')).toBeInTheDocument()
    expect(cardNames()).toEqual(PRODUCT_NAMES.slice(0, 12))
    expect(screen.getByRole('button', { name: 'Load more (4 remaining)' })).toBeInTheDocument()
  })

  it('shows a loading state with no product cards', () => {
    setAppState({ products: [], productsStatus: 'loading' })
    renderShop()
    expect(screen.getByText('Loading the market…')).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('shows the error state with the backend message and no product cards', () => {
    setAppState({ productsStatus: 'error', productsError: 'The backend refused the connection.' })
    renderShop()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the catalogue.")
    expect(alert).toHaveTextContent('The backend refused the connection.')
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })

  it('shows the empty state when the catalogue is empty', () => {
    setAppState({ products: [] })
    renderShop()
    expect(screen.getByText(/0 results/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing matched that search.' })).toBeInTheDocument()
  })
})

describe('Shop search', () => {
  it('filters by the ?search= param and shows the search chip', () => {
    setAppState({})
    renderShop('/shop?search=milk')
    expect(screen.getByText(/1 result/)).toBeInTheDocument()
    expect(screen.getByText('Search: “milk”')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Whole Milk (1 L)'])
  })

  it('matches words in the description, not just the name', () => {
    setAppState({})
    renderShop('/shop?search=pasteurized')
    expect(screen.getByText(/1 result/)).toBeInTheDocument()
    expect(cardNames()).toEqual(['Whole Milk (1 L)'])
  })

  it('applies a typed search on Enter', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'mango{Enter}')
    expect(await screen.findByText(/1 result/)).toBeInTheDocument()
    expect(cardNames()).toEqual(['Alphonso Mangoes (1 kg)'])
    expect(screen.getByText('Search: “mango”')).toBeInTheDocument()
  })

  it('applies a typed search via the search button', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'paneer')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText(/1 result/)).toBeInTheDocument()
    expect(cardNames()).toEqual(['Paneer (200 g)'])
  })

  it('shows the empty state for a search with no matches', () => {
    setAppState({})
    renderShop('/shop?search=zzz')
    expect(screen.getByText(/0 results/)).toBeInTheDocument()
    expect(screen.getByText('Search: “zzz”')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing matched that search.' })).toBeInTheDocument()
    // Reset filters appears in the panel, the chips row and the empty state.
    expect(screen.getAllByRole('button', { name: 'Reset filters' }).length).toBeGreaterThan(0)
  })
})

describe('Shop category filter', () => {
  it('filters by the ?categoryId= param and shows the category chip', () => {
    setAppState({})
    renderShop('/shop?categoryId=3')
    expect(screen.getByText(/2 results/)).toBeInTheDocument()
    expect(screen.getByText('Category: Dairy')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Whole Milk (1 L)', 'Paneer (200 g)'])
  })

  it('filters when a category radio is clicked', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.click(screen.getByRole('radio', { name: 'Fruits' }))
    expect(await screen.findByText(/3 results/)).toBeInTheDocument()
    expect(screen.getByText('Category: Fruits')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Fresh Apples (1 kg)', 'Bananas (1 dozen)', 'Alphonso Mangoes (1 kg)'])
  })

  it('shows the raw id in the chip for an unknown category', () => {
    setAppState({})
    renderShop('/shop?categoryId=99')
    expect(screen.getByText(/0 results/)).toBeInTheDocument()
    expect(screen.getByText('Category: 99')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nothing matched that search.' })).toBeInTheDocument()
  })
})

describe('Shop sorting', () => {
  it('sorts by price low to high', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc')
    const names = cardNames()
    expect(names[0]).toBe('Lays Classic Salted Chips (52 g)')
    expect(names[11]).toBe('Fresh Apples (1 kg)')
    expect(screen.queryByRole('heading', { name: 'Alphonso Mangoes (1 kg)' })).not.toBeInTheDocument()
  })

  it('sorts by name Z to A', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name-desc')
    expect(cardNames()[0]).toBe('Whole Wheat Bread (400 g)')
    expect(cardNames()[1]).toBe('Whole Milk (1 L)')
  })

  it('changing the sort resets to the first page', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Load more (4 remaining)' }))
    expect(cardNames()).toHaveLength(16)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'price-asc')
    expect(cardNames()).toHaveLength(12)
    expect(cardNames()[0]).toBe('Lays Classic Salted Chips (52 g)')
  })
})

describe('Shop pagination', () => {
  it('loads the remaining products with Load more', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Load more (4 remaining)' }))
    expect(cardNames()).toEqual(PRODUCT_NAMES)
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })

  it('jumps to a page and marks it current', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    const page2 = screen.getByRole('button', { name: '2' })
    await user.click(page2)
    expect(cardNames()).toHaveLength(16)
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })
})

describe('Shop reset', () => {
  it('Reset filters clears search and category', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop('/shop?search=milk&categoryId=3')
    expect(screen.getByText(/1 result/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Reset filters' })[0])
    expect(await screen.findByText('16 results')).toBeInTheDocument()
    expect(screen.queryByText('Search: “milk”')).not.toBeInTheDocument()
    expect(screen.queryByText('Category: Dairy')).not.toBeInTheDocument()
  })

  it('Clear all clears the active filters', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop('/shop?search=milk&categoryId=3')
    expect(screen.getByText(/1 result/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(await screen.findByText('16 results')).toBeInTheDocument()
    expect(screen.queryByText('Search: “milk”')).not.toBeInTheDocument()
  })
})

describe('Shop filter drawer', () => {
  it('opens the mobile filter drawer and closes it with Show results', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show results' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('closes the drawer with the X button', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close filters' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('applies a category from inside the drawer', async () => {
    const user = userEvent.setup()
    setAppState({})
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    await user.click(within(dialog).getByRole('radio', { name: 'Fruits' }))
    expect(await screen.findByText(/3 results/)).toBeInTheDocument()
    expect(screen.getByText('Category: Fruits')).toBeInTheDocument()
    expect(cardNames()).toEqual(['Fresh Apples (1 kg)', 'Bananas (1 dozen)', 'Alphonso Mangoes (1 kg)'])
  })
})

describe('Shop error handling and basket', () => {
  it('Retry calls reloadProducts', async () => {
    const user = userEvent.setup()
    const { reloadProducts } = setAppState({ productsStatus: 'error', productsError: 'Down.' })
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reloadProducts).toHaveBeenCalledTimes(1)
  })

  it('Add on a card calls addToCart with the product id', async () => {
    const user = userEvent.setup()
    const { addToCart } = setAppState({})
    renderShop()
    await user.click(screen.getByRole('button', { name: 'Add Whole Milk (1 L) to basket' }))
    expect(addToCart).toHaveBeenCalledTimes(1)
    expect(addToCart).toHaveBeenCalledWith(6, 1)
  })
})
