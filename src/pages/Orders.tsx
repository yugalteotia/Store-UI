import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder, fetchOrders, inr } from '../lib/api'

const badge: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-stone-200 text-stone-700',
}

export function Orders() {
  const { data: orders, isLoading, error } = useQuery({ queryKey: ['orders'], queryFn: fetchOrders })
  if (isLoading) return <p className="text-stone-500">Loading orders…</p>
  if (error) return <p className="text-red-700">Couldn't load orders. Are you logged in?</p>
  if (!orders?.length) return <p className="text-stone-500">No orders yet. <Link to="/shop" className="text-fk underline">Shop now</Link></p>
  return (
    <div>
      <h1 className="text-3xl font-bold">My orders</h1>
      <p className="mt-1 text-sm text-stone-500">Status here is the payment status from the backend (PENDING / PAID / FAILED / CANCELLED) — not a delivery status.</p>
      <div className="mt-6 space-y-4">
        {orders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="font-bold">Order #{o.id}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge[o.status] ?? ''}`}>{o.status}</span>
            </div>
            <p className="mt-1 text-sm text-stone-500">{new Date(o.createdAt).toLocaleString('en-IN')} • {o.items.length} item(s) • {inr(o.totalPrice)}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export function OrderDetail() {
  const { id } = useParams()
  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(Number(id)),
    enabled: !!id,
  })
  if (isLoading) return <p className="text-stone-500">Loading order…</p>
  if (error || !order) return <p className="text-red-700">Order not found, or it belongs to another user.</p>
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/orders" className="text-sm text-fk hover:underline">← All orders</Link>
      <h1 className="mt-2 text-3xl font-bold">Order #{order.id}</h1>
      <p className="mt-1 text-stone-500">{new Date(order.createdAt).toLocaleString('en-IN')} • <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[order.status] ?? ''}`}>{order.status}</span></p>
      <div className="mt-6 rounded-3xl border bg-white p-6">
        <ul className="divide-y">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between py-3">
              <span>{item.product.name} × {item.quantity}</span>
              <span className="font-semibold">{inr(item.totalPrice)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between text-lg font-bold"><span>Total</span><span>{inr(order.totalPrice)}</span></div>
      </div>
    </div>
  )
}
