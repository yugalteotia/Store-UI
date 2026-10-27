import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { productSchema, type ProductForm } from './schemas'
import { useApp } from '../state/AppContext'
import { CATEGORIES } from '../api/categories'
import { createProduct as apiCreate, deleteProduct as apiDelete, updateProduct as apiUpdate } from '../api/services'
import { ApiError } from '../api/http'
import { formatINR } from '../domain/format'

const inputCls = 'w-full rounded-2xl border border-plum/20 bg-paper px-4 py-2.5 text-plum dark:border-white/20 dark:bg-white/10 dark:text-cream'
const tabCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold ${isActive ? 'bg-plum text-cream' : 'border border-plum/20 dark:border-white/20'}`

function AdminBanner() {
  const { session, isAdminHint } = useApp()
  if (!session) {
    return (
      <p role="note" className="mt-3 rounded-2xl bg-butter/70 px-4 py-3 text-sm font-semibold text-plum">
        Product management is ADMIN-only on the backend (POST/PUT/DELETE /products return 403 for
        regular customers). Sign in with an admin account to use these forms. The backend — not
        this page — enforces that rule.
      </p>
    )
  }
  if (!isAdminHint) {
    return (
      <p role="note" className="mt-3 rounded-2xl bg-butter/70 px-4 py-3 text-sm font-semibold text-plum">
        You are signed in, but the admin check did not confirm admin access for this account, so
        these forms are disabled. If you are an admin, the backend will still accept your changes;
        otherwise it will return 403. (ORCHARD cannot read your role from /auth/me — it returns
        only id, name and email — so this banner is a hint from GET /admin/hello, not security.)
      </p>
    )
  }
  return (
    <p role="note" className="mt-3 rounded-2xl bg-butter/70 px-4 py-3 text-sm font-semibold text-plum">
      Admin workspace: changes go straight to the live catalogue via POST/PUT/DELETE /products.
      There is no inventory, supplier, delivery or analytics module — the backend has none.
    </p>
  )
}

export function ManageHome() {
  const { products } = useApp()
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Manage the market</h1>
      <AdminBanner />
      <nav className="mt-6 flex gap-2">
        <NavLink to="/manage/products" className={tabCls}>Product list</NavLink>
        <NavLink to="/manage/products/new" className={tabCls}>Add product</NavLink>
      </nav>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
          <p className="font-serif text-3xl font-bold">{products.length}</p>
          <p className="text-sm text-plum/60 dark:text-cream/60">Products in the live catalogue</p>
        </section>
        <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
          <p className="font-serif text-3xl font-bold">{CATEGORIES.length}</p>
          <p className="text-sm text-plum/60 dark:text-cream/60">Seed categories (no category endpoint exists)</p>
        </section>
        <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
          <p className="font-serif text-3xl font-bold">{products.filter((x) => x.categoryId === 1).length}</p>
          <p className="text-sm text-plum/60 dark:text-cream/60">Products in the Fruits category</p>
        </section>
      </div>
      <Link to="/manage/products" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Open product list</Link>
    </main>
  )
}

export function ManageProducts() {
  const { products, reloadProducts, session, isAdminHint } = useApp()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'price-asc' | 'price-desc'>('name')
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const out = products.filter((p) => query === '' || p.name.toLowerCase().includes(query))
    return [...out].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'price-asc' ? a.price - b.price : b.price - a.price,
    )
  }, [products, q, sort])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Products</h1>
      <AdminBanner />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label htmlFor="manage-search" className="sr-only">Search products</label>
        <div className="flex flex-1 items-center gap-2">
          <Search size={18} aria-hidden />
          <input id="manage-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className={`${inputCls} max-w-sm`} />
        </div>
        <label htmlFor="manage-sort" className="sr-only">Sort products</label>
        <select id="manage-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-full border border-plum/20 bg-paper px-4 py-2 text-sm dark:border-white/20 dark:bg-white/10">
          <option value="name">Name A–Z</option>
          <option value="price-asc">Price low to high</option>
          <option value="price-desc">Price high to low</option>
        </select>
        <Link to="/manage/products/new" className="flex items-center gap-1 rounded-full bg-citrus px-5 py-2.5 font-semibold text-white"><Plus size={16} aria-hidden /> Add product</Link>
      </div>
      {msg && <p role="status" className="mt-4 rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">{msg}</p>}
      {err && <p role="alert" className="mt-4 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{err}</p>}
      {!session && <p className="mt-4 text-sm">Sign in with an admin account to delete products.</p>}
      {results.length === 0 ? (
        <div className="mt-6 rounded-3xl bg-paper p-10 text-center shadow-card dark:bg-white/5">
          <p className="font-serif text-2xl font-bold">No products match that search.</p>
          <button type="button" onClick={() => setQ('')} className="mt-4 rounded-full bg-plum px-6 py-3 font-semibold text-cream">Clear search</button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {results.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-3xl bg-paper p-4 shadow-card sm:flex-row sm:items-center dark:bg-white/5">
              <Link to={`/products/${p.id}`} className="flex flex-1 items-center gap-3">
                <img src={p.image} alt={p.name} className="h-16 w-16 rounded-2xl object-cover" />
                <span><span className="block font-serif font-bold">{p.name}</span><span className="text-sm text-plum/60 dark:text-cream/60">{formatINR(p.price)}</span></span>
              </Link>
              <span className="flex gap-2">
                <Link to={`/manage/products/${p.id}/edit`} aria-label={`Edit ${p.name}`} className="rounded-full border border-plum/20 p-2 dark:border-white/20"><Pencil size={18} aria-hidden /></Link>
                {pendingDelete === p.id ? (
                  <span className="flex items-center gap-2" role="alert">
                    <span className="text-sm font-semibold">Delete?</span>
                    <button type="button" disabled={!isAdminHint} onClick={async () => { setErr(''); try { await apiDelete(p.id); await reloadProducts(); setPendingDelete(null); setMsg(`${p.name} was deleted from the live catalogue.`) } catch (e) { setErr(e instanceof ApiError && e.kind === 'authz' ? 'The backend refused this delete (403): this account is not an admin.' : e instanceof Error ? e.message : 'Delete failed.') } }} className="rounded-full bg-red-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">Yes</button>
                    <button type="button" onClick={() => setPendingDelete(null)} className="rounded-full border px-3 py-1 text-sm">No</button>
                  </span>
                ) : (
                  <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setPendingDelete(p.id)} className="rounded-full border border-plum/20 p-2 text-red-700 dark:border-white/20 dark:text-red-300"><Trash2 size={18} aria-hidden /></button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function ProductFormInner({ initial, onSaved, disabled }: { initial?: ProductForm; onSaved: (data: ProductForm) => Promise<void> | void; disabled?: boolean }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? { name: '', description: '', price: 0, categoryId: CATEGORIES[0].id },
  })
  return (
    <form onSubmit={handleSubmit(onSaved)} className="max-w-2xl space-y-5 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" noValidate>
      <div>
        <label htmlFor="pf-name" className="text-sm font-semibold">Name</label>
        <input id="pf-name" {...register('name')} className={`${inputCls} mt-1`} />
        {errors.name && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="pf-desc" className="text-sm font-semibold">Description</label>
        <textarea id="pf-desc" {...register('description')} rows={3} className={`${inputCls} mt-1`} />
        {errors.description && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.description.message}</p>}
      </div>
      <div>
        <label htmlFor="pf-price" className="text-sm font-semibold">Price (INR)</label>
        <input id="pf-price" type="number" step="0.01" {...register('price', { valueAsNumber: true })} className={`${inputCls} mt-1`} />
        {errors.price && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.price.message}</p>}
      </div>
      <div>
        <label htmlFor="pf-cat" className="text-sm font-semibold">Category</label>
        <select id="pf-cat" {...register('categoryId', { valueAsNumber: true })} className={`${inputCls} mt-1`}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.categoryId && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.categoryId.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting || disabled} className="rounded-full bg-plum px-8 py-3 font-semibold text-cream disabled:opacity-50">Save product</button>
      {disabled && <p className="text-sm text-plum/60 dark:text-cream/60">Saving is disabled: admin access was not confirmed for this account (see the banner above).</p>}
    </form>
  )
}

export function ManageProductNew() {
  const { isAdminHint, reloadProducts } = useApp()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Add product</h1>
      <AdminBanner />
      <div className="mt-6">
        {msg && <p role="status" className="mb-4 rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">{msg}</p>}
        {err && <p role="alert" className="mb-4 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{err}</p>}
        <p className="mb-4 text-sm text-plum/60 dark:text-cream/60">The backend stores only name, description, price and category. No image is uploaded — the shop will show the local placeholder for the product name, or its category photo.</p>
        <ProductFormInner
          disabled={!isAdminHint}
          onSaved={async (data) => {
            setErr('')
            try {
              const created = await apiCreate(data)
              await reloadProducts()
              setMsg(`“${data.name}” was added to the live catalogue.`)
              setTimeout(() => navigate(`/products/${created.id}`), 500)
            } catch (e) {
              setErr(e instanceof ApiError && e.kind === 'authz' ? 'The backend refused this create (403): this account is not an admin.' : e instanceof Error ? e.message : 'Create failed.')
            }
          }}
        />
      </div>
    </main>
  )
}

export function ManageProductEdit() {
  const { productId } = useParams()
  const { products, isAdminHint, reloadProducts } = useApp()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const product = products.find((p) => p.id === Number(productId))
  if (!product) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Product not found</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">That product isn&apos;t in the live catalogue, so it can&apos;t be edited.</p>
        <Link to="/manage/products" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Back to products</Link>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">Edit: {product.name}</h1>
      <AdminBanner />
      <div className="mt-6">
        {msg && <p role="status" className="mb-4 rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">{msg}</p>}
        {err && <p role="alert" className="mb-4 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{err}</p>}
        <ProductFormInner
          disabled={!isAdminHint}
          initial={{ name: product.name, description: product.description, price: product.price, categoryId: product.categoryId }}
          onSaved={async (data) => {
            setErr('')
            try {
              await apiUpdate(product.id, data)
              await reloadProducts()
              setMsg('Changes saved to the live catalogue. (PUT returns 204 with no body, so the shop list was reloaded to confirm.)')
              setTimeout(() => navigate(`/products/${product.id}`), 500)
            } catch (e) {
              setErr(e instanceof ApiError && e.kind === 'authz' ? 'The backend refused this update (403): this account is not an admin.' : e instanceof Error ? e.message : 'Update failed.')
            }
          }}
        />
      </div>
    </main>
  )
}
