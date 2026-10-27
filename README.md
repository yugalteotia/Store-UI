# ORCHARD — The Living Market (Phase 2: real backend integration)

A design-led fruit-market and grocery frontend, now connected to the real
Store REST API. Tagline: “A little closer to the good stuff.”

Phase 2 replaced the Phase 1 mock layer entirely: products, basket,
accounts, orders and product management all go through the Spring Boot
backend. There is **no mock fallback** — if the backend is down, screens
show an error and a retry, never mock data. No backend file was changed
to make this work, and nothing in this repo is pushed anywhere by the
frontend itself.

Photos under `public/images/` are generic placeholder photos, not brand
packshots (see `public/images/IMAGES.md`). The backend sends **no**
product image, so the frontend maps each exact backend product name to
a local photo, falling back to its category photo — see
`src/api/categories.ts`. That mapping is a frontend strategy, not
backend data.

## Run

Prerequisites: Node 20+ and, for live data, the backend running on
`http://localhost:8080` (see "Backend" below). The frontend itself runs
without the backend, but the catalogue, basket and account screens will
show backend-unreachable errors until it is up.

```bash
cd ~/workspace/orchard/frontend
npm install
npm run dev        # Vite dev server on http://localhost:4242
```

Port **4242 is deliberate**: the backend's dev `websiteUrl` is
`http://localhost:4242`, so Stripe's success/cancel returns land on
this dev server. The dev server also proxies API paths to
`http://localhost:8080` (see "API configuration").

## Build, check, test

```bash
npm run typecheck  # tsc -b (TypeScript strict)
npm run lint       # oxlint
npm test           # Vitest, run once (mocked network — no live backend needed)
npm run build      # tsc -b && vite build
npm run preview    # serve the production build locally (see the SPA-fallback note below)
```

## Backend (run separately, never from this repo)

From the Store REST API repository, with MySQL on `localhost:3306` and
Stripe **test** keys in the backend's own environment:

```bash
./mvnw spring-boot:run
curl http://localhost:8080/health   # expect {"status":"UP"}
```

The backend is Spring Boot 4.1.1 / Java 17, MySQL + Flyway. Its API
documentation (when running) is at `/swagger-ui/index.html`.

## API configuration

- `VITE_API_BASE_URL` (see `.env.example`): leave **empty** for local
  dev — the Vite proxy forwards `/products`, `/carts`, `/orders`,
  `/checkout`, `/auth`, `/users`, `/admin`, `/health` to
  `http://localhost:8080`. This keeps the page same-origin with the
  backend, which matters twice over: the backend has **no CORS
  configuration**, and the HttpOnly refresh cookie (path
  `/auth/refresh`) only works same-origin.
- Set `VITE_API_BASE_URL` only when the frontend is served from the
  backend's origin, or after the backend gains an explicit CORS config
  for the frontend origin. Never use a wildcard CORS origin with
  credentialed requests.
- **Never** put database credentials, JWT signing secrets, Stripe secret
  keys or webhook signing secrets in frontend env files. They live only
  in the backend's environment. Do not commit a real `.env` file.
- SPA/API collision: frontend routes `/products/:id` and `/checkout`
  share prefixes with backend API paths. The dev proxy bypasses
  `Accept: text/html` requests to `index.html`, so browser refreshes
  work, while `fetch()` calls still proxy. A static production host
  must configure its own SPA fallback for these routes — `vite preview`
  does **not** apply the bypass (see `docs/integration-testing.md`).

## Routes

| Route | What it does (Phase 2) |
|---|---|
| `/` | Home: hero, category discovery (10 seed categories), fruit-aisle section, editorial section, market picks, footer with local newsletter form |
| `/shop` | Live catalogue: client-side search, category filter, name/price sort, active-filter state, reset, result count, load-more + pagination, empty state, mobile filter drawer. The backend has no search/sort/pagination, so filtering runs over the loaded list. |
| `/products/:productId` | Real product by backend id: photo (local placeholder), name, description, price (pack size is in the name — the backend sends no unit), quantity controls, add to basket, related products, breadcrumbs, not-found state |
| `/cart` | Server basket: quantity +/-, remove, clear with confirmation, server subtotal, empty state. The basket is an anonymous backend cart (UUID in localStorage, not user-linked). |
| `/checkout` | Real checkout: review, then `POST /checkout` creates a PENDING order, clears the server basket, and redirects to Stripe's hosted page (URL allow-listed to HTTPS `*.stripe.com`). No card fields anywhere in ORCHARD. |
| `/checkout-success`, `/checkout-cancel` | Stripe return pages. Success fetches the real order status from the server — a return URL alone never proves payment; PENDING means the webhook has not arrived yet. Cancel has no order id (backend sends none). |
| `/checkout/result` | Order view by `?orderId=` or the last checkout, fetched from the server; graceful empty state on direct navigation |
| `/login`, `/register` | Real auth: `POST /auth/login` (15-min access token in memory + HttpOnly refresh cookie) and `POST /users` (lowercase email, password 6–25, new accounts are regular customers). No demo account. |
| `/account`, `/account/profile`, `/account/orders`, `/account/orders/:orderId`, `/account/security` | Real account: overview, profile edit (name/email only — the backend has no phone/city), order history/detail with payment status, real password change for your own account |
| `/manage`, `/manage/products`, `/manage/products/new`, `/manage/products/:productId/edit` | Product management, ADMIN-only on the backend. Manage navigation shows only when `GET /admin/hello` succeeds (a UI hint, never security); the backend enforces every write with 403. No inventory/supplier/delivery/analytics — the backend has none. |

## Architecture

- `src/api/http.ts` — central fetch client: base URL, 15 s timeout, JSON/204/non-JSON handling, normalised error kinds (network/auth/authz/not-found/validation/conflict/rate-limit/server/unexpected), one silent refresh + retry on 401. Access token held **in memory only**.
- `src/api/contracts.ts` — wire DTOs, verified against backend source (see `docs/api-contract-matrix.md`).
- `src/api/mapping.ts` — explicit DTO → view-model mapping (price parsing, image mapping, no invented units/flags).
- `src/api/categories.ts` — categories from the backend seed migration V5 (there is no `GET /categories` endpoint) + the frontend image mapping.
- `src/api/services.ts` — one function per endpoint; components never build URLs or headers.
- `src/state/AppContext.tsx` — shared catalogue/cart/session/orders state; server cart total is authoritative; stale cart ids (backend reseeded) are dropped and the basket restarts empty.
- `src/domain/repositories.ts` — pure client-side helpers only (filter/sort, count/subtotal/detailed).
- `src/domain/format.ts` — centralised INR and date formatting.
- `src/domain/storage.ts` — safe localStorage handling (malformed data falls back, never crashes).

Persisted in the browser: theme (`orchard.theme`) and the anonymous cart
id (`orchard.cartId`, a UUID — not sensitive). The access token is
never persisted; it is restored across reloads via `POST /auth/refresh`
using the HttpOnly cookie. The backend has **no logout endpoint**, so
signing out clears browser state only — the refresh cookie survives
until expiry (see `docs/phase-2-integration-plan.md`).

Themes: light, dark (warm plum surfaces, not a plain inversion) and
system, toggled from the header. GSAP is used only for hero entrance
and section reveals and is skipped when `prefers-reduced-motion` is set.

## Docs

- `docs/phase-2-integration-plan.md` — architecture, approach, security, unresolved blockers
- `docs/api-contract-matrix.md` — every endpoint, verified vs non-existent, with schemas and error shapes
- `docs/integration-testing.md` — checks actually run, and which live flows remain unverified (no backend was available during Phase 2)
- `docs/backend-capability-audit.md` — Phase 1 read-only audit (still accurate; Phase 2 docs supersede it where they differ)
- `docs/mock-data-and-integration-boundary.md` — Phase 1 mock architecture (historical: the mock layer was removed in Phase 2)

## Limitations (honest)

- **No live backend was available while building Phase 2** (nothing on
  `localhost:8080`), so live catalogue/auth/cart/checkout/Stripe/admin
  flows are implemented and unit-tested against mocked HTTP, but are
  **unverified end-to-end** — see `docs/integration-testing.md` for the
  exact list and how to run them.
- The backend has no CORS config and its production `websiteUrl` points
  at the backend host, not a frontend — both need separate, approved
  backend changes before a deployed (non-proxy) frontend + Stripe
  returns work end-to-end.
- The backend has no logout/revocation and no ownership checks on
  `/users/**` — the frontend never exposes the user list and only ever
  touches its own account, but those are backend gaps, not frontend
  fixes.
- Product photos are placeholders; the backend sends no images, units,
  stock, ratings, search, pagination or sort.
- JS bundle is ~551 kB (Vite chunk-size warning); code-splitting is a
  future optimisation.
