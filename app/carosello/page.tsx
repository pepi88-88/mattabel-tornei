'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type Match = {
  key:string; court:number|null;sequence:number|null;status:string
  scheduledTime:string;phase:string;teamA:string;teamB:string
}
type Tournament = {
  id:string;name:string;date:string|null;groupsPublic:boolean;bracketsPublic:boolean
  live:Match[];next:Match[]
}
const INTERVALS=[10,15,20,30,45,60]
function timeText(s:string) {
  return /^\d{1,2}:\d{2}/.test(s)?s.slice(0,5):'—'
}
function MatchRow({match,live}:{match:Match;live?:boolean}) {
  return <div className={`desk-match ${live?'desk-match-live':''}`}>
    <div className="desk-match-where">
      <span className="desk-match-court">{match.court?'CAMPO '+match.court:'DA ASSEGNARE'}</span>
      <span className="desk-match-time">{live?'LIVE':timeText(match.scheduledTime)}</span>
    </div>
    <div className="desk-match-teams">
      <span>{match.teamA}</span><b>VS</b><span>{match.teamB}</span>
    </div>
    <div className="desk-match-phase">{match.phase}</div>
  </div>
}

export default function DeskCarousel() {
  const [items,setItems]=useState<Tournament[]>([])
  const [selectionOpen,setSelectionOpen]=useState(false)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [allTournaments,setAllTournaments]=useState(true)
  const [index,setIndex]=useState(0)
  const [duration,setDuration]=useState(15)
  const [paused,setPaused]=useState(false)
  const [now,setNow]=useState<Date|null>(null)
  const [error,setError]=useState('')
  const [updated,setUpdated]=useState('')
  const [refreshing,setRefreshing]=useState(false)
  const [progress,setProgress]=useState(0)

  const visibleItems=useMemo(
    ()=>allTournaments?items:items.filter(item=>selectedIds.includes(item.id)),
    [items,allTournaments,selectedIds]
  )
  const saveSelection=(all:boolean,ids:string[])=>{
    setAllTournaments(all)
    setSelectedIds(ids)
    setIndex(0)
    try{localStorage.setItem('mattabel:desk:selection',JSON.stringify({all,ids}))}catch{}
  }
  const toggleTournament=(id:string)=>{
    const next=selectedIds.includes(id)?selectedIds.filter(x=>x!==id):[...selectedIds,id]
    saveSelection(false,next)
  }

  const reload=useCallback(async()=>{
    try {
      // The selector must not depend on match-state availability.
      // /api/tournaments is already the canonical source used by Regia.
      const tournamentsResponse=await fetch('/api/tournaments?include_closed=1',{cache:'no-store'})
      if(!tournamentsResponse.ok)throw new Error('Elenco tornei non disponibile')
      const tournamentsJson=await tournamentsResponse.json()
      const open=((tournamentsJson?.items || []) as any[]).filter(t=>
        !t.archived &&
        !['closed','archived','finished','completed'].includes(String(t.status || '').toLowerCase().trim())
      )

      let matchItems: Tournament[]=[]
      try {
        const deskResponse=await fetch('/api/public/desk',{cache:'no-store'})
        if(deskResponse.ok){
          const deskJson=await deskResponse.json()
          if(Array.isArray(deskJson?.items))matchItems=deskJson.items
        }
      }catch{}
      const byId=new Map(matchItems.map(t=>[String(t.id),t]))
      const nextItems: Tournament[]=open.map(t=>{
        const details=byId.get(String(t.id))
        return {
          id:String(t.id),
          name:String(t.name||t.title||'Torneo'),
          date:t.event_date||null,
          groupsPublic:details?.groupsPublic||false,
          bracketsPublic:details?.bracketsPublic||false,
          live:details?.live||[],
          next:details?.next||[],
        }
      })
      setItems(nextItems)
      setUpdated(new Date().toISOString())
      setIndex(prev=>Math.min(prev,Math.max(0,nextItems.length-1)))
      setError('')
    } catch(e:any){
      setError(e?.message||'Impossibile aggiornare il carosello')
    } finally {
      setRefreshing(false)
    }
  },[])

  useEffect(()=>{
    try{
      const pref=Number(localStorage.getItem('mattabel:desk:duration'))
      if(INTERVALS.includes(pref))setDuration(pref)
      const saved=localStorage.getItem('mattabel:desk:selection')
      if(saved) {
        const choice=JSON.parse(saved)
        if(typeof choice?.all==='boolean')setAllTournaments(choice.all)
        if(Array.isArray(choice?.ids))setSelectedIds(choice.ids.filter((id:any)=>typeof id==='string'))
      }
    }catch{}
    setNow(new Date())
    void reload()
    const fetchTimer=window.setInterval(()=>void reload(),20000)
    const clockTimer=window.setInterval(()=>setNow(new Date()),1000)
    return()=>{window.clearInterval(fetchTimer);window.clearInterval(clockTimer)}
  },[reload])

  useEffect(()=>{
    if(paused || visibleItems.length<=1){setProgress(0);return}
    const started=Date.now()
    setProgress(0)
    const timer=window.setInterval(()=>{
      const elapsed=Date.now()-started
      setProgress(Math.min(100,(elapsed/(duration*1000))*100))
      if(elapsed >= duration*1000){
        setIndex(prev=>(prev+1)%visibleItems.length)
        setProgress(0)
      }
    },150)
    return()=>window.clearInterval(timer)
  },[index,duration,paused,visibleItems.length])

  const active=visibleItems[index]
  const dateLabel=useMemo(()=>{
    if(!active?.date)return ''
    const date=new Date(active.date)
    return Number.isNaN(date.getTime())?'':date.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})
  },[active?.date])
  const chooseDuration=(n:number)=>{
    setDuration(n)
    try{localStorage.setItem('mattabel:desk:duration',String(n))}catch{}
  }
  const go=(direction:number)=>{
    if(!visibleItems.length)return
    setIndex(prev=>(prev+direction+visibleItems.length)%visibleItems.length)
  }
  const fullscreen=()=>{
    const el=document.querySelector('.desk-screen') as HTMLElement|null
    if(!el)return
    if(document.fullscreenElement)void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }
  return <div className="desk-screen">
    <div className="desk-bg-glow" aria-hidden="true"/>
    <header className="desk-header">
      <div className="desk-brand">
        <Image src="/logo2.png" width={104} height={66} alt="Beach Volley Mattabel" priority/>
        <div><strong>MATTABEL</strong><span>BEACH VOLLEY • TORNEI IN CORSO</span></div>
      </div>
      <div className="desk-clock">
        <span>{now?now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span>
        <small>{now?now.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}):''}</small>
      </div>
    </header>

    <main className="desk-content">
      {active ? <>
        <div className="desk-titlebar">
          <div>
            <p className="desk-eyebrow">TORNEO {index+1} DI {visibleItems.length}{dateLabel?' • '+dateLabel:''}</p>
            <h1>{active.name}</h1>
          </div>
          <div className="desk-live-count"><span className="desk-live-dot"/>{active.live.length} LIVE</div>
        </div>
        <div className="desk-panels">
          <section className="desk-panel">
            <div className="desk-panel-heading"><h2>IN CAMPO ORA</h2><span>PARTITE LIVE</span></div>
            <div className="desk-panel-list">
              {active.live.length?active.live.slice(0,4).map(m=><MatchRow key={m.key} match={m} live/>):
                <div className="desk-empty">Nessuna partita segnata LIVE <small>Le partite in corso compariranno qui quando attivate dalla Regia.</small></div>}
            </div>
          </section>
          <section className="desk-panel">
            <div className="desk-panel-heading"><h2>PROSSIME PARTITE</h2><span>PROGRAMMA</span></div>
            <div className="desk-panel-list">
              {active.next.length?active.next.slice(0,5).map(m=><MatchRow key={m.key} match={m}/>):
                <div className="desk-empty">Programmazione in preparazione <small>Gli orari e i campi saranno visibili quando pubblicati.</small></div>}
            </div>
          </section>
        </div>
      </> : <div className="desk-welcome">
        <Image src="/logo2.png" width={180} height={120} alt="Mattabel"/>
        <h1>{items.length ? 'Nessun torneo selezionato' : 'Nessun torneo aperto'}</h1>
        <p>{items.length ? 'Apri Seleziona tornei per scegliere cosa mostrare sullo schermo.' : 'Il carosello inizierà automaticamente quando ci saranno tornei attivi.'}</p>
      </div>}
      {error&&<div className="desk-error" role="status">Ultimo aggiornamento non riuscito · {error}. I dati precedenti rimangono visibili.</div>}
    </main>

    {selectionOpen && <div className="desk-selection-overlay" role="dialog" aria-label="Seleziona tornei del carosello">
      <div className="desk-selection-panel">
        <div className="desk-selection-top"><h2>Tornei da mostrare</h2>
          <button type="button" onClick={()=>setSelectionOpen(false)} aria-label="Chiudi selezione">✕</button>
        </div>
        <p>Scegli tutti i tornei aperti oppure seleziona solo quelli che vuoi vedere sul monitor.</p>
        <label className="desk-selection-choice">
          <input type="checkbox" checked={allTournaments}
            onChange={e=>saveSelection(e.target.checked,selectedIds)}/>
          Mostra tutti i tornei aperti
        </label>
        <div className="desk-selection-list">
          {items.map(t=><label key={t.id} className="desk-selection-choice">
            <input type="checkbox" checked={allTournaments || selectedIds.includes(t.id)}
              onChange={()=>toggleTournament(t.id)}/>
            <span>{t.name}{t.date?' · '+new Date(t.date).toLocaleDateString('it-IT'):''}</span>
          </label>)}
          {!items.length&&<span>Nessun torneo aperto disponibile.</span>}
        </div>
        <button className="desk-selection-done" type="button" onClick={()=>setSelectionOpen(false)}>Fatto</button>
      </div>
    </div>}
    <footer className="desk-footer">
      <div className="desk-controls">
        <button type="button" onClick={()=>setSelectionOpen(value=>!value)}
          aria-expanded={selectionOpen} title="Scegli quali tornei far scorrere sul monitor">Seleziona tornei</button>
        <button type="button" onClick={()=>go(-1)} disabled={visibleItems.length<2} aria-label="Torneo precedente">‹</button>
        <button type="button" onClick={()=>setPaused(p=>!p)} aria-label={paused?'Riprendi carosello':'Metti in pausa carosello'}>{paused?'▶':'Ⅱ'}</button>
        <button type="button" onClick={()=>go(1)} disabled={visibleItems.length<2} aria-label="Torneo successivo">›</button>
        <label>CAMBIA OGNI
          <select value={duration} onChange={e=>chooseDuration(Number(e.target.value))} aria-label="Intervallo rotazione">
            {INTERVALS.map(v=><option key={v} value={v}>{v} sec</option>)}
          </select>
        </label>
        <button type="button" onClick={()=>{setRefreshing(true);void reload()}} disabled={refreshing} title="Aggiorna dati">↻</button>
        <button type="button" onClick={fullscreen} title="Schermo intero">⛶</button>
        <Link href="/atleta/tornei" title="Torna alla vista atleta">Esci</Link>
      </div>
      <div className="desk-footer-right">
        <span>{paused?'IN PAUSA':'ROTazione AUTOMATICA'.toUpperCase()}</span>
        <div className="desk-dots">
          {visibleItems.map((t,i)=><button type="button" key={t.id} onClick={()=>setIndex(i)}
            className={i===index?'active':''} title={t.name} aria-label={'Mostra '+t.name}/>)}
        </div>
        {updated&&<small>DATI AGGIORNATI {new Date(updated).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</small>}
      </div>
    </footer>
    <div className="desk-progress"><div style={{width:(paused?0:progress)+'%'}}/></div>
  </div>
}
