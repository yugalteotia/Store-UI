import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { categoryFor, fetchProduct, inr } from '../lib/api'
import { ProductImage } from '../components/ProductCard'
import { useCart } from '../lib/cart'

export default function ProductDetail() {
  const { id } = useParams()
  const { cart, add, setQuantity } = useCart()
  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(Number(id)),
    enabled: !!id,
  })
  if (isLoading) return <div className="skeleton h-80 w-full" />
  if (error || !product) {
    const is404 = error && 'status' in error && (error as { status: number }).status === 404
    return (
      <div className="rounded-lg border bg-white p-6">
        <p className="text-red-700">
          {is404
            ? 'Product not found.'
            : 'Could not load this product — is the backend running on localhost:8080?'}
        </p>
        {!is404 && (
          <button onClick={() => refetch()} className="mt-4 rounded-sm bg-fk px-5 py-2 text-sm font-bold text-white">
            Retry
          </button>
        )}
        <Link to="/shop" className="ml-3 text-sm text-fk underline">Back to shop</Link>
      </div>
    )
  }
  const item = cart?.items.find((i) => i.product.id === product.id)
  const cat = categoryFor(product.categoryId)

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="overflow-hidden rounded-3xl border bg-white">
        <ProductImage product={product} large />
      </div>
      <div>
        <Link to="/shop" className="text-sm text-fk hover:underline">← Back to shop</Link>
        {cat && <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-fk">{cat.emoji} {cat.name}</p>}
        <h1 className="mt-1 text-3xl font-bold">{product.name}</h1>
        <p className="mt-3 text-2xl font-bold">{inr(product.price)}</p>
        <p className="mt-4 text-stone-600">{product.description}</p>
        <p className="mt-4 text-sm text-stone-500">
          Note: the API has no image, stock, or pack-size field yet — pack size is part of the product name, and the photo is a generic placeholder (see README).
        </p>
        <div className="mt-6">
          {item ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(product.id, item.quantity - 1)} className="h-10 w-10 rounded-full border font-bold">−</button>
              <span className="text-lg font-semibold">{item.quantity} in cart</span>
              <button onClick={() => setQuantity(product.id, item.quantity + 1)} className="h-10 w-10 rounded-full bg-fk font-bold text-white">+</button>
            </div>
          ) : (
            <button onClick={() => add(product.id)} className="rounded-sm bg-saffron px-8 py-3 font-semibold text-white hover:bg-saffron-dark">
              Add to cart
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
