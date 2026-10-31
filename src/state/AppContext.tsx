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
  logout as apiLogout,
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
  logout: () => Promise<void>
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
  // cartBusy is retained for API compatibility but is always false now:
  // cart actions are optimistic and never block the UI while syncing.
  const cartBusy = false
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
  // Refs mirroring state, so optimistic updates + queued background syncs
  // never read a stale closure. The UI updates instantly from these refs;
  // the server sync runs in the background, in click order.
  const cartRef = useRef<CartLine[]>([])
  const productsRef = useRef<Product[]>([])
  const cartTotalRef = useRef(0)
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { cartRef.current = cart }, [cart])
  useEffect(() => { productsRef.current = products }, [products])
  useEffect(() => { cartTotalRef.current = cartTotal }, [cartTotal])

  const optimisticTotal = useCallback((lines: CartLine[]) => {
    return lines.reduce((sum, l) => {
      const p = productsRef.current.find((x) => x.id === l.productId)
      return sum + (p ? p.price * l.quantity : 0)
    }, 0)
  }, [])

  const applyOptimistic = useCallback((lines: CartLine[]) => {
    cartRef.current = lines
    setCart(lines)
    const total = optimisticTotal(lines)
    cartTotalRef.current = total
    setCartTotal(total)
    setCartError(null)
  }, [optimisticTotal])

  const enqueueSync = useCallback((fn: () => Promise<void>) => {
    // Serialize server mutations in click order, but never block the UI:
    // callers return immediately after the optimistic update.
    syncQueueRef.current = syncQueueRef.current.then(fn, fn).catch(() => {})
  }, [])

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
      // Optimistic: the basket count / total update NOW, no waiting for
      // the backend round-trip(s). The old code awaited add + GET cart
      // and disabled every Add button (cartBusy) meanwhile — that wait
      // is what made adding feel slow on a hosted backend.
      const prevLines = cartRef.current
      const prevTotal = cartTotalRef.current
      const existing = prevLines.find((l) => l.productId === productId)
      const target = Math.min(MAX_QTY, (existing?.quantity ?? 0) + Math.max(1, qty))
      const nextLines = existing
        ? prevLines.map((l) => (l.productId === productId ? { ...l, quantity: target } : l))
        : [...prevLines, { productId, quantity: target }]
      applyOptimistic(nextLines)
      setJustAdded((n) => n + 1)
      // Background sync, in click order. No GET /carts after the mutation:
      // the optimistic total (from the already-loaded catalogue prices)
      // is the display total; the server total is authoritative at
      // checkout, and a manual refreshCart() still re-reads it.
      // On failure, roll back to the pre-click state and surface cartError.
      enqueueSync(async () => {
        try {
          const cartId = await ensureCartId()
          if (existing) {
            await updateCartItem(cartId, productId, target)
          } else {
            await addCartItem(cartId, productId)
            if (target > 1) await updateCartItem(cartId, productId, target)
          }
        } catch (err) {
          cartRef.current = prevLines
          setCart(prevLines)
          cartTotalRef.current = prevTotal
          setCartTotal(prevTotal)
          setCartError(err instanceof ApiError ? err.message : 'Could not add to basket.')
        }
      })
    },
    [applyOptimistic, enqueueSync, ensureCartId],
  )

  const setCartQuantity = useCallback(
    async (productId: number, qty: number) => {
      const prevLines = cartRef.current
      const prevTotal = cartTotalRef.current
      const nextLines = qty <= 0
        ? prevLines.filter((l) => l.productId !== productId)
        : prevLines.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(MAX_QTY, qty) } : l))
      applyOptimistic(nextLines)
      const cartId = cartIdRef.current
      if (!cartId) return
      enqueueSync(async () => {
        try {
          if (qty <= 0) await removeCartItem(cartId, productId)
          else await updateCartItem(cartId, productId, Math.min(MAX_QTY, qty))
        } catch (err) {
          cartRef.current = prevLines
          setCart(prevLines)
          cartTotalRef.current = prevTotal
          setCartTotal(prevTotal)
          setCartError(err instanceof ApiError ? err.message : 'Could not update basket.')
        }
      })
    },
    [applyOptimistic, enqueueSync],
  )

  const removeFromCart = useCallback(
    async (productId: number) => {
      const prevLines = cartRef.current
      const prevTotal = cartTotalRef.current
      applyOptimistic(prevLines.filter((l) => l.productId !== productId))
      const cartId = cartIdRef.current
      if (!cartId) return
      enqueueSync(async () => {
        try {
          await removeCartItem(cartId, productId)
        } catch (err) {
          cartRef.current = prevLines
          setCart(prevLines)
          cartTotalRef.current = prevTotal
          setCartTotal(prevTotal)
          setCartError(err instanceof ApiError ? err.message : 'Could not remove from basket.')
        }
      })
    },
    [applyOptimistic, enqueueSync],
  )

  const clearCart = useCallback(async () => {
    const prevLines = cartRef.current
    const prevTotal = cartTotalRef.current
    applyOptimistic([])
    const cartId = cartIdRef.current
    if (!cartId) return
    enqueueSync(async () => {
      try {
        await clearCartItems(cartId)
      } catch (err) {
        cartRef.current = prevLines
        setCart(prevLines)
        cartTotalRef.current = prevTotal
        setCartTotal(prevTotal)
        setCartError(err instanceof ApiError ? err.message : 'Could not clear basket.')
      }
    })
  }, [applyOptimistic, enqueueSync])

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

  const logout = useCallback(async () => {
    // Ask the backend to clear the refresh-token cookie FIRST: the cookie
    // is HttpOnly, so JS cannot delete it — only the backend can, via
    // POST /auth/logout. Without that endpoint, the next page load's
    // POST /auth/refresh silently signs the same user back in.
    // Local state is cleared regardless, so logout always works from the
    // user's point of view even if the backend isn't updated yet.
    try {
      await apiLogout()
    } catch {
      // Backend without the logout endpoint yet: cookie stays, but the
      // local session is still dropped. Warn once so it isn't silent.
      console.warn('[orchard] POST /auth/logout failed; refresh cookie may still be set.')
    }
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
