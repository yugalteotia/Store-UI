import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addToCart,
  clearCartApi,
  createCart,
  fetchCart,
  removeCartItem,
  updateCartItem,
  type Cart,
} from './api'

// The backend cart is anonymous: POST /carts returns a UUID with no user
// link. Guests can shop; checkout is what requires login. The UUID is
// the only thing the UI must persist, so it lives in localStorage.
const CART_KEY = 'store.cartId'

interface CartState {
  cart: Cart | null
  loading: boolean
  count: number
  add: (productId: number) => void
  setQuantity: (productId: number, quantity: number) => void
  remove: (productId: number) => void
  clear: () => void
  clearLocalCartId: () => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

const CartContext = createContext<CartState | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [cartId, setCartId] = useState<string | null>(() =>
    localStorage.getItem(CART_KEY),
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (cartId) localStorage.setItem(CART_KEY, cartId)
    else localStorage.removeItem(CART_KEY)
  }, [cartId])

  const { data: cart, isLoading, error: cartError } = useQuery({
    queryKey: ['cart', cartId],
    queryFn: () => fetchCart(cartId!),
    enabled: !!cartId,
    retry: false,
  })

  // A stored cart id can be stale (e.g. DB reseeded, backend restarted
  // with a fresh DB). Previously the drawer stayed broken forever after
  // a back/forward to a page using that cart. Drop the stale id so the
  // next add creates a fresh cart instead of erroring.
  useEffect(() => {
    if (cartId && cartError && 'status' in cartError && (cartError as { status: number }).status === 404) {
      setCartId(null)
      queryClient.removeQueries({ queryKey: ['cart', cartId] })
    }
  }, [cartId, cartError, queryClient])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cart', cartId] })

  const ensureCartId = async (): Promise<string> => {
    if (cartId) return cartId
    const created = await createCart()
    setCartId(created.id)
    return created.id
  }

  const addMutation = useMutation({
    mutationFn: async (productId: number) => {
      const id = await ensureCartId()
      try {
        await addToCart(id, productId)
      } catch (e) {
        // Stored cart id can be stale (DB reseeded, cart cleared server
        // side). Create a fresh cart and retry once instead of failing.
        if (e instanceof Error && 'status' in e && (e as { status: number }).status === 404) {
          const created = await createCart()
          setCartId(created.id)
          await addToCart(created.id, productId)
        } else {
          throw e
        }
      }
    },
    onSuccess: invalidate,
  })
  const qtyMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      if (cartId) await updateCartItem(cartId, productId, quantity)
    },
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: (productId: number) =>
      cartId ? removeCartItem(cartId, productId) : Promise.resolve(),
    onSuccess: invalidate,
  })
  const clearMutation = useMutation({
    mutationFn: () => (cartId ? clearCartApi(cartId) : Promise.resolve()),
    onSuccess: invalidate,
  })

  const value = useMemo<CartState>(
    () => ({
      cart: cart ?? null,
      loading: isLoading,
      count:
        cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      add: (productId) => addMutation.mutate(productId),
      setQuantity: (productId, quantity) =>
        quantity < 1
          ? removeMutation.mutate(productId)
          : qtyMutation.mutate({ productId, quantity }),
      remove: (productId) => removeMutation.mutate(productId),
      clear: () => clearMutation.mutate(),
      clearLocalCartId: () => setCartId(null),
      drawerOpen,
      setDrawerOpen,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, isLoading, drawerOpen, cartId],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
