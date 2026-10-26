import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'

// Flipkart-style header: solid blue bar, italic logo, big white search
// box, white Login button, cart with count badge.
export default function Header() {
  const { user, role, logout } = useAuth()
  const { count, setDrawerOpen } = useCart()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const search = (e: FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/shop?search=${encodeURIComponent(q.trim())}` : '/shop')
  }

  return (
    <header className="sticky top-0 z-40 bg-fk shadow-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="leading-none text-white">
          <span className="text-2xl font-extrabold italic tracking-tight">FreshStore</span>
          <span className="block text-[11px] font-medium italic text-yellow-300">Fresh • Everyday • Delivered</span>
        </Link>
        <form onSubmit={search} className="order-3 flex w-full min-w-0 flex-1 sm:order-none sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for products, brands and more"
            className="min-w-0 flex-1 rounded-l-sm bg-white px-4 py-2.5 text-sm text-stone-900 outline-none placeholder:text-stone-400"
          />
          <button className="rounded-r-sm bg-white px-4 text-fk" aria-label="Search">🔍</button>
        </form>
        <nav className="ml-auto flex items-center gap-4 text-sm font-semibold text-white">
          <Link to="/shop" className="hidden hover:underline md:block">Shop</Link>
          {user && <Link to="/orders" className="hidden hover:underline md:block">Orders</Link>}
          {role === 'ADMIN' && <Link to="/admin/products" className="hidden hover:underline md:block">Admin</Link>}
          {user ? (
            <>
              <Link to="/account" className="hidden hover:underline sm:block">{user.name}</Link>
              <button onClick={() => { logout(); navigate('/') }} className="rounded-sm bg-white px-4 py-1.5 text-fk hover:bg-blue-50">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-sm bg-white px-5 py-1.5 text-fk hover:bg-blue-50">Login</Link>
              <Link to="/register" className="hidden hover:underline sm:block">Sign up</Link>
            </>
          )}
          <button
            key={count}
            onClick={() => setDrawerOpen(true)}
            className="cart-pop flex items-center gap-1.5 font-semibold"
          >
            🛒 Cart
            {count > 0 && <span className="rounded-full bg-saffron px-2 py-0.5 text-xs text-stone-900">{count}</span>}
          </button>
        </nav>
      </div>
    </header>
  )
}
