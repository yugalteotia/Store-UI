import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  AccountOverview,
  AccountProfile,
  AccountOrders,
  AccountOrderDetail,
  AccountSecurity,
} from '../pages/Account'
import { useApp } from '../state/AppContext'
import { changePassword, getOrder, updateUser } from '../api/services'
import { ApiError } from '../api/http'
import { formatINR } from '../domain/format'
import type { RealOrder, RealUser } from '../domain/types'

// Account pages only read session/sessionStatus/orders/ordersStatus/
// ordersError/refreshOrders/logout/setSessionUser from the app state, and
// call updateUser/changePassword/getOrder in ../api/services, so mocking
// the hook and those three service functions keeps these tests hermetic
// (no network).
vi.mock('../state/AppContext', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useApp: vi.fn(),
}))
const mockUseApp = vi.mocked(useApp)

vi.mock('../api/services', () => ({
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  getOrder: vi.fn(),
}))
const mockUpdateUser = vi.mocked(updateUser)
const mockChangePassword = vi.mocked(changePassword)
const mockGetOrder = vi.mocked(getOrder)

const SIGNED_IN: RealUser = { id: 1, name: 'Yugal', email: 'yugal@example.com' }

const ORDER_101: RealOrder = {
  id: 101,
  status: 'PAID',
  createdAt: '2026-11-10T10:00:00.000Z',
  total: 1250,
  items: [
    { productId: 7, name: 'Whole Milk (1 L)', unitLabel: '1 L', image: '/images/whole-milk-1-l.jpg', unitPrice: 65, quantity: 2 },
    { productId: 9, name: 'Bananas (1 kg)', unitLabel: '1 kg', image: '/images/bananas-1-kg.jpg', unitPrice: 40, quantity: 3 },
  ],
}
const ORDER_102: RealOrder = {
  id: 102,
  status: 'PENDING',
  createdAt: '2026-11-11T09:30:00.000Z',
  total: 250,
  items: [
    { productId: 7, name: 'Whole Milk (1 L)', unitLabel: '1 L', image: '/images/whole-milk-1-l.jpg', unitPrice: 65, quantity: 1 },
  ],
}
const ORDER_42: RealOrder = {
  id: 42,
  status: 'PAID',
  createdAt: '2026-11-09T08:15:00.000Z',
  total: 250,
  items: [
    { productId: 7, name: 'Whole Milk (1 L)', unitLabel: '1 L', image: '/images/whole-milk-1-l.jpg', unitPrice: 65, quantity: 2 },
    { productId: 9, name: 'Bananas (1 kg)', unitLabel: '1 kg', image: '/images/bananas-1-kg.jpg', unitPrice: 40, quantity: 3 },
  ],
}

interface AppOverrides {
  session?: RealUser | null
  sessionStatus?: 'loading' | 'ready' | 'error'
  orders?: RealOrder[]
  ordersStatus?: 'loading' | 'ready' | 'error'
  ordersError?: string | null
  refreshOrders?: () => Promise<void>
  logout?: () => Promise<void>
  setSessionUser?: (user: RealUser | null) => void
}

function setAppState(partial: AppOverrides = {}) {
  const refreshOrders = vi.fn(partial.refreshOrders ?? (async () => {}))
  const logout = vi.fn(partial.logout ?? (async () => {}))
  const setSessionUser = vi.fn(partial.setSessionUser ?? (() => {}))
  mockUseApp.mockReturnValue({
    // `??` would swallow an explicit null session, so test the key instead.
    session: partial.session === undefined ? SIGNED_IN : partial.session,
    sessionStatus: partial.sessionStatus ?? 'ready',
    orders: partial.orders ?? [],
    ordersStatus: partial.ordersStatus ?? 'ready',
    ordersError: partial.ordersError ?? null,
    refreshOrders,
    logout,
    setSessionUser,
  } as unknown as ReturnType<typeof useApp>)
  return { refreshOrders, logout, setSessionUser }
}

function renderAt(path: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path.replace(/\/\d+$/, '/:orderId')} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderOverview() {
  return render(
    <MemoryRouter>
      <AccountOverview />
    </MemoryRouter>,
  )
}

function renderProfile() {
  return render(
    <MemoryRouter>
      <AccountProfile />
    </MemoryRouter>,
  )
}

function renderOrders() {
  return render(
    <MemoryRouter>
      <AccountOrders />
    </MemoryRouter>,
  )
}

function renderSecurity() {
  return render(
    <MemoryRouter>
      <AccountSecurity />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AccountOverview', () => {
  it('greets the signed-in user with name, email and account id', () => {
    setAppState()
    renderOverview()
    expect(screen.getByText('Hello, Yugal')).toBeInTheDocument()
    expect(screen.getByText('yugal@example.com · account #1')).toBeInTheDocument()
  })

  it('shows the order count and a link to the orders page', () => {
    setAppState({ orders: [ORDER_101, ORDER_102] })
    renderOverview()
    expect(screen.getByText('2 orders on your account (server-confirmed).')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View orders' })).toHaveAttribute('href', '/account/orders')
  })

  it('uses the singular "1 order" for a single order', () => {
    setAppState({ orders: [ORDER_101] })
    renderOverview()
    expect(screen.getByText('1 order on your account (server-confirmed).')).toBeInTheDocument()
  })

  it('renders the four account tabs with the right destinations', () => {
    setAppState()
    renderOverview()
    const nav = screen.getByRole('navigation', { name: 'Account' })
    const tabs: Array<[string, string]> = [
      ['Overview', '/account'],
      ['Profile', '/account/profile'],
      ['Orders', '/account/orders'],
      ['Security', '/account/security'],
    ]
    for (const [name, href] of tabs) {
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('explains that the backend profile has only name and email', () => {
    setAppState()
    renderOverview()
    expect(
      screen.getByText(
        'Real account area - orders and profile come from the Store API. The backend profile has only name and email; there is no phone or city field.',
      ),
    ).toBeInTheDocument()
  })

  it('calls logout when Sign out is clicked', async () => {
    const user = userEvent.setup()
    const { logout } = setAppState()
    renderOverview()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})

describe('RequireAuth guard', () => {
  it('shows a checking message while the session is loading', () => {
    setAppState({ session: null, sessionStatus: 'loading' })
    renderOverview()
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session…')
    expect(screen.queryByText('Hello, Yugal')).not.toBeInTheDocument()
  })

  it('shows the sign-in prompt with a link to /login when signed out', () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderOverview()
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.getByText('Account pages need a real Store API account. Your basket is separate and stays as it is.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to sign-in' })).toHaveAttribute('href', '/login')
  })

  it('also guards the profile page when signed out', () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderProfile()
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument()
  })
})

describe('AccountProfile', () => {
  it('pre-fills name and email from the session', () => {
    setAppState()
    renderProfile()
    expect(screen.getByLabelText('name')).toHaveValue('Yugal')
    expect(screen.getByLabelText('email')).toHaveValue('yugal@example.com')
  })

  it('shows validation errors for a short name and a bad email', async () => {
    const user = userEvent.setup()
    setAppState()
    renderProfile()
    await user.clear(screen.getByLabelText('name'))
    await user.type(screen.getByLabelText('name'), 'Y')
    await user.clear(screen.getByLabelText('email'))
    await user.type(screen.getByLabelText('email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByText('Please enter your name')).toBeInTheDocument()
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('updates the profile, stores the new user and shows a success message', async () => {
    const user = userEvent.setup()
    const updated: RealUser = { id: 1, name: 'Yugal Teotia', email: 'yugal@example.com' }
    mockUpdateUser.mockResolvedValue(updated)
    const { setSessionUser } = setAppState()
    renderProfile()
    await user.clear(screen.getByLabelText('name'))
    await user.type(screen.getByLabelText('name'), 'Yugal Teotia')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith(1, 'Yugal Teotia', 'yugal@example.com'))
    expect(setSessionUser).toHaveBeenCalledWith(updated)
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated on the server.')
  })

  it('shows the server error message when the update fails', async () => {
    const user = userEvent.setup()
    mockUpdateUser.mockRejectedValue(new Error('Email already taken'))
    setAppState()
    renderProfile()
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already taken')
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
  })
})

describe('AccountOrders', () => {
  it('shows a loading state while orders load', () => {
    setAppState({ ordersStatus: 'loading' })
    renderOrders()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your orders…')
  })

  it('shows the error state and retries when Retry is clicked', async () => {
    const user = userEvent.setup()
    const { refreshOrders } = setAppState({ ordersStatus: 'error', ordersError: 'Server exploded' })
    renderOrders()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load orders: Server exploded")
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refreshOrders).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state with a link to the shop', () => {
    setAppState({ orders: [] })
    renderOrders()
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
    expect(screen.getByText('Orders appear here once you check out and Stripe confirms payment. A PENDING order means the webhook has not arrived yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop the market' })).toHaveAttribute('href', '/shop')
  })

  it('lists orders with id, status, total and item counts', () => {
    setAppState({ orders: [ORDER_101, ORDER_102] })
    renderOrders()
    const link101 = screen.getByRole('link', { name: /Order #101/ })
    expect(link101).toHaveAttribute('href', '/account/orders/101')
    expect(link101).toHaveTextContent('PAID')
    expect(link101).toHaveTextContent(formatINR(1250))
    expect(screen.getByRole('link', { name: /Order #102/ })).toHaveTextContent('PENDING')
    expect(screen.getByText('2 items · status is a payment status, not a delivery status')).toBeInTheDocument()
    expect(screen.getByText('1 item · status is a payment status, not a delivery status')).toBeInTheDocument()
  })
})

describe('AccountOrderDetail', () => {
  it('shows a loading state, then the order with its items and total', async () => {
    mockGetOrder.mockResolvedValue(ORDER_42)
    setAppState()
    renderAt('/account/orders/42', <AccountOrderDetail />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading order…')
    expect(await screen.findByText(/Order #42/)).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledWith(42)
    expect(screen.getByRole('img', { name: 'Whole Milk (1 L)' })).toBeInTheDocument()
    expect(screen.getByText('2 × ' + formatINR(65))).toBeInTheDocument()
    expect(screen.getByText('3 × ' + formatINR(40))).toBeInTheDocument()
    expect(screen.getByText(formatINR(130))).toBeInTheDocument()
    expect(screen.getByText(formatINR(120))).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText(formatINR(250))).toBeInTheDocument()
  })

  it('shows the not-found state with the invalid-id message for a non-numeric id', async () => {
    setAppState()
    renderAt('/account/orders/abc', <AccountOrderDetail />)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
    expect(screen.getByText('That order id is not valid.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to orders' })).toHaveAttribute('href', '/account/orders')
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('shows the server error message when loading the order fails', async () => {
    mockGetOrder.mockRejectedValue(new ApiError('not-found', 'That order is not on your account.', 404))
    setAppState()
    renderAt('/account/orders/42', <AccountOrderDetail />)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
    expect(screen.getByText('That order is not on your account.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to orders' })).toBeInTheDocument()
  })

  it('shows a generic message when loading fails with a plain error', async () => {
    mockGetOrder.mockRejectedValue(new Error('boom'))
    setAppState()
    renderAt('/account/orders/42', <AccountOrderDetail />)
    expect(await screen.findByText('Order not found')).toBeInTheDocument()
    expect(screen.getByText('Could not load this order.')).toBeInTheDocument()
  })

  it('is guarded when signed out and shows no order content', async () => {
    // The detail effect still fires its fetch on mount (pre-existing
    // behaviour); the guard only hides the order UI behind sign-in.
    mockGetOrder.mockResolvedValue(ORDER_42)
    setAppState({ session: null, sessionStatus: 'ready' })
    renderAt('/account/orders/42', <AccountOrderDetail />)
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.queryByText(/Order #42/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('AccountSecurity', () => {
  it('renders the three password fields and the update button', () => {
    setAppState()
    renderSecurity()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Update password' })).toBeInTheDocument()
  })

  it('shows validation errors when submitted empty', async () => {
    const user = userEvent.setup()
    setAppState()
    renderSecurity()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Enter your current password')).toBeInTheDocument()
    expect(await screen.findByText('New password must be at least 6 characters')).toBeInTheDocument()
    expect(await screen.findByText('Please confirm the new password')).toBeInTheDocument()
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('shows a mismatch error when the new passwords differ', async () => {
    const user = userEvent.setup()
    setAppState()
    renderSecurity()
    await user.type(screen.getByLabelText('Current password'), 'oldpass123')
    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'different1')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('changes the password and shows a success message', async () => {
    const user = userEvent.setup()
    mockChangePassword.mockResolvedValue(undefined)
    setAppState()
    renderSecurity()
    await user.type(screen.getByLabelText('Current password'), 'oldpass123')
    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith(1, 'oldpass123', 'newpass123'))
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed on the server.')
  })

  it('shows a friendly message when the current password is rejected', async () => {
    const user = userEvent.setup()
    mockChangePassword.mockRejectedValue(new ApiError('auth', 'Invalid credentials', 401))
    setAppState()
    renderSecurity()
    await user.type(screen.getByLabelText('Current password'), 'wrongpass')
    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password was not accepted.')
  })

  it('shows the server message for a non-auth failure', async () => {
    const user = userEvent.setup()
    mockChangePassword.mockRejectedValue(new Error('Server exploded'))
    setAppState()
    renderSecurity()
    await user.type(screen.getByLabelText('Current password'), 'oldpass123')
    await user.type(screen.getByLabelText('New password'), 'newpass123')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
  })
})
