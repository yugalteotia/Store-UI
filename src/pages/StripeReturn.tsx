import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { formatINR } from '../domain/format'
import { getOrder } from '../api/services'
import { ApiError } from '../api/http'
import type { RealOrder } from '../domain/types'

/**
 * Pages the backend's Stripe configuration redirects to:
 *   {websiteUrl}/checkout-success?orderId={id}
 *   {websiteUrl}/checkout-cancel?
 * Neither URL proves anything by itself: both pages fetch the real order
 * from GET /orders/{id} (cancel has no orderId, so it cannot fetch one)
 * and display only what the server says. A PENDING status after a
 * "successful" Stripe return means the webhook has not arrived yet.
 */
function OrderStatus({ orderId }: { orderId: number }) {
  const { session, sessionStatus } = useApp()
  const [order, setOrder] = useState<RealOrder | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setError('')
    getOrder(orderId)
      .then((o) => {
        setOrder(o)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load this order.')
        setLoading(false)
      })
  }

  useEffect(() => {
    if (sessionStatus !== 'ready') return
    if (!session) {
      setError('Sign in to view this order.')
      setLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session, orderId])

  if (loading) return <p role="status">Checking the real order status with the server…</p>
  if (error || !order) {
    return (
      <div>
        <p role="alert" className="text-red-700 dark:text-red-300">{error || 'Order not found.'}</p>
        {!session && <Link to={`/login?next=/checkout-success?orderId=${orderId}`} className="mt-4 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Sign in</Link>}
        <button type="button" onClick={load} className="mt-4 rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">Retry</button>
      </div>
    )
  }
  return (
    <div>
      <p className="text-lg">Order #{order.id} — payment status: <strong>{order.status}</strong></p>
      {order.status === 'PENDING' && (
        <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">
          Still PENDING: Stripe&apos;s webhook has not confirmed this payment yet. Wait a moment
          and refresh — do not re-pay, and do not treat this return page as a receipt.
        </p>
      )}
      {order.status === 'PAID' && <p className="mt-2 text-sm">Payment confirmed by the server.</p>}
      {order.status === 'FAILED' && <p className="mt-2 text-sm">The server records this payment as failed. No delivery is coming from it.</p>}
      <ul className="mt-4 space-y-2">
        {order.items.map((i) => (
          <li key={i.productId} className="text-sm">{i.quantity} × {i.name} — {formatINR(i.unitPrice * i.quantity)}</li>
        ))}
      </ul>
      <p className="mt-4 font-bold">Total: {formatINR(order.total)}</p>
      <Link to={`/account/orders/${order.id}`} className="mt-4 inline-block font-semibold text-citrusdark underline">View this order in your account</Link>
    </div>
  )
}

export function CheckoutSuccess() {
  const [params] = useSearchParams()
  const orderId = Number(params.get('orderId'))
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-serif text-4xl font-bold">Back from Stripe</h1>
      <p className="mt-3 text-plum/60 dark:text-cream/60">
        You returned from Stripe. This page checks the order on the server — the return URL
        alone never proves payment.
      </p>
      <div className="mt-6 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
        {Number.isInteger(orderId) ? <OrderStatus orderId={orderId} /> : <p>No order id was returned. Check your orders list to see what the server actually recorded.</p>}
      </div>
      <Link to="/account/orders" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">My orders</Link>
    </main>
  )
}

export function CheckoutCancel() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-4xl font-bold">Checkout cancelled</h1>
      <p className="mt-3 text-plum/60 dark:text-cream/60">
        You left Stripe without completing payment. No payment was taken by this return page.
        The order created before Stripe (if any) stays PENDING on the server until Stripe&apos;s
        webhook says otherwise — check your orders list to see it.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/cart" className="rounded-full bg-plum px-6 py-3 font-semibold text-cream">Back to basket</Link>
        <Link to="/account/orders" className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">My orders</Link>
      </div>
    </main>
  )
}
