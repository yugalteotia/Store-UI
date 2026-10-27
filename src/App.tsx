import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AppProvider } from './state/AppContext'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Home } from './pages/Home'
import { Shop } from './pages/Shop'
import { ProductDetail } from './pages/ProductDetail'
import { CartPage } from './pages/CartPage'
import { Checkout } from './pages/Checkout'
import { CheckoutResult } from './pages/CheckoutResult'
import { CheckoutCancel, CheckoutSuccess } from './pages/StripeReturn'
import { Login, Register } from './pages/Auth'
import {
  AccountOverview,
  AccountProfile,
  AccountOrders,
  AccountOrderDetail,
  AccountSecurity,
} from './pages/Account'
import { ManageHome, ManageProducts, ManageProductNew, ManageProductEdit } from './pages/Manage'

export function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-serif text-4xl font-bold">That page isn&apos;t in the market</h1>
      <p className="mt-3 text-plum/60 dark:text-cream/60">Check the address, or head back to the shop.</p>
      <Link to="/shop" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Shop the market</Link>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <ErrorBoundary>
          <div className="flex min-h-screen flex-col overflow-x-hidden">
            <Header />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/products/:productId" element={<ProductDetail />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/checkout/result" element={<CheckoutResult />} />
                <Route path="/checkout-success" element={<CheckoutSuccess />} />
                <Route path="/checkout-cancel" element={<CheckoutCancel />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/account" element={<AccountOverview />} />
                <Route path="/account/profile" element={<AccountProfile />} />
                <Route path="/account/orders" element={<AccountOrders />} />
                <Route path="/account/orders/:orderId" element={<AccountOrderDetail />} />
                <Route path="/account/security" element={<AccountSecurity />} />
                <Route path="/manage" element={<ManageHome />} />
                <Route path="/manage/products" element={<ManageProducts />} />
                <Route path="/manage/products/new" element={<ManageProductNew />} />
                <Route path="/manage/products/:productId/edit" element={<ManageProductEdit />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <Footer />
          </div>
        </ErrorBoundary>
      </AppProvider>
    </BrowserRouter>
  )
}
