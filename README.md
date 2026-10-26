# FreshStore — store-ui

React + Vite + TypeScript frontend for the [Store REST API](https://github.com/yugalteotia/Store-REST-API)
(an online grocery store backend: Spring Boot, MySQL, JWT, Stripe).

**This repo is intentionally separate from the backend repo. Nothing here changes the backend.**

## Tech

- React 19 + Vite + TypeScript
- React Router, TanStack Query, Tailwind CSS v4
- Flipkart-inspired look: blue header + search, category strip, white
  product cards, saffron Add buttons
- Smoothness: 5-min query cache, no refetch on window focus,
  `keepPreviousData` (old page stays visible while the next loads),
  skeleton cards instead of blank "Loading…" screens, page fade/slide
  transitions, slide-in cart drawer, hover lift + image zoom

## Run locally (no CORS change needed)

The trick for local testing: the browser only talks to the Vite dev server,
and Vite proxies API calls to the backend. Same origin → no CORS issue,
and the HttpOnly refresh cookie works.

1. Start the backend (from the Store-REST-API repo, MySQL running):

   ```bash
   ./mvnw spring-boot:run   # backend on http://localhost:8080
   ```

2. In this repo:

   ```bash
   npm install
   npm run dev   # frontend on http://localhost:4242
   ```

   Port 4242 is deliberate: the backend's dev `websiteUrl` is
   `http://localhost:4242`, so Stripe success/cancel redirects land back
   on this dev server.

   Refresh-safe: frontend routes like `/orders`, `/products/:id` and
   `/checkout` collide with backend API paths, so a browser refresh
   used to be proxied to the backend and answered 401 ("no access").
   `vite.config.ts` now bypasses the proxy for document navigations
   (`Accept: text/html` → `index.html`) while API `fetch()` calls
   still proxy to the backend.

3. Open http://localhost:4242 — shop as a guest, login/register to
   checkout, pay in Stripe test mode, and watch the order flip from
   PENDING to PAID on `/checkout-success`.

## What works

- Home, Shop (category filter via `?categoryId=`, client-side search/sort),
  Product detail, cart drawer (anonymous cart UUID in localStorage)
- Login / Register (register then auto-login, since `POST /users`
  returns no token), silent token refresh on 401 (15-min access token,
  7-day HttpOnly refresh cookie)
- Checkout → Stripe hosted page → `/checkout-success?orderId=…`
  (polls while PENDING) / `/checkout-cancel`
- My Orders + Order detail, Account (profile + change password)
- Admin products (create/edit/delete) — gated on the JWT `role` claim;
  new registrations are `USER` by default
- Session handling: access token in localStorage (survives reload and
  browser back/forward), refresh via the HttpOnly cookie. Protected
  pages redirect guests to `/login?next=<page>` instead of showing an
  API error, and logged-in users never see the login page again via
  back/forward. A stale cart id (backend reseeded) is dropped
  automatically instead of breaking the cart drawer.

## Known backend limits (reflected honestly in the UI, not faked)

- No CORS config in the backend → a separately-hosted production
  frontend will need one. That's a later, separate backend change.
- No product images, stock, search, pagination, or sort endpoint →
  search/sort are client-side. Product photos are generic placeholder
  images stored locally in `public/images/` (sources in
  `public/images/IMAGES.md`) — NOT brand packshots, to be replaced
  with proper licensed packshots later.
- No `GET /categories` endpoint → the 10 seeded categories are
  hardcoded in `src/lib/api.ts` (V5 seed order). Verify if you reseed.
- No wishlist/address endpoints (entities exist, endpoints don't) →
  those sections are absent on purpose.
- Order status is a *payment* status (PENDING/PAID/FAILED/CANCELLED),
  not a delivery status.
- No logout endpoint → logout clears the local access token only.
- The backend clears the cart when it creates the Stripe session,
  so a cancelled checkout means re-adding items.

## Build

```bash
npm run build   # typecheck + production build
npm run preview
```
