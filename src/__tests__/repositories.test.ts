import { describe, expect, it } from 'vitest'
import { CartRepository, ProductRepository } from '../domain/repositories'
import { CATEGORIES } from '../api/categories'
import { isValidTheme, loadJson, saveJson } from '../domain/storage'
import { formatINR } from '../domain/format'
import type { Product } from '../domain/types'

const PRODUCTS: Product[] = [
  { id: 1, name: 'Fresh Apples (1 kg)', slug: 'fresh-apples-1-kg', description: 'Crisp apples.', price: 180, unitLabel: '', categoryId: 1, image: '/images/fresh-apples.jpg', isFeatured: false, isSeasonal: false },
  { id: 2, name: 'Bananas (1 dozen)', slug: 'bananas-1-dozen', description: 'Sweet bananas.', price: 60, unitLabel: '', categoryId: 1, image: '/images/bananas.jpg', isFeatured: false, isSeasonal: false },
  { id: 6, name: 'Fresh Tomatoes (1 kg)', slug: 'fresh-tomatoes-1-kg', description: 'Ripe tomatoes.', price: 40, unitLabel: '', categoryId: 2, image: '/images/fresh-tomatoes.jpg', isFeatured: false, isSeasonal: false },
]

describe('catalog search / filter / sort (client-side over the loaded list)', () => {
  it('finds products by name, case-insensitively', () => {
    const out = ProductRepository.filterSort(PRODUCTS, { search: 'APPLE', categoryId: 'all', sort: 'name-asc' })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(1)
  })
  it('filters by numeric backend category id', () => {
    const out = ProductRepository.filterSort(PRODUCTS, { search: '', categoryId: '2', sort: 'name-asc' })
    expect(out).toHaveLength(1)
    expect(out[0].categoryId).toBe(2)
  })
  it('sorts by price ascending and descending', () => {
    const asc = ProductRepository.filterSort(PRODUCTS, { search: '', categoryId: 'all', sort: 'price-asc' })
    const desc = ProductRepository.filterSort(PRODUCTS, { search: '', categoryId: 'all', sort: 'price-desc' })
    expect(asc[0].price).toBeLessThanOrEqual(asc[asc.length - 1].price)
    expect(desc[0].price).toBeGreaterThanOrEqual(desc[desc.length - 1].price)
  })
  it('returns an empty list for a nonsense search', () => {
    expect(ProductRepository.filterSort(PRODUCTS, { search: 'zzz-no-such-fruit', categoryId: 'all', sort: 'name-asc' })).toEqual([])
  })
  it('derives categories from the verified seed list (10, ids 1-10)', () => {
    expect(CATEGORIES).toHaveLength(10)
    expect(CATEGORIES.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(CATEGORIES[0].name).toBe('Fruits')
  })
})

describe('basket helpers (pure)', () => {
  it('counts lines and computes subtotal from catalogue prices', () => {
    const cart = [
      { productId: 1, quantity: 3 },
      { productId: 6, quantity: 1 },
    ]
    expect(CartRepository.count(cart)).toBe(4)
    expect(CartRepository.subtotal(cart, PRODUCTS)).toBe(180 * 3 + 40)
  })
  it('detailed() drops lines whose product is no longer in the catalogue', () => {
    const cart = [
      { productId: 1, quantity: 1 },
      { productId: 999, quantity: 2 },
    ]
    expect(CartRepository.detailed(cart, PRODUCTS)).toHaveLength(1)
  })
})

describe('safe persisted state', () => {
  it('returns the fallback for malformed JSON instead of throwing', () => {
    window.localStorage.setItem('orchard.test-bad', '{not json')
    expect(loadJson('orchard.test-bad', { ok: true })).toEqual({ ok: true })
    window.localStorage.removeItem('orchard.test-bad')
  })
  it('round-trips valid JSON', () => {
    saveJson('orchard.test-good', { a: 1 })
    expect(loadJson('orchard.test-good', {})).toEqual({ a: 1 })
  })
  it('rejects invalid theme values', () => {
    expect(isValidTheme('banana')).toBe(false)
    expect(isValidTheme('dark')).toBe(true)
  })
})

describe('currency formatting', () => {
  it('formats INR with Indian grouping, whole rupees staying whole', () => {
    expect(formatINR(120)).toBe('₹120')
    expect(formatINR(123456)).toContain('1,23,456')
  })
})
