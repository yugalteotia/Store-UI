import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { CartRepository } from '../domain/repositories'
import { formatINR } from '../domain/format'
import { checkout } from '../api/services'
import { isValidStripeCheckoutUrl, ApiError } from '../api/http'
function loadCartId(): string | null {
  try {
    const raw = window.localStorage.getItem('orchard.cartId')
    return raw && /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null
  } catch {
    return null
  }
}

export function Checkout() {
  const { cart, products, cartSubtotal, session, sessionStatus, setLastCheckoutOrderId, refreshCart } = useApp()
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [pending, setPending] = useState(false)
  const lines = CartRepository.detailed(cart, products)
  const cartId = loadCartId()

  const startCheckout = async () => {
    setError('')
    setUncertain(false)
    if (!cartId) {
      setError('No basket was found on the server. Add an item first, then try again.')
      return
    }
    setPending(true)
    try {
      const result = await checkout(cartId)
      if (!isValidStripeCheckoutUrl(result.checkoutUrl)) {
        setError('The server returned a checkout address that is not a Stripe address. Nothing was opened — this is a safety stop, not a payment.')
        setPending(false)
        return
      }
      setLastCheckoutOrderId(result.orderId)
      // The backend has already created a PENDING order and cleared the
      // basket (server-side). Refresh local state, then hand off to Stripe.
      await refreshCart()
      window.location.href = result.checkoutUrl
    } catch (err) {
      setPending(false)
      if (err instanceof ApiError && err.kind === 'network') {
        // A timeout here is genuinely uncertain: the order may exist.
        setUncertain(true)
        setError('The checkout request did not complete cleanly. The order may already exist — check your orders before trying again.')
      } else if (err instanceof ApiError && err.kind === 'auth') {
        setError('Please sign in to check out — checkout requires an account.')
      } else {
        setError(err instanceof Error ? err.message : 'Checkout failed.')
      }
    }
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Checkout</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">Your basket is empty, so there&apos;s nothing to check out.</p>
        <Link to="/shop" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Shop the market</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Checkout</h1>
      <p role="note" className="mt-3 rounded-2xl bg-butter/70 px-4 py-3 text-sm font-semibold text-plum">
        Real checkout, via the Store API: this creates a PENDING order, clears your basket on the
        server, and takes you to Stripe&apos;s hosted payment page. ORCHARD never asks for, sees or
        stores card details. Payment is only confirmed by Stripe&apos;s server-to-server webhook —
        returning from Stripe does not by itself prove payment.
      </p>

      {sessionStatus === 'ready' && !session && (
        <div role="alert" className="mt-4 rounded-2xl bg-paper p-5 dark:bg-white/5">
          <p className="font-semibold">Sign in to check out.</p>
          <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">Checkout requires an account on the backend. Your basket is kept — it is not linked to your account, so it stays exactly as it is after you sign in.</p>
          <Link to="/login?next=/checkout" className="mt-3 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Sign in</Link>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" aria-label="What happens next">
          <h2 className="font-serif text-2xl font-bold">What happens next</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-plum/80 dark:text-cream/80">
            <li>You confirm below. The server creates your order (PENDING) and clears this basket.</li>
            <li>You pay on Stripe&apos;s hosted page — card details go to Stripe, not to ORCHARD.</li>
            <li>Stripe tells the server the result via webhook; your order becomes PAID or FAILED.</li>
            <li>You return here and can check the real order status — never trust the return URL alone.</li>
          </ol>
          {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}
          {uncertain && (
            <Link to="/account/orders" className="mt-3 inline-block rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">Check my orders</Link>
          )}
          <button
            type="button"
            disabled={pending || !session}
            onClick={() => void startCheckout()}
            className="mt-6 w-full rounded-full bg-citrus py-3 font-semibold text-white hover:bg-citrusdark disabled:opacity-50"
          >
            {pending ? 'Creating your Stripe checkout…' : 'Continue to secure Stripe checkout'}
          </button>
          <p className="mt-2 text-xs text-plum/60 dark:text-cream/60">Only the basket total is sent to the server (via the basket id). ORCHARD never sends a price of its own — the server prices the order from its catalogue.</p>
        </section>

        <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" aria-label="Basket summary">
          <h2 className="font-serif text-2xl font-bold">Basket summary</h2>
          <ul className="mt-4 space-y-3">
            {lines.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center gap-3">
                <img src={product.image} alt={product.name} className="h-14 w-14 rounded-xl object-cover" />
                <span className="flex-1 text-sm"><strong>{product.name}</strong><br />{quantity} × {formatINR(product.price)}</span>
                <strong className="text-sm">{formatINR(product.price * quantity)}</strong>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-between border-t border-plum/10 pt-4 text-lg dark:border-white/10">
            <span>Total (server)</span>
            <strong>{formatINR(cartSubtotal)}</strong>
          </div>
        </section>
      </div>
    </main>
  )
}
