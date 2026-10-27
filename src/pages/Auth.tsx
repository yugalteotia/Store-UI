import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { loginSchema, registerSchema, type LoginForm, type RegisterForm } from './schemas'
import { useApp } from '../state/AppContext'
import { ApiError } from '../api/http'

const inputCls = 'w-full rounded-2xl border border-plum/20 bg-paper px-4 py-2.5 text-plum dark:border-white/20 dark:bg-white/10 dark:text-cream'

// `any` is justified here: this one field is shared by two different RHF form shapes
// (LoginForm and RegisterForm), both of which have an identical `password` field.
function PasswordField({ id, label, error, register }: { id: string; label: string; error?: string; register: any }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="relative mt-1">
        <input id={id} type={show ? 'text' : 'password'} {...register('password')} className={`${inputCls} pr-12`} autoComplete="current-password" />
        <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-plum/60 dark:text-cream/60">
          {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
    </div>
  )
}

function nextPath(params: URLSearchParams): string {
  const next = params.get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/account'
}

export function Login() {
  const { login, session } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [msg, setMsg] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const onSubmit = async (data: LoginForm) => {
    setMsg('')
    try {
      await login(data.email, data.password)
      navigate(nextPath(params))
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'auth') {
        setMsg('Email or password is incorrect. (The backend returns the same 401 for either, so ORCHARD cannot say which one.)')
      } else if (err instanceof ApiError && err.fieldErrors.email) {
        setMsg(err.fieldErrors.email)
      } else {
        setMsg(err instanceof Error ? err.message : 'Sign-in failed.')
      }
    }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-serif text-4xl font-bold">Welcome back</h1>
      <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">
        Real sign-in against the Store API (POST /auth/login). Your password is sent only to the
        backend over this connection and is never stored in the browser.
      </p>
      {session && <p role="status" className="mt-4 rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">You are already signed in as {session.name}.</p>}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" noValidate>
        <div>
          <label htmlFor="login-email" className="text-sm font-semibold">Email</label>
          <input id="login-email" type="email" {...register('email')} className={`${inputCls} mt-1`} />
          {errors.email && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.email.message}</p>}
        </div>
        <PasswordField id="login-password" label="Password" error={errors.password?.message} register={register} />
        {msg && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{msg}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-plum py-3 font-semibold text-cream disabled:opacity-50">Sign in</button>
        <p className="text-center text-sm">New here? <Link to="/register" className="font-semibold text-citrusdark underline">Create an account</Link></p>
      </form>
    </main>
  )
}

export function Register() {
  const { register: registerAccount } = useApp()
  const navigate = useNavigate()
  const [msg, setMsg] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })
  const onSubmit = async (data: RegisterForm) => {
    setMsg('')
    try {
      await registerAccount(data.name, data.email, data.password)
      navigate('/account')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.email) {
        setMsg(err.fieldErrors.email)
      } else if (err instanceof ApiError && /already registered/i.test(err.message)) {
        setMsg('That email is already registered. Try signing in instead.')
      } else {
        setMsg(err instanceof Error ? err.message : 'Registration failed.')
      }
    }
  }
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-serif text-4xl font-bold">Join the market</h1>
      <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">
        Real registration (POST /users). The backend requires a lowercase email and a password of
        6–25 characters, and every new account starts as a regular customer — admin accounts are
        promoted in the database, never from this form.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" noValidate>
        <div>
          <label htmlFor="reg-name" className="text-sm font-semibold">Name</label>
          <input id="reg-name" {...register('name')} className={`${inputCls} mt-1`} />
          {errors.name && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="reg-email" className="text-sm font-semibold">Email (lowercase)</label>
          <input id="reg-email" type="email" {...register('email')} className={`${inputCls} mt-1`} />
          {errors.email && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors.email.message}</p>}
        </div>
        <PasswordField id="reg-password" label="Password (6–25 characters)" error={errors.password?.message} register={register} />
        {msg && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{msg}</p>}
        <button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-plum py-3 font-semibold text-cream disabled:opacity-50">Create account</button>
        <p className="text-center text-sm">Already have an account? <Link to="/login" className="font-semibold text-citrusdark underline">Sign in</Link></p>
      </form>
    </main>
  )
}
