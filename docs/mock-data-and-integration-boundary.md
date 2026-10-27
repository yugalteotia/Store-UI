# Mock Data and Integration Boundary — ORCHARD Phase 1

Phase 1 is **strictly mock-only**. There is no network client for application data anywhere
in `src/`: no `fetch`, no Axios, no backend URL, no API key, no Stripe call, no proxy, no
JWT, no token. The app runs with the backend completely off. (The word "Stripe" appears in
docs and in user-facing demo disclaimers only to state that it is **not** used.)

## Domain types

See `src/domain/types.ts`:

- `Category` — `id`, `name`, `blurb`, `image`, `accent`. Fictional merchandising categories.
- `Product` — `id`, `name`, `slug`, `description`, `price` (INR, whole rupees), `unitLabel`,
  `categoryId`, `image`, `isFeatured`, `isSeasonal`, optional `tagline`.
- `CartLine` — `productId`, `quantity` (1–99, enforced by the repository).
- `OrderItem` / `DemoOrder` — snapshot of items at order time, `reference` (`ORC-######`),
  `createdAt` (ISO), `total`, customer name/contact, and a demo note.
- `MockUser` — `id`, `name`, `email`, `phone`, `city`. No password field exists.
- `ThemePreference` — `'light' | 'dark' | 'system'`.

Deliberately absent by default: stock counts, delivery times, ratings, nutritional facts,
organic certification, farm origin, discounts. Nothing on screen claims them.

## Repository interfaces

See `src/domain/repositories.ts`. All repositories are pure functions over data passed in;
components never manipulate the seed arrays directly:

- `ProductRepository` — `list`, `getById`, `getBySlug`, `categories`, `filterSort`
  (search + category + name/price/featured sort), `related`, `create`, `update`, `remove`.
- `CartRepository` — `add`, `setQuantity`, `remove`, `clear`, `count`, `subtotal`, `detailed`
  (joins lines to products, dropping lines whose product was deleted).
- `OrderRepository` — `createFromCart` (returns `null` for an empty basket),
  `getById` (by id or reference).
- `AuthRepository` — `loginMock`, `registerMock`, `demoUser`. Returns a `MockUser` only.
  No token is created, stored, or returned.
- `UserRepository` — `updateProfile`, `changePasswordMock` (returns a message; stores nothing).

## Mock seed data

- Location: `src/domain/seed.ts` — `CATEGORIES` (7 fictional categories) and
  `SEED_PRODUCTS` (34 deterministic products across all categories, prices in INR).
- Images: local files under `public/images/`, copied from the earlier Store-UI placeholder
  set. These are **generic placeholder photos, not brand packshots** (see
  `public/images/IMAGES.md`). A product maps to its own image; the category image is the
  fallback if a product image is missing. No external image URLs are used.
- Currency: `src/domain/format.ts` — `formatINR` (centralised, `en-IN` / INR) and
  `formatDate` / `formatDateTime`. No price is hardcoded in a view.

## State and persistence

- `src/state/AppContext.tsx` (`AppProvider` / `useApp`) is the single shared-state owner:
  products, basket, demo orders, last demo order, mock session, theme.
- Persisted (localStorage, safely): basket (`orchard.cart`) and theme (`orchard.theme`).
  Loading is guarded: malformed JSON returns a fallback, malformed basket entries are
  filtered out, and invalid theme values fall back to `system` (see
  `src/domain/storage.ts` and the tests).
- **Not persisted**: the mock session, demo orders, and any password. The session lives only
  in memory for the tab session; refreshing the page signs the demo user out. Demo orders
  likewise live only in the current session — this is an accepted prototype limitation,
  not a bug to paper over.
- The management workspace mutates the same product state the storefront reads, so a
  product created/edited/deleted in `/manage` appears/disappears in `/shop` and on product
  pages in the same session.

## Simulated actions

- Checkout: validates contact fields client-side (React Hook Form + Zod), snapshots the
  basket into a `DemoOrder`, clears the basket, and navigates to `/checkout/result`.
  The confirmation is labelled a prototype; direct navigation to `/checkout/result` with
  no order shows a graceful empty state and never claims a real payment.
- Login / register: validate locally, set the in-memory mock session, show a message that
  says explicitly that no real account was authenticated or created. The demo-account
  button signs in the fixed demo user without any credential.
- Password change: validates the form and returns a simulated message. Nothing is stored.
- Newsletter (footer): validates locally and shows a local success message. Nothing is sent.
- Theme: light / dark / system, resolved with `matchMedia`, persisted as above.

## Known differences from the real backend

| Concept | Phase 1 mock | Real backend (verified, see audit) |
|---|---|---|
| Products | 34 mock products, 7 fictional categories, images, units, slugs | 50 seeded products, 10 real categories, no images/units/slugs |
| Categories | Derived from mock data, browsable | No `GET /categories` endpoint at all |
| Cart | Local, in-memory + localStorage | Anonymous UUID cart, server-side, quantity rules |
| Orders | Local demo orders, `ORC-######`, in-session only | Server orders, PENDING → PAID/FAILED via Stripe webhook |
| Checkout | Local preview, no card fields, no payment | Stripe hosted session, cart cleared immediately, PENDING order |
| Auth | Mock session, no token, no password storage | 15-min JWT + 7-day HttpOnly refresh cookie, USER/ADMIN, no logout |
| Admin | Demo workspace, explicitly not real authorization | Admin-only product CRUD, role enforced server-side |
| Prices | Fictional demo INR prices | Real seeded BigDecimal prices |

## Where a future API adapter could be introduced

Phase 2 should **not** edit views to call an API directly. Instead:

1. Add `src/adapters/apiClient.ts` (the only module allowed to use a network client) and
   `src/adapters/productApi.ts`, `cartApi.ts`, `orderApi.ts`, `authApi.ts` implementing
   the same shapes the repositories return today.
2. Swap the `AppProvider` data source from `SEED_PRODUCTS` + in-memory repositories to
   the adapters, keeping `useApp()`'s interface stable so pages do not change.
3. Add first, in the backend repo (separately approved): a `GET /categories` endpoint,
   product images, and CORS for the hosted frontend. Without those, a faithful Phase 2
   catalogue cannot be built from the API alone.
4. Map backend fields explicitly at the adapter boundary: backend `ProductDto`
   (`id: number`, `categoryId: Byte`) → mock `Product` (`id: string`, `slug`, `unitLabel`,
   `image`) — slugs, units and images do not exist in the backend and need a backend
   decision, not a silent frontend invention.
5. Replace the demo checkout with the real flow only when the Stripe redirect behaviour
   (cart cleared immediately, PENDING order, webhook-driven PAID/FAILED) is handled in
   the UI — the current demo confirmation must not be reused as a "payment success" page.
