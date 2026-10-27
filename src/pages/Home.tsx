import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ArrowRight, Leaf, ShoppingBasket, Sparkles } from 'lucide-react'
import { CATEGORIES } from '../api/categories'
import { useApp } from '../state/AppContext'
import { ProductCard } from '../components/ProductCard'
import { Reveal } from '../components/Reveal'

export function Home() {
  const { products, productsStatus, productsError, reloadProducts } = useApp()
  const heroRef = useRef<HTMLDivElement>(null)
  // The backend has no featured/seasonal flags, so these are display
  // choices over catalogue order — never presented as backend data.
  const featured = products.slice(0, 8)
  const seasonal = products.filter((p) => p.categoryId === 1).slice(0, 3)
  const popular = products.slice(0, 8)

  useEffect(() => {
    const el = heroRef.current
    if (!el || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    const ctx = gsap.context(() => {
      gsap.fromTo('.hero-copy', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out' })
      gsap.fromTo('.hero-img', { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power2.out' })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <main>
      {/* Hero: asymmetric editorial composition */}
      <section ref={heroRef} className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:py-16">
        <div className="lg:col-span-7">
          <p className="hero-copy inline-flex items-center gap-2 rounded-full bg-butter/70 px-4 py-1 text-sm font-semibold text-plum">
            <Sparkles size={16} aria-hidden /> A neighbourhood market, online
          </p>
          <h1 className="hero-copy mt-5 font-serif text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            A little closer
            <br />
            to the <span className="text-citrus">good stuff.</span>
          </h1>
          <p className="hero-copy mt-5 max-w-xl text-lg text-plum/70 dark:text-cream/70">
            Fresh fruit, everyday vegetables and market staples, chosen like a good stallholder
            would — colourful, honest, and ready for tonight&apos;s cooking.
          </p>
          <div className="hero-copy mt-7 flex flex-wrap gap-3">
            <Link to="/shop" className="inline-flex items-center gap-2 rounded-full bg-plum px-6 py-3 font-semibold text-cream dark:bg-butter dark:text-plum">
              Shop the market <ArrowRight size={18} aria-hidden />
            </Link>
            <Link to="/shop?categoryId=1" className="inline-flex items-center gap-2 rounded-full border-2 border-plum/20 px-6 py-3 font-semibold dark:border-white/20">
              Fruit aisle
            </Link>
          </div>
          {productsStatus === 'error' && (
            <div role="alert" className="hero-copy mt-4 rounded-2xl bg-paper p-4 text-sm dark:bg-white/5">
              The live catalogue couldn&apos;t load ({productsError}).{' '}
              <button type="button" onClick={() => void reloadProducts()} className="font-semibold underline">Retry</button>
            </div>
          )}
        </div>
        <div className="relative lg:col-span-5">
          <div className="hero-img blob absolute -top-6 -right-4 h-40 w-40 bg-butter/80" aria-hidden />
          <img src="/images/alphonso-mangoes.jpg" alt="Ripe Alphonso mangoes at a market stall" className="hero-img relative aspect-[4/5] w-full rounded-[2rem] object-cover shadow-lift" />
          <div className="hero-img absolute bottom-6 left-4 max-w-[240px] rounded-2xl bg-paper/95 p-4 shadow-lift dark:bg-plumdeep/95">
            <p className="flex items-center gap-2 text-sm font-semibold"><Leaf size={16} className="text-leaf" aria-hidden /> Today&apos;s market note</p>
            <p className="mt-1 text-sm text-plum/70 dark:text-cream/70">Fruit, vegetables and staples, priced live from the Store API — pack sizes are in each product name.</p>
          </div>
        </div>
      </section>

      {/* Category discovery */}
      <Reveal className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-serif text-3xl font-bold sm:text-4xl">Wander the aisles</h2>
          <Link to="/shop" className="text-sm font-semibold text-citrusdark hover:underline">View everything →</Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((c, i) => (
            <Link
              key={c.id}
              to={`/shop?categoryId=${c.id}`}
              className={`group relative overflow-hidden rounded-3xl ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
            >
              <img src={c.image} alt={c.name} loading="lazy" className="aspect-[4/3] h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-plum/85 to-transparent p-4 pt-10 text-cream">
                <span className="font-serif text-lg font-bold">{c.name}</span>
                <span className="block text-sm text-cream/80">{c.blurb}</span>
              </span>
            </Link>
          ))}
          <Link to="/shop" className="flex flex-col justify-center rounded-3xl bg-butter p-6 text-plum">
            <ShoppingBasket size={28} aria-hidden />
            <span className="mt-2 font-serif text-xl font-bold">Everything, in one basket</span>
            <span className="text-sm">Fruit, veg and staples together.</span>
          </Link>
        </div>
      </Reveal>

      {/* Seasonal */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-leaf dark:text-butter">From the fruit aisle</p>
          <h2 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">What&apos;s bright right now</h2>
        </Reveal>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {seasonal.map((p, i) => (
            <Link key={p.id} to={`/products/${p.id}`} className={`group relative overflow-hidden rounded-3xl ${i === 0 ? 'md:col-span-2' : ''}`}>
              <img src={p.image} alt={p.name} loading="lazy" className="aspect-[16/10] w-full object-cover transition duration-300 group-hover:scale-105" />
              <span className="absolute bottom-4 left-4 rounded-2xl bg-paper/95 px-4 py-3 text-plum dark:bg-plumdeep/95 dark:text-cream">
                <span className="font-serif text-lg font-bold">{p.name}</span>
                <span className="block text-sm">From ₹{p.price}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Editorial philosophy */}
      <section className="bg-peach/50 py-14 dark:bg-white/5">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-2">
          <img src="/images/fresh-spinach.jpg" alt="Fresh green spinach leaves" loading="lazy" className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
          <div>
            <h2 className="font-serif text-3xl font-bold sm:text-4xl">A market, not a warehouse.</h2>
            <p className="mt-4 text-lg text-plum/70 dark:text-cream/70">
              ORCHARD is imagined as the stall you return to because someone there knows what&apos;s
              good today. This shop keeps that feeling: big photography, honest descriptions,
              and a basket that never gets in the way of cooking plans.
            </p>
            <ul className="mt-6 space-y-2 text-plum/80 dark:text-cream/80">
              <li>· Colour first — find things by looking, not by decoding labels.</li>
              <li>· Prices in rupees; pack sizes are stated in each product name by the catalogue itself.</li>
              <li>· No invented ratings, stock counts or delivery promises — the backend sends none.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Popular + promo */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 className="font-serif text-3xl font-bold sm:text-4xl">Popular in the market</h2>
          <p className="mt-2 text-plum/60 dark:text-cream/60">A slice of the live catalogue — the full list lives in Shop.</p>
        </Reveal>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        <Reveal className="mt-10">
          <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-leaf p-8 text-white md:flex-row md:items-center">
            <div>
              <p className="font-serif text-2xl font-bold sm:text-3xl">Build a week of cooking in one basket.</p>
              <p className="mt-1 text-white/80">Start with fruit for breakfast, veg for dinner, and staples for everything between.</p>
            </div>
            <Link to="/shop" className="shrink-0 rounded-full bg-butter px-6 py-3 font-semibold text-plum">Start shopping</Link>
          </div>
        </Reveal>
      </section>

      {/* Featured strip */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <h2 className="font-serif text-3xl font-bold">Market picks</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </main>
  )
}
