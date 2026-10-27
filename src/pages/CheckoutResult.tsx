import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { formatINR, formatDateTime } from '../domain/format'
import { getOrder } from '../api/services'
import { ApiError } from '../api/http'
import type { RealOrder } from '../domain/types'

function statusNote(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Payment confirmed by the server (Stripe webhook).'
    case 'FAILED':
      return 'The payment did not succeed according to the server.'
    case 'CANCELLED':
      return 'This order was cancelled.'
    default:
      return 'Payment not yet confirmed — the server is still waiting on Stripe. Wait a moment and refresh this page; do not treat the return from Stripe as proof of payment.'
  }
}

export function CheckoutResult() {
  const { lastCheckoutOrderId, session, sessionStatus } = useApp()
  const [params] = useSearchParams()
  const orderId = Number(params.get('orderId') ?? lastCheckoutOrderId ?? NaN)
  const [order, setOrder] = useState<RealOrder | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('empty')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!Number.isInteger(orderId) || sessionStatus !== 'ready') return
    if (!session) {
      setStatus('error')
      setError('Sign in to view this order.')
      return
    }
    setStatus('loading')
    getOrder(orderId)
      .then((o) => {
        setOrder(o)
        setStatus('ready')
      })
      .catch((err) => {
        setStatus('error')
        setError(err instanceof ApiError ? err.message : 'Could not load this order.')
      })
  }, [orderId, session, sessionStatus])

  if (!Number.isInteger(orderId)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">No order to show</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">
          You arrived here directly, without a checkout. Nothing has been charged or ordered.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/shop" className="rounded-full bg-plum px-6 py-3 font-semibold text-cream">Shop the market</Link>
          <Link to="/account/orders" className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">My orders</Link>
        </div>
      </main>
    )
  }

  if (status === 'loading') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p role="status">Loading order #{orderId}…</p>
      </main>
    )
  }

  if (status === 'error' || !order) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Order could not be shown</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">{error || 'That order was not found.'}</p>
        {!session && <Link to={`/login?next=/checkout/result?orderId=${orderId}`} className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Sign in</Link>}
        <Link to="/account/orders" className="mt-6 inline-block rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">My orders</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-3xl bg-paper p-8 text-center shadow-card dark:bg-white/5">
        <CheckCircle2 size={48} className="mx-auto text-leaf" aria-hidden />
        <h1 className="mt-4 font-serif text-4xl font-bold">Order #{order.id}</h1>
        <p className="mt-2 font-semibold">Payment status: <span className="text-citrusdark">{order.status}</span></p>
        <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">{statusNote(order.status)}</p>
        <p className="mt-4 text-sm text-plum/60 dark:text-cream/60">{formatDateTime(order.createdAt)}</p>
      </div>
      <section className="mt-6 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" aria-label="Order items">
        <ul className="space-y-3">
          {order.items.map((i) => (
            <li key={i.productId} className="flex items-center gap-3">
              <img src={i.image} alt={i.name} className="h-14 w-14 rounded-xl object-cover" />
              <span className="flex-1 text-sm"><strong>{i.name}</strong><br />{i.quantity} × {formatINR(i.unitPrice)}</span>
              <strong className="text-sm">{formatINR(i.unitPrice * i.quantity)}</strong>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-between border-t border-plum/10 pt-4 text-lg dark:border-white/10">
          <span>Total</span>
          <strong>{formatINR(order.total)}</strong>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/shop" className="rounded-full bg-plum px-6 py-3 font-semibold text-cream">Continue shopping</Link>
        <Link to="/account/orders" className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">View in account orders</Link>
      </div>
    </main>
  )
}
