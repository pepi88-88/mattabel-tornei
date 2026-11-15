'use client'

import * as React from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function LoginStaffPage() {
  const [err,setErr]=React.useState<string|undefined>()
  const [loading,setLoading]=React.useState(false)
  const [showPassword,setShowPassword]=React.useState(false)

  async function onSubmit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if(loading)return
    setErr(undefined)
    setLoading(true)
    try {
      const form=new FormData(e.currentTarget)
      const response=await fetch('/api/auth/login',{method:'POST',body:form})
      const result=await response.json().catch(()=>({} as any))
      if(!response.ok||!result?.ok){
        setErr(result?.error||'Accesso non riuscito. Controlla le credenziali.')
        return
      }
      const serverRole=String(result.role??'').toLowerCase()
      const role:'admin'|'coach'=serverRole==='admin'?'admin':'coach'
      try{localStorage.setItem('role',role)}catch{}
      location.assign('/admin/tour')
    } catch {
      setErr('Connessione non disponibile. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mt-access-screen mt-access-login-screen">
      <div className="mt-access-aura" aria-hidden="true" />
      <section className="mt-access-card mt-access-login-card" aria-label="Accesso Staff Mattabel">
        <div className="mt-access-logo mt-access-login-logo">
          <Image src="/logo-mattabel.png" width={210} height={210}
            alt="Mattabel Beach Volley, logo circolare" priority />
    <Image src="/logo-mattabel.png" width={245} height={245} alt="" aria-hidden="true" className="mt-access-logo-letter-contrast" />
        </div>
        <p className="mt-access-section-label">AREA RISERVATA</p>
        <h1>Accesso Staff</h1>
        <p>Accedi al gestionale Mattabel</p>
        <form onSubmit={onSubmit} className="mt-login-form">
          <label htmlFor="mt-login-user">Utente</label>
          <input id="mt-login-user" name="user" autoComplete="username"
            disabled={loading} required placeholder="Nome utente"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <label htmlFor="mt-login-password">Password</label>
          <div className="mt-login-password">
            <input id="mt-login-password" name="pass" type={showPassword?'text':'password'}
              autoComplete="current-password" disabled={loading} required placeholder="Password" />
            <button type="button" onClick={()=>setShowPassword(v=>!v)} disabled={loading}
              aria-label={showPassword?'Nascondi password':'Mostra password'}
              aria-pressed={showPassword}>
              {showPassword?'Nascondi':'Mostra'}
            </button>
          </div>
          {err&&<div role="alert" className="mt-login-error">{err}</div>}
          <button className="mt-login-submit" type="submit" disabled={loading}>
            {loading?'Accesso in corso…':'Accedi'}
          </button>
        </form>
        <Link href="/" className="mt-access-back">← Torna alla scelta accesso</Link>
      </section>
    </main>
  )
}
