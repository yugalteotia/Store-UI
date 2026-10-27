import { Link, useParams } from 'react-router-dom'
import { Minus, Plus, ShoppingBasket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import { ProductRepository } from '../domain/repositories'
import { categoryById } from '../api/categories'
import { getProduct } from '../api/services'
import { ApiError } from '../api/http'
import { formatINR } from '../domain/format'
import { ProductCard } from '../components/ProductCard'

export function ProductDetail() {
  const { productId } = useParams()
  const { products, productsStatus, addToCart } = useApp()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [detail, setDetail] = useState<typeof products[number] | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const numericId = Number(productId)
  const fromList = Number.isInteger(numericId) ? ProductRepository.getById(products, numericId) : undefined
  useEffect(() => {
    if (fromList || productsStatus !== 'ready' || !Number.isInteger(numericId)) return
    let cancelled = false
    getProduct(numericId)
      .then((p) => { if (!cancelled) setDetail(p) })
      .catch((err) => { if (!cancelled) setDetailError(err instanceof ApiError ? err.message : 'Could not load this product.') })
    return () => { cancelled = true }
  }, [fromList, productsStatus, numericId])
  const product = fromList ?? detail

  if (!product) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">{productsStatus === 'loading' && !detailError ? 'Loading product…' : 'Product not found'}</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">{detailError ?? 'That product isn\'t in the live catalogue — it may have been removed, or the backend may be down.'}</p>
        <Link to="/shop" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Back to shop</Link>
      </main>
    )
  }

  const cat = categoryById(product.categoryId)
  const related = ProductRepository.related(products, product)

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-plum/60 dark:text-cream/60">
        <Link to="/" className="hover:underline">Home</Link> /{' '}
        <Link to="/shop" className="hover:underline">Shop</Link> /{' '}
        {cat && <Link to={`/shop?categoryId=${cat.id}`} className="hover:underline">{cat.name}</Link>} /{' '}
        <span aria-current="page" className="text-plum dark:text-cream">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <img src={product.image} alt={product.name} className="aspect-[4/3] w-full rounded-[2rem] object-cover shadow-lift" />
        <div>
          {cat && <p className="text-sm font-semibold uppercase tracking-wide text-leaf dark:text-butter">{cat.name}</p>}
          <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">{product.name}</h1>
          {product.tagline && <p className="mt-2 font-serif text-xl text-citrusdark">{product.tagline}</p>}
          <p className="mt-4 text-lg text-plum/70 dark:text-cream/70">{product.description}</p>
          <p className="mt-6">
            <span className="font-serif text-4xl font-bold">{formatINR(product.price)}</span>
          </p>
          <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">Pack size is stated in the product name — the catalogue sends no separate unit, stock or rating.</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-plum/20 dark:border-white/20" role="group" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-3"><Minus size={16} aria-hidden /></button>
              <span aria-live="polite" className="w-10 text-center font-bold">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(1000, q + 1))} className="p-3"><Plus size={16} aria-hidden /></button>
            </div>
            <button
              type="button"
              onClick={async () => { setAddError(null); try { await addToCart(product.id, qty); setAdded(true) } catch (err) { setAddError(err instanceof Error ? err.message : 'Could not add to basket.') } }}
              className="flex items-center gap-2 rounded-full bg-citrus px-6 py-3 font-semibold text-white hover:bg-citrusdark"
            >
              <ShoppingBasket size={18} aria-hidden /> Add to basket
            </button>
            <Link to="/cart" className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20">View basket</Link>
          </div>
          {added && <p role="status" className="mt-3 rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold text-leafdark dark:text-butter">Added to your basket.</p>}
          {addError && <p role="alert" className="mt-3 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{addError}</p>}
          <p className="mt-6 rounded-2xl bg-peach/60 p-4 text-sm dark:bg-white/5">
            Live catalogue data: name, description and price come from the Store API. The photo is
            a local placeholder (the backend sends no image) and no stock, origin or freshness
            claims are made for this product.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-serif text-3xl font-bold">You may also like</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </main>
  )
}
