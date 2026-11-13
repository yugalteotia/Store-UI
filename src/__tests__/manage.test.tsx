import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  ManageHome,
  ManageProducts,
  ManageProductNew,
  ManageProductEdit,
} from '../pages/Manage'
import { useApp } from '../state/AppContext'
import { createProduct, deleteProduct, updateProduct } from '../api/services'
import { ApiError } from '../api/http'
import { formatINR } from '../domain/format'
import { CATEGORIES } from '../api/categories'
import type { Product, RealUser } from '../domain/types'

// Manage pages only read products/session/isAdminHint/reloadProducts from
// the app state, and call createProduct/updateProduct/deleteProduct in
// ../api/services, so mocking the hook and those three service functions
// keeps these tests hermetic (no network).
vi.mock('../state/AppContext', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useApp: vi.fn(),
}))
const mockUseApp = vi.mocked(useApp)

vi.mock('../api/services', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}))
const mockCreateProduct = vi.mocked(createProduct)
const mockUpdateProduct = vi.mocked(updateProduct)
const mockDeleteProduct = vi.mocked(deleteProduct)

const ADMIN: RealUser = { id: 1, name: 'Yugal', email: 'yugal@example.com' }

const APPLES: Product = {
  id: 1,
  name: 'Fresh Apples (1 kg)',
  slug: 'fresh-apples-1-kg',
  description: 'Crisp Kashmiri apples, sweet and juicy.',
  price: 120,
  unitLabel: '1 kg',
  categoryId: 1,
  image: '/images/fresh-apples.jpg',
  isFeatured: false,
  isSeasonal: false,
}
const MILK: Product = {
  id: 2,
  name: 'Amul Taaza Milk (1 L)',
  slug: 'amul-taaza-milk-1-l',
  description: 'Toned milk, pasteurised and homogenised.',
  price: 65,
  unitLabel: '1 L',
  categoryId: 3,
  image: '/images/amul-taaza-milk.jpg',
  isFeatured: false,
  isSeasonal: false,
}
const BREAD: Product = {
  id: 3,
  name: 'Whole Wheat Bread (400 g)',
  slug: 'whole-wheat-bread-400-g',
  description: 'Soft whole wheat bread, baked fresh daily.',
  price: 45,
  unitLabel: '400 g',
  categoryId: 4,
  image: '/images/whole-wheat-bread.jpg',
  isFeatured: false,
  isSeasonal: false,
}
const BANANAS: Product = {
  id: 4,
  name: 'Bananas (1 dozen)',
  slug: 'bananas-1-dozen',
  description: 'Ripe Robusta bananas, sweet and firm.',
  price: 60,
  unitLabel: '1 dozen',
  categoryId: 1,
  image: '/images/bananas.jpg',
  isFeatured: false,
  isSeasonal: false,
}
const PRODUCTS = [APPLES, MILK, BREAD]

interface AppOverrides {
  products?: Product[]
  session?: RealUser | null
  isAdminHint?: boolean
  reloadProducts?: () => Promise<void>
}

function setAppState(partial: AppOverrides = {}) {
  const reloadProducts = vi.fn(partial.reloadProducts ?? (async () => {}))
  mockUseApp.mockReturnValue({
    // `??` would swallow an explicit null session, so test the key instead.
    products: partial.products ?? PRODUCTS,
    session: partial.session === undefined ? ADMIN : partial.session,
    isAdminHint: partial.isAdminHint ?? true,
    reloadProducts,
  } as unknown as ReturnType<typeof useApp>)
  return { reloadProducts }
}

function renderHome() {
  return render(
    <MemoryRouter>
      <ManageHome />
    </MemoryRouter>,
  )
}

function renderProducts() {
  return render(
    <MemoryRouter>
      <ManageProducts />
    </MemoryRouter>,
  )
}

function renderNew() {
  return render(
    <MemoryRouter initialEntries={['/manage/products/new']}>
      <Routes>
        <Route path="/manage/products/new" element={<ManageProductNew />} />
        <Route path="/products/:id" element={<div>Product page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderEdit(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manage/products/:productId/edit" element={<ManageProductEdit />} />
        <Route path="/products/:id" element={<div>Product page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ManageHome', () => {
  it('renders the heading, stat cards and the link to the product list', () => {
    setAppState()
    renderHome()
    expect(screen.getByRole('heading', { name: 'Manage the market' })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Products in the live catalogue')).toBeInTheDocument()
    expect(screen.getByText(String(CATEGORIES.length))).toBeInTheDocument()
    expect(screen.getByText('Seed categories (no category endpoint exists)')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Products in the Fruits category')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open product list' })).toHaveAttribute('href', '/manage/products')
  })

  it('counts only category 1 products in the Fruits stat', () => {
    setAppState({ products: [APPLES, BANANAS, MILK] })
    renderHome()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Products in the Fruits category')).toBeInTheDocument()
  })

  it('shows the ADMIN-only banner when signed out', () => {
    setAppState({ session: null, isAdminHint: false })
    renderHome()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Product management is ADMIN-only on the backend (POST/PUT/DELETE /products return 403 for regular customers).',
    )
  })

  it('shows the not-confirmed-admin banner when signed in without the admin hint', () => {
    setAppState({ isAdminHint: false })
    renderHome()
    expect(screen.getByRole('note')).toHaveTextContent(
      'You are signed in, but the admin check did not confirm admin access for this account',
    )
  })

  it('shows the admin workspace banner when the admin hint is confirmed', () => {
    setAppState({ isAdminHint: true })
    renderHome()
    expect(screen.getByRole('note')).toHaveTextContent(
      'Admin workspace: changes go straight to the live catalogue via POST/PUT/DELETE /products.',
    )
  })

  it('links the tabs to the product list and the add-product form', () => {
    setAppState()
    renderHome()
    expect(screen.getByRole('link', { name: 'Product list' })).toHaveAttribute('href', '/manage/products')
    expect(screen.getByRole('link', { name: 'Add product' })).toHaveAttribute('href', '/manage/products/new')
  })
})

describe('ManageProducts', () => {
  it('lists products sorted by name by default, with prices and edit/delete controls', () => {
    setAppState()
    renderProducts()
    expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Amul Taaza Milk (1 L)')
    expect(items[1]).toHaveTextContent('Fresh Apples (1 kg)')
    expect(items[2]).toHaveTextContent('Whole Wheat Bread (400 g)')
    expect(screen.getByText(formatINR(120))).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Fresh Apples (1 kg)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Fresh Apples (1 kg)' })).toHaveAttribute(
      'href',
      '/manage/products/1/edit',
    )
    expect(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Add product/ })).toHaveAttribute('href', '/manage/products/new')
  })

  it('filters by search query, case-insensitively', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProducts()
    await user.type(screen.getByLabelText('Search products'), 'MILK')
    expect(screen.getByText('Amul Taaza Milk (1 L)')).toBeInTheDocument()
    expect(screen.queryByText('Fresh Apples (1 kg)')).not.toBeInTheDocument()
    expect(screen.queryByText('Whole Wheat Bread (400 g)')).not.toBeInTheDocument()
  })

  it('shows the empty state and Clear search restores the list', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProducts()
    await user.type(screen.getByLabelText('Search products'), 'guava')
    expect(screen.getByText('No products match that search.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Fresh Apples (1 kg)')).toBeInTheDocument()
    expect(screen.getByText('Amul Taaza Milk (1 L)')).toBeInTheDocument()
  })

  it('sorts by price low to high', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProducts()
    await user.selectOptions(screen.getByLabelText('Sort products'), 'price-asc')
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Whole Wheat Bread (400 g)')
    expect(items[1]).toHaveTextContent('Amul Taaza Milk (1 L)')
    expect(items[2]).toHaveTextContent('Fresh Apples (1 kg)')
  })

  it('sorts by price high to low', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProducts()
    await user.selectOptions(screen.getByLabelText('Sort products'), 'price-desc')
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Fresh Apples (1 kg)')
    expect(items[1]).toHaveTextContent('Amul Taaza Milk (1 L)')
    expect(items[2]).toHaveTextContent('Whole Wheat Bread (400 g)')
  })

  it('asks for confirmation before deleting, and No cancels without calling the API', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProducts()
    await user.click(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' }))
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
    expect(mockDeleteProduct).not.toHaveBeenCalled()
    expect(screen.getByText('Fresh Apples (1 kg)')).toBeInTheDocument()
  })

  it('deletes on Yes, reloads the catalogue and shows a success message', async () => {
    const user = userEvent.setup()
    mockDeleteProduct.mockResolvedValue(undefined)
    const { reloadProducts } = setAppState()
    renderProducts()
    await user.click(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(mockDeleteProduct).toHaveBeenCalledWith(1))
    expect(reloadProducts).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fresh Apples (1 kg) was deleted from the live catalogue.',
    )
  })

  it('disables the delete confirmation when the admin hint is not confirmed', async () => {
    const user = userEvent.setup()
    setAppState({ isAdminHint: false })
    renderProducts()
    await user.click(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' }))
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled()
  })

  it('shows a friendly message when the backend refuses the delete with 403', async () => {
    const user = userEvent.setup()
    mockDeleteProduct.mockRejectedValue(new ApiError('authz', 'Forbidden', 403))
    setAppState()
    renderProducts()
    await user.click(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(await screen.findByText('The backend refused this delete (403): this account is not an admin.')).toBeInTheDocument()
  })

  it('shows the server message when the delete fails for another reason', async () => {
    const user = userEvent.setup()
    mockDeleteProduct.mockRejectedValue(new Error('Server exploded'))
    setAppState()
    renderProducts()
    await user.click(screen.getByRole('button', { name: 'Delete Fresh Apples (1 kg)' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
  })

  it('tells signed-out visitors to sign in with an admin account to delete', () => {
    setAppState({ session: null, isAdminHint: false })
    renderProducts()
    expect(screen.getByText('Sign in with an admin account to delete products.')).toBeInTheDocument()
  })
})

describe('ManageProductNew', () => {
  it('renders the form with empty fields, price 0 and Fruits as the default category', () => {
    setAppState()
    renderNew()
    expect(screen.getByRole('heading', { name: 'Add product' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.getByLabelText('Price (INR)')).toHaveValue(0)
    expect(screen.getByLabelText('Category')).toHaveValue('1')
    expect(screen.getByLabelText('Category')).toHaveTextContent('Fruits')
    expect(screen.getByText(/The backend stores only name, description, price and category/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save product' })).toBeInTheDocument()
  })

  it('shows validation errors on empty submit and does not call the API', async () => {
    const user = userEvent.setup()
    setAppState()
    renderNew()
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('Product name is required')).toBeInTheDocument()
    expect(await screen.findByText('Description must be at least 10 characters')).toBeInTheDocument()
    expect(await screen.findByText('Price must be greater than 0')).toBeInTheDocument()
    expect(mockCreateProduct).not.toHaveBeenCalled()
  })

  it('creates the product, reloads the catalogue and shows a success message', async () => {
    const user = userEvent.setup()
    const created = { ...BANANAS, id: 99 }
    mockCreateProduct.mockResolvedValue(created)
    const { reloadProducts } = setAppState()
    renderNew()
    await user.type(screen.getByLabelText('Name'), 'Fresh Guavas (1 kg)')
    await user.type(screen.getByLabelText('Description'), 'Sweet pink guavas, ripe and ready.')
    await user.clear(screen.getByLabelText('Price (INR)'))
    await user.type(screen.getByLabelText('Price (INR)'), '90')
    await user.selectOptions(screen.getByLabelText('Category'), '2')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() =>
      expect(mockCreateProduct).toHaveBeenCalledWith({
        name: 'Fresh Guavas (1 kg)',
        description: 'Sweet pink guavas, ripe and ready.',
        price: 90,
        categoryId: 2,
      }),
    )
    expect(reloadProducts).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      '“Fresh Guavas (1 kg)” was added to the live catalogue.',
    )
  })

  it('navigates to the new product page after creating it', async () => {
    const user = userEvent.setup()
    mockCreateProduct.mockResolvedValue({ ...BANANAS, id: 99 })
    setAppState()
    renderNew()
    await user.type(screen.getByLabelText('Name'), 'Fresh Guavas (1 kg)')
    await user.type(screen.getByLabelText('Description'), 'Sweet pink guavas, ripe and ready.')
    await user.clear(screen.getByLabelText('Price (INR)'))
    await user.type(screen.getByLabelText('Price (INR)'), '90')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('Product page', undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('shows a friendly message when the backend refuses the create with 403', async () => {
    const user = userEvent.setup()
    mockCreateProduct.mockRejectedValue(new ApiError('authz', 'Forbidden', 403))
    setAppState()
    renderNew()
    await user.type(screen.getByLabelText('Name'), 'Fresh Guavas (1 kg)')
    await user.type(screen.getByLabelText('Description'), 'Sweet pink guavas, ripe and ready.')
    await user.clear(screen.getByLabelText('Price (INR)'))
    await user.type(screen.getByLabelText('Price (INR)'), '90')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('The backend refused this create (403): this account is not an admin.')).toBeInTheDocument()
  })

  it('shows the server message when the create fails for another reason', async () => {
    const user = userEvent.setup()
    mockCreateProduct.mockRejectedValue(new Error('Server exploded'))
    setAppState()
    renderNew()
    await user.type(screen.getByLabelText('Name'), 'Fresh Guavas (1 kg)')
    await user.type(screen.getByLabelText('Description'), 'Sweet pink guavas, ripe and ready.')
    await user.clear(screen.getByLabelText('Price (INR)'))
    await user.type(screen.getByLabelText('Price (INR)'), '90')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('Server exploded')).toBeInTheDocument()
  })

  it('disables saving and explains why when the admin hint is not confirmed', () => {
    setAppState({ isAdminHint: false })
    renderNew()
    expect(screen.getByRole('button', { name: 'Save product' })).toBeDisabled()
    expect(screen.getByText('Saving is disabled: admin access was not confirmed for this account (see the banner above).')).toBeInTheDocument()
  })
})

describe('ManageProductEdit', () => {
  it('shows the not-found state with a back link for an unknown product id', () => {
    setAppState()
    renderEdit('/manage/products/999/edit')
    expect(screen.getByRole('heading', { name: 'Product not found' })).toBeInTheDocument()
    expect(screen.getByText("That product isn't in the live catalogue, so it can't be edited.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', '/manage/products')
    expect(mockUpdateProduct).not.toHaveBeenCalled()
  })

  it('pre-fills the form from the product', () => {
    setAppState()
    renderEdit('/manage/products/1/edit')
    expect(screen.getByRole('heading', { name: 'Edit: Fresh Apples (1 kg)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Fresh Apples (1 kg)')
    expect(screen.getByLabelText('Description')).toHaveValue('Crisp Kashmiri apples, sweet and juicy.')
    expect(screen.getByLabelText('Price (INR)')).toHaveValue(120)
    expect(screen.getByLabelText('Category')).toHaveValue('1')
  })

  it('saves changes, reloads the catalogue and shows a success message', async () => {
    const user = userEvent.setup()
    mockUpdateProduct.mockResolvedValue(undefined)
    const { reloadProducts } = setAppState()
    renderEdit('/manage/products/1/edit')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Fresh Apples (2 kg)')
    await user.clear(screen.getByLabelText('Price (INR)'))
    await user.type(screen.getByLabelText('Price (INR)'), '150')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() =>
      expect(mockUpdateProduct).toHaveBeenCalledWith(1, {
        name: 'Fresh Apples (2 kg)',
        description: 'Crisp Kashmiri apples, sweet and juicy.',
        price: 150,
        categoryId: 1,
      }),
    )
    expect(reloadProducts).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved to the live catalogue.')
  })

  it('navigates to the product page after saving', async () => {
    const user = userEvent.setup()
    mockUpdateProduct.mockResolvedValue(undefined)
    setAppState()
    renderEdit('/manage/products/1/edit')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('Product page', undefined, { timeout: 3000 })).toBeInTheDocument()
  })

  it('shows a friendly message when the backend refuses the update with 403', async () => {
    const user = userEvent.setup()
    mockUpdateProduct.mockRejectedValue(new ApiError('authz', 'Forbidden', 403))
    setAppState()
    renderEdit('/manage/products/1/edit')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('The backend refused this update (403): this account is not an admin.')).toBeInTheDocument()
  })

  it('disables saving when the admin hint is not confirmed', () => {
    setAppState({ isAdminHint: false })
    renderEdit('/manage/products/1/edit')
    expect(screen.getByRole('button', { name: 'Save product' })).toBeDisabled()
    expect(screen.getByText('Saving is disabled: admin access was not confirmed for this account (see the banner above).')).toBeInTheDocument()
  })
})
