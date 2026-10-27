import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, Search, X } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { ProductRepository, type SortKey } from '../domain/repositories'
import { CATEGORIES } from '../api/categories'
import { ProductCard } from '../components/ProductCard'

const PAGE_SIZE = 12

export function Shop() {
  const { products, productsStatus, productsError, reloadProducts } = useApp()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const categoryId = params.get('categoryId') ?? 'all'
  const [sort, setSort] = useState<SortKey>('default')
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => setPage(1), [search, categoryId, sort])

  const results = useMemo(
    () => ProductRepository.filterSort(products, { search, categoryId, sort }),
    [products, search, categoryId, sort],
  )
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = results.slice(0, safePage * PAGE_SIZE)
  const activeFilters = [
    ...(search ? [`Search: “${search}”`] : []),
    ...(categoryId !== 'all' ? [`Category: ${CATEGORIES.find((c) => String(c.id) === categoryId)?.name ?? categoryId}`] : []),
  ]

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next)
  }
  const reset = () => {
    setParams(new URLSearchParams())
    setSort('default')
  }

  const filters = (
    <div className="space-y-5">
      <div>
        <label htmlFor="shop-search" className="text-sm font-semibold">Search</label>
        <div className="mt-2 flex gap-2">
          <input
            id="shop-search"
            defaultValue={search}
            key={search}
            placeholder="Apples, spinach, dal…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setQuery({ search: (e.target as HTMLInputElement).value })
            }}
            className="w-full rounded-full border border-plum/20 bg-paper px-4 py-2 text-sm dark:border-white/20 dark:bg-white/10"
          />
          <button type="button" aria-label="Search" onClick={() => {
            const el = document.getElementById('shop-search') as HTMLInputElement | null
            setQuery({ search: el?.value ?? '' })
          }} className="rounded-full bg-citrus px-4 py-2 text-white">
            <Search size={16} aria-hidden />
          </button>
        </div>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Category</legend>
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="category" checked={categoryId === 'all'} onChange={() => setQuery({ categoryId: null })} /> All categories
          </label>
          {CATEGORIES.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="category" checked={categoryId === String(c.id)} onChange={() => setQuery({ categoryId: String(c.id) })} /> {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="shop-sort" className="text-sm font-semibold">Sort by</label>
        <select
          id="shop-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="mt-2 w-full rounded-full border border-plum/20 bg-paper px-4 py-2 text-sm dark:border-white/20 dark:bg-white/10"
        >
          <option value="default">Catalogue order</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
      </div>
      {(search || categoryId !== 'all' || sort !== 'default') && (
        <button type="button" onClick={reset} className="rounded-full border border-plum/20 px-4 py-2 text-sm font-semibold dark:border-white/20">
          Reset filters
        </button>
      )}
    </div>
  )

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold sm:text-5xl">Shop the market</h1>
      <p className="mt-2 text-plum/60 dark:text-cream/60">Live catalogue from the Store API. Search and sorting run over the loaded list — the backend itself has no search, sort or pagination. Prices are in INR.</p>
      {productsStatus === 'loading' && <p role="status" className="mt-6 rounded-3xl bg-paper p-6 dark:bg-white/5">Loading the market…</p>}
      {productsStatus === 'error' && (
        <div role="alert" className="mt-6 rounded-3xl bg-paper p-6 dark:bg-white/5">
          <p className="font-semibold">Couldn&apos;t load the catalogue.</p>
          <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">{productsError} The backend may be down — nothing here is a cached or mock substitute.</p>
          <button type="button" onClick={() => void reloadProducts()} className="mt-4 rounded-full bg-plum px-6 py-3 font-semibold text-cream">Retry</button>
        </div>
      )}

      <div className="mt-6 flex gap-2 lg:hidden">
        <button type="button" onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-cream">
          <Filter size={16} aria-hidden /> Filters
        </button>
        {activeFilters.length > 0 && <button type="button" onClick={reset} className="rounded-full border px-4 py-2 text-sm">Clear all</button>}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block rounded-3xl bg-paper p-5 shadow-card dark:bg-white/5" aria-label="Filters">
          {filters}
        </aside>

        <section aria-label="Products">
          <p role="status" className="text-sm font-semibold">
            {results.length} result{results.length === 1 ? '' : 's'}
            {activeFilters.length > 0 && ` — ${activeFilters.join(' · ')}`}
          </p>
          {activeFilters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeFilters.map((f) => <span key={f} className="rounded-full bg-peach px-3 py-1 text-xs font-semibold dark:bg-white/10">{f}</span>)}
              <button type="button" onClick={reset} className="text-xs font-semibold underline">Reset filters</button>
            </div>
          )}

          {productsStatus === 'error' ? null : results.length === 0 ? (
            <div className="mt-6 rounded-3xl bg-paper p-10 text-center shadow-card dark:bg-white/5">
              <h2 className="font-serif text-2xl font-bold">Nothing matched that search.</h2>
              <p className="mt-2 text-plum/60 dark:text-cream/60">Try a different word, or browse a category instead.</p>
              <button type="button" onClick={reset} className="mt-5 rounded-full bg-plum px-6 py-3 font-semibold text-cream">Reset filters</button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
              {safePage < pageCount && (
                <div className="mt-8 text-center">
                  <button type="button" onClick={() => setPage((p) => p + 1)} className="rounded-full bg-plum px-8 py-3 font-semibold text-cream">
                    Load more ({results.length - visible.length} remaining)
                  </button>
                </div>
              )}
              <div className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === safePage ? 'page' : undefined}
                    onClick={() => setPage(n)}
                    className={`h-10 w-10 rounded-full text-sm font-semibold ${n === safePage ? 'bg-citrus text-white' : 'border border-plum/20 dark:border-white/20'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {drawerOpen && (
        <div role="dialog" aria-modal="true" aria-label="Filters" className="fixed inset-0 z-50 bg-plum/60 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-cream p-6 dark:bg-plumdeep" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold">Filters</h2>
              <button type="button" aria-label="Close filters" onClick={() => setDrawerOpen(false)} className="rounded-full border p-2"><X size={18} aria-hidden /></button>
            </div>
            <div className="mt-4">{filters}</div>
            <button type="button" onClick={() => setDrawerOpen(false)} className="mt-6 w-full rounded-full bg-plum py-3 font-semibold text-cream">Show results</button>
          </div>
        </div>
      )}
    </main>
  )
}
