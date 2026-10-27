import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Phase 2: the browser talks to the real Store API through this dev proxy.
// The backend has NO CORS configuration, so a direct browser call from a
// different origin would be blocked — the proxy keeps the page and the API
// same-origin, which is also what lets the HttpOnly refresh cookie
// (path /auth/refresh) work. This is a local-dev mechanism only; a
// separately-hosted production frontend needs an approved backend CORS
// change (see docs/phase-2-integration-plan.md).
//
// Port 4242 is deliberate: the backend's dev `websiteUrl` is
// http://localhost:4242, so Stripe's success/cancel returns land on this
// dev server. Production websiteUrl is the backend host itself, which is a
// separate approved-change blocker for deployed Stripe returns.
//
// SPA/API collision: frontend routes /products/:id and /checkout share
// prefixes with backend API paths. A browser refresh sends a real GET with
// Accept: text/html, while fetch() sends Accept: */*. The bypass below
// serves index.html only for text/html requests, so refreshes on
// /orders, /products/1, /checkout etc. work, and API calls still proxy.
// Method also distinguishes the page GET /checkout from POST /checkout:
// GET /checkout is a page (bypassed), POST /checkout is the API call.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4242,
    proxy: {
      '/products': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => (req.headers.accept?.includes('text/html') ? '/index.html' : undefined),
      },
      '/carts': 'http://localhost:8080',
      '/orders': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) => (req.headers.accept?.includes('text/html') ? '/index.html' : undefined),
      },
      '/checkout': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        bypass: (req) =>
          req.headers.accept?.includes('text/html') ? '/index.html' : undefined,
      },
      '/auth': 'http://localhost:8080',
      '/users': 'http://localhost:8080',
      '/admin': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
})
