import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

export function Footer() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) return
    setDone(true) // Local only: nothing is sent anywhere.
  }
  return (
    <footer className="mt-16 bg-plum text-cream dark:bg-black/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-serif text-2xl font-bold">ORCHARD</p>
          <p className="mt-2 text-sm text-cream/70">A little closer to the good stuff.</p>
          <p className="mt-4 text-xs text-cream/50">
            Connected to the real Store REST API. Orders and payments go through the backend; this newsletter form is local only.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold">Browse</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/" className="hover:underline">Home</Link></li>
            <li><Link to="/shop" className="hover:underline">Shop the market</Link></li>
            <li><Link to="/cart" className="hover:underline">Basket</Link></li>
            <li><Link to="/account" className="hover:underline">Account</Link></li>
            <li><Link to="/manage" className="hover:underline">Manage</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold">Market notes</p>
          <p className="mt-2 text-sm text-cream/70">A short note now and then. This form works locally only — nothing is sent.</p>
          {done ? (
            <p role="status" className="mt-3 rounded-xl bg-leaf px-4 py-3 text-sm">Thanks — noted locally. No email was sent.</p>
          ) : (
            <form onSubmit={submit} className="mt-3 flex gap-2">
              <label htmlFor="newsletter-email" className="sr-only">Email for market notes</label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-full bg-white/10 px-4 py-2 text-sm text-cream placeholder:text-cream/50"
              />
              <button type="submit" className="rounded-full bg-citrus px-4 py-2 text-sm font-semibold text-white">Join</button>
            </form>
          )}
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs text-cream/50">
        ORCHARD — The Living Market · Photos are generic placeholders, not brand packshots.
      </p>
    </footer>
  )
}
