/**
 * Centralised HTTP client for the real Store REST API.
 *
 * Base URL: VITE_API_BASE_URL when set (direct mode — only usable once the
 * backend has CORS for the frontend origin, a separate approved backend
 * change). Empty by default: local dev goes through the Vite proxy in
 * vite.config.ts, so the browser is same-origin with the backend and the
 * HttpOnly refresh cookie (path /auth/refresh) is sent.
 *
 * No secrets of any kind live here: no DB credentials, no JWT signing
 * secret, no Stripe secret or webhook secret. The access token is held in
 * memory only (module variable, never localStorage) and restored across
 * reloads via POST /auth/refresh, which reads the HttpOnly cookie.
 */

export type ApiErrorKind =
  | 'network'
  | 'auth'
  | 'authz'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'rate-limit'
  | 'server'
  | 'unexpected'

export class ApiError extends Error {
  kind: ApiErrorKind
  status: number | null
  fieldErrors: Record<string, string>

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

/** In-memory access token. Deliberately NOT persisted: see docs. */
let accessToken: string | null = null
export function getAccessToken(): string | null {
  return accessToken
}
export function setAccessToken(token: string | null): void {
  accessToken = token
}

const TIMEOUT_MS = 15000

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'auth'
  if (status === 403) return 'authz'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  if (status === 400) {
    // A field-error map is a validation failure; a bare {error} is also
    // surfaced as validation by default — callers may re-map by message.
    return 'validation'
  }
  return 'unexpected'
}

/** Extract a safe, user-facing message from a backend error body. Never
 *  surfaces stack traces, SQL, tokens or raw internals: only the `error`
 *  string or a field-error map, both of which the backend itself returns. */
function messageFromBody(body: unknown, fallback: string): { message: string; fieldErrors: Record<string, string> } {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    // Spring Boot's default error body (used when no handler exists, e.g.
    // duplicate registration) carries a generic `error` phrase plus a
    // specific `message`. Prefer the specific message in that case only;
    // stack traces are never in either field.
    const generic = new Set(['Internal Server Error', 'Bad Request', 'Unauthorized', 'Forbidden', 'Not Found'])
    if (typeof record.error === 'string' && record.error && !generic.has(record.error)) {
      return { message: record.error, fieldErrors: {} }
    }
    if (typeof record.message === 'string' && record.message) {
      return { message: record.message.slice(0, 300), fieldErrors: {} }
    }
    if (typeof record.error === 'string' && record.error) {
      return { message: record.error, fieldErrors: {} }
    }
    const fieldErrors: Record<string, string> = {}
    for (const [k, v] of Object.entries(record)) {
      if (typeof v === 'string') fieldErrors[k] = v
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { message: 'Please check the highlighted fields.', fieldErrors }
    }
  }
  if (typeof body === 'string' && body) return { message: body.slice(0, 300), fieldErrors: {} }
  return { message: fallback, fieldErrors: {} }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }
  return text
}

async function rawFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

let refreshPromise: Promise<string | null> | null = null

/** POST /auth/refresh, using the HttpOnly cookie. Single-flight so parallel
 *  401s do not stampede the endpoint. Returns the new token or null. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await rawFetch('/auth/refresh', { method: 'POST' }, null)
      if (!res.ok) return null
      const body = (await parseBody(res)) as { token?: unknown } | null
      if (body && typeof body.token === 'string' && body.token) {
        setAccessToken(body.token)
        return body.token
      }
      return null
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Set false for the refresh call itself (it must not recurse). */
  retryOnAuth?: boolean
}

/**
 * One request through the API. On 401 it attempts exactly one silent
 * refresh and retries once; if that fails the token is cleared and an
 * `auth` ApiError is thrown (callers route the user to /login).
 * Non-idempotent writes are never auto-retried beyond that single
 * auth-refresh retry — a timed-out write is reported as uncertain, not
 * silently re-sent (see services/checkout and the Checkout page).
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  let res: Response
  try {
    res = await rawFetch(path, { method, body }, getAccessToken())
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('network', 'The request timed out. The server may still have processed it — check your orders before retrying.')
    }
    throw new ApiError('network', 'Could not reach the server. Check your connection and that the backend is running.')
  }

  if (res.status === 401 && options.retryOnAuth !== false && !path.startsWith('/auth/refresh')) {
    const fresh = await refreshAccessToken()
    if (fresh) {
      try {
        res = await rawFetch(path, { method, body }, fresh)
      } catch {
        throw new ApiError('network', 'Could not reach the server. Check your connection and that the backend is running.')
      }
    } else {
      setAccessToken(null)
      throw new ApiError('auth', 'Your session has expired. Please sign in again.', 401)
    }
  }

  const parsed = await parseBody(res)
  if (res.status === 204 || parsed === null) {
    if (res.ok) return null as T
    throw new ApiError(kindForStatus(res.status), `Request failed (${res.status}).`, res.status)
  }
  if (!res.ok) {
    const { message, fieldErrors } = messageFromBody(parsed, `Request failed (${res.status}).`)
    throw new ApiError(kindForStatus(res.status), message, res.status, fieldErrors)
  }
  return parsed as T
}

/** Checkout URLs must be Stripe-hosted HTTPS URLs. Anything else is
 *  rejected rather than followed — a user-controlled or attacker-controlled
 *  redirect target must never be trusted. */
export function isValidStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return parsed.hostname === 'checkout.stripe.com' || parsed.hostname.endsWith('.stripe.com')
  } catch {
    return false
  }
}
