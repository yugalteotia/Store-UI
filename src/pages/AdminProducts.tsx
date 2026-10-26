import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CATEGORIES, createProduct, deleteProduct, fetchProducts, inr, updateProduct, type Product } from '../lib/api'
import { useAuth } from '../lib/auth'

const inputCls = 'w-full rounded-xl border bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-leaf-500'

export default function AdminProducts() {
  const { role } = useAuth()
  const queryClient = useQueryClient()
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: () => fetchProducts() })
  const [editing, setEditing] = useState<Product | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState(1)
  const [error, setError] = useState('')

  if (role !== 'ADMIN') {
    return <p className="text-red-700">Admin only. New registrations are USER by default — an admin account must be promoted in the backend DB.</p>
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['products'] })
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const body = { name, description, price: Number(price), categoryId }
    try {
      if (editing) await updateProduct(editing.id, body)
      else await createProduct(body)
      setEditing(null); setName(''); setDescription(''); setPrice(''); setCategoryId(1)
      refresh()
    } catch {
      setError('Save failed. Check the category and that your token still has the ADMIN role.')
    }
  }
  const startEdit = (p: Product) => {
    setEditing(p); setName(p.name); setDescription(p.description); setPrice(String(p.price)); setCategoryId(p.categoryId)
  }
  const remove = async (id: number) => {
    if (!confirm('Delete this product?')) return
    await deleteProduct(id)
    refresh()
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">Admin: Products</h1>
      <form onSubmit={save} className="mt-6 space-y-4 rounded-3xl border bg-white p-6">
        <h2 className="font-bold">{editing ? `Edit #${editing.id}` : 'Add product'}</h2>
        <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (include pack size, e.g. 1 kg — the API has no separate field)" />
        <input className={inputCls} required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <div className="flex gap-3">
          <input className={inputCls} required type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (₹)" />
          <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button className="rounded-full bg-fk px-6 py-2.5 font-semibold text-white">{editing ? 'Update' : 'Create'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setName(''); setDescription(''); setPrice('') }} className="rounded-full border px-6 py-2.5">Cancel</button>}
        </div>
      </form>
      {isLoading && <p className="mt-6 text-stone-500">Loading…</p>}
      <div className="mt-6 space-y-3">
        {products?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4">
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-sm text-stone-500">{inr(p.price)} • Category {p.categoryId}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(p)} className="rounded-full border px-4 py-1.5 text-sm">Edit</button>
              <button onClick={() => remove(p.id)} className="rounded-full border border-red-200 px-4 py-1.5 text-sm text-red-600">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
