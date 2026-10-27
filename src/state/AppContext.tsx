import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { CartLine, Product, RealOrder, RealUser, ThemePreference } from '../domain/types'
import { CartRepository } from '../domain/repositories'
import { isValidTheme, loadJson, saveJson } from '../domain/storage'
import { ApiError, apiRequest, setAccessToken } from '../api/http'
import {
  addCartItem,
  clearCartItems,
  clearSessionToken,
  createCart,
  getCart,
  getMe,
  listOrders,
  listProducts,
  login as apiLogin,
  probeAdmin,
  registerUser,
  removeCartItem,
  updateCartItem,
} from '../api/services'
import { cartLinesFromDto } from '../api/mapping'

export type LoadStatus = 'loading' | 'ready' | 'error'

interface AppState {
  products: Product[]
  productsStatus: LoadStatus
  productsError: string | null
  reloadProducts: () => Promise<void>
  cart: CartLine[]
  cartCount: number
  cartSubtotal: number
  cartStatus: LoadStatus
  cartError: string | null
  justAdded: number
  cartBusy: boolean
  orders: RealOrder[]
  ordersStatus: LoadStatus
  ordersError: string | null
  refreshOrders: () => Promise<void>
  lastCheckoutOrderId: number | null
  setLastCheckoutOrderId: (id: number | null) => void
  session: RealUser | null
  sessionStatus: LoadStatus
  isAdminHint: boolean
  theme: ThemePreference
  resolvedDark: boolean
  addToCart: (productId: number, qty?: number) => Promise<void>
  setCartQuantity: (productId: number, qty: number) => Promise<void>
  removeFromCart: (productId: number) => Promise<void>
  clearCart: () => Promise<void>
  refreshCart: () => Promise<void>
  login: (email: string, password: string) => Promise<RealUser>
  register: (name: string, email: string, password: string) => Promise<RealUser>
  logout: () => void
  setSessionUser: (user: RealUser | null) => void
  setTheme: (t: ThemePreference) => void
}

const Ctx = createContext<AppState | null>(null)

const CART_ID_KEY = 'orchard.cartId'
const MAX_QTY = 1000 // backend UpdateItemRequestDto @Max(1000)

function loadCartId(): string | null {
  try {
    const raw = window.localStorage.getItem(CART_ID_KEY)
    // A cart id is a UUID; anything else is stale/corrupt and is dropped.
    return raw && /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null
  } catch {
    return null
  }
}
function saveCartId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CART_ID_KEY, id)
    else window.localStorage.removeItem(CART_ID_KEY)
  } catch {
    // Storage unavailable: cart still works in memory for this session.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [productsStatus, setProductsStatus] = useState<LoadStatus>('loading')
  const [productsError, setProductsError] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartTotal, setCartTotal] = useState(0)
  const [cartStatus, setCartStatus] = useState<LoadStatus>('loading')
  const [cartError, setCartError] = useState<string | null>(null)
  const [cartBusy, setCartBusy] = useState(false)
  const [orders, setOrders] = useState<RealOrder[]>([])
  const [ordersStatus, setOrdersStatus] = useState<LoadStatus>('loading')
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [lastCheckoutOrderId, setLastCheckoutOrderId] = useState<number | null>(null)
  const [session, setSession] = useState<RealUser | null>(null)
  const [sessionStatus, setSessionStatus] = useState<LoadStatus>('loading')
  const [isAdminHint, setIsAdminHint] = useState(false)
  const [justAdded, setJustAdded] = useState(0)
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    const raw = loadJson<unknown>('orchard.theme', 'system')
    return isValidTheme(raw) ? raw : 'system'
  })
  const [systemDark, setSystemDark] = useState(
    () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false),
  )
  const cartIdRef = useRef<string | null>(loadCartId())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const resolvedDark = theme === 'dark' || (theme === 'system' && systemDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedDark)
  }, [resolvedDark])

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t)
    saveJson('orchard.theme', t)
  }, [])

  const reloadProducts = useCallback(async () => {
    setProductsStatus('loading')
    setProductsError(null)
    try {
      setProducts(await listProducts())
      setProductsStatus('ready')
    } catch (err) {
      setProductsStatus('error')
      setProductsError(err instanceof ApiError ? err.message : 'Could not load products.')
    }
  }, [])

  const refreshCart = useCallback(async () => {
    const cartId = cartIdRef.current
    if (!cartId) {
      setCart([])
      setCartTotal(0)
      setCartStatus('ready')
      return
    }
    setCartStatus('loading')
    setCartError(null)
    try {
      const dto = await getCart(cartId)
      const { lines, total } = cartLinesFromDto(dto)
      setCart(lines)
      setCartTotal(total)
      setCartStatus('ready')
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'not-found') {
        // Stale cart id (e.g. backend reseeded): drop it, start empty.
        // This is the only case where a cart id is discarded silently;
        // it cannot contain an order or a payment.
        cartIdRef.current = null
        saveCartId(null)
        setCart([])
        setCartTotal(0)
        setCartStatus('ready')
      } else {
        setCartStatus('error')
        setCartError(err instanceof ApiError ? err.message : 'Could not load your basket.')
      }
    }
  }, [])

  const refreshOrders = useCallback(async () => {
    if (!session) {
      setOrders([])
      setOrdersStatus('ready')
      return
    }
    setOrdersStatus('loading')
    setOrdersError(null)
    try {
      setOrders(await listOrders())
      setOrdersStatus('ready')
    } catch (err) {
      setOrdersStatus('error')
      setOrdersError(err instanceof ApiError ? err.message : 'Could not load orders.')
    }
  }, [session])

  // Initial load: products + saved cart. Session restore runs separately
  // so a backend outage never blocks the public catalogue.
  useEffect(() => {
    void reloadProducts()
    void refreshCart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Session restore: silent refresh via the HttpOnly cookie, then /auth/me.
  // Failure is not an error state — it just means "signed out".
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiRequest<{ token: string }>('/auth/refresh', { method: 'POST', retryOnAuth: false })
        if (res?.token) {
          setAccessToken(res.token)
          const user = await getMe()
          if (cancelled) return
          setSession(user)
          setIsAdminHint(await probeAdmin())
        }
      } catch {
        // Signed out (no/expired cookie, or backend down): stay signed out.
      } finally {
        if (!cancelled) setSessionStatus('ready')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'ready' && session) void refreshOrders()
    if (sessionStatus === 'ready' && !session) {
      setOrders([])
      setOrdersStatus('ready')
    }
  }, [session, sessionStatus, refreshOrders])

  const ensureCartId = useCallback(async (): Promise<string> => {
    if (cartIdRef.current) return cartIdRef.current
    const dto = await createCart()
    cartIdRef.current = dto.id
    saveCartId(dto.id)
    return dto.id
  }, [])

  const addToCart = useCallback(
    async (productId: number, qty = 1) => {
      setCartBusy(true)
      try {
        const cartId = await ensureCartId()
        const existing = cart.find((l) => l.productId === productId)
        const target = Math.min(MAX_QTY, (existing?.quantity ?? 0) + Math.max(1, qty))
        if (existing) {
          await updateCartItem(cartId, productId, target)
        } else {
          await addCartItem(cartId, productId)
          if (target > 1) await updateCartItem(cartId, productId, target)
        }
        await refreshCart()
        setJustAdded((n) => n + 1)
      } finally {
        setCartBusy(false)
      }
    },
    [cart, ensureCartId, refreshCart],
  )

  const setCartQuantity = useCallback(
    async (productId: number, qty: number) => {
      const cartId = cartIdRef.current
      if (!cartId) return
      setCartBusy(true)
      try {
        if (qty <= 0) await removeCartItem(cartId, productId)
        else await updateCartItem(cartId, productId, Math.min(MAX_QTY, qty))
        await refreshCart()
      } finally {
        setCartBusy(false)
      }
    },
    [refreshCart],
  )

  const removeFromCart = useCallback(
    async (productId: number) => {
      const cartId = cartIdRef.current
      if (!cartId) return
      setCartBusy(true)
      try {
        await removeCartItem(cartId, productId)
        await refreshCart()
      } finally {
        setCartBusy(false)
      }
    },
    [refreshCart],
  )

  const clearCart = useCallback(async () => {
    const cartId = cartIdRef.current
    if (!cartId) {
      setCart([])
      setCartTotal(0)
      return
    }
    setCartBusy(true)
    try {
      await clearCartItems(cartId)
      await refreshCart()
    } finally {
      setCartBusy(false)
    }
  }, [refreshCart])

  const login = useCallback(async (email: string, password: string) => {
    const user = await apiLogin(email, password)
    setSession(user)
    setIsAdminHint(await probeAdmin())
    setSessionStatus('ready')
    return user
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    await registerUser(name, email, password)
    // Registration returns no token: sign in with the same credentials.
    return login(email, password)
  }, [login])

  const logout = useCallback(() => {
    // No backend logout endpoint exists: clearing client state is the
    // whole logout. The refresh cookie remains until it expires, but it
    // is HttpOnly and cannot be read or reused by this page's JS — and
    // session restore on the next visit would sign the user back in.
    // That cookie-lifetime caveat is documented in the integration plan.
    clearSessionToken()
    setSession(null)
    setIsAdminHint(false)
    setOrders([])
  }, [])

  const value = useMemo<AppState>(
    () => ({
      products,
      productsStatus,
      productsError,
      reloadProducts,
      cart,
      cartCount: CartRepository.count(cart),
      cartSubtotal: cartTotal,
      cartStatus,
      cartError,
      justAdded,
      cartBusy,
      orders,
      ordersStatus,
      ordersError,
      refreshOrders,
      lastCheckoutOrderId,
      setLastCheckoutOrderId,
      session,
      sessionStatus,
      isAdminHint,
      theme,
      resolvedDark,
      addToCart,
      setCartQuantity,
      removeFromCart,
      clearCart,
      refreshCart,
      login,
      register,
      logout,
      setSessionUser: setSession,
      setTheme,
    }),
    [
      products, productsStatus, productsError, reloadProducts, cart, cartTotal, cartStatus, cartError,
      justAdded, cartBusy, orders, ordersStatus, ordersError, refreshOrders, lastCheckoutOrderId,
      session, sessionStatus, isAdminHint, theme, resolvedDark, addToCart, setCartQuantity,
      removeFromCart, clearCart, refreshCart, login, register, logout, setTheme,
    ],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
