import { Link } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'
import type { Product } from '../domain/types'
import { formatINR } from '../domain/format'
import { useState } from 'react'
import { categoryById } from '../api/categories'
import { useApp } from '../state/AppContext'

export function ProductCard({ product }: { product: Product }) {
  // Deliberately NOT disabled while a background sync is in flight:
  // addToCart is optimistic, so the user can keep shopping instantly.
  // A failed sync surfaces via cartError (Header banner / Cart page).
  // The button itself gives instant feedback: since cart state updates
  // optimistically, the Add button flips to a stepper the moment it is
  // tapped, and the quantity pulses on every tap.
  const { cart, addToCart, setCartQuantity } = useApp()
  const [error, setError] = useState<string | null>(null)
  const cat = categoryById(product.categoryId)
  const qty = cart.find((l) => l.productId === product.id)?.quantity ?? 0

  const handleAdd = () => {
    setError(null)
    void addToCart(product.id, 1).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not add to basket.')
    })
  }
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-paper shadow-card transition hover:shadow-lift dark:bg-white/5">
      <Link to={`/products/${product.id}`} className="block overflow-hidden" aria-label={`View ${product.name}`}>
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {cat && <p className="text-xs font-semibold uppercase tracking-wide text-leaf dark:text-butter">{cat.name}</p>}
        <h3 className="mt-1 font-serif text-lg font-bold leading-snug">
          <Link to={`/products/${product.id}`} className="hover:underline">{product.name}</Link>
        </h3>
        {product.tagline && <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">{product.tagline}</p>}
        <p className="mt-2 text-sm text-plum/70 dark:text-cream/70 line-clamp-2">{product.description}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <p>
            <span className="text-lg font-bold">{formatINR(product.price)}</span>
          </p>
          {qty === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Add ${product.name} to basket`}
              className="flex items-center gap-1 rounded-full bg-citrus px-4 py-2 text-sm font-semibold text-white transition hover:bg-citrusdark active:scale-95"
            >
              <Plus size={16} aria-hidden /> Add
            </button>
          ) : (
            <div
              className="flex items-center rounded-full bg-citrus text-sm font-semibold text-white"
              role="group"
              aria-label={`${product.name} quantity in basket`}
            >
              <button
                type="button"
                aria-label={`Remove one ${product.name} from basket`}
                onClick={() => {
                  setError(null)
                  void setCartQuantity(product.id, qty - 1).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Could not update basket.')
                  })
                }}
                className="p-2 pl-3 transition hover:opacity-80 active:scale-90"
              >
                <Minus size={16} aria-hidden />
              </button>
              <span key={qty} className="basket-pop w-7 text-center" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label={`Add one more ${product.name} to basket`}
                onClick={handleAdd}
                className="p-2 pr-3 transition hover:opacity-80 active:scale-90"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          )}
        </div>
        {error && <p role="alert" className="pt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </article>
  )
}
