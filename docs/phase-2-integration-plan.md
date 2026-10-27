# Phase 2 integration plan — ORCHARD × Store REST API

## Current state (verified, 2026-10-27)

- **Frontend (Phase 1, as found):** React 19 + TypeScript strict + Vite 8 + React
  Router 7 + Tailwind 3 + Lucide + GSAP + React Hook Form + Zod + Vitest.
  Routes: `/`, `/shop`, `/products/:productId`, `/cart`, `/checkout`,
  `/checkout/result`, `/login`, `/register`, `/account*`, `/manage*`.
  State lived in `src/state/AppContext.tsx` over mock repositories in
  `src/domain/`; basket + theme persisted in localStorage; session and
  demo orders were in-memory only. No TanStack Query was installed, and
  none was added — the app's server state is small (one catalogue, one
  cart, one session, one order list) and is managed by the context with
  explicit reload/invalidate calls, which avoids a second caching layer
  disagreeing with the server.
- **Backend (as found, read-only clone at `/tmp/orchard-audit2`, commit
  `bf2fc98`):** Spring Boot **4.1.1**, Java **17** (pom `java.version`;
  the backend README's "Java 26" does not match the pom — the pom wins),
  MySQL + Flyway, Spring Security + JWT (jjwt), Stripe Java SDK, MapStruct,
  Lombok. Single test class (`StoreApplicationTests`, context load only).
  OpenAPI at `/v3/api-docs`, Swagger UI at `/swagger-ui/index.html`.
  **No backend file was changed in Phase 2, and nothing was pushed.**

## Architecture after Phase 2

```
src/api/http.ts          central fetch client, error normalisation,
                         in-memory token, single-flight silent refresh
src/api/contracts.ts     wire DTOs (verified shapes only)
src/api/mapping.ts       DTO -> ORCHARD view model (explicit, tested)
src/api/categories.ts    seed-derived categories + frontend image mapping
src/api/services.ts      one function per endpoint, no URLs in components
src/state/AppContext.tsx shared catalogue/cart/session/orders state
src/domain/repositories.ts PURE client-side helpers only (filter/sort,
                         count/subtotal/detailed) — no longer a data source
src/domain/seed.ts       DELETED (Phase 1 mock products are gone)
src/pages/*              presentation only; all data via AppContext/services
```

Phase 1 mock repositories survive **only as a concept in the old tests** —
they were deleted from runtime. There is **no mock fallback at runtime**:
an API failure shows an error + retry, never a mock product, order or
session. Mixing mock and real data in one result is impossible by
construction (the mock data no longer exists in the bundle).

## Integration approach (execution order followed)

1. HTTP layer (`api/http.ts`) — base URL, timeout, JSON/204/non-JSON,
   normalised error kinds, one silent refresh + retry on 401.
2. Catalogue — `GET /products` (+ detail), mapped to view models,
   client-side search/filter/sort over the loaded list.
3. Auth — `POST /auth/login`, `POST /users` (registration),
   `GET /auth/me`, `POST /auth/refresh`, `GET /admin/hello` (UI hint).
4. Cart — anonymous-UUID cart, server total authoritative.
5. Orders — `GET /orders`, `GET /orders/{id}` (checkout creates orders).
6. Payments — `POST /checkout` + Stripe return pages.
7. Management — `POST/PUT/DELETE /products` (admin-only, 403 surfaced).
8. Tests, docs, verification (see `integration-testing.md`).

## Verified endpoint contracts (summary)

Full matrix: `docs/api-contract-matrix.md`. Headlines:

| Area | Verified contract |
|---|---|
| Products | `GET /products`, `GET /products?categoryId=N`, `GET /products/{id}` public; `POST/PUT/DELETE /products` ADMIN-only. DTO `{id, name, description, price, categoryId}` — no image, unit, stock, rating, search, pagination, sort. |
| Categories | **No endpoint.** Categories are seed migration V5 rows, IDs 1–10 in seed order. Frontend maps `categoryId` to those names (documented as seed-derived). |
| Cart | Public, anonymous UUID. `POST /carts` (201), `GET /carts/{id}`, `POST …/items {productId}` (adds exactly 1), `PUT …/items/{id} {quantity}` (1–1000), `DELETE …/items/{id}`, `DELETE …/items`. Response carries server `totalPrice`. No user link, no merge. |
| Auth | `POST /auth/login` → `{token}`, sets HttpOnly `Secure` refresh cookie (path `/auth/refresh`, 7 days). `POST /auth/refresh` → `{token}`. `GET /auth/me` → `{id, name, email}` only — **no role**. Access token 15 min. **No logout endpoint, no `/auth/register`.** |
| Registration | `POST /users` (public) → 201 `{id, name, email}`, no token. Lowercase email, password 6–25, name ≤255. New accounts are forced `USER`. |
| Users | `GET /users`, `GET /users/{id}`, `PUT /users/{id}`, `DELETE /users/{id}`, `POST /users/{id}/change-password` exist, but the service layer has **no ownership check** — any authenticated user can call them for any id. The frontend calls only its own id (from `/auth/me`) and **never renders the user list**. |
| Orders | **No `POST /orders`.** Orders are created by `POST /checkout`. `GET /orders` returns the current user's orders; `GET /orders/{id}` returns 403 for another user's order. `status` is a payment status (PENDING/PAID/FAILED/CANCELLED). |
| Checkout | `POST /checkout {cartId}` (auth) → `{orderId, checkoutUrl}`. Creates a PENDING order, creates a Stripe Checkout Session, then clears the cart; on Stripe failure the order is deleted and the call returns 500. |
| Webhook | `POST /checkout/webhook` — server-to-server only, Stripe signature verified against the webhook secret. Only `payment_intent.succeeded` → PAID and `payment_intent.payment_failed` → FAILED are handled. **Never called from the browser.** |
| Admin | `GET /admin/hello` — ADMIN-only; used as a UI hint for showing Manage navigation, never as security. |
| Health | `GET /health` → `{status: "UP"}`, public. |

Endpoints that **do not exist** (do not call them): `POST /auth/register`,
`POST /orders`, `GET /categories`, `POST /auth/logout`, `GET /users/me`,
any inventory/delivery/review/discount/wishlist/address endpoint
(entities for Address/Profile exist; endpoints do not).

## Security considerations

- **Tokens:** access token in memory only, never localStorage. Refresh via
  the HttpOnly cookie. Decoded JWT claims are never used: the JWT does
  contain a `role` claim, but the frontend treats it as untrusted and
  relies on backend 403s. `/auth/me` gives no role, so Manage visibility
  is a hint only.
- **Logout weakness (backend limitation):** with no logout endpoint and
  no token revocation, "sign out" only clears browser state. The refresh
  cookie survives until expiry, so a later visit silently restores the
  session. This is surfaced in the Account UI and below as a blocker for
  any shared-device claim. Fixing it needs a backend change (e.g. a
  logout endpoint that clears the cookie, or refresh-token rotation /
  revocation) — not done here.
- **User-endpoint exposure (backend limitation):** the absence of
  ownership checks on `/users/**` means any authenticated customer can
  list, read, update or delete any user, and change any user's password
  if they know the current password hash check passes — in practice the
  old-password check blocks blind changes, but list/read/update/delete
  are unguarded. The frontend mitigates by never exposing them; the
  backend should add ownership/admin checks. Not changed here.
- **CORS:** the backend has **no CORS configuration at all**. Local dev
  therefore uses the Vite proxy (same-origin). A separately-hosted
  production frontend will be blocked by the browser until the backend
  adds an explicit, non-wildcard CORS config for the frontend origin.
  Never use `*` with credentialed requests.
- **Checkout redirect:** the returned `checkoutUrl` is allow-listed to
  HTTPS `*.stripe.com` before any navigation; any other URL is refused
  with an on-screen error. No Stripe secret, webhook secret, DB
  credential or JWT signing secret is in the frontend or its env files.
- **Errors:** the client shows only backend `error`/`message` strings or
  field-error maps, never stack traces, SQL or tokens. Passwords and
  Authorization headers are never logged.
- **CSRF note:** `SecurityConfig` disables CSRF (stateless JWT design).
  The refresh cookie has no explicit `SameSite` attribute (browser
  default Lax applies). Through the same-origin proxy this is the
  intended flow; it is noted, not "fixed" from the frontend.

## Session persistence trade-off (explicit)

- Access token: memory only → a reload loses it, but the refresh cookie
  restores it silently (one `POST /auth/refresh` + `GET /auth/me`).
- The refresh cookie is `Secure`. On `http://localhost` modern browsers
  treat localhost as a secure context, so the cookie is expected to be
  accepted there; on a plain-HTTP LAN IP it would be rejected and reload
  restore would fail (user must sign in again). Over HTTPS it works.
- If refresh fails (expired/rejected cookie, backend down), the app is
  simply signed out — the catalogue still loads, the anonymous cart
  still works, checkout prompts sign-in.

## Unresolved issues / blockers (separate approved backend changes only)

1. **CORS for production** — no backend CORS config; direct browser calls
   from another origin will fail. Local proxy is the workaround.
2. **`websiteUrl` for Stripe returns** — dev `websiteUrl` is
   `http://localhost:4242`, prod is `https://store-rest-api.hostless.app`
   (the backend host, not a frontend). ORCHARD dev runs on 4242 so local
   Stripe returns land correctly; a deployed frontend needs
   `websiteUrl` pointed at the frontend origin in a backend config
   change. Without it, Stripe returns go to the wrong host.
3. **No logout / token revocation** — see security section.
4. **No ownership checks on `/users/**`** — see security section.
5. **Duplicate registration response** — `DuplicateUserException` has no
   exception handler, so the documented 400 is not what the code
   produces (likely a 500 with Spring's default body). The frontend
   surfaces whatever message the server returns instead of assuming 400.
6. **Wrong-old-password response** — `BadCredentialsException` from
   `UserService.updatePassword` likewise has no handler in
   `UserController`; the exact status is unverified without a live run.
   The frontend treats it as "current password not accepted" only for
   401, otherwise shows the server message.
7. **Cart quantity message vs bound** — `@Max(1000)` but the message
   says "must not exceed 100". The frontend clamps to 1000 (the
   annotation) and documents the contradiction.
8. **`GET /products?categoryId=` empty-value edge** — the controller
   declares `defaultValue = ""` for a `Byte`. The frontend never sends
   an empty value (it omits the parameter), so this is avoided, not
   resolved.
9. **No live backend was available** during Phase 2 (nothing on
   `localhost:8080`), so every live-flow verification in
   `integration-testing.md` is marked UNVERIFIED, not claimed.

## What changed in the frontend (files)

- New: `src/api/{http,contracts,mapping,categories,services}.ts`,
  `src/pages/StripeReturn.tsx`, `docs/{phase-2-integration-plan,
  api-contract-matrix,integration-testing}.md`, `.env.example`.
- Rewritten: `src/state/AppContext.tsx`, `src/domain/types.ts`,
  `src/domain/repositories.ts` (pure helpers only),
  `src/pages/{Home,Shop,ProductDetail,CartPage,Checkout,CheckoutResult,
  Auth,Account,Manage}.tsx`, `src/components/{Header,ProductCard}.tsx`,
  `src/pages/schemas.ts`, `vite.config.ts`, `README.md`, tests.
- Deleted: `src/domain/seed.ts` (mock products/categories).
- Backend files changed: **none**. Store-UI untouched. Nothing pushed.
