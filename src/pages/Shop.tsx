import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CATEGORIES, fetchProducts } from '../lib/api'
import ProductCard, { ProductSkeleton } from '../components/ProductCard'

// The backend has no search / pagination / sort endpoint yet, so search
// and sort are client-side over the (category-filtered) server response.
// With keepPreviousData, switching categories keeps the old grid visible
// with skeletons only on the very first load — no blank flash.
export default function Shop() {
  const [params, setParams] = useSearchParams()
  const categoryId = params.get('category') ? Number(params.get('category')) : undefined
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [sort, setSort] = useState<'name' | 'price-asc' | 'price-desc'>('name')

  useEffect(() => {
    setSearch(params.get('search') ?? '')
  }, [params])

  const { data: products, isLoading, isFetching, error } = useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => fetchProducts(categoryId),
  })

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (products ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    )
    return [...list].sort((a, b) =>
      sort === 'price-asc' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : a.name.localeCompare(b.name),
    )
  }, [products, search, sort])

  const goCategory = (id?: number) => {
    const next: Record<string, string> = {}
    if (id) next.category = String(id)
    if (search) next.search = search
    setParams(next)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Flipkart-style left filter panel */}
      <aside className="w-full shrink-0 rounded-lg bg-white p-4 shadow-sm lg:w-60">
        <h2 className="text-sm font-bold uppercase tracking-wide">Filters</h2>
        <p className="mt-4 text-xs font-bold uppercase text-stone-500">Category</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <button onClick={() => goCategory(undefined)} className={!categoryId ? 'font-bold text-fk' : 'hover:text-fk'}>All categories</button>
          </li>
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <button onClick={() => goCategory(c.id)} className={categoryId === c.id ? 'font-bold text-fk' : 'hover:text-fk'}>
                {c.emoji} {c.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs font-bold uppercase text-stone-500">Sort by</p>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="mt-2 w-full rounded-sm border bg-white px-3 py-2 text-sm">
          <option value="name">Name</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in this category… (client-side for now)"
            className="flex-1 rounded-sm border bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-fk"
          />
          {isFetching && !isLoading && <span className="text-xs text-stone-400">Updating…</span>}
        </div>
        <p className="mt-3 text-sm text-stone-500">
          {visible.length} result{visible.length === 1 ? '' : 's'}
          {categoryId ? ` in ${CATEGORIES.find((c) => c.id === categoryId)?.name}` : ''}
          {search ? ` for “${search}”` : ''}
        </p>
        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Couldn't reach the backend on localhost:8080.</p>}
        {isLoading ? (
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {visible.length === 0 && !error && <p className="mt-6 text-stone-500">No products match. Try another search or category.</p>}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
