# API contract matrix — Store REST API (verified from source)

Source: read-only clone, backend commit `bf2fc98`, Spring Boot 4.1.1 /
Java 17. Every row was checked against a controller, DTO, security-rules
class, service or migration — not against the README. The README's list
is candidate-only: several of its routes do not exist, and several
existing routes are not in it.

Conventions: "Public" = a `SecurityRules` class permits it (or the
controller is annotated `@SecurityRequirements`); otherwise the request
needs `Authorization: Bearer <access token>` and falls under
`anyRequest().authenticated()`. Unauthenticated → 401 (empty body via
`HttpStatusEntryPoint`); authenticated but wrong role → 403 (empty body
via the access-denied handler). Validation failures → 400 with a
field→message map (global handler) unless a controller handler says
otherwise. Prices are JSON numbers (Jackson `BigDecimal`); currency is
INR (Stripe line items use `currency: "INR"`, unit amount = price × 100
paise). No endpoint in this matrix paginates or sorts.

## Auth

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `POST /auth/login` | Public | `{email, password}` — email `@Email`, both `@NotBlank` | 200 `{token}` (access token); sets HttpOnly `Secure` cookie `refreshToken`, path `/auth/refresh`, max-age 604800 (7 days) | 400 validation map; 401 empty body on bad credentials (`AuthController` handler) | Yes (no side effect) |
| `POST /auth/refresh` | Public | Cookie `refreshToken` (no body) | 200 `{token}` | 400 if cookie missing (Spring: missing `@CookieValue`); 401 if token invalid/expired (`BadCredentialsException` → 401 handler) | Yes |
| `GET /auth/me` | Auth | — | 200 `{id, name, email}` | 401 no/invalid token; 404 if the token's user no longer exists. **No role field.** | Yes |
| `POST /auth/logout` | — | — | **DOES NOT EXIST** | Frontend logout = clear client state only. | — |

Token facts: access 900 s, refresh 604800 s (`application.yaml`).
JWT claims: `sub` = user id, `email`, `name`, `role`. The frontend
never decodes claims for authorisation.

## Users

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `POST /users` | Public | `{name (≤255), email (lowercase, valid), password (6–25)}` | 201 `{id, name, email}` + `Location: /users/{id}`. New account forced `Role.USER`; password BCrypt-hashed. **This is the registration endpoint — there is no `/auth/register`.** | 400 validation map; duplicate email → `DuplicateUserException`, which has **no handler** (controller claims 400, code likely yields Spring's default 500 body) — see plan §Unresolved | **No** (creates a user; a retried duplicate fails) |
| `GET /users` | Auth (any role) | Optional `?sort=name\|email` (anything else → `name`) | 200 `UserDto[]` | 401. ⚠️ No admin/ownership restriction in code — any authenticated user can list all users. **Frontend never calls this.** | Yes |
| `GET /users/{id}` | Auth (any role) | — | 200 `{id, name, email}` | 401; 404 `ErrorDto{error}`. ⚠️ No ownership check. Frontend never calls it (uses `/auth/me`). | Yes |
| `PUT /users/{id}` | Auth (any role) | `{name, email}` — **no validation annotations** | 200 `{id, name, email}` | 401; 404. ⚠️ No ownership check. Frontend calls it only with the id from `/auth/me`. | Yes (idempotent overwrite) |
| `DELETE /users/{id}` | Auth (any role) | — | 204 (empty) | 401; 404. ⚠️ No ownership check. **Frontend never calls this.** | Yes |
| `POST /users/{id}/change-password` | Auth (any role) | `{oldPassword, newPassword}` — no validation annotations | 204 (empty) | 401; 404; wrong old password → `BadCredentialsException` with **no handler in `UserController`** (exact status unverified — see plan). ⚠️ No ownership check. Frontend calls it only with its own id. | Yes (no change on failure) |

## Products

DTO: `{id: Long, name: string, description: string|null, price: BigDecimal, categoryId: Byte}`.
No image, unit, stock, rating, description-length or price validation
on create/update (no `@Valid` on those controller methods).

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `GET /products` | Public | — | 200 `ProductDto[]` (full list) | — | Yes |
| `GET /products?categoryId=N` | Public | `categoryId` Byte (controller declares `defaultValue = ""`; frontend omits the parameter when unfiltered) | 200 filtered list | Unknown category id → 200 empty list (repository query, no 404) | Yes |
| `GET /products/{id}` | Public | — | 200 `ProductDto` | 404 empty body | Yes |
| `POST /products` | ADMIN only | `{name, description, price, categoryId}` | 201 `ProductDto` + `Location` | 400 empty body if category missing; 401; 403 non-admin | No (creates) |
| `PUT /products/{id}` | ADMIN only | `{name, description, price, categoryId}` | 204 (empty, no body) — frontend reloads the list to confirm | 400 empty body if category missing; 404 if product missing; 401; 403 | Yes (overwrite) |
| `DELETE /products/{id}` | ADMIN only | — | 204 (empty) | 404 if missing; 401; 403 | Yes |

Categories (seed migration V5, in insert order → ids 1–10): 1 Fruits,
2 Vegetables, 3 Dairy, 4 Bakery, 5 Beverages, 6 Pantry Staples,
7 Snacks, 8 Frozen Foods, 9 Personal Care, 10 Household Essentials.
Seed products: 50 (5 per category). There is **no `GET /categories`**.

## Carts (public, anonymous)

Cart entity: UUID id, `dateCreated`, items. No user association, no
expiry in code, no merge on login. Item DTO: `{product: {id, name,
price}, quantity, totalPrice}` — note the cart/order `ProductDto` has
**no description or categoryId**; the shop joins the catalogue for
display. Cart DTO: `{id, items, totalPrice}` (server-computed).

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `POST /carts` | Public | — | 201 `CartDto` + `Location: /carts/{id}` | — | No (creates a new cart each call — frontend creates at most one, then reuses its id) |
| `GET /carts/{cartId}` | Public | UUID path | 200 `CartDto` | 404 `{error: "Cart not found."}` (controller handler) | Yes |
| `POST /carts/{cartId}/items` | Public | `{productId}` (`@NotNull`, but the controller method has no `@Valid` — a missing field deserialises as 0 and then 400 "Product not found") | 201 `CartItemDto`. **Adds exactly 1**; if the product is already present, quantity +1. | 400 `{error: "Product not found."}` for missing product; 404 cart missing | No — each call adds 1 (frontend disables double-click via a busy flag and drives quantity with PUT after the first add) |
| `PUT /carts/{cartId}/items/{productId}` | Public | `{quantity}` `@Min(1) @Max(1000)` (message text says "must not exceed 100" — annotation wins) | 200 `CartItemDto` | 400 validation map or "Product not found."; 404 cart missing | Yes |
| `DELETE /carts/{cartId}/items/{productId}` | Public | — | 204 declared; controller also sets a body map (a 204 drops the body — frontend treats any 2xx as success) | 404 cart missing; missing item → `ProductNotFoundException` → 400 in this controller's handler (note: delete of a non-present item is a 400, not 404) | Yes |
| `DELETE /carts/{cartId}/items` | Public | — | 204 declared (same body caveat) | 404 cart missing | Yes |

## Orders

DTO: `{id, status, createdAt, items: [{product: {id, name, price}, quantity, totalPrice}], totalPrice}`.
`status` is `PaymentStatus`: PENDING, PAID, FAILED, CANCELLED.

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `POST /orders` | — | — | **DOES NOT EXIST.** Orders are created only via `POST /checkout`. | — | — |
| `GET /orders` | Auth | — | 200 `OrderDto[]` for **the current user only** (`OrderService.getOrders` filters by the authenticated user) | 401 | Yes |
| `GET /orders/{orderId}` | Auth | — | 200 `OrderDto` | 401; 404 empty body; 403 `ErrorDto{error: "You don't have access to this order!"}` for another user's order | Yes |

## Checkout & payments

| Method + path | Access | Request | Success | Errors / notes | Retry safe? |
|---|---|---|---|---|---|
| `POST /checkout` | Auth | `{cartId}` (`@NotNull`) | 200 `{orderId, checkoutUrl}`. Side effects, in order: order created PENDING from the cart (prices from server catalogue, never from the client); Stripe Checkout Session created; **cart cleared**; on Stripe failure the order is deleted and the call fails. | 400 `ErrorDto` for missing/empty cart; 401; 500 `ErrorDto{error: "Error creating a checkout session."}` on Stripe failure. **No idempotency key** — a retried request after a timeout may create a second order. Frontend never auto-retries; it tells the user to check orders. | **No** |
| `POST /checkout/webhook` | Public (Stripe signature is the auth) | Raw body + `Stripe-Signature` header | 200 (void). `payment_intent.succeeded` → PAID; `payment_intent.payment_failed` → FAILED; other events ignored. Signature verified with the webhook secret; invalid signature → `PaymentException` → 500 generic message. | **Server-to-server only. Never called from the browser.** | n/a |
| Stripe success/cancel URLs | — | — | Success: `{websiteUrl}/checkout-success?orderId={id}`. Cancel: `{websiteUrl}/checkout-cancel?` (note: no order id). `websiteUrl`: dev `http://localhost:4242`, prod `https://store-rest-api.hostless.app`. | Neither URL proves payment. The frontend fetches `GET /orders/{id}` and shows the server status; PENDING after a return means the webhook has not arrived yet. | — |

## Admin & health

| Method + path | Access | Notes |
|---|---|---|
| `GET /admin/hello` | ADMIN only | Returns `"Hello Admin!"` (plain string). 401 / 403 otherwise. Used by the frontend only as a UI hint. |
| `GET /health` | Public | `{status: "UP"}`. |

## Global error shapes

- Validation: 400, `{field: message, ...}` (global handler).
- Unreadable body: 400, `{error: "Invalid Request body."}`.
- Controller `ErrorDto`: `{error: string}` (orders 403, checkout 400/500).
- Cart controller: `{error: "Cart not found."}` (404), `{error: "Product not found."}` (400).
- Auth failures: 401 empty body (entry point / login handler); 403 empty body (access-denied handler).
- Unhandled runtime exceptions (e.g. duplicate registration, wrong old password): no handler → Spring Boot's default error body (`error` generic phrase + specific `message`). The frontend prefers `message` in that case.

## Assumptions explicitly NOT made

- No pagination, sorting, search, filtering beyond `categoryId`, wishlist,
  address, delivery, inventory, review, discount or analytics endpoint
  was found — none is called.
- No `GET /categories`, no category create/update/delete.
- No user-profile fields beyond name/email; no phone, city or avatar.
- No order status beyond the payment status; no tracking, no delivery
  estimate, no cancellation endpoint for customers.
- No refresh-token rotation, revocation or logout.
- No CORS configuration (verified by grep: no `Cors*`/`allowedOrigins`
  in the backend source).
