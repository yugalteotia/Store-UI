import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkout, inr } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'

export default function Checkout() {
  const { cart, clearLocalCartId } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = cart?.items ?? []

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">Login to checkout</h1>
        <p className="mt-2 text-stone-500">Your cart is saved. Login, then come back to pay with Stripe.</p>
        <button onClick={() => navigate('/login?next=/checkout')} className="mt-6 rounded-full bg-fk px-6 py-3 font-semibold text-white">
          Login
        </button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border bg-white p-8 text-center">
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-stone-500">Add something from the shop first.</p>
        <button onClick={() => navigate('/shop')} className="mt-6 rounded-full bg-fk px-6 py-3 font-semibold text-white">Shop now</button>
      </div>
    )
  }

  const pay = async () => {
    if (!cart) return
    setBusy(true)
    setError('')
    try {
      // Backend creates the order (PENDING), clears the cart, and
      // returns the Stripe hosted checkout URL. Payment itself happens
      // on Stripe, not in this app.
      const res = await checkout(cart.id)
      clearLocalCartId()
      window.location.href = res.checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Review & pay</h1>
      <p className="mt-1 text-stone-500">Ordering as {user.name} ({user.email})</p>
      <div className="mt-6 rounded-3xl border bg-white p-6">
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.product.id} className="flex justify-between py-3">
              <span>{item.product.name} × {item.quantity}</span>
              <span className="font-semibold">{inr(item.totalPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>{inr(cart?.totalPrice ?? 0)}</span>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <button onClick={pay} disabled={busy} className="mt-6 w-full rounded-full bg-fk py-3 font-semibold text-white hover:bg-fk-dark disabled:opacity-50">
          {busy ? 'Creating Stripe session…' : 'Pay with Stripe'}
        </button>
        <p className="mt-3 text-center text-xs text-stone-400">
          You will return to /checkout-success or /checkout-cancel. The order stays PENDING until Stripe's webhook confirms payment.
        </p>
      </div>
    </div>
  )
}
