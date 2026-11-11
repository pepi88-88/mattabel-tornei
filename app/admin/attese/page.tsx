'use client'

import * as React from 'react'

type Tour = { id:string; name:string; is_active?:boolean }
type Tournament = { id:string; tour_id:string; name:string; event_date?:string; status?:string; archived?:boolean }
type Match = {
  key:string; tournament_id:string; phase:string; teamA:string; teamB:string;
  status:'waiting'|'queued'|'live'|'paused'|'done'; sourceType:'girone'|'bracket';
  court:number|null
}
type GroupData = {
  meta?:Record<string,{bestOf?:1|3}>;
  scores?:Record<string,Array<{a?:string|null;b?:string|null}>>
}
type BracketData = {
  winnersById?:Record<string,Record<string,'A'|'B'|undefined>>;
  bracketScoresById?:Record<string,Record<string,unknown>>
}
type Snapshot = { starts:Record<string,number>; lastPlayed:Record<string,number>; completed:Record<string,true> }
const emptySnapshot=():Snapshot=>({starts:{},lastPlayed:{},completed:{}})
const STORAGE_TOUR='attese:selectedTournament'
const STORAGE_SEASON='attese:selectedTour'
const nameKey=(name:string)=>String(name||'').trim().toLocaleLowerCase('it')
const known=(name:string)=>{
  const v=String(name||'').trim()
  if(!v || v==='—' || v==='-' || /^(vincente|perdente|winner|loser|da definire|bye)\b/i.test(v))return false
  if(/^[A-Z]\d{1,2}$/.test(v)||/^\d{1,2}[A-Z]$/.test(v))return false
  return true
}
const colors=(minutes:number)=>minutes>45?'text-red-400':minutes>30?'text-orange-400':minutes>15?'text-yellow-300':'text-green-400'
const fmt=(ms:number)=>{
  const sec=Math.max(0,Math.floor(ms/1000))
  return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor((sec%3600)/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`
}
const scored=(s?:{a?:string|null;b?:string|null})=>
  s?.a!=null && s.b!=null && String(s.a).trim()!=='' && String(s.b).trim()!=='' &&
  Number.isFinite(Number(s.a)) && Number.isFinite(Number(s.b))
function isCompleted(match:Match,groups:GroupData,brackets:BracketData):boolean{
  if(match.status==='done')return true
  const g=match.key.match(/^girone:([^:]+):(\d+)$/)
  if(g){
    const letter=g[1],index=Number(g[2]),bestOf=groups.meta?.[letter]?.bestOf===3?3:1
    const scores=groups.scores?.[letter]||[]
    if(bestOf===1)return scored(scores[index])
    const segment=scores.slice(index*bestOf,index*bestOf+bestOf)
    let winsA=0,winsB=0
    for(const score of segment){if(!scored(score))continue
      const a=Number(score.a),b=Number(score.b)
      if(a>b)winsA++;else if(b>a)winsB++
    }
    return winsA>=2||winsB>=2
  }
  const b=match.key.match(/^bracket:([^:]+):(.+)$/)
  return Boolean(b && brackets.winnersById?.[b[1]]?.[b[2]])
}
function readSnapshot(tournamentId:string):Snapshot{
  try{
    const value=JSON.parse(localStorage.getItem(`attese:clock:${tournamentId}`)||'{}')
    return {starts:value.starts||{},lastPlayed:value.lastPlayed||{},completed:value.completed||{}}
  }catch{return emptySnapshot()}
}
const errMsg=(error:unknown)=>error instanceof Error?error.message:String(error)

export default function AttesePage(){
  const [tours,setTours]=React.useState<Tour[]>([])
  const [tourId,setTourId]=React.useState('')
  const [tournaments,setTournaments]=React.useState<Tournament[]>([])
  const [selected,setSelected]=React.useState('')
  const [rows,setRows]=React.useState<Match[]>([])
  const [clock,setClock]=React.useState<Snapshot>(emptySnapshot)
  const [now,setNow]=React.useState(0)
  const [loading,setLoading]=React.useState(false)
  const [error,setError]=React.useState('')
  const [lastRead,setLastRead]=React.useState(0)
  const [offline,setOffline]=React.useState(false)
  const [highlight,setHighlight]=React.useState<string|null>(null)
  const busy=React.useRef(false)

  React.useEffect(()=>{
    setNow(Date.now())
    const id=setInterval(()=>setNow(Date.now()),1000)
    return ()=>clearInterval(id)
  },[])
  React.useEffect(()=>{
    let mounted=true
    fetch('/api/tours',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error(`Tour: HTTP ${r.status}`)
      return r.json()
    }).then(data=>{
      if(!mounted)return
      const options=Array.isArray(data.items)?data.items as Tour[]:[]
      setTours(options)
      const saved=localStorage.getItem(STORAGE_SEASON)||localStorage.getItem('selectedTourId')||''
      const active=options.filter(t=>t.is_active!==false)
      setTourId(active.find(t=>t.id===saved)?.id||active[0]?.id||options.find(t=>t.id===saved)?.id||options[0]?.id||'')
    }).catch(e=>{if(mounted)setError(errMsg(e))})
    return ()=>{mounted=false}
  },[])
  React.useEffect(()=>{
    if(!tourId){setTournaments([]);setSelected('');return}
    localStorage.setItem(STORAGE_SEASON,tourId)
    localStorage.setItem('selectedTourId',tourId)
    const controller=new AbortController()
    setTournaments([])
    setSelected('')
    setRows([])
    fetch(`/api/tournaments?tour_id=${encodeURIComponent(tourId)}`,{cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error(`Tornei: HTTP ${r.status}`);return r.json()})
      .then(data=>{
        if(controller.signal.aborted)return
        const options=(Array.isArray(data.items)?data.items as Tournament[]:[])
          .filter(t=>t.tour_id===tourId && String(t.status||'').toLowerCase()!=='closed' && !t.archived)
        setTournaments(options)
        const saved=localStorage.getItem(STORAGE_TOUR)||localStorage.getItem('selectedTournamentId')||''
        const regia=(()=>{try{return JSON.parse(localStorage.getItem('regia:selectedTournaments')||'{}')?.a||''}catch{return ''}})()
        setSelected(options.find(t=>t.id===saved)?.id||options.find(t=>t.id===regia)?.id||options[0]?.id||'')
        setError('')
      }).catch(e=>{if(!controller.signal.aborted)setError(errMsg(e))})
    return ()=>controller.abort()
  },[tourId])

  const load=React.useCallback(async()=>{
    if(!selected || busy.current)return
    busy.current=true
    setLoading(true)
    try{
      const params=encodeURIComponent(selected)
      const [r,g,b]=await Promise.all([
        fetch(`/api/regia/state?tournament_id=${params}`,{headers:{'x-role':'admin'},cache:'no-store'}),
        fetch(`/api/groups/state?tournament_id=${params}`,{headers:{'x-role':'admin'},cache:'no-store'}),
        fetch(`/api/brackets/state?tournament_id=${params}`,{headers:{'x-role':'admin'},cache:'no-store'}),
      ])
      if(!r.ok||!g.ok||!b.ok)throw new Error(`Lettura risultati fallita (Regia ${r.status}, Gironi ${g.status}, Tabelloni ${b.status})`)
      const [rj,gj,bj]=await Promise.all([r.json(),g.json(),b.json()])
      const incoming=(Array.isArray(rj.rows)?rj.rows:[]) as Match[]
      const groups=(gj.state||{}) as GroupData,brackets=(bj.state||{}) as BracketData
      const previous=readSnapshot(selected),next:Snapshot={
        starts:{...previous.starts},lastPlayed:{...previous.lastPlayed},completed:{...previous.completed}
      }
      const current=Date.now()
      for(const match of incoming){
        const done=isCompleted(match,groups,brackets)
        if(done){
          if(!next.completed[match.key]){
            next.completed[match.key]=true
            for(const name of [match.teamA,match.teamB])if(known(name)){
              const key=nameKey(name)
              next.lastPlayed[key]=current
              delete next.starts[key]
            }
          }
        }else if(!next.completed[match.key]){
          for(const name of [match.teamA,match.teamB]){
            if(!known(name))continue
            const key=nameKey(name)
            if(!next.starts[key])next.starts[key]=next.lastPlayed[key]||current
          }
        }
      }
      localStorage.setItem(`attese:clock:${selected}`,JSON.stringify(next))
      setClock(next)
      setRows(incoming.filter(m=>!isCompleted(m,groups,brackets)))
      setLastRead(current)
      setOffline(false)
      setError('')
    }catch(e){setOffline(true);setError(errMsg(e))}
    finally{busy.current=false;setLoading(false)}
  },[selected])

  React.useEffect(()=>{
    if(!selected)return
    localStorage.setItem(STORAGE_TOUR,selected)
    localStorage.setItem('selectedTournamentId',selected)
    setClock(readSnapshot(selected))
    setRows([])
    setHighlight(null)
    void load()
    const timer=setInterval(()=>void load(),15000)
    return ()=>clearInterval(timer)
  },[selected,load])

  const waitFor=(name:string)=>known(name)?Math.max(0,now-(clock.starts[nameKey(name)]||now)):0
  const nextMatches=React.useMemo(()=>{
    return rows.filter(m=>known(m.teamA)||known(m.teamB))
      .map(m=>({...m,waitA:waitFor(m.teamA),waitB:waitFor(m.teamB)}))
      .sort((a,b)=>Math.max(b.waitA,b.waitB)-Math.max(a.waitA,a.waitB))
  },[rows,clock,now])
  const teams=React.useMemo(()=>{
    const result=new Map<string,{name:string;wait:number;matchKey:string}>()
    for(const match of nextMatches){
      for(const [name,wait] of [[match.teamA,match.waitA],[match.teamB,match.waitB]] as Array<[string,number]>){
        if(!known(name))continue
        const id=nameKey(name),old=result.get(id)
        if(!old||wait>old.wait)result.set(id,{name,wait,matchKey:match.key})
      }
    }
    return [...result.values()].sort((a,b)=>b.wait-a.wait)
  },[nextMatches])
  return <div className="space-y-5 pb-8">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <div><h1 className="text-2xl font-bold">Attese · Regia</h1>
        <p className="text-sm text-neutral-400">Incontri da giocare e tempi di attesa delle singole coppie.</p></div>
      <span className="rounded-full border border-orange-500/50 text-orange-200 px-3 py-1 text-xs">PREVIEW · DATI REALI</span>
    </div>
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-neutral-300 min-w-0 w-full sm:w-[240px]">Tour
        <select value={tourId} onChange={e=>setTourId(e.target.value)} className="input text-sm min-h-11 w-full">
          {tours.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-300 min-w-0 w-full sm:w-[320px]">Torneo aperto
        <select value={selected} onChange={e=>setSelected(e.target.value)} className="input text-sm min-h-11 w-full" disabled={!tournaments.length}>
          {!tournaments.length&&<option value="">Nessun torneo aperto</option>}
          {tournaments.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button className="btn h-11" disabled={!selected||loading} onClick={()=>void load()}>
        {loading?'Aggiornamento…':'Aggiorna risultati'}
      </button>
      <div className="text-xs text-neutral-400">
        {offline?<span className="text-amber-300">Offline · ultimi dati disponibili</span>:
        lastRead?<span>Aggiornato alle {new Date(lastRead).toLocaleTimeString('it-IT')}</span>:'In attesa dei dati'}
        <div className="text-[11px]">Controllo automatico ogni 15 secondi</div>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-md border border-red-900 bg-red-950/30 p-3 text-sm text-amber-200">{error}</p>}
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(220px,270px)] xl:grid-cols-[minmax(0,1fr)_280px] gap-3 lg:gap-4">
      <section className="min-w-0 space-y-2">
        <h2 className="font-semibold">Partite in attesa ({nextMatches.length})</h2>
        {nextMatches.map((m,i)=><article key={m.key} className={`rounded-xl border p-3 space-y-2 ${highlight===m.key?'border-orange-400 bg-neutral-800':'border-neutral-800 bg-neutral-900/70'}`}>
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{i+1}. {m.phase}</span>
            <span>{m.court?'Campo '+m.court:''} {m.status==='live'?'· LIVE':''}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-xs sm:text-sm leading-snug break-words">{known(m.teamA)?m.teamA:'— Da definire'}</div>
              <div className={`text-[11px] sm:text-xs mt-1 font-medium tabular-nums ${known(m.teamA)?colors(m.waitA/60000):'text-neutral-500'}`}>
                {known(m.teamA)?fmt(m.waitA):'—'}
              </div>
            </div>
            <span className="text-[11px] sm:text-xs text-neutral-500 pt-1">VS</span>
            <div className="min-w-0 text-right">
              <div className="font-semibold text-xs sm:text-sm leading-snug break-words">{known(m.teamB)?m.teamB:'— Da definire'}</div>
              <div className={`text-[11px] sm:text-xs mt-1 font-medium tabular-nums ${known(m.teamB)?colors(m.waitB/60000):'text-neutral-500'}`}>
                {known(m.teamB)?fmt(m.waitB):'—'}
              </div>
            </div>
          </div>
        </article>)}
        {!nextMatches.length&&!loading&&<div className="rounded-lg border border-neutral-800 p-5 text-sm text-neutral-400">
          Nessuna partita giocabile trovata per questo torneo.</div>}
      </section>
      <section className="min-w-0 space-y-2">
        <h2 className="font-semibold">Coppie in attesa ({teams.length})</h2>
        {teams.map((t,i)=><button key={t.name} type="button" onClick={()=>setHighlight(t.matchKey)}
          className={`w-full text-left rounded-lg p-2.5 border ${highlight===t.matchKey?'border-orange-400 bg-neutral-800':'border-neutral-800 bg-neutral-900/70'}`}>
          <span className="text-xs text-neutral-500">#{i+1}</span>
          <div className="min-w-0">
            <div className="font-medium text-xs sm:text-sm break-words">{t.name}</div>
            <div className={`text-xs mt-1 font-bold tabular-nums ${colors(t.wait/60000)}`}>{fmt(t.wait)}</div>
          </div>
        </button>)}
      </section>
    </div>
    <p className="text-xs text-neutral-400 border-t border-neutral-800 pt-3">
      I timer vengono conservati su questo dispositivo anche chiudendo il browser. Il conteggio parte quando una coppia viene riconosciuta per la prima volta e riparte dal risultato osservato al successivo aggiornamento. Per un conteggio condiviso tra dispositivi e per risultati registrati mentre questa pagina è chiusa servirà un archivio temporale sul server. Questa schermata non modifica risultati né Regia.
    </p>
  </div>
}
