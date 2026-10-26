import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { changePassword, updateUser } from '../lib/api'
import { useAuth } from '../lib/auth'

const inputCls = 'w-full rounded-xl border bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-leaf-500'

export default function Account() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [msg, setMsg] = useState('')
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  if (!user) return <p className="text-stone-500">Please login to view your account.</p>

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('')
    try {
      await updateUser(user.id, name, email)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setMsg('Profile updated.')
    } catch {
      setMsg('Update failed.')
    }
  }
  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwMsg('')
    try {
      await changePassword(user.id, oldPw, newPw)
      setPwMsg('Password changed.')
      setOldPw('')
      setNewPw('')
    } catch {
      setPwMsg('Password change failed. Check your current password.')
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-bold">My account</h1>
      <p className="text-sm text-stone-500">
        The backend profile is only id, name and email — there are no address or wishlist endpoints yet,
        so those sections are intentionally absent here.
      </p>
      <form onSubmit={saveProfile} className="space-y-4 rounded-3xl border bg-white p-6">
        <h2 className="font-bold">Profile</h2>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        {msg && <p className="text-sm text-fk">{msg}</p>}
        <button className="rounded-full bg-fk px-6 py-2.5 font-semibold text-white">Save profile</button>
      </form>
      <form onSubmit={savePassword} className="space-y-4 rounded-3xl border bg-white p-6">
        <h2 className="font-bold">Change password</h2>
        <input className={inputCls} type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" required />
        <input className={inputCls} type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" required />
        {pwMsg && <p className="text-sm text-fk">{pwMsg}</p>}
        <button className="rounded-full bg-fk px-6 py-2.5 font-semibold text-white">Change password</button>
      </form>
    </div>
  )
}
