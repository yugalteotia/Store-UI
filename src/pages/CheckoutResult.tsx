import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchOrder, inr } from '../lib/api'

export function CheckoutSuccess() {
  const [params] = useSearchParams()
  const orderId = Number(params.get('orderId'))
  // Poll while PENDING: the Stripe webhook updates the order to PAID
  // asynchronously, so a single fetch right after redirect often still
  // shows PENDING.
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrder(orderId),
    enabled: !!orderId,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' ? 3000 : false,
  })

  if (!orderId) return <p>Missing order id.</p>
  if (isLoading) return <p className="text-stone-500">Confirming your payment…</p>
  if (!order) return <p className="text-red-700">Order not found. It may belong to another account.</p>

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border bg-white p-8">
      <h1 className="text-3xl font-bold">Thank you! 🎉</h1>
      <p className="mt-2 text-stone-600">
        Order #{order.id} — payment status: <strong>{order.status}</strong>
        {order.status === 'PENDING' && ' (still confirming with Stripe — this page refreshes automatically)'}
      </p>
      <ul className="mt-6 divide-y">
        {order.items.map((item, i) => (
          <li key={i} className="flex justify-between py-3">
            <span>{item.product.name} × {item.quantity}</span>
            <span className="font-semibold">{inr(item.totalPrice)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-between text-lg font-bold">
        <span>Total</span>
        <span>{inr(order.totalPrice)}</span>
      </div>
      <Link to="/orders" className="mt-6 inline-block rounded-full bg-fk px-6 py-3 font-semibold text-white">View my orders</Link>
    </div>
  )
}

export function CheckoutCancel() {
  return (
    <div className="mx-auto max-w-md rounded-3xl border bg-white p-8 text-center">
      <h1 className="text-2xl font-bold">Checkout cancelled</h1>
      <p className="mt-2 text-stone-500">
        No payment was completed. Note: the backend clears the cart when it creates the Stripe session,
        so a cancelled checkout means re-adding items — that's current backend behaviour, not a UI bug.
      </p>
      <Link to="/shop" className="mt-6 inline-block rounded-full bg-fk px-6 py-3 font-semibold text-white">Back to shop</Link>
    </div>
  )
}
