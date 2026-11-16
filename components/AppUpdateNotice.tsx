'use client'

import {useCallback,useEffect,useRef,useState} from 'react'

const VERSION_KEY='mattabel:app:version'
const CHECK_INTERVAL=5*60*1000

// Le bozze non sincronizzate rimangono sul dispositivo: non ricaricare
// la pagina finché esistono. Le cache offline sono escluse dal controllo.
function hasPendingChanges(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||''
      if(!(
        /^mattabel:risultati:pending:/.test(key)||
        /^mattabel:gironi:pending:/.test(key)||
        /^mattabel:offline:(?:brackets|creation|payments):pending:/.test(key)
      ))continue
      const raw=localStorage.getItem(key)
      if(!raw)continue
      try{
        const value=JSON.parse(raw)
        if(value==null||value===false)continue
        if(Array.isArray(value)&&value.length===0)continue
        if(typeof value==='object'&&Object.keys(value).length===0)continue
      }catch{}
      return true
    }
  }catch{
    // Se non possiamo verificare le bozze, non ricarichiamo.
    return true
  }
  return false
}

export default function AppUpdateNotice(){
  const [available,setAvailable]=useState('')
  const [busy,setBusy]=useState(false)
  const [pending,setPending]=useState(false)
  const [dismissed,setDismissed]=useState('')
  const checking=useRef(false)
  const latestRef=useRef('')
  const activating=useRef(false)

  const check=useCallback(async()=>{
    if(checking.current||!navigator.onLine)return
    checking.current=true
    try{
      const response=await fetch('/api/app-version?ts='+Date.now(),{
        cache:'no-store',headers:{'Cache-Control':'no-cache'}
      })
      if(!response.ok)return
      const data=await response.json()
      const next=typeof data?.version==='string'?data.version:''
      if(!next||next==='local-development')return
      latestRef.current=next
      const previous=localStorage.getItem(VERSION_KEY)
      if(!previous){
        localStorage.setItem(VERSION_KEY,next)
      }else if(previous!==next){
        setAvailable(next)
        setPending(hasPendingChanges())
      }
    }catch{
      // Offline o API temporaneamente indisponibile: nessun refresh.
    }finally{
      checking.current=false
    }
  },[])

  useEffect(()=>{
    void check()
    const onResume=()=>{if(document.visibilityState==='visible')void check()}
    const onOnline=()=>void check()
    const onFocus=()=>void check()
    document.addEventListener('visibilitychange',onResume)
    window.addEventListener('online',onOnline)
    window.addEventListener('focus',onFocus)
    const interval=window.setInterval(()=>void check(),CHECK_INTERVAL)
    return()=>{
      document.removeEventListener('visibilitychange',onResume)
      window.removeEventListener('online',onOnline)
      window.removeEventListener('focus',onFocus)
      window.clearInterval(interval)
    }
  },[check])

  async function applyUpdate(){
    if(busy)return
    if(!navigator.onLine){setPending(false);return}
    if(hasPendingChanges()){
      setPending(true)
      return
    }
    setPending(false)
    setBusy(true)
    try{
      // La nuova versione puo' includere un SW in attesa. Attivarlo
      // SOLO dopo il click, mai durante una partita o una bozza offline.
      if('serviceWorker' in navigator){
        const registration=await navigator.serviceWorker.getRegistration('/')
        await registration?.update().catch(()=>{})
        const waiting=registration?.waiting
        if(waiting&&navigator.serviceWorker.controller){
          activating.current=true
          const onChange=()=>{
            navigator.serviceWorker.removeEventListener('controllerchange',onChange)
            localStorage.setItem(VERSION_KEY,available)
            window.location.reload()
          }
          navigator.serviceWorker.addEventListener('controllerchange',onChange)
          waiting.postMessage({type:'MATTABEL_ACTIVATE_UPDATE'})
          // Se il vecchio worker non e' piu' al controllo, resta possibile
          // ricaricare manualmente dal pulsante senza perdere dati.
          window.setTimeout(()=>{
            navigator.serviceWorker.removeEventListener('controllerchange',onChange)
            if(activating.current){
              activating.current=false
              setBusy(false)
            }
          },8000)
          return
        }
      }
      // Se il SW non e' cambiato, la navigazione network-first carica
      // comunque il nuovo HTML e i bundle Next.js del deploy corrente.
      localStorage.setItem(VERSION_KEY,available)
      window.location.reload()
    }catch{
      setBusy(false)
    }
  }

  if(!available||dismissed===available)return null
  return <aside className="fixed bottom-4 left-3 right-3 z-[99999] mx-auto max-w-md rounded-xl border border-sky-600 bg-slate-950 p-4 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,.65)]" role="status" aria-live="polite">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-bold text-base">🏐 Aggiornamento Mattabel disponibile</div>
        <p className="mt-1 text-sm text-slate-300">
          {pending?'Ci sono modifiche ancora da sincronizzare. Connettiti e salvale prima di aggiornare.':'Una nuova versione di Mattabel Tornei è pronta.'}
        </p>
      </div>
      <button type="button" onClick={()=>setDismissed(available)} aria-label="Ricordamelo più tardi" className="shrink-0 rounded px-2 py-1 text-slate-300 hover:bg-slate-800">✕</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy||!navigator.onLine} onClick={()=>void applyUpdate()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy?'Aggiornamento…':pending?'Verifica sincronizzazione':'Aggiorna ora'}
      </button>
      <button type="button" onClick={()=>setDismissed(available)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200">
        Più tardi
      </button>
    </div>
  </aside>
}
