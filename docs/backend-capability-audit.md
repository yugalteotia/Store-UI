# Backend Capability Audit — Store REST API (Phase 1, read-only)

Source inspected: a fresh read-only clone of https://github.com/yugalteotia/Store-REST-API
(cloned to `/tmp/orchard-audit`, never edited). Backend files were **not** modified, and
Phase 1 of ORCHARD does **not** connect to this backend at all. This audit exists only so a
future Phase 2 integration is designed against verified behaviour, not assumptions.

Stack (from `pom.xml`): Spring Boot 4.1.1, Java 17 (`java.version` 17; the README mentions
Java 26 — treat the pom as authoritative for the build), MySQL + Flyway, Spring Security + JWT
(jjwt), Stripe Java SDK (INR), MapStruct, Lombok, Thymeleaf (only a trivial home template).

## Verified product fields and operations

Product entity / DTO fields (verified in `products/Product.java`, `ProductDto.java`):
`id` (Long), `name`, `description`, `price` (BigDecimal), `categoryId` (Byte).

Operations (verified in `products/ProductController.java`):
- `GET /products` — list all; optional `?categoryId=` filter.
- `GET /products/{id}` — single product; 404 handling via `ProductNotFoundException`.
- `POST /products` — admin only (see below).
- `PUT /products/{id}` — admin only.
- `DELETE /products/{id}` — admin only.

Create/update request bodies (`AddProductRequest`, `UpdateProductRequest`): only
`name`, `description`, `price`, `categoryId`. There is no image, stock, variant, rating,
discount, unit, or slug field anywhere in the product model.

## Category-related capabilities

- `Category` entity: `id` (Byte), `name`, and a product set. Categories exist in the
  database and are seeded by Flyway migration `V5__populate_database.sql` (10 categories,
  in seed order: Fruits, Vegetables, Dairy, Bakery, Beverages, Pantry Staples, Snacks,
  Frozen Foods, Personal Care, Household Essentials; 50 products, 5 per category).
- **There is NO `GET /categories` endpoint in the codebase.** No controller returns a
  category list, so a frontend cannot fetch categories from the API. Any Phase 2 frontend
  would have to derive categories from product responses, hardcode the seed list, or add a
  backend endpoint (a backend change, out of Phase 1 scope).
- The ORCHARD mock categories (Citrus & sunshine, Apples & pears, etc.) are fictional
  merchandising categories. They are **not** backend category records and must not be
  presented as such.

## Actual cart and order behaviour

Cart (`carts/CartController.java`, `CartService.java`):
- Anonymous cart, identified by a UUID — no login required to create or use a cart.
- `POST /carts` → 201 with a cart DTO; `GET /carts/{cartId}`; `POST /carts/{cartId}/items`
  with `{productId}` (adds quantity 1); `PUT /carts/{cartId}/items/{productId}` with
  `{quantity}`; `DELETE /carts/{cartId}/items/{productId}`; `DELETE /carts/{cartId}/items`
  (clear). Cart item total = product price × quantity.
- Errors: missing cart → 404 "Cart not found."; missing product on add → 400
  "Product not found." Quantity validation is via `@Valid` on the update DTO.

Orders (`orders/OrderController.java`, `OrderService.java`):
- Authenticated only: `GET /orders` (current user's orders), `GET /orders/{id}`.
- `GET /orders/{id}` for another user's order → 403 "You don't have access to this order!";
  unknown order → 404.
- Order fields: `id`, `createdAt`, `items`, `totalPrice`, and a payment `status`.

## Actual authentication and authorization rules

Auth (`auth/AuthController.java`, `AuthService.java`, `JwtService.java`, `JwtConfig.java`,
`SecurityConfig.java`):
- `POST /auth/login` returns an access token in the body and sets a refresh-token cookie:
  HttpOnly, Secure, path `/auth/refresh`, max-age 7 days.
- Access token lifetime: **15 minutes** (`accessTokenExpiration: 900` in `application.yaml`);
  refresh token lifetime: **7 days** (`604800`).
- `POST /auth/refresh` issues a new access token from the refresh cookie (401 if missing/invalid).
- `GET /auth/me` returns the current user.
- **No logout endpoint exists.** There is no endpoint that revokes or clears tokens.
- Roles: `USER` and `ADMIN` (JWT claim `role`; authorities are `ROLE_<role>`).
- Registration: `POST /users` — `UserService` forces every new registration to `Role.USER`;
  an admin must be promoted directly in the database.
- `UserDto` exposes only `id`, `name`, `email`. `PUT /users/{id}` updates name/email;
  `POST /users/{id}/change-password` changes a password. Registration validation: email must
  be lowercase (custom `@LowerCase` validator), password 6–25 characters (verified in
  `RegisterUserRequest` / `LowerCaseValidator` — the exact bounds should be re-checked
  against the live DTO if Phase 2 reuses them).
- Security: stateless sessions, CSRF disabled, unauthenticated requests → 401 via
  `HttpStatusEntryPoint`, forbidden → 403. Public routes are defined per-feature
  (`*SecurityRules` classes); everything else requires authentication.
- Admin-only: `POST/PUT/DELETE /products` and `GET /admin/hello`.
- **No CORS configuration was found anywhere in the backend source.** A separately hosted
  frontend cannot call this API from a browser until a CORS change is approved and made in
  the backend repo (deferred by the user; not done in Phase 1).

## Checkout / payment flow

Verified in `payments/CheckoutService.java`, `StripePaymentGateway.java`, `StripeConfig.java`:
- Authenticated `POST /checkout` with `{cartId}`:
  1. Creates an order with status `PENDING`.
  2. **Clears the cart immediately**, before any payment is confirmed.
  3. Creates a Stripe Checkout Session and returns `{orderId, checkoutUrl}`.
- Stripe redirects to `websiteUrl + /checkout-success?orderId=<id>` on success and
  `websiteUrl + /checkout-cancel` on cancellation. `websiteUrl` is `http://localhost:4242`
  in dev and `https://store-rest-api.hostless.app` in prod.
- A Stripe webhook flips the order to `PAID` or `FAILED` (signature-verified;
  deserialization failure → `PaymentException`).
- `PaymentStatus` values are `PENDING`, `PAID`, `FAILED`, `CANCELLED`. **This is a payment
  status, not a delivery status.** The backend has no delivery, fulfilment, tracking, or
  shipment state at all.
- Checkout errors: missing/empty cart → handled as a checkout error; Stripe failures →
  generic "Error creating a checkout session."

## Exception handling (verified)

- Global: `GlobalExceptionHandler` maps validation failures to 400 with a field→message map
  and unreadable bodies to 400 "Invalid Request body."
- Per-controller handlers exist for cart-not-found (404), product-not-found (400 on add),
  order-not-found (404), and access-denied (403). Error shape is not uniform across
  controllers (`ErrorDto` vs ad-hoc `Map` bodies) — a Phase 2 client must not assume one
  error format.

## Missing capabilities (verified absent — do not invent)

- No product images, image URLs, or image upload.
- No stock / inventory counts, stock reservations, or low-stock behaviour.
- No search endpoint (no name/description search parameter), no pagination, no sorting.
- No product variants, units, weights, or slugs.
- No reviews, ratings, discounts, coupons, or promotional pricing.
- No delivery slots, delivery zones, delivery fees, or delivery tracking.
- No wishlist endpoints, and no address endpoints — even though `Address` and `Profile`
  entities (and repositories) exist in the codebase, they have **no REST endpoints**.
- No `GET /categories` endpoint (see above).
- No logout, no password-reset flow, no email verification.
- No order cancellation endpoint, no order-status (delivery) endpoint.
- No public health-gated storefront data beyond `GET /health` and the product/cart routes.

## Unresolved questions (for Phase 2, to confirm against a running backend, not assumed here)

1. The exact validation bounds/messages on `RegisterUserRequest` (password length, name rules).
2. Whether `PUT /products/{id}` returns a body or 204 in practice (controller returns `Void`).
3. Whether the seeded V5 catalogue is the live production catalogue or has since changed.
4. The deployed backend's current CORS posture (none found in code, but a reverse proxy
   could add headers — verify against the live deployment before Phase 2).
5. Stripe webhook event types actually handled (checkout session completed vs payment intent
   events) — the handler extracts an order id and a PAID/FAILED result, but the exact event
   mapping should be confirmed from the webhook code path before relying on it.

## Frontend concepts: supported vs future backend work

Supported by the real backend today (Phase 2 could wire these):
catalogue list + category filter + product detail; anonymous cart with quantity rules;
authenticated order list/detail; login/refresh/me; registration (USER only); profile update;
password change; admin product CRUD; Stripe-hosted checkout with PENDING → PAID/FAILED.

Would require future backend work (NOT in Phase 1, NOT assumed):
category listing endpoint; product images; search/pagination/sort; stock; units/slugs;
ratings/reviews; discounts/coupons; delivery slots/zones/fees/tracking; wishlist and address
endpoints; logout/revocation; CORS for a hosted frontend; a uniform error format.
