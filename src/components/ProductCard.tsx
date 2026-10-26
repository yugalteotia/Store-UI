import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoryFor, inr, type Product } from '../lib/api'
import { imageForProduct } from '../lib/productImages'
import { useCart } from '../lib/cart'

export function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  const cat = categoryFor(product.categoryId)
  const src = imageForProduct(product.name, cat?.name ?? '')
  const [failed, setFailed] = useState(false)
  if (src && !failed) {
    return (
      <div className={`overflow-hidden bg-white ${large ? 'h-80' : 'h-48'}`}>
        <img
          src={src}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }
  return (
    <div
      className={`flex items-center justify-center bg-fk-light ${large ? 'h-80 text-7xl' : 'h-48 text-5xl'}`}
      title={cat?.name ?? 'Product'}
    >
      {cat?.emoji ?? '🛍️'}
    </div>
  )
}

export function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white p-3">
      <div className="skeleton h-48 w-full" />
      <div className="skeleton mt-3 h-4 w-3/4" />
      <div className="skeleton mt-2 h-4 w-1/2" />
      <div className="skeleton mt-3 h-8 w-full" />
    </div>
  )
}

function ProductCardInner({ product }: { product: Product }) {
  const { cart, add, setQuantity } = useCart()
  const item = cart?.items.find((i) => i.product.id === product.id)
  const cat = categoryFor(product.categoryId)

  return (
    <div className="product-card flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
      <Link to={`/products/${product.id}`}>
        <ProductImage product={product} />
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-400">{cat?.name}</span>
        <Link to={`/products/${product.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug hover:text-fk">
          {product.name}
        </Link>
        <p className="line-clamp-1 text-xs text-stone-500">{product.description}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-base font-bold">{inr(product.price)}</span>
          {item ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setQuantity(product.id, item.quantity - 1)} className="h-8 w-8 rounded-sm border font-bold hover:bg-stone-100">−</button>
              <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
              <button onClick={() => setQuantity(product.id, item.quantity + 1)} className="h-8 w-8 rounded-sm bg-fk font-bold text-white">+</button>
            </div>
          ) : (
            <button onClick={() => add(product.id)} className="rounded-sm bg-saffron px-5 py-2 text-sm font-bold text-white shadow hover:bg-saffron-dark">
              ADD
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const ProductCard = memo(ProductCardInner)
export default ProductCard
