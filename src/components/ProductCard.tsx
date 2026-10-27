import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Product } from '../domain/types'
import { formatINR } from '../domain/format'
import { useState } from 'react'
import { categoryById } from '../api/categories'
import { useApp } from '../state/AppContext'

export function ProductCard({ product }: { product: Product }) {
  // Deliberately NOT disabled while a background sync is in flight:
  // addToCart is optimistic, so the user can keep shopping instantly.
  // A failed sync surfaces via cartError (Header banner / Cart page).
  const { addToCart } = useApp()
  const [error, setError] = useState<string | null>(null)
  const cat = categoryById(product.categoryId)
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
          <button
            type="button"
            onClick={async () => {
              setError(null)
              try {
                await addToCart(product.id, 1)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add to basket.')
              }
            }}
            aria-label={`Add ${product.name} to basket`}
            className="flex items-center gap-1 rounded-full bg-citrus px-4 py-2 text-sm font-semibold text-white transition hover:bg-citrusdark active:scale-95 disabled:opacity-50"
          >
            <Plus size={16} aria-hidden /> Add
          </button>
        </div>
        {error && <p role="alert" className="pt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </div>
    </article>
  )
}
