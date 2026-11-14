import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { CheckoutResult } from '../pages/CheckoutResult'
import { CheckoutCancel, CheckoutSuccess } from '../pages/StripeReturn'
import { useApp } from '../state/AppContext'
import { getOrder } from '../api/services'
import { ApiError } from '../api/http'
import { formatDateTime } from '../domain/format'
import type { RealOrder, RealUser } from '../domain/types'

// CheckoutResult and StripeReturn only read lastCheckoutOrderId /
// session / sessionStatus from the app state, and only call getOrder
// from the API, so mocking the hook and that one function keeps these
// tests hermetic (no network). Neither page is behind RequireAuth: the
// Stripe redirects land here while the session may still be restoring,
// so each page handles the signed-out state itself.
vi.mock('../state/AppContext', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useApp: vi.fn(),
}))
const mockUseApp = vi.mocked(useApp)

// Only `getOrder` is mocked: it is the only services function any
// component under test calls, and the real one would hit the network.
vi.mock('../api/services', () => ({ getOrder: vi.fn() }))
const mockGetOrder = vi.mocked(getOrder)

const SIGNED_IN: RealUser = { id: 1, name: 'Yugal', email: 'yugal@example.com' }

const ORDER: RealOrder = {
  id: 42,
  status: 'PAID',
  createdAt: '2026-11-14T03:53:00.000Z',
  items: [
    { productId: 7, name: 'Whole Milk (1 L)', unitLabel: '1 L', image: '/images/whole-milk-1-l.jpg', unitPrice: 65, quantity: 2 },
    { productId: 9, name: 'Bananas (1 kg)', unitLabel: '1 kg', image: '/images/bananas-1-kg.jpg', unitPrice: 40, quantity: 3 },
  ],
  total: 250,
}

interface AppOverrides {
  lastCheckoutOrderId?: number | null
  session?: RealUser | null
  sessionStatus?: 'loading' | 'ready' | 'error'
}

function setAppState(partial: AppOverrides) {
  // Explicit null must stay null (a guest): ?? would turn it into SIGNED_IN.
  mockUseApp.mockReturnValue({
    lastCheckoutOrderId: partial.lastCheckoutOrderId === undefined ? null : partial.lastCheckoutOrderId,
    session: partial.session === undefined ? SIGNED_IN : partial.session,
    sessionStatus: partial.sessionStatus ?? 'ready',
  } as unknown as ReturnType<typeof useApp>)
}

function renderAt(path: string, ui: ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseApp.mockReset()
  mockGetOrder.mockReset()
})

describe('CheckoutResult with no order to show', () => {
  it('shows the direct-arrival empty state with shop and orders links when there is no order id', () => {
    setAppState({})
    renderAt('/checkout/result', <CheckoutResult />)
    expect(screen.getByRole('heading', { name: 'No order to show' })).toBeInTheDocument()
    expect(
      screen.getByText("You arrived here directly, without a checkout. Nothing has been charged or ordered."),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shop the market' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/account/orders')
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('treats a non-numeric orderId as no order at all', () => {
    setAppState({ lastCheckoutOrderId: 7 })
    renderAt('/checkout/result?orderId=abc', <CheckoutResult />)
    expect(screen.getByRole('heading', { name: 'No order to show' })).toBeInTheDocument()
    expect(mockGetOrder).not.toHaveBeenCalled()
  })
})

describe('CheckoutResult order resolution', () => {
  it('prefers the orderId query param over the stored last-checkout id', async () => {
    mockGetOrder.mockResolvedValue(ORDER)
    setAppState({ lastCheckoutOrderId: 7 })
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledWith(42)
    expect(mockGetOrder).not.toHaveBeenCalledWith(7)
  })

  it('falls back to the stored last-checkout id when the URL has no orderId', async () => {
    mockGetOrder.mockResolvedValue(ORDER)
    setAppState({ lastCheckoutOrderId: 42 })
    renderAt('/checkout/result', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledWith(42)
  })

  it('shows a loading state while the order is being fetched', async () => {
    let resolveOrder!: (order: RealOrder) => void
    mockGetOrder.mockImplementation(
      () =>
        new Promise<RealOrder>((resolve) => {
          resolveOrder = resolve
        }),
    )
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading order #42…')
    resolveOrder(ORDER)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
  })

  it('does not fetch while the session is still restoring', () => {
    setAppState({ session: null, sessionStatus: 'loading' })
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(mockGetOrder).not.toHaveBeenCalled()
  })
})

describe('CheckoutResult order display', () => {
  it('renders a paid order with its items, line totals, total and date', async () => {
    mockGetOrder.mockResolvedValue(ORDER)
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(screen.getByText('Payment status:')).toBeInTheDocument()
    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.getByText('Payment confirmed by the server (Stripe webhook).')).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(ORDER.createdAt))).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Whole Milk (1 L)' })).toHaveAttribute(
      'src',
      '/images/whole-milk-1-l.jpg',
    )
    expect(screen.getByText('2 × ₹65')).toBeInTheDocument()
    expect(screen.getByText('₹130')).toBeInTheDocument()
    expect(screen.getByText('3 × ₹40')).toBeInTheDocument()
    expect(screen.getByText('₹120')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('₹250')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toHaveAttribute('href', '/shop')
    expect(screen.getByRole('link', { name: 'View in account orders' })).toHaveAttribute(
      'href',
      '/account/orders',
    )
  })

  it('explains a failed payment from the server status', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, status: 'FAILED' })
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(screen.getByText('The payment did not succeed according to the server.')).toBeInTheDocument()
  })

  it('explains a cancelled order from the server status', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, status: 'CANCELLED' })
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(screen.getByText('This order was cancelled.')).toBeInTheDocument()
  })

  it('warns that a pending payment is not yet confirmed and never treats the return as proof', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, status: 'PENDING' })
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order #42' })).toBeInTheDocument()
    expect(screen.getByText(/Payment not yet confirmed/)).toBeInTheDocument()
    expect(screen.getByText(/do not treat the return from Stripe as proof of payment/)).toBeInTheDocument()
  })
})

describe('CheckoutResult errors', () => {
  it('asks a guest to sign in, remembering the result page as next', async () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order could not be shown' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to view this order.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/checkout/result?orderId=42',
    )
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('surfaces the server message when the order cannot be loaded', async () => {
    mockGetOrder.mockRejectedValue(new ApiError('not-found', 'Order 42 was not found.'))
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order could not be shown' })).toBeInTheDocument()
    expect(screen.getByText('Order 42 was not found.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/account/orders')
  })

  it('falls back to a generic message for a non-API failure', async () => {
    mockGetOrder.mockRejectedValue(new Error('boom'))
    setAppState({})
    renderAt('/checkout/result?orderId=42', <CheckoutResult />)
    expect(await screen.findByRole('heading', { name: 'Order could not be shown' })).toBeInTheDocument()
    expect(screen.getByText('Could not load this order.')).toBeInTheDocument()
  })
})

describe('CheckoutSuccess (Stripe return)', () => {
  it('says no order id was returned when Stripe sent a non-numeric one, and never fetches', () => {
    setAppState({})
    renderAt('/checkout-success?orderId=abc', <CheckoutSuccess />)
    expect(screen.getByRole('heading', { name: 'Back from Stripe' })).toBeInTheDocument()
    expect(
      screen.getByText(/No order id was returned. Check your orders list to see what the server actually recorded./),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/account/orders')
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('treats a missing orderId as order 0: Number(null) is 0, so it still checks the server', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, id: 0 })
    setAppState({})
    renderAt('/checkout-success', <CheckoutSuccess />)
    expect(await screen.findByText(/Order #0 - payment status:/)).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledWith(0)
  })

  it('checks the real order on the server instead of trusting the return URL', async () => {
    let resolveOrder!: (order: RealOrder) => void
    mockGetOrder.mockImplementation(
      () =>
        new Promise<RealOrder>((resolve) => {
          resolveOrder = resolve
        }),
    )
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking the real order status with the server…')
    resolveOrder(ORDER)
    expect(await screen.findByText(/Order #42 - payment status:/)).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledWith(42)
  })

  it('does not fetch while the session is still restoring', () => {
    setAppState({ session: null, sessionStatus: 'loading' })
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking the real order status with the server…')
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('confirms a paid order with its items, total and account link', async () => {
    mockGetOrder.mockResolvedValue(ORDER)
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    expect(await screen.findByText(/Order #42 - payment status:/)).toBeInTheDocument()
    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.getByText('Payment confirmed by the server.')).toBeInTheDocument()
    expect(screen.getByText('2 × Whole Milk (1 L) - ₹130')).toBeInTheDocument()
    expect(screen.getByText('3 × Bananas (1 kg) - ₹120')).toBeInTheDocument()
    expect(screen.getByText('Total: ₹250')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View this order in your account' })).toHaveAttribute(
      'href',
      '/account/orders/42',
    )
  })

  it('warns that a pending order is not a receipt and must not be re-paid', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, status: 'PENDING' })
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    expect(await screen.findByText(/Order #42 - payment status:/)).toBeInTheDocument()
    expect(screen.getByText(/Still PENDING: Stripe's webhook has not confirmed this payment yet./)).toBeInTheDocument()
    expect(screen.getByText(/do not re-pay, and do not treat this return page as a receipt./)).toBeInTheDocument()
  })

  it('states plainly that a failed payment means no delivery is coming', async () => {
    mockGetOrder.mockResolvedValue({ ...ORDER, status: 'FAILED' })
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    expect(await screen.findByText(/Order #42 - payment status:/)).toBeInTheDocument()
    expect(screen.getByText('The server records this payment as failed. No delivery is coming from it.')).toBeInTheDocument()
  })

  it('asks a guest to sign in, remembering the success page as next, and offers a retry', async () => {
    setAppState({ session: null, sessionStatus: 'ready' })
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sign in to view this order.')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=/checkout-success?orderId=42',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('retries the server check after a failure and shows the order when it succeeds', async () => {
    const user = userEvent.setup()
    mockGetOrder
      .mockRejectedValueOnce(new ApiError('server', 'Order service is down.'))
      .mockResolvedValue(ORDER)
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Order service is down.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Order #42 - payment status:/)).toBeInTheDocument()
    expect(mockGetOrder).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('falls back to a generic message for a non-API failure', async () => {
    mockGetOrder.mockRejectedValue(new Error('boom'))
    setAppState({})
    renderAt('/checkout-success?orderId=42', <CheckoutSuccess />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load this order.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('CheckoutCancel (Stripe return)', () => {
  it('explains that leaving Stripe took no payment and the order stays pending on the server', () => {
    setAppState({})
    renderAt('/checkout-cancel', <CheckoutCancel />)
    expect(screen.getByRole('heading', { name: 'Checkout cancelled' })).toBeInTheDocument()
    expect(screen.getByText(/You left Stripe without completing payment. No payment was taken by this return page./)).toBeInTheDocument()
    expect(screen.getByText(/stays PENDING on the server until Stripe's webhook says otherwise/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to basket' })).toHaveAttribute('href', '/cart')
    expect(screen.getByRole('link', { name: 'My orders' })).toHaveAttribute('href', '/account/orders')
    expect(mockGetOrder).not.toHaveBeenCalled()
  })

  it('never fetches an order, even if an orderId is in the URL', () => {
    setAppState({})
    renderAt('/checkout-cancel?orderId=42', <CheckoutCancel />)
    expect(screen.getByRole('heading', { name: 'Checkout cancelled' })).toBeInTheDocument()
    expect(mockGetOrder).not.toHaveBeenCalled()
  })
})
