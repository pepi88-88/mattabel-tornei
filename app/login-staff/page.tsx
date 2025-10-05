// app/login-staff/page.tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

export default function LoginStaffPage() {
  const router = useRouter()
  const [err, setErr] = React.useState<string | undefined>()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(undefined)
    const fd = new FormData(e.currentTarget)

    try {
      const r = await fetch('/api/auth/login', { method: 'POST', body: fd })
      const js = await r.json().catch(() => ({} as any))
      if (!r.ok || !js?.ok) {
        setErr(js?.error || 'Login fallito')
        return
      }

      // 🔑 Ruolo coerente con il menu/permessi lato UI
      // Se il server ti restituisce "admin" o "coach", mappalo a "staff"
      const serverRole = (js.role as 'admin' | 'coach' | 'staff') ?? 'staff'
      const uiRole = serverRole === 'admin' || serverRole === 'coach' ? 'staff' : serverRole

      // Salva anche il nome utente (spesso l'header lo usa)
      const user = String(fd.get('user') ?? '').trim()

      localStorage.setItem('role', uiRole)        // es.: "staff"
      if (user) localStorage.setItem('user', user)

      // ✅ Redirect dove ti serve
      router.replace('/tour')
      // in alternativa: location.assign('/tour') se vuoi un reload completo
    } catch {
      setErr('Errore di rete')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[url('/bg-texture.svg')] bg-cover">
      <div className="card p-8 w-[90%] max-w-md space-y-6">
        <h1 className="text-xl font-semibold text-center">Login Staff</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <div className="text-xs mb-1">Utente</div>
            <input name="user" className="input w-full" autoComplete="username" />
          </div>
          <div>
            <div className="text-xs mb-1">Password</div>
            <input name="pass" type="password" className="input w-full" autoComplete="current-password" />
          </div>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <button type="submit" className="btn w-full">Entra</button>
        </form>
      </div>
    </main>
  )
}
