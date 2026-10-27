# ORCHARD hosting connection plan — DRAFT, NOT APPLIED

Status: **prepared for approval only.** Nothing in this document has been
pushed to GitHub, applied to the backend repo, or applied to any live
deployment. The backend was inspected from a fresh read-only clone
(`bf2fc98`, inspected 2026-10-27); that clone was never edited.

## 0. What the user must supply before anything can be applied

| Placeholder | What it is | Why it cannot be guessed |
|---|---|---|
| `<FRONTEND_ORIGIN>` | Exact deployed frontend origin, e.g. `https://orchard.example.com` — scheme + host (+ port if non-standard), **no trailing slash, no path** | CORS `allowedOrigins` and Stripe `websiteUrl` both require an exact origin. A wrong value = blocked API calls or Stripe returns landing nowhere. |
| Frontend host platform | Vercel, Netlify, GitHub Pages, or another static host | SPA fallback and base-path handling differ per host (see §5). |
| Backend deployment target | Confirm the prod backend to patch is the existing `https://store-rest-api.hostless.app` deployment | The patch changes `application-prod.yaml`; it only takes effect when that deployment is rebuilt/redeployed with the prod profile. |

Until `<FRONTEND_ORIGIN>` is known, **do not apply the patch** — a patch
with a placeholder in it would break Stripe returns and CORS outright.

## 1. Current state (verified, not assumed)

- Frontend (ORCHARD v2, `orchard-v2` branch of `yugalteotia/Store-UI`,
  commit `9d8eb6f`) runs locally on `http://localhost:4242` via the Vite
  proxy in `vite.config.ts` to `http://localhost:8080`. `VITE_API_BASE_URL`
  is empty (proxy mode). The browser is same-origin with the backend, so
  no CORS is needed locally.
- Frontend HTTP client (`src/api/http.ts`) uses `fetch(..., { credentials:
  'include' })` and sends `Authorization: Bearer <access token>` plus
  `Content-Type: application/json`. The access token lives in memory only;
  reloads restore it via `POST /auth/refresh`, which reads the HttpOnly
  refresh cookie.
- Backend: **no CORS configuration exists anywhere** — no
  `CorsConfiguration`, `WebMvcConfigurer`, `allowedOrigins`, or `http.cors()`
  was found in the clone. A direct browser call from any other origin is
  therefore blocked by the browser today, even though the API itself is up.
- Backend prod config (`src/main/resources/application-prod.yaml`):
  `websiteUrl: https://store-rest-api.hostless.app`, `server.port:
  ${PORT:8080}`, `address: 0.0.0.0`, datasource from
  `${SPRING_DATASOURCE_URL}`. Dev config
  (`application-dev.yaml`) has `websiteUrl: http://localhost:4242` and is
  **intentionally untouched** by this plan.
- Stripe URLs are built in
  `src/main/java/com/yugal/store/payments/StripePaymentGateway.java`:
  success = `websiteUrl + "/checkout-success?orderId=" + id`, cancel =
  `websiteUrl + "/checkout-cancel?"`. So prod Stripe returns currently go
  to the backend host, which serves no such pages.
- Deployed backend health check, 2026-10-27 (public, no auth, no charge):
  `GET https://store-rest-api.hostless.app/health` → **HTTP 200,
  `{"status":"UP"}`**, and `GET /products` → HTTP 200 with the seed
  catalogue. The backend is up; the blockers are purely CORS +
  `websiteUrl`, not availability.

## 2. Backend patch (draft — see `backend-hosting-patch.diff` beside this file)

Apply in the Store-REST-API repo, then redeploy the prod backend. Three
files, nothing else:

1. **NEW** `src/main/java/com/yugal/store/commons/CorsConfig.java` —
   a `CorsConfigurationSource` bean:
   - `allowedOrigins`: exactly `["<FRONTEND_ORIGIN>"]`
   - `allowedMethods`: `GET, POST, PUT, DELETE, OPTIONS`
     (OPTIONS is the preflight method; the frontend itself uses GET/POST/
     PUT/DELETE)
   - `allowedHeaders`: `Authorization, Content-Type` (the only headers
     the frontend sends)
   - `allowCredentials: true` — required because the frontend uses
     `credentials: 'include'` and the refresh flow is cookie-based
   - `maxAge: 3600` (1 hour of preflight caching; browsers cap this anyway)
   - Applied to `/**`.
2. **MODIFIED** `src/main/java/com/yugal/store/auth/SecurityConfig.java` —
   add `.cors(Customizer.withDefaults())` to the filter chain.
   **Why this line matters:** a `WebMvcConfigurer` CORS mapping alone
   does not reliably let preflight `OPTIONS` requests past Spring
   Security for authenticated endpoints. Enabling CORS in the security
   filter chain makes Spring apply the `CorsConfigurationSource` bean
   before the authorisation checks, so a preflight to e.g. `POST
   /checkout` is answered instead of 401'd. No authorisation rule is
   weakened by this change — it only answers preflights and adds the
   CORS headers for the one listed origin.
3. **MODIFIED** `src/main/resources/application-prod.yaml` —
   `websiteUrl: <FRONTEND_ORIGIN>` (was the backend host). Dev yaml is
   unchanged.

### Why wildcard CORS with credentials is forbidden

- Spring itself rejects `allowedOrigins: ["*"]` combined with
  `allowCredentials: true` (it throws at startup / silently refuses the
  combination in newer versions).
- Semantically, a credentialed wildcard would let **any** website make
  authenticated, cookie-bearing requests to the API from a visitor's
  browser. The whole point of the list above is that exactly one origin
  is trusted.

### Cookie / SameSite — the second, separate decision (read this)

The refresh cookie is set in
`src/main/java/com/yugal/store/auth/AuthController.java` (login):
`HttpOnly, path=/auth/refresh, maxAge=7 days, Secure=true`, **no
SameSite attribute**. Browsers therefore default it to `Lax`.

- Local dev (same-origin via proxy): unaffected — the cookie is
  first-party and is sent.
- Hosted cross-origin: the cookie belongs to the backend host while the
  page is on the frontend host, i.e. it is a **cross-site** cookie.
  With `Lax`, browsers do **not** send it on a cross-site `fetch`
  `POST /auth/refresh`. Consequence: even after the CORS patch, a hosted
  user who reloads, or whose 15-minute access token expires, will be
  signed out and must log in again. Public catalogue and the anonymous
  cart keep working; only session restore is affected.
- Fix (optional Patch B, **needs explicit approval, not in the diff**):
  set the refresh cookie with `SameSite=None; Secure` (Secure is already
  set, and `None` is rejected without it). Spring's `ResponseCookie`
  supports this, e.g. in `AuthController.login` build the cookie with
  `ResponseCookie.from("refreshToken", token).httpOnly(true).secure(true)
  .sameSite("None").path("/auth/refresh").maxAge(7 days).build()` and set
  it as a header. Trade-off to accept knowingly: `SameSite=None` makes
  the cookie sendable cross-site, so the refresh endpoint must stay
  CORS-restricted to the one origin (it is, per Patch A) — a malicious
  site could trigger the request, but cannot read the new token back
  because its origin is not in `allowedOrigins`.
- Alternative if Patch B is declined: accept re-login after reload /
  token expiry on the hosted site, and document it in the UI. Do not
  work around it by storing the access token in `localStorage` — that
  would be a worse, permanent exposure than the current in-memory token.

### CSRF note

`SecurityConfig` already disables CSRF (stateless JWT API). The CORS
patch does not change that, and does not need a CSRF token. This is the
existing backend posture, not a new weakening introduced by hosting.

### Test to add / run (backend side)

The backend test suite in the clone is a single
`src/test/java/com/yugal/store/StoreApplicationTests.java` (context-load
only) and needs MySQL + environment variables, so it could not be run
from this VM — run it where the backend is built/deployed, not here.
Add one focused test (e.g. a `@WebMvcTest`/`MockMvc` preflight test):

- `OPTIONS /products` with `Origin: <FRONTEND_ORIGIN>`,
  `Access-Control-Request-Method: GET`,
  `Access-Control-Request-Headers: authorization` →
  expect 200, `Access-Control-Allow-Origin: <FRONTEND_ORIGIN>` exactly,
  and `Access-Control-Allow-Credentials: true`.
- Same preflight with an unlisted origin → expect **no**
  `Access-Control-Allow-Origin` header.

Manual, no-charge verification after deploy (see §6 checklist):

```bash
curl -i -X OPTIONS https://store-rest-api.hostless.app/products \
  -H "Origin: <FRONTEND_ORIGIN>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
# Expect: Access-Control-Allow-Origin: <FRONTEND_ORIGIN>
#         Access-Control-Allow-Credentials: true
```

## 3. What the frontend must change at build time (no code change needed)

The frontend code already supports direct mode; it is a build-time
variable, not a code patch:

- `VITE_API_BASE_URL` **must** be set at build time to the deployed
  backend origin, e.g. `VITE_API_BASE_URL=https://store-rest-api.hostless.app`.
  It is baked into the bundle by Vite (`import.meta.env`), so changing
  it requires a rebuild — it cannot be changed at runtime on a static host.
- Leaving it empty on a static host does **not** work: there is no Vite
  proxy in production, so relative `/products` calls would hit the
  frontend host itself and 404. Empty = local proxy mode only.
- No secrets go in this variable or any frontend env file: no DB
  credentials, JWT signing secret, Stripe secret, or webhook secret.
  The backend URL is public, not a secret.

## 4. Build verification actually run (test build only)

Run from `~/workspace/orchard/frontend` (workspace copy only, not
committed or pushed):

```bash
VITE_API_BASE_URL=https://store-rest-api.hostless.app npm run build
```

- Result: **build passes** (see report — exact output recorded there).
- The built bundle contains the backend origin string (expected — that
  is the configured API base, not a secret).
- Secret scan of `dist/`: no Stripe secret keys, JWT secrets, DB
  credentials, or tokens were found (checked for `sk_live`/`sk_test`,
  `STRIPE_SECRET`, `jwt`, and password-like values; only the public
  backend origin and ordinary code appear).
- **This does NOT prove hosted integration works.** Runtime API calls
  from a hosted page will still be CORS-blocked until Patch A is applied
  and the backend redeployed, and session restore additionally needs
  the §2 SameSite decision. Do not claim hosted integration works on
  the basis of this build.

## 5. SPA fallback — required on every static host

The app uses `BrowserRouter` (no basename, Vite `base` default `/`).
These routes must all serve `index.html` on refresh / deep link, not 404:

`/`, `/shop`, `/products/*`, `/cart`, `/checkout`, `/checkout/result`,
`/checkout-success`, `/checkout-cancel`, `/login`, `/register`,
`/account`, `/account/*`, `/manage`, `/manage/*`

- **Vercel** — `vercel.json` (added to the orchard workspace only, not
  pushed): a single rewrite `{"source": "/(.*)", "destination":
  "/index.html"}`. API calls are absolute to the backend origin in
  direct mode, so the rewrite cannot swallow them.
- **Netlify** — `netlify.toml` (added to the orchard workspace only, not
  pushed): `[[redirects]] from = "/*" to = "/index.html" status = 200`
  (default `force = false`, so real static assets still win over the
  redirect).
- **GitHub Pages — least suitable, caveat:** Pages has no rewrite
  rules. The usual workaround is a `404.html` that is a copy of
  `index.html`, which is fragile, and a project page
  (`<user>.github.io/<repo>/`) additionally requires Vite `base:
  '/<repo>/'` **and** a matching router basename — the current app has
  neither. Only use Pages with a custom domain at the site root (plus
  the `404.html` copy), or prefer Vercel/Netlify. Do not deploy to a
  project-page subpath without first changing `base` + basename and
  rebuilding.

## 6. Hosting checklist (in order)

1. [ ] User supplies `<FRONTEND_ORIGIN>` + host platform (+ confirms
       the prod backend target is the hostless deployment).
2. [ ] Fill in `<FRONTEND_ORIGIN>` in `backend-hosting-patch.diff`
       (all three places: `CorsConfig`, `SecurityConfig` needs no value,
       `application-prod.yaml`) and decide Patch B (SameSite) explicitly.
3. [ ] Apply the patch to a branch of Store-REST-API, review, run the
       §2 preflight test + the existing backend test suite where MySQL
       is available, then merge and redeploy the prod backend.
4. [ ] Verify the §2 `curl` preflight against the redeployed backend
       (exact origin + credentials headers present; unlisted origin
       gets no allow-origin header).
5. [ ] Build the frontend with
       `VITE_API_BASE_URL=https://store-rest-api.hostless.app`
       (or the confirmed backend origin) and deploy `dist/` to the
       chosen host, with the §5 SPA fallback in place.
6. [ ] Smoke-test hosted, in order, with a test account and Stripe
       **test** mode only: catalogue load → product detail → login →
       cart add/qty → checkout → Stripe test session → return to
       `/checkout-success?orderId=…` → order shows server status
       (PENDING until the webhook flips it to PAID; never trust the URL
       alone) → logout/reload behaviour (per the SameSite decision).
7. [ ] Confirm no real charges, no production Stripe keys, and no
       secrets were added to any frontend file, host env var, or doc.

## 7. Files prepared (orchard workspace only — NOT pushed)

- `docs/hosting-connection-plan.md` — this file.
- `docs/backend-hosting-patch.diff` — Patch A (CORS + `websiteUrl`),
  with `<FRONTEND_ORIGIN>` placeholders, ready to fill in and apply in
  the backend repo after approval.
- `vercel.json` — SPA rewrite only, no secrets.
- `netlify.toml` — SPA redirect only, no secrets.
- No file in `~/workspace/store-ui` was changed, no branch was created
  or pushed, and the backend clone in `/tmp/orchard-host-prep` was left
  unmodified.

## 8. What remains blocked

- Everything in §6 steps 2–7 is blocked on `<FRONTEND_ORIGIN>` + host
  platform. Without the origin, the backend patch cannot be completed
  and the hosted build cannot be configured correctly.
- Even after Patch A, cross-origin session restore after reload /
  token expiry is blocked on the explicit Patch B (SameSite) decision
  in §2, unless re-login is accepted as the hosted behaviour.
- Live hosted integration (catalogue, auth, cart, checkout, Stripe
  webhook) remains unverified until the backend is patched, redeployed,
  and smoke-tested per §6 step 6.
