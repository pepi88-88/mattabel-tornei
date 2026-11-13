'use client'

import { useEffect, useMemo, useState } from 'react'
import BracketRankings from './BracketRankings'
import type { Bracket } from './BracketCanvas'

type Tour = {id:string;name:string}
type Stage = {id:string;name:string;tour_id:string;event_date?:string;status?:string}
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

  // Load only tours with at least one open stage. No completed stages appear
  // in the floating selector, even when the season itself is archived.
  useEffect(()=>{
    let live=true
    Promise.all([fetchJson('/api/tours'),fetchJson('/api/tournaments')]).then(([toursData,stagesData])=>{
      if(!live)return
      const openStages=((stagesData.items||[]) as Stage[]).filter(stage =>
        stage.status !== 'closed' && stage.status !== 'finished' && stage.status !== 'completed')
      const availableTours=((toursData.items||[]) as Tour[]).filter(tour =>
        openStages.some(stage=>stage.tour_id===tour.id))
      setTours(availableTours)
      setStages(openStages)
      setTourId(previous=>availableTours.some(t=>t.id===previous)?previous:availableTours[0]?.id||'')
    }).catch(e=>{if(live)setMessage(e.message)})
    return()=>{live=false}
  },[])

  useEffect(()=>{
    const available=stages.filter(stage=>stage.tour_id===tourId)
    setStageId(previous=>available.some(stage=>stage.id===previous)?previous:available[0]?.id||'')
  },[tourId,stages])

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
    const ranking=(groupState?.rankByGroup||groupState?.groupRankings||{}) as Record<string,string[]>
    let storedRank:Record<string,string[]>={}
    let avulsa:string[]=[]
    if(typeof window!=='undefined' && stageId && tourId){
      try{storedRank=JSON.parse(localStorage.getItem('groups_rank:'+tourId+':'+stageId)||'{}')}catch{}
      try{avulsa=JSON.parse(localStorage.getItem('classifica_avulsa:'+tourId+':'+stageId)||localStorage.getItem('avulsa:'+tourId+':'+stageId)||'[]')}catch{}
    }
    const byTitle=new Map(brackets.map(bracket=>[bracket.title.trim().toUpperCase(),bracket]))
    const read=(token:string,seen:Set<string>):string=>{
      const raw=String(token||'').trim()
      if(!raw||seen.has(raw))return raw
      seen.add(raw)
      // Same winner/loser references used by the Resultati tabellone renderer.
      const cross=raw.match(/^(Perdente|Loser|Vincente|Winner)\s+(.+?)\s+([A-Za-z])?(\d+)$/i)
      if(cross){
        const bracket=byTitle.get(cross[2].trim().toUpperCase())
        const codeLetter=['M','G','S','F'].includes(String(cross[3]||'R').toUpperCase())
          ? 'R':String(cross[3]||'R').toUpperCase()
        const index=Number(cross[4])-1
        const pairing=codeLetter==='P'?bracket?.prelims?.[index]:bracket?.r1?.[index]
        const side=bracket?winners[bracket.id]?.[codeLetter+(index+1)]:undefined
        if(pairing&&side){
          const isLoser=/^(Perdente|Loser)$/i.test(cross[1])
          const selected=(side==='A')!==isLoser?pairing.A:pairing.B
          return read(selected,seen)
        }
      }
      const m=raw.match(/^([A-Z])\s*(\d{1,2})$/i) || raw.match(/^(\d{1,2})\s*([A-Z])$/i)
      if(m){
        const letter=/^[A-Z]/i.test(m[1])?m[1].toUpperCase():m[2].toUpperCase()
        const pos=Number(/^[A-Z]/i.test(m[1])?m[2]:m[1])
        const ranked=ranking[letter]?.[pos-1]||storedRank[letter]?.[pos-1]
        if(ranked)return names(ranked)
        const id=entries[letter+'-'+pos]
        if(id&&labels[id])return names(labels[id])
      }
      if(/^\d+$/.test(raw)&&avulsa[Number(raw)-1])return names(avulsa[Number(raw)-1])
      return raw
    }
    return (token:string)=>read(token,new Set<string>())
  },[groupState,stageId,tourId,brackets,winners])

  const selector=<div className="mt-rankings-selection-fields">
    <label>Tour
      <select className="input" value={tourId} onChange={e=>setTourId(e.target.value)}>
        {tours.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    <label>Tappa aperta
      <select className="input" value={stageId} onChange={e=>setStageId(e.target.value)}>
        {stages.filter(t=>t.tour_id===tourId).map(t=><option key={t.id} value={t.id}>
          {t.name}
        </option>)}
      </select>
    </label>
  </div>

  return <>
    <button className="btn btn-outline btn-sm ml-auto" type="button"
      onClick={()=>setOpen(true)}>🏆 Classifica tabelloni</button>
    {open && <BracketRankings
      brackets={loadedFor===stageId&&!busy?brackets:[]}
      winnersById={winners}
      tourId={tourId}
      tId={stageId}
      resolveToken={resolve}
      selection={selector}
      floating
      readOnly
      loading={busy||loadedFor!==stageId}
      loadError={message}
      onClose={()=>setOpen(false)}
    />}

  </>
}
