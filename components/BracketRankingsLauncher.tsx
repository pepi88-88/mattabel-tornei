'use client'

import { useEffect, useMemo, useState } from 'react'
import BracketRankings from './BracketRankings'
import type { Bracket } from './BracketCanvas'

type Tour = {id:string;name:string}
type Stage = {id:string;name:string;event_date?:string;status?:string}
type BState = {items?:Bracket[]; winnersById?:Record<string,Record<string,'A'|'B'>>}
const headers = {'x-role':'admin'}
const fetchJson=async (url:string)=>{
  const res=await fetch(url,{cache:'no-store',headers})
  if(!res.ok)throw new Error('Errore di caricamento ('+res.status+')')
  return res.json()
}
const names = (text:string)=>text.trim().replace(/\s+/g,' ').toUpperCase()

/** Classifica di servizio indipendente dai punti della classifica stagionale.
 * Legge anche tappe chiuse, non solo quelle operative in Risultati.
 */
export default function BracketRankingsLauncher(){
  const [open,setOpen]=useState(false)
  const [tours,setTours]=useState<Tour[]>([])
  const [tourId,setTourId]=useState('')
  const [stages,setStages]=useState<Stage[]>([])
  const [stageId,setStageId]=useState('')
  const [brackets,setBrackets]=useState<Bracket[]>([])
  const [winners,setWinners]=useState<Record<string,Record<string,'A'|'B'>>>({})
  const [groupState,setGroupState]=useState<any>({})
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [loadedFor,setLoadedFor]=useState('')

  useEffect(()=>{
    let live=true
    fetchJson('/api/tours').then(data=>{
      if(!live)return
      const list=(data.items||[]) as Tour[]
      setTours(list)
      setTourId(list[0]?.id||'')
    }).catch(e=>{if(live)setMessage(e.message)})
    return()=>{live=false}
  },[])

  useEffect(()=>{
    let live=true
    setStages([]);setStageId('');setBrackets([]);setLoadedFor('')
    if(!tourId)return
    fetchJson('/api/tournaments?include_closed=1&tour_id='+encodeURIComponent(tourId)).then(data=>{
      if(!live)return
      const list=(data.items||[]) as Stage[]
      setStages(list)
      setStageId(list.find(stage=>stage.status!=='closed')?.id||list[0]?.id||'')
    }).catch(e=>{if(live)setMessage(e.message)})
    return()=>{live=false}
  },[tourId])

  useEffect(()=>{
    let live=true
    setBrackets([]);setWinners({});setGroupState({});setLoadedFor('')
    if(!stageId)return
    setBusy(true);setMessage('')
    Promise.all([
      fetchJson('/api/brackets/state?tournament_id='+encodeURIComponent(stageId)),
      fetchJson('/api/groups/state?tournament_id='+encodeURIComponent(stageId)).catch(()=>({state:{}})),
    ]).then(([bracketData,groupData])=>{
      if(!live)return
      const state:BState=bracketData.state||{}
      const items=Array.isArray(bracketData.state)?bracketData.state:(state.items||[])
      setBrackets(items)
      setWinners(state.winnersById||{})
      setGroupState(groupData.state||{})
      setLoadedFor(stageId)
    }).catch(e=>{if(live)setMessage(e.message)})
      .finally(()=>{if(live)setBusy(false)})
    return()=>{live=false}
  },[stageId])

  const resolve = useMemo(()=>{
    const entries=(groupState?.assign||{}) as Record<string,string>
    const labels=(groupState?.labels||{}) as Record<string,string>
    return (token:string)=>{
      const raw=String(token||'').trim()
      const match=raw.match(/^([A-Z])(\d{1,2})$/)
      if(match){
        const id=entries[match[1]+'-'+Number(match[2])]
        return id && labels[id]?names(labels[id]):raw
      }
      return raw
    }
  },[groupState])

  const selector=<div className="mt-rankings-selection-fields">
    <label>Tour
      <select className="input" value={tourId} onChange={e=>setTourId(e.target.value)}>
        {tours.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    <label>Tappa (anche concluse)
      <select className="input" value={stageId} onChange={e=>setStageId(e.target.value)}>
        {stages.map(t=><option key={t.id} value={t.id}>
          {t.name}{t.status==='closed'?' · conclusa':''}
        </option>)}
      </select>
    </label>
  </div>

  return <>
    <button className="btn btn-outline btn-sm ml-auto" type="button"
      onClick={()=>setOpen(true)}>🏆 Classifica tabelloni</button>
    {open && (busy || loadedFor!==stageId || !stageId || !brackets.length ?
      <div className="mt-rankings-overlay mt-rankings-floating-overlay" role="presentation">
        <section className="mt-rankings-dialog mt-rankings-floating-dialog" role="dialog" aria-modal="false" aria-label="Seleziona torneo e tappa">
          <header className="mt-rankings-dialog-header">
            <h2>Classifica tabelloni</h2>
            <button type="button" className="btn" onClick={()=>setOpen(false)}>Chiudi</button>
          </header>
          <div className="mt-rankings-selector-bar">{selector}</div>
          <p className="p-4 text-sm">{busy?'Caricamento…':message||'Seleziona una tappa con tabelloni creati.'}</p>
        </section>
      </div> :
      <BracketRankings key={stageId} brackets={brackets}
        winnersById={winners} tourId={tourId} tId={stageId}
        resolveToken={resolve} selection={selector} floating readOnly
        onClose={()=>setOpen(false)}/>)}
  </>
}
