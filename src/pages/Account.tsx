import { Link, NavLink, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { profileSchema, passwordSchema, type ProfileForm, type PasswordForm } from './schemas'
import { useApp } from '../state/AppContext'
import { changePassword, getOrder, updateUser } from '../api/services'
import { ApiError } from '../api/http'
import { useEffect } from 'react'
import { formatINR, formatDateTime } from '../domain/format'

const inputCls = 'w-full rounded-2xl border border-plum/20 bg-paper px-4 py-2.5 text-plum dark:border-white/20 dark:bg-white/10 dark:text-cream'
const tabCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-semibold ${isActive ? 'bg-plum text-cream' : 'border border-plum/20 dark:border-white/20'}`

function Tabs() {
  return (
    <nav aria-label="Account" className="mt-6 flex flex-wrap gap-2">
      <NavLink to="/account" end className={tabCls}>Overview</NavLink>
      <NavLink to="/account/profile" className={tabCls}>Profile</NavLink>
      <NavLink to="/account/orders" className={tabCls}>Orders</NavLink>
      <NavLink to="/account/security" className={tabCls}>Security</NavLink>
    </nav>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, sessionStatus } = useApp()
  if (sessionStatus === 'loading') {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><p role="status">Checking your session…</p></main>
  }
  if (!session) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-4xl font-bold">Sign in required</h1>
        <p className="mt-3 text-plum/60 dark:text-cream/60">Account pages need a real Store API account. Your basket is separate and stays as it is.</p>
        <Link to="/login" className="mt-6 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Go to sign-in</Link>
      </main>
    )
  }
  return <>{children}</>
}

export function AccountOverview() {
  return (
    <RequireAuth>
      <AccountShell title="Account overview">
        <AccountBody />
      </AccountShell>
    </RequireAuth>
  )
}
function AccountShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-4xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">Real account area — orders and profile come from the Store API. The backend profile has only name and email; there is no phone or city field.</p>
      <Tabs />
      <div className="mt-8">{children}</div>
    </main>
  )
}
function AccountBody() {
  const { session, orders, logout } = useApp()
  if (!session) return null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
        <h2 className="font-serif text-2xl font-bold">Hello, {session.name}</h2>
        <p className="mt-2 text-sm text-plum/60 dark:text-cream/60">{session.email} · account #{session.id}</p>
        <Link to="/account/profile" className="mt-4 inline-block font-semibold text-citrusdark underline">Edit profile</Link>
      </section>
      <section className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
        <h2 className="font-serif text-2xl font-bold">Your orders</h2>
        <p className="mt-2 text-sm">{orders.length} order{orders.length === 1 ? '' : 's'} on your account (server-confirmed).</p>
        <Link to="/account/orders" className="mt-4 inline-block font-semibold text-citrusdark underline">View orders</Link>
      </section>
      <button type="button" onClick={logout} className="rounded-full border border-plum/20 px-6 py-3 font-semibold dark:border-white/20 md:col-span-2 justify-self-start">Sign out</button>
      <p className="text-xs text-plum/60 dark:text-cream/60 md:col-span-2">Note: the backend has no logout endpoint, so signing out clears this browser&apos;s session only. The refresh cookie remains until it expires — a separate backend change would be needed to invalidate it server-side.</p>
    </div>
  )
}

export function AccountProfile() {
  return (
    <RequireAuth>
      <AccountShell title="Profile">
        <ProfileFormInner />
      </AccountShell>
    </RequireAuth>
  )
}
function ProfileFormInner() {
  const { session, setSessionUser } = useApp()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const { register, handleSubmit, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: session ? { name: session.name, email: session.email } : undefined,
  })
  if (!session) return null
  return (
    <form onSubmit={handleSubmit(async (d) => { setMsg(''); setErr(''); try { const updated = await updateUser(session.id, d.name, d.email); setSessionUser(updated); setMsg('Profile updated on the server.') } catch (e) { setErr(e instanceof Error ? e.message : 'Profile update failed.') } })} className="max-w-xl space-y-5 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5" noValidate>
      <p className="text-sm text-plum/60 dark:text-cream/60">Only name and email exist on the backend profile. Changing your email here changes the email you sign in with.</p>
      {(['name', 'email'] as const).map((f) => (
        <div key={f}>
          <label htmlFor={`pf-${f}`} className="text-sm font-semibold capitalize">{f}</label>
          <input id={`pf-${f}`} {...register(f)} className={`${inputCls} mt-1`} />
          {errors[f] && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors[f]?.message}</p>}
        </div>
      ))}
      {msg && <p role="status" className="rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">{msg}</p>}
      {err && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{err}</p>}
      <button type="submit" className="rounded-full bg-plum px-8 py-3 font-semibold text-cream">Save profile</button>
    </form>
  )
}

export function AccountOrders() {
  return (
    <RequireAuth>
      <AccountShell title="Order history">
        <OrdersList />
      </AccountShell>
    </RequireAuth>
  )
}
function OrdersList() {
  const { orders, ordersStatus, ordersError, refreshOrders } = useApp()
  if (ordersStatus === 'loading') return <p role="status">Loading your orders…</p>
  if (ordersStatus === 'error') {
    return (
      <div role="alert" className="rounded-3xl bg-paper p-6 dark:bg-white/5">
        <p className="font-semibold">Couldn&apos;t load orders: {ordersError}</p>
        <button type="button" onClick={() => void refreshOrders()} className="mt-3 rounded-full bg-plum px-6 py-3 font-semibold text-cream">Retry</button>
      </div>
    )
  }
  if (orders.length === 0) {
    return (
      <div className="rounded-3xl bg-paper p-10 text-center shadow-card dark:bg-white/5">
        <p className="font-serif text-2xl font-bold">No orders yet</p>
        <p className="mt-2 text-plum/60 dark:text-cream/60">Orders appear here once you check out and Stripe confirms payment. A PENDING order means the webhook has not arrived yet.</p>
        <Link to="/shop" className="mt-5 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Shop the market</Link>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id} className="rounded-3xl bg-paper p-5 shadow-card dark:bg-white/5">
          <Link to={`/account/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:underline">
            <span><strong>Order #{o.id}</strong> · {formatDateTime(o.createdAt)} · <span className="text-citrusdark">{o.status}</span></span>
            <strong>{formatINR(o.total)}</strong>
          </Link>
          <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">{o.items.length} item{o.items.length === 1 ? '' : 's'} · status is a payment status, not a delivery status</p>
        </li>
      ))}
    </ul>
  )
}

export function AccountOrderDetail() {
  const { orderId } = useParams()
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const id = Number(orderId)
    if (!Number.isInteger(id)) { setLoading(false); setLoadError('That order id is not valid.'); return }
    getOrder(id).then((o) => { setOrder(o); setLoading(false) }).catch((e) => { setLoadError(e instanceof ApiError ? e.message : 'Could not load this order.'); setLoading(false) })
  }, [orderId])
  return (
    <RequireAuth>
      <AccountShell title="Order details">
        {loading ? (
          <p role="status">Loading order…</p>
        ) : !order ? (
          <div className="rounded-3xl bg-paper p-10 text-center shadow-card dark:bg-white/5">
            <p className="font-serif text-2xl font-bold">Order not found</p>
            <p className="mt-2 text-plum/60 dark:text-cream/60">{loadError || 'That order isn\'t on your account, or it does not exist. (The backend returns 403 for another user\'s order.)'}</p>
            <Link to="/account/orders" className="mt-5 inline-block rounded-full bg-plum px-6 py-3 font-semibold text-cream">Back to orders</Link>
          </div>
        ) : (
          <div className="rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5">
            <p className="text-lg"><strong>Order #{order.id}</strong> · {formatDateTime(order.createdAt)} · <span className="text-citrusdark">{order.status}</span></p>
            <p className="mt-1 text-sm text-plum/60 dark:text-cream/60">Status is the payment status recorded by the server.</p>
            <ul className="mt-5 space-y-3">
              {order.items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3">
                  <img src={i.image} alt={i.name} className="h-14 w-14 rounded-xl object-cover" />
                  <span className="flex-1 text-sm"><strong>{i.name}</strong><br />{i.quantity} × {formatINR(i.unitPrice)}</span>
                  <strong className="text-sm">{formatINR(i.unitPrice * i.quantity)}</strong>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex justify-between border-t border-plum/10 pt-4 text-lg dark:border-white/10"><span>Total</span><strong>{formatINR(order.total)}</strong></p>
          </div>
        )}
      </AccountShell>
    </RequireAuth>
  )
}

export function AccountSecurity() {
  const { session } = useApp()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })
  return (
    <RequireAuth>
      <AccountShell title="Security">
        <form
          onSubmit={handleSubmit(async (d) => { setMsg(''); setErr(''); if (!session) return; try { await changePassword(session.id, d.currentPassword, d.newPassword); setMsg('Password changed on the server.'); reset() } catch (e) { setErr(e instanceof ApiError && e.kind === 'auth' ? 'Your current password was not accepted.' : e instanceof Error ? e.message : 'Password change failed.') } })}
          className="max-w-xl space-y-5 rounded-3xl bg-paper p-6 shadow-card dark:bg-white/5"
          noValidate
        >
          <p className="text-sm text-plum/60 dark:text-cream/60">Real password change (POST /users/{'{id}'}/change-password for your own account only). The backend checks your current password against its stored hash.</p>
          {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((f) => (
            <div key={f}>
              <label htmlFor={`pw-${f}`} className="text-sm font-semibold">{f === 'currentPassword' ? 'Current password' : f === 'newPassword' ? 'New password' : 'Confirm new password'}</label>
              <input id={`pw-${f}`} type="password" {...register(f)} className={`${inputCls} mt-1`} />
              {errors[f] && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{errors[f]?.message}</p>}
            </div>
          ))}
          {msg && <p role="status" className="rounded-xl bg-leaf/15 px-4 py-3 text-sm font-semibold">{msg}</p>}
          {err && <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700 dark:bg-white/5 dark:text-red-300">{err}</p>}
          <button type="submit" className="rounded-full bg-plum px-8 py-3 font-semibold text-cream">Update password</button>
        </form>
      </AccountShell>
    </RequireAuth>
  )
}
