import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { CartRepository } from '../domain/repositories'
import { formatINR } from '../domain/format'

export function CartPage() {
  const { cart, products, setCartQuantity, removeFromCart, clearCart, cartSubtotal, cartStatus, cartError, refreshCart } = useApp()
  const [opError, setOpError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => { setOpError(null); try { await fn() } catch (err) { setOpError(err instanceof Error ? err.message : 'Basket update failed.') } }
  const [confirmClear, setConfirmClear] = useState(false)
  const lines = CartRepository.detailed(cart, products)

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Your basket is empty</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">Fill it with something colourful.</p>
        <Link to="/shop" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Return to shopping</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Your basket</h1>
      {cartStatus === 'loading' && <p role="status" className="mt-4 text-sm">Loading your basket…</p>}
      {(cartError || opError) && (
        <div role="alert" className="mt-4 rounded-2xl bg-paper p-4 text-sm dark:bg-white/5">
          <p className="font-semibold">Basket update failed: {cartError ?? opError}</p>
          <button type="button" onClick={() => void refreshCart()} className="mt-2 font-semibold underline">Retry loading the basket</button>
        </div>
      )}
      <ul className="mt-8 space-y-4">
        {lines.map(({ product, quantity }) => (
          <li key={product.id} className="flex flex-col gap-4 rounded-3xl bg-paper p-4 shadow-card sm:flex-row sm:items-center dark:bg-white/5">
            <Link to={`/products/${product.id}`} className="flex flex-1 items-center gap-4">
              <img src={product.image} alt={product.name} className="h-20 w-20 rounded-2xl object-cover" />
              <span>
                <span className="block font-serif text-lg font-bold">{product.name}</span>
                <span className="text-sm text-plum/60 dark:text-cream/60">{formatINR(product.price)}</span>
              </span>
            </Link>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <div className="flex items-center rounded-full border border-plum/20 dark:border-white/20" role="group" aria-label={`Quantity for ${product.name}`}>
                <button type="button" aria-label="Decrease quantity" onClick={() => void run(() => setCartQuantity(product.id, quantity - 1))} className="p-2"><Minus size={16} aria-hidden /></button>
                <span className="w-10 text-center font-bold">{quantity}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => void run(() => setCartQuantity(product.id, quantity + 1))} className="p-2"><Plus size={16} aria-hidden /></button>
              </div>
              <span className="w-24 text-right font-bold">{formatINR(product.price * quantity)}</span>
              <button type="button" aria-label={`Remove ${product.name}`} onClick={() => void run(() => removeFromCart(product.id))} className="rounded-full border border-plum/20 p-2 text-red-700 dark:border-white/20 dark:text-red-300">
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
        <div className="flex justify-between text-lg">
          <span>Subtotal</span>
          <strong>{formatINR(cartSubtotal)}</strong>
        </div>
        <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">Server total from the Store API — no delivery fee, tax or discount is applied by the backend.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/checkout" className="rounded-full bg-citrus px-8 py-3 font-semibold text-white hover:bg-citrusdark">Go to checkout</Link>
          {!confirmClear ? (
            <button type="button" onClick={() => setConfirmClear(true)} className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">Clear basket</button>
          ) : (
            <span className="flex items-center gap-2" role="alert">
              <span className="text-sm font-semibold">Clear everything?</span>
              <button type="button" onClick={() => { void run(async () => { await clearCart(); setConfirmClear(false) }) }} className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white">Yes, clear</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-full border px-4 py-2 text-sm">Keep it</button>
            </span>
          )}
        </div>
      </div>
    </main>
  )
}
