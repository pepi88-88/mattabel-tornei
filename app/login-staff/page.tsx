'use client'

import * as React from 'react'
import Link from 'next/link'

export default function LoginStaffPage() {
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
      const role = js.role as 'admin' | 'coach'
      localStorage.setItem('role', role)
      location.href = '/admin/iscrizioni'
    } catch {
      setErr('Errore di rete')
    }
  }

 return (
  <main className="min-h-screen flex items-center justify-center bg-[url('/bg-texture.svg')] bg-cover">
    <div className="card relative p-8 w-[90%] max-w-md space-y-6">
      {/* ← pulsante Home ben visibile dentro la card */}
      <div className="absolute -top-3 left-3">
        <Link href="/" className="btn btn-sm btn-ghost z-10">
          ← Home
        </Link>
      </div>

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

      {/* opzionale: tasto Indietro */}
      <button className="btn btn-ghost w-full" onClick={() => history.back()}>
        ← Indietro
      </button>
    </div>
  </main>
)

