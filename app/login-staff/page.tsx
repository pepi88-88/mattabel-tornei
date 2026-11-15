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
    <main className="mt-login-screen">
      <div className="mt-login-glow" aria-hidden="true" />
      <section className="mt-login-layout" aria-label="Accesso Mattabel">
        <div className="mt-login-intro">
          <div className="mt-login-identity">
            <Image src="/logo2.png" alt="Logo Beach Volley Mattabel" width={150} height={94} priority />
            <div>
              <span className="mt-login-overline">BEACH VOLLEY</span>
              <h1>MATTABEL</h1>
            </div>
          </div>
          <p className="mt-login-eyebrow">AREA RISERVATA</p>
          <h2>Il torneo è nelle tue mani.</h2>
          <p>Gestisci gironi, risultati, tabelloni e regia da un unico posto.</p>
          <div className="mt-login-decor" aria-hidden="true"><span/><span/><span/></div>
        </div>
        <div className="mt-login-card">
          <div className="mt-login-card-top">
            <span className="mt-login-mark">STAFF / ADMIN</span>
            <h2>Accedi al gestionale</h2>
            <p>Inserisci le credenziali del tuo account Mattabel.</p>
          </div>
          <form onSubmit={onSubmit} className="mt-login-form">
            <label htmlFor="mt-login-user">Utente</label>
            <input id="mt-login-user" name="user" type="text" autoComplete="username"
              disabled={loading} required placeholder="Nome utente" autoCapitalize="none"
              autoCorrect="off" spellCheck={false}/>
            <label htmlFor="mt-login-password">Password</label>
            <div className="mt-login-password">
              <input id="mt-login-password" name="pass" type={showPassword?'text':'password'}
                autoComplete="current-password" disabled={loading} required
                placeholder="La tua password"/>
              <button type="button" onClick={()=>setShowPassword(v=>!v)} disabled={loading}
                aria-label={showPassword?'Nascondi password':'Mostra password'}
                aria-pressed={showPassword}>
                {showPassword?'Nascondi':'Mostra'}
              </button>
            </div>
            {err&&<div role="alert" className="mt-login-error">{err}</div>}
            <button className="mt-login-submit" type="submit" disabled={loading}>
              {loading?'Accesso in corso…':'Entra nel gestionale'}
              {!loading&&<span aria-hidden="true">→</span>}
            </button>
          </form>
          <div className="mt-login-card-bottom">
            <Link href="/" className="mt-login-back">← Torna alla home</Link>
            <span>Accesso riservato allo staff</span>
          </div>
        </div>
      </section>
    </main>
  )
}
