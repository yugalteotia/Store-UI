# Integration testing — Phase 2

## What was run (all commands from `~/workspace/orchard/frontend`)

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc -b`, strict) | ✅ Pass, 0 errors (final run; two real issues were found and fixed during the work: old Phase 1 tests referencing deleted mock APIs, and two unused imports) |
| `npm test` (Vitest, mocked network — no live backend needed) | ✅ **38/38 pass** (3 files): `api.test.ts` (19), `repositories.test.ts` (11), `app.test.tsx` (8). Two test-side failures were found and fixed (a product name appearing multiple times on Home, and an async unknown-product assertion). |
| `npm run lint` (oxlint) | ✅ 0 errors, 4 warnings — all `set-state-in-effect` notes of the same harmless class as Phase 1 (state set inside an effect that loads data); no lint errors. |
| `npm run build` (`tsc -b && vite build`) | ✅ Pass in ~1.75 s. JS bundle 551.52 kB (Vite >500 kB chunk warning, as in Phase 1 — code-splitting is a future optimisation, not a failure). CSS 18.35 kB. |
| Dev-server serve check (`vite`, port 4242) | ✅ Browser-style requests (`Accept: text/html`) return **200 `index.html`** for `/`, `/shop`, `/products/1`, `/checkout`, `/checkout-success?orderId=1`, `/checkout-cancel`, `/account/orders` — the proxy bypass works, so refreshes on API-colliding routes do not 401. Fetch-style requests (`Accept: */*`) to `/products`, `/products/1`, `/health` correctly proxy and return 502 only because no backend is listening — that is the proxy working, not a frontend bug. |
| Production-preview check (`vite preview`, port 4199) | ⚠️ Partial: `/`, `/shop`, `/cart`, `/images/fresh-apples.jpg` return 200, but `/products/1`, `/checkout-success`, `/checkout-cancel` return **502**. Root cause found: the preview server applies the dev proxy config to `/products/*` and `/checkout*` without the text/html bypass, so it forwards those page requests to the (absent) backend. This is a preview-server artefact, not the dev or deployed behaviour — but it means **a static production host must configure its own SPA fallback** for those routes; do not rely on `vite preview`'s routing. |
| Source/security greps | ✅ `fetch(` appears only in `src/api/http.ts` (the central client). No `STRIPE_SECRET`, webhook secret, JWT secret or DB credential in `src/` or `.env.example`. No token/password logging. Checkout redirect is allow-listed to HTTPS `*.stripe.com` (tested, including hostile look-alikes). No `GET /users` (user list) call anywhere in `src/`. No webhook call from the browser. |

## What the unit tests cover (mocked at the HTTP boundary)

- HTTP client: JSON success + bearer header, 204 empty, field-error
  validation, `{error}` bodies, 403/404/500 kinds, network failure,
  401 → one silent refresh → retry, refresh failure → auth error +
  token cleared, no recursion on the refresh endpoint itself.
- Checkout redirect validation: accepts `checkout.stripe.com`,
  rejects `http:`, `checkout.stripe.com.evil.example`, and plain URLs.
- DTO mapping: string/number prices, image-by-name mapping, category
  fallback, unknown-name fallback, order status preserved, unparseable
  price → null (dropped, never ₹0).
- Services: list drops bad-price rows; login posts `/auth/login` then
  `/auth/me` with the token; registration posts `/users` (not
  `/auth/register`); cart add/update bodies; checkout sends only
  `{cartId}`; management 403 → `authz`; unknown product → `not-found`.
- Client catalogue: search (case-insensitive), numeric-category filter,
  price/name sort, empty search, 10 seed categories in order.
- App smoke (mocked network): home renders + live products appear,
  unknown route/product/checkout-result states, Stripe cancel page,
  theme cycle + persistence, malformed cart-id/theme tolerated, login
  inline validation.

## Live-backend E2E — NOT RUN (no backend available)

Checked first: `curl http://localhost:8080/health` → no listener.
Per the task, MySQL/Spring Boot were **not** started by this work, no
test account was created, and no charge was attempted. The following
workflows are therefore **UNVERIFIED** against a live backend and must
not be described as verified end-to-end:

1. Fetch the real product catalogue + product detail (code path is the
   same as the mocked tests, but no live payload was observed).
2. Register / login / silent refresh / session restore, including
   whether the `Secure` refresh cookie is accepted over plain
   `http://localhost` in the user's browser.
3. Anonymous cart create/add/update/remove/clear and server totals.
4. Checkout → Stripe test-mode session → success/cancel returns →
   webhook → PAID/FAILED status visible on `/checkout-success` and in
   account orders.
5. Management create/update/delete as ADMIN, and 403 as a regular user.
6. Cross-user access: another user's order (expect 403) and the
   `/users/**` ownership gap (expect the backend to allow it — a
   backend bug, not a frontend behaviour to rely on).
7. Duplicate registration and wrong-old-password exact status codes
   (see plan: likely 500s from missing handlers, not the documented
   400/401).
8. `GET /products?categoryId=` with an empty value, and the exact
   Jackson serialisation of `BigDecimal` prices and `LocalDateTime`
   `createdAt` on a live server.

## How to run the live checks when the backend is up

```bash
# Terminal 1 — backend (from the Store-REST-API repo, separately):
#   needs MySQL on localhost:3306 and Stripe test keys in its .env
./mvnw spring-boot:run
curl http://localhost:8080/health        # expect {"status":"UP"}

# Terminal 2 — ORCHARD (from ~/workspace/orchard/frontend):
npm install
npm run dev                              # http://localhost:4242
```

Then, in the browser, with a **test account only** (never a real
customer account): register → sign in → shop → add to basket → change
quantities → sign out/in (session restore) → checkout → Stripe **test**
card → return → confirm the order status on `/checkout-success` and in
`/account/orders` → repeat checkout and cancel → as a second test
account, open the first account's order URL (expect 403) → as an admin
(DB-promoted) account, create/edit/delete a product and confirm the
shop reflects it → as a regular account, attempt the same (expect 403
and no false success). Never use a real card or production keys.

## Regression note

Phase 1's "mock order creation" and "shared mock CRUD" tests were
deleted with the mock layer and replaced by the API-boundary tests
above. The Phase 1 behaviour they covered (a local demo order, local
CRUD) intentionally no longer exists: in Phase 2 an order exists only
when the server creates it, and a product change exists only when the
server accepts it.
