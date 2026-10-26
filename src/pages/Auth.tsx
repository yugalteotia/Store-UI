import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { register } from '../lib/api'
import { useAuth } from '../lib/auth'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-3xl border bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-leaf-500'

export function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Back/forward bug: after logging in, pressing back landed on /login
  // again and showed a login form even though you were logged in —
  // looking like the session was lost. Logged-in users never see this page.
  if (user) return <Navigate to={params.get('next') || '/'} replace />
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate(params.get('next') || '/')
    } catch {
      setError('Login failed. Check your email and password.')
    }
  }

  return (
    <Shell title="Welcome back">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className={inputCls} type="email" required placeholder="Email (lowercase, as registered)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-full bg-fk py-3 font-semibold text-white hover:bg-fk-dark">Login</button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-500">
        No account? <Link to="/register" className="font-semibold text-fk">Sign up</Link>
      </p>
      <p className="mt-3 text-center text-xs text-stone-400">
        Login sets an HttpOnly refresh cookie; the access token lasts 15 minutes and refreshes silently.
      </p>
    </Shell>
  )
}

export function Register() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  if (user) return <Navigate to="/" replace />
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      // Backend register (POST /users) does not return a token, so log
      // in immediately after a successful registration.
      await register(name, email.toLowerCase(), password)
      await login(email.toLowerCase(), password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. The email may already be registered, or the password must be 6–25 characters.')
    }
  }

  return (
    <Shell title="Create your account">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className={inputCls} required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} type="email" required placeholder="Email (must be lowercase)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} type="password" required minLength={6} maxLength={25} placeholder="Password (6–25 characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-full bg-fk py-3 font-semibold text-white hover:bg-fk-dark">Sign up</button>
      </form>
      <p className="mt-4 text-center text-sm text-stone-500">
        Already have an account? <Link to="/login" className="font-semibold text-fk">Login</Link>
      </p>
    </Shell>
  )
}
