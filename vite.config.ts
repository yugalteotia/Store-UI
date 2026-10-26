import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Port 4242 is deliberate: the backend's dev `websiteUrl` is
// http://localhost:4242, so Stripe success/cancel redirects land back
// on this dev server.
//
// Local CORS avoidance: in dev, the browser only ever talks to this
// same origin (localhost:4242). Vite proxies API paths to the Spring
// Boot backend on localhost:8080, so no backend CORS change is needed
// for local testing. For a separately-hosted production frontend, the
// backend will need a real CORS configuration (a later, separate step).
//
// REFRESH BUG (fixed here): several frontend routes collide with API
// paths — /orders, /products/:id, /checkout, /admin/products. On
// client-side navigation (React Router) no server request happens, so
// everything worked. But on browser refresh, the browser sends a real
// GET /orders with Accept: text/html, and Vite's prefix proxy forwarded
// it to the backend BEFORE the SPA fallback could serve index.html.
// The backend, receiving no Authorization header on a navigation
// request, answered 401 — which is exactly the "no access" on refresh.
// Pages that don't collide with an API path (/, /shop, /login,
// /account) worked on refresh, which is why only some pages broke.
//
// Fix: bypass the proxy for document navigations (Accept includes
// text/html) and serve index.html, so React Router takes over. API
// calls from fetch() send Accept: */* (no text/html), so they still
// proxy to the backend as before.
const API_PATHS = [
  '/products',
  '/carts',
  '/orders',
  '/checkout',
  '/auth',
  '/users',
  '/admin',
  '/health',
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4242,
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [
        path,
        {
          target: 'http://localhost:8080',
          changeOrigin: true,
          bypass(req) {
            if (req.headers.accept?.includes('text/html')) {
              return '/index.html'
            }
          },
        },
      ]),
    ),
  },
})
