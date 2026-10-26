import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import CartDrawer from './components/CartDrawer'
import Header from './components/Header'
import { AuthProvider, useAuth } from './lib/auth'
import { CartProvider } from './lib/cart'
import Account from './pages/Account'
import AdminProducts from './pages/AdminProducts'
import { Login, Register } from './pages/Auth'
import Checkout from './pages/Checkout'
import { CheckoutCancel, CheckoutSuccess } from './pages/CheckoutResult'
import Home from './pages/Home'
import { OrderDetail, Orders } from './pages/Orders'
import ProductDetail from './pages/ProductDetail'
import Shop from './pages/Shop'

// Smoothness fix #1: products stay fresh for 5 minutes and are NOT
// refetched on window focus, so going back/forward doesn't blank out.
// Smoothness fix #2: keepPreviousData keeps the old page visible while
// the next page's data loads, instead of flashing to a loading screen.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      retry: 1,
    },
  },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="skeleton h-64 w-full" />
  // Guest hitting a protected page used to get a raw API error ("Couldn't
  // load orders", "Order not found") instead of a login screen, and
  // after login they landed on home, losing where they were going.
  // Redirect to login with ?next=, so login returns them here — and
  // browser back from login goes to the page before, not into a loop.
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  return <>{children}</>
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

function AnimatedRoutes() {
  const { pathname } = useLocation()
  // Keying on pathname re-runs the page-in animation on every navigation.
  return (
    <div key={pathname} className="page-in">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/checkout-success" element={<RequireAuth><CheckoutSuccess /></RequireAuth>} />
        <Route path="/checkout-cancel" element={<CheckoutCancel />} />
        <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/admin/products" element={<RequireAuth><AdminProducts /></RequireAuth>} />
        <Route path="*" element={<p>Page not found. <a href="/" className="text-fk underline">Go home</a></p>} />
      </Routes>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <ScrollToTop />
            <Header />
            <main className="mx-auto max-w-7xl px-4 py-6">
              <AnimatedRoutes />
            </main>
            <footer className="mt-8 bg-[#172337] py-8 text-center text-sm text-stone-400">
              FreshStore — UI for the Store REST API • Prices in INR • Payments via Stripe
              <br />
              <span className="text-xs">Product photos are generic placeholders for prototyping, not brand packshots.</span>
            </footer>
            <CartDrawer />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
