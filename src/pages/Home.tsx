import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CATEGORIES, fetchProducts } from '../lib/api'
import { CATEGORY_IMAGES } from '../lib/productImages'
import ProductCard, { ProductSkeleton } from '../components/ProductCard'

const BANNERS = [
  { title: 'Fresh Fruits & Vegetables', sub: 'Farm-fresh picks, every day', cta: 'Shop fresh', category: 1, bg: 'bg-green-600' },
  { title: 'Dairy, Bakery & More', sub: 'Milk, bread, butter — daily essentials', cta: 'Shop dairy', category: 3, bg: 'bg-fk' },
  { title: 'Pantry Staples', sub: 'Rice, atta, dal, oil — stock up', cta: 'Stock up', category: 6, bg: 'bg-orange-600' },
]

export default function Home() {
  const [banner, setBanner] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBanner((b) => (b + 1) % BANNERS.length), 5000)
    return () => clearInterval(t)
  }, [])
  const current = BANNERS[banner]

  const { data: products, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetchProducts(),
  })

  const section = (title: string, categoryId: number) => {
    const list = (products ?? []).filter((p) => p.categoryId === categoryId).slice(0, 4)
    if (!list.length) return null
    return (
      <section className="mt-6 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <Link to={`/shop?category=${categoryId}`} className="rounded-sm bg-fk px-4 py-1.5 text-xs font-bold text-white">VIEW ALL</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {list.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    )
  }

  return (
    <div>
      {/* Category strip, Flipkart-style */}
      <section className="rounded-lg bg-white px-4 py-3 shadow-sm">
        <div className="flex gap-6 overflow-x-auto">
          {CATEGORIES.map((c) => {
            const img = CATEGORY_IMAGES[c.name]
            return (
              <Link key={c.id} to={`/shop?category=${c.id}`} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
                {img ? (
                  <img src={img} alt={c.name} loading="lazy" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fk-light text-2xl">{c.emoji}</span>
                )}
                <span className="text-xs font-semibold">{c.name}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Rotating hero banner */}
      <section key={banner} className={`hero-fade mt-4 overflow-hidden rounded-lg ${current.bg} px-6 py-10 text-white md:px-10`}>
        <h1 className="max-w-xl text-3xl font-bold leading-tight md:text-4xl">{current.title}</h1>
        <p className="mt-2 text-white/90">{current.sub}</p>
        <Link to={`/shop?category=${current.category}`} className="mt-5 inline-block rounded-sm bg-white px-6 py-2.5 text-sm font-bold text-stone-900">
          {current.cta} →
        </Link>
        <div className="mt-6 flex gap-2">
          {BANNERS.map((_, i) => (
            <button key={i} onClick={() => setBanner(i)} aria-label={`Banner ${i + 1}`} className={`h-2 rounded-full transition-all ${i === banner ? 'w-8 bg-white' : 'w-2 bg-white/50'}`} />
          ))}
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Couldn't reach the backend. Is it running on localhost:8080? (Frontend dev server: localhost:4242, proxied — see README.)
        </p>
      )}
      {isLoading && (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
        </div>
      )}
      {section('Fresh picks — Fruits', 1)}
      {section('Vegetables', 2)}
      {section('Dairy essentials', 3)}
      {section('Snacks & more', 7)}
    </div>
  )
}
