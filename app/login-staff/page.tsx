// app/login-staff/page.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function LoginStaff() {
  const router = useRouter()
  const [username, setUsername] = useState('')     // <-- era email
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // TODO: sostituisci con la tua logica di auth (es. verifica su DB username/password)
      if (username.trim() && password.trim()) {
        localStorage.setItem('role', 'staff')
        router.replace('/admin')
      } else {
        throw new Error('Inserisci username e password.')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Errore di accesso')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[url('/bg-texture.svg')] bg-cover">
      <div className="card p-6 w-[90%] max-w-md space-y-6">
        <div className="flex justify-center">
          <Image
            src="/logo-mattabel.png"
            width={160}
            height={160}
            alt="Mattabel Beach Volley"
            priority
          />
        </div>

        <h1 className="text-xl font-semibold text-center">Accesso Staff</h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm">Username</span>
            <input
              type="text"                     // <-- niente vincolo "@" come type="email"
              autoComplete="username"
              className="input w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <button type="submit" className="btn w-full" disabled={loading}>
            {loading ? 'Accesso…' : 'Entra'}
          </button>
        </form>

        {/* Se vuoi tenere il pulsante home, rimuovi i commenti sotto
        <button
          type="button"
          className="text-xs text-neutral-500 hover:text-neutral-300"
          onClick={() => router.replace('/')}
        >
          ← Torna alla home
        </button>
        */}
      </div>
    </main>
  )
}
