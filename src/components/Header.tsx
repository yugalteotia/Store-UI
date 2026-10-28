import { useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ShoppingBasket, Leaf, Menu, Moon, Search, Sun, User, X } from 'lucide-react'
import { useApp } from '../state/AppContext'

export function Header() {
  const { cartCount, justAdded, session, theme, setTheme, isAdminHint } = useApp()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const submitSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/shop?search=${encodeURIComponent(q)}`)
    setOpen(false)
  }
  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-medium ${isActive ? 'bg-plum text-cream dark:bg-butter dark:text-plum' : 'text-plum hover:bg-peach/60 dark:text-cream dark:hover:bg-white/10'}`

  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur dark:bg-plumdeep/95 border-b border-plum/10 dark:border-white/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="ORCHARD home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf text-white">
            <Leaf size={22} aria-hidden />
          </span>
          <span className="font-serif text-2xl font-bold tracking-tight text-plum dark:text-cream">
            ORCHARD
          </span>
          <span className="hidden text-xs text-plum/60 dark:text-cream/60 sm:block">The Living Market</span>
        </Link>

        <nav aria-label="Primary" className="order-4 flex w-full items-center gap-1 md:order-none md:w-auto">
          <NavLink to="/" end className={linkCls}>Home</NavLink>
          <NavLink to="/shop" className={linkCls}>Shop</NavLink>
          {isAdminHint && <NavLink to="/manage" className={linkCls}>Manage</NavLink>}
          <NavLink to="/account" className={linkCls}>Account</NavLink>
        </nav>

        {/* Below lg the search gets its own full-width row so it is never
            crushed between the fixed-width header buttons; at lg+ it sits
            inline in the header row as before. */}
        <form onSubmit={submitSearch} role="search" className="order-3 flex w-full items-center gap-2 lg:order-none lg:ml-auto lg:min-w-0 lg:flex-1 lg:max-w-xs">
          <label htmlFor="header-search" className="sr-only">Search products</label>
          <input
            id="header-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the market…"
            className="w-full rounded-full border border-plum/20 bg-paper px-4 py-2 text-sm text-plum dark:border-white/20 dark:bg-white/10 dark:text-cream"
          />
          <button type="submit" aria-label="Search" className="rounded-full bg-citrus p-2 text-white hover:bg-citrusdark">
            <Search size={18} aria-hidden />
          </button>
        </form>

        <button type="button" onClick={cycleTheme} aria-label={`Theme: ${theme}. Switch theme`} className="rounded-full border border-plum/20 p-2 text-plum dark:border-white/20 dark:text-cream" title={`Theme: ${theme}`}>
          {theme === 'dark' ? <Moon size={18} aria-hidden /> : <Sun size={18} aria-hidden />}
        </button>

        <Link to={session ? '/account' : '/login'} aria-label="Account" className="flex items-center gap-1 rounded-full border border-plum/20 px-3 py-2 text-sm text-plum dark:border-white/20 dark:text-cream">
          <User size={18} aria-hidden />
          <span className="hidden sm:inline">{session ? session.name.split(' ')[0] : 'Sign in'}</span>
        </Link>

        <Link to="/cart" aria-label={`Basket, ${cartCount} items`} className="relative flex items-center gap-1 rounded-full bg-plum px-4 py-2 text-sm font-semibold text-cream dark:bg-butter dark:text-plum">
          <ShoppingBasket size={18} aria-hidden />
          <span className="hidden sm:inline">Basket</span>
          <span key={justAdded} className="basket-pop inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-citrus px-1 text-xs text-white" aria-live="polite">
            {cartCount}
          </span>
        </Link>

        <button type="button" className="md:hidden rounded-full border border-plum/20 p-2" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen((o) => !o)}>
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        </button>
      </div>
      {open && (
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4 pb-4 md:hidden">
          <NavLink to="/" end onClick={() => setOpen(false)} className={linkCls}>Home</NavLink>
          <NavLink to="/shop" onClick={() => setOpen(false)} className={linkCls}>Shop</NavLink>
          {isAdminHint && <NavLink to="/manage" onClick={() => setOpen(false)} className={linkCls}>Manage</NavLink>}
          <NavLink to="/account" onClick={() => setOpen(false)} className={linkCls}>Account</NavLink>
        </nav>
      )}
    </header>
  )
}
