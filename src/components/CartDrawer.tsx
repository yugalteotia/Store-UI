import { Link, useNavigate } from 'react-router-dom'
import { inr } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'

export default function CartDrawer() {
  const { cart, drawerOpen, setDrawerOpen, setQuantity, remove, clear } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!drawerOpen) return null
  const items = cart?.items ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
      <aside className="drawer-in relative flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-bold">Your cart</h2>
          <button onClick={() => setDrawerOpen(false)} className="rounded-full border px-3 py-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-stone-500">Your cart is empty. Add some fresh picks from the shop.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={item.product.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.product.name}</p>
                    <p className="text-sm text-stone-500">{inr(item.product.price)} each</p>
                    <button onClick={() => remove(item.product.id)} className="text-sm text-red-600 hover:underline">Remove</button>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setQuantity(item.product.id, item.quantity - 1)} className="h-7 w-7 rounded-full border font-bold">−</button>
                      <span className="w-6 text-center font-semibold">{item.quantity}</span>
                      <button onClick={() => setQuantity(item.product.id, item.quantity + 1)} className="h-7 w-7 rounded-full bg-fk font-bold text-white">+</button>
                    </div>
                    <p className="mt-1 font-semibold">{inr(item.totalPrice)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <div className="space-y-3 border-t px-5 py-4">
            <div className="flex justify-between font-bold">
              <span>Subtotal</span>
              <span>{inr(cart?.totalPrice ?? 0)}</span>
            </div>
            <p className="text-xs text-stone-500">Delivery and taxes are handled at Stripe checkout as configured in the backend.</p>
            <button
              onClick={() => {
                setDrawerOpen(false)
                if (!user) navigate('/login?next=/checkout')
                else navigate('/checkout')
              }}
              className="w-full rounded-sm bg-saffron py-3 font-bold text-white hover:bg-saffron-dark"
            >
              {user ? 'Review & pay' : 'Login to checkout'}
            </button>
            <button onClick={() => clear()} className="w-full rounded-full border py-2 text-sm hover:bg-stone-100">
              Clear cart
            </button>
            <Link to="/shop" onClick={() => setDrawerOpen(false)} className="block text-center text-sm text-fk hover:underline">
              Continue shopping
            </Link>
          </div>
        )}
      </aside>
    </div>
  )
}
