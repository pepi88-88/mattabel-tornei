'use client'
import useSWR from 'swr'
import PrepareOffline from '@/components/PrepareOffline'
import {offlineJSON, cacheOfflineJSON, offlineQueueKey, readOfflineQueue, putOfflineQueue} from '@/lib/offlineClient'
import { useEffect, useMemo, useRef, useState } from 'react'

const fetcher = (u: string) => offlineJSON(u)

// Stessa palette A–P della pagina Creazione Gironi: colori coerenti con i temi Mattabel.
const GROUP_COLORS: Record<string,string> = {
  A:'#2563EB', B:'#EF4444', C:'#F59E0B', D:'#8B5CF6',
  E:'#10B981', F:'#FB923C', G:'#06B6D4', H:'#8B5CF6',
  I:'#22C55E', J:'#F97316', K:'#0EA5E9', L:'#EAB308',
  M:'#84CC16', N:'#F43F5E', O:'#14B8A6', P:'#64748B',
}
const colorFor = (letter:string) => GROUP_COLORS[letter] ?? '#334155'

export default function PagamentiPage() {
  // TOUR
  const { data: tours } = useSWR('/api/tours', fetcher)
  const [tourId, setTourId] = useState('')
  useEffect(() => {
    const s = localStorage.getItem('selectedTourId')
    if (s) setTourId(s)
  }, [])
  function onPickTour(id: string) {
    setTourId(id)
    localStorage.setItem('selectedTourId', id)
    localStorage.removeItem('selectedTournamentId')
    setTId('')
  }

  // TAPPA (raw)
  const { data: taps } = useSWR(
    tourId ? `/api/tournaments?tour_id=${tourId}` : null,
    fetcher
  )
  const [tId, setTId] = useState('')
  useEffect(() => {
    const s = localStorage.getItem('selectedTournamentId')
    if (s) setTId(s)
  }, [])

  // ---- TAPPE VISIBILI: esclude CHIUSE + ordina per data desc
  const parseDate = (s?: string | null) => (s ? new Date(s).getTime() : 0)
  const tappeVisibili = useMemo(() => {
    const arr = (taps?.items ?? []) as any[]
    return arr
      .filter(tp => tp?.status !== 'closed')
      .sort((a, b) => parseDate(b?.event_date) - parseDate(a?.event_date))
  }, [taps])

  // se non c'è tId, seleziona la prima visibile
  useEffect(() => {
    if (!tId && tappeVisibili.length) {
      setTId(tappeVisibili[0].id)
    }
  }, [tappeVisibili, tId])

  // se la tappa salvata è chiusa/non più visibile → reset
  useEffect(() => {
    if (!tId || !taps) return
    const stillVisible = tappeVisibili.some(t => t.id === tId)
    if (!stillVisible) {
      setTId('')
      const saved = localStorage.getItem('selectedTournamentId')
      if (saved === tId) localStorage.removeItem('selectedTournamentId')
    }
  }, [tId, tappeVisibili])

  function onPickTappa(id: string) {
    setTId(id)
    localStorage.setItem('selectedTournamentId', id)
  }

  // LISTA pagamenti
  const { data, mutate } = useSWR(
    tId ? `/api/registrations/for-payments?tournament_id=${tId}` : null,
    fetcher
  )
  type PaymentChange = {id:string;side:'A'|'B'|'C'|'D';value:boolean;expected:boolean}
  const [pendingPayments,setPendingPayments]=useState<PaymentChange[]>([])
  const [paymentsConflict,setPaymentsConflict]=useState('')
  const [paymentsMessage,setPaymentsMessage]=useState('')
  const syncingPayments=useRef(false)
  const keyPayments=tId?offlineQueueKey('payments',tId):''
  useEffect(()=>{
    setPendingPayments(tId?readOfflineQueue<PaymentChange[]>(offlineQueueKey('payments',tId),[]):[])
    setPaymentsConflict('')
    setPaymentsMessage('')
  },[tId])
  const queueUpdate=(list:PaymentChange[])=>{
    if(!keyPayments)return false
    if(!putOfflineQueue(keyPayments,list)){
      setPaymentsMessage('Memoria piena: modifica non conservata. Non chiudere la pagina.')
      return false
    }
    setPendingPayments(list)
    return true
  }
  const items = (data?.items ?? []).map((r:any)=>{
    const changes=pendingPayments.filter(x=>x.id===r.id)
    return changes.reduce((acc:any,x)=>({...acc,['paid_'+x.side.toLowerCase()]:x.value}),r)
  })
  const [view,setView] = useState<'lista'|'gironi'>('lista')
  // Il riepilogo economico non deve comparire in presenza di atleti.
  const [showStats,setShowStats] = useState(false)
  const {data:groupsResponse} = useSWR(
    tId ? '/api/groups/state?tournament_id='+encodeURIComponent(tId) : null,
    fetcher,
    {revalidateOnFocus:true}
  )
  const groupState = groupsResponse?.state
  const groupsForPayments = useMemo(()=>{
    if(!groupState?.assign || !groupState?.meta)return [] as Array<{letter:string;rows:any[]}>
    const letters = 'ABCDEFGHIJKLMNOP'.slice(0,Math.max(0,Number(groupState.groupsCount)||0)).split('')
    return letters.map(letter=>{
      const capacity = Math.max(0,Number(groupState.meta?.[letter]?.capacity)||0)
      const rows = Array.from({length:capacity},(_,i)=>({
        registrationId:String(groupState.assign?.[letter+'-'+(i+1)]||''),
        slot:i+1
      })).filter(x=>x.registrationId)
      return {letter,rows}
    }).filter(g=>g.rows.length>0)
  },[groupState])

  // --- SOLO PAGAMENTI: escludi la waiting list
  const maxTeamsRaw = tId
    ? tappeVisibili.find((t: any) => t.id === tId)?.max_teams
    : undefined
  const maxTeams = Number.isFinite(+maxTeamsRaw) ? Math.max(0, +maxTeamsRaw) : 0

  // mostra in Pagamenti solo i primi "maxTeams" (se > 0). Se maxTeams non impostato → mostra tutto
  const payableItems =
    maxTeams > 0 ? items.slice(0, Math.min(maxTeams, items.length)) : items

  // 🔍 RICERCA TESTUALE
  const [search, setSearch] = useState('')

  // TOT GENERALI (NON filtrati dalla ricerca)
  const stats = useMemo(() => {
    let a = 0, b = 0, c = 0, d = 0, full = 0

for (const r of payableItems) {
  if (r.paid_a) a++
  if (r.paid_b) b++
  if (r.paid_c) c++
  if (r.paid_d) d++

  const isTeam = !!r.team_name && Number(r.team_format) >= 3
  const is4 = Number(r.team_format) === 4

  const fullyPaid = isTeam
    ? (r.paid_a && r.paid_b && r.paid_c && (is4 ? r.paid_d : true))
    : (r.paid_a && r.paid_b)

  if (fullyPaid) full++
}

return { a, b, c, d, full, teams: payableItems.length }

  }, [payableItems])

  // 📌 LISTA VISIBILE: applica ricerca + manda in fondo le squadre COMPLETAMENTE pagate
  const visibleItems = useMemo(() => {
    // 1) filtro per ricerca
    const q = search.trim().toLowerCase()
    let filtered = payableItems
    if (q) {
      filtered = payableItems.filter((r: any) => {
       const a = String(r.a || '').toLowerCase()
const b = String(r.b || '').toLowerCase()
const c = String(r.c || '').toLowerCase()
const d = String(r.d || '').toLowerCase()
const tn = String(r.team_name || '').toLowerCase()
return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q) || tn.includes(q)

      })
    }

    // 2) metti in fondo quelle completamente pagate (paid_a && paid_b)
    const notFull: any[] = []
    const full: any[] = []
    for (const r of filtered) {
     const isTeam = !!r.team_name && Number(r.team_format) >= 3
const is4 = Number(r.team_format) === 4
const fullyPaid = isTeam
  ? (r.paid_a && r.paid_b && r.paid_c && (is4 ? r.paid_d : true))
  : (r.paid_a && r.paid_b)

if (fullyPaid) full.push(r)
else notFull.push(r)

    }
    return [...notFull, ...full]
  }, [payableItems, search])

  const syncPayments=async()=>{
    if(!tId || syncingPayments.current || !navigator.onLine || paymentsConflict)return
    syncingPayments.current=true
    try{
      let list=readOfflineQueue<PaymentChange[]>(offlineQueueKey('payments',tId),[])
      for(const entry of [...list]){
        const field='paid_'+entry.side.toLowerCase()
        let response:Response
        try{
          response=await fetch('/api/registrations/pay',{
            method:'PATCH',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({id:entry.id,[field]:entry.value,expected:{[field]:entry.expected}})
          })
        }catch{
          setPaymentsMessage('Connessione assente: pagamenti conservati sul dispositivo.')
          return
        }
        if(response.status===409){
          setPaymentsConflict('Pagamento modificato da un altro Staff. Controllare prima di sincronizzare.')
          return
        }
        if(!response.ok){
          setPaymentsMessage('Sincronizzazione pagamenti non riuscita ('+response.status+').')
          return
        }
        list=readOfflineQueue<PaymentChange[]>(offlineQueueKey('payments',tId),[])
          .filter(x=>!(x.id===entry.id&&x.side===entry.side&&x.value===entry.value&&x.expected===entry.expected))
        putOfflineQueue(offlineQueueKey('payments',tId),list)
        setPendingPayments(list)
      }
      if(!list.length){
        setPaymentsMessage('Pagamenti sincronizzati con Supabase.')
        mutate()
      }
    }finally{syncingPayments.current=false}
  }
  useEffect(()=>{
    if(!tId || !pendingPayments.length)return
    const onLine=()=>{void syncPayments()}
    window.addEventListener('online',onLine)
    if(navigator.onLine) void syncPayments()
    return ()=>window.removeEventListener('online',onLine)
  },[tId,pendingPayments.length,paymentsConflict])

  async function togglePaid(id: string, side: 'A' | 'B' | 'C' | 'D', value: boolean) {
    // trova la riga per messaggio più chiaro
    const reg = items.find((r: any) => r.id === id)

    // se stiamo TOGLIENDO una spunta → chiedi conferma
    if (!value) {
     const name = reg
  ? (reg.team_name ? `${reg.team_name} — ${reg.a} / ${reg.b} / ${reg.c || ''} / ${reg.d || ''}` : `${reg.a} — ${reg.b}`)
  : ''
const label =
  side === 'A' ? 'Pagato A'
  : side === 'B' ? 'Pagato B'
  : side === 'C' ? 'Pagato C'
  : 'Pagato D'

      const msg = name
        ? `Vuoi davvero togliere la spunta "${label}" per ${name}?`
        : `Vuoi davvero togliere la spunta "${label}"?`

      const ok = confirm(msg)
      if (!ok) {
        // ripristina lo stato locale (nel dubbio, ricarichiamo i dati correnti)
        mutate(data, false)
        return
      }
    }

    const body: any = { id }
if (side === 'A') body.paid_a = value
else if (side === 'B') body.paid_b = value
else if (side === 'C') body.paid_c = value
else body.paid_d = value


    const field='paid_'+side.toLowerCase()
    const old=pendingPayments.find(x=>x.id===id&&x.side===side)
    const previousValue=!!reg?.[field]
    const updated=[
      ...pendingPayments.filter(x=>!(x.id===id&&x.side===side)),
      {id,side,value,expected:old?.expected??previousValue}
    ]
    // Prima persistiamo, poi rendiamo visibile la spunta, così un blackout
    // non lascia una modifica che non sia stata memorizzata.
    if(!queueUpdate(updated))return
    const updatedData={...data,items:(data?.items||[]).map((r:any)=>
      r.id===id?{...r,[field]:value}:r
    )}
    mutate(updatedData,false)
    cacheOfflineJSON('/api/registrations/for-payments?tournament_id='+tId,updatedData)
    setPaymentsMessage(navigator.onLine?'Pagamento da sincronizzare…':'Pagamento salvato sul dispositivo (offline).')
    if(navigator.onLine)void syncPayments()
  }


  const allAssigned = new Set(groupsForPayments.flatMap(g=>g.rows.map(x=>x.registrationId)))
  const byId = new Map(payableItems.map((r:any)=>[r.id,r]))
  const renderChecks = (r:any) => {
    const isTeam=!!r.team_name && Number(r.team_format)>=3
    const is4=Number(r.team_format)===4
    return <div key={r.id} className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-lg border border-neutral-700 px-2 py-2">
      <label className="flex justify-center" title={'Pagamento di '+r.a}>
        <input aria-label={'Pagato: '+r.a} type="checkbox" checked={!!r.paid_a} onChange={e=>togglePaid(r.id,'A',e.target.checked)}/>
      </label>
      <div className="min-w-0 text-center text-sm font-medium text-white">
        {r.a} / {r.b}
        {isTeam&&<div className="text-xs text-neutral-400">{r.c}{is4?' / '+r.d:''}</div>}
      </div>
      <label className="flex justify-center" title={'Pagamento di '+r.b}>
        <input aria-label={'Pagato: '+r.b} type="checkbox" checked={!!r.paid_b} onChange={e=>togglePaid(r.id,'B',e.target.checked)}/>
      </label>
      {isTeam&&<div className="col-span-3 flex items-center justify-center gap-3 text-xs text-neutral-300">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!r.paid_c} onChange={e=>togglePaid(r.id,'C',e.target.checked)}/>
          {r.c||'C'}
        </label>
        {is4&&<label className="flex items-center gap-1">
          <input type="checkbox" checked={!!r.paid_d} onChange={e=>togglePaid(r.id,'D',e.target.checked)}/>
          {r.d||'D'}
        </label>}
      </div>}
    </div>
  }

  return (
    <div className="mt-payments-page space-y-4 xl:space-y-6 p-2 sm:p-3 xl:p-6">
      <h1 className="mt-simple-page-title">Pagamenti</h1>
      <PrepareOffline tournamentId={tId} />
      {!!pendingPayments.length&&<div role="status" className="rounded border border-amber-500 p-2 text-amber-200">
        Pagamenti da sincronizzare: {pendingPayments.length}.
        <button type="button" onClick={()=>void syncPayments()} disabled={!!paymentsConflict}
          className="ml-3 underline">Sincronizza</button>
      </div>}
      {paymentsMessage&&<p role="status" className="text-sm text-sky-200">{paymentsMessage}</p>}
      {paymentsConflict&&<p role="alert" className="rounded border border-red-500 p-2 text-red-300">{paymentsConflict}</p>
      {/* intestazione: stessi selettori di Iscrizioni */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tour</span>
          <select
            className="input"
            value={tourId}
            onChange={e => onPickTour(e.target.value)}
          >
            {tours?.items?.map((tr: any) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
                {tr.season_start && tr.season_end
                  ? ` (${tr.season_start}/${tr.season_end})`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tappa</span>
          <select
            className="input"
            value={tId}
            onChange={e => onPickTappa(e.target.value)}
          >
            {tappeVisibili.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.event_date ? `${t.event_date} — ` : ''}
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={()=>setShowStats(x=>!x)}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300">
            {showStats?'Nascondi riepilogo':'Mostra riepilogo'}
          </button>
        </div>
      </div>

      {showStats&&<div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">
        Squadre: {stats.teams} · Pagate A: {stats.a} · Pagate B: {stats.b} · Pagate C: {stats.c} · Pagate D: {stats.d} · Squadre pagate: {stats.full}
      </div>}
      <div className="inline-flex overflow-hidden rounded-lg border border-neutral-700" role="group" aria-label="Visualizzazione pagamenti">
        <button type="button" aria-pressed={view==='lista'} onClick={()=>setView('lista')}
          className={view==='lista'?'bg-blue-700 px-4 py-2 text-white':'bg-neutral-900 px-4 py-2 text-neutral-300'}>Lista</button>
        <button type="button" aria-pressed={view==='gironi'} onClick={()=>setView('gironi')}
          className={view==='gironi'?'bg-blue-700 px-4 py-2 text-white':'bg-neutral-900 px-4 py-2 text-neutral-300'}>Gironi</button>
      </div>
      {/* Le due viste utilizzano esattamente gli stessi paid_a/b/c/d delle iscrizioni. */}
      <div className="card p-4 space-y-3">
        {/* 🔍 barra di ricerca (solo se c'è tappa selezionata) */}
        {tId && payableItems.length > 0 && (
          <div className="mb-2">
            <input
              className="input w-full max-w-sm"
              placeholder="Cerca per nome o squadra…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}

        {view==='gironi' ? (
          !tId ? <div className="text-neutral-400">Seleziona una tappa.</div> :
          !groupsResponse ? <div className="text-neutral-400">Caricamento gironi…</div> :
          groupsForPayments.length===0 ? <div className="text-neutral-400">Non ci sono ancora coppie assegnate ai gironi. Usa la vista Lista.</div> :
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {groupsForPayments.map(g=><section key={g.letter} className="overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/60">
              <h2 className="px-3 py-3 text-center text-lg font-extrabold tracking-wide text-white"
                style={{backgroundColor:colorFor(g.letter)}}>GIRONE {g.letter}</h2>
              <div className="space-y-2 p-3">
              {g.rows.map(({registrationId,slot})=>{
                const reg=byId.get(registrationId) as any
                return reg ? renderChecks(reg) :
                  <div key={registrationId} className="text-sm text-amber-300">Slot {slot}: iscrizione non presente nei pagamenti ({groupState?.labels?.[registrationId]||'ID non trovato'})</div>
              })}
              </div>
            </section>)}
            {payableItems.filter((r:any)=>!allAssigned.has(r.id)).length>0&&<section className="rounded-xl border border-neutral-700 p-3 space-y-2">
              <h2 className="text-center text-lg font-bold">Non assegnate</h2>
              {payableItems.filter((r:any)=>!allAssigned.has(r.id)).map((r:any)=>renderChecks(r))}
            </section>}
          </div>
        ) : !tId ? (
          <div className="text-neutral-400">Seleziona una tappa visibile.</div>
        ) : payableItems.length === 0 ? (
          items.length > 0 ? (
            <div className="text-neutral-400">
              Solo lista d’attesa per questa tappa. Nessuno da pagare.
            </div>
          ) : (
            <div className="text-neutral-400">
              Nessuna iscrizione per questa tappa.
            </div>
          )
        ) : visibleItems.length === 0 ? (
          <div className="text-neutral-400">
            Nessun risultato per la ricerca corrente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
  {visibleItems.map((r: any, i: number) => {
    const isTeam = !!r.team_name && Number(r.team_format) >= 3
    const is4 = Number(r.team_format) === 4

    const fullyPaid = isTeam
      ? (r.paid_a && r.paid_b && r.paid_c && (is4 ? r.paid_d : true))
      : (r.paid_a && r.paid_b)

   return (
  <div
    key={r.id}
    className={[
      'py-2 px-3 rounded-lg border border-neutral-800',
      'grid gap-x-2 gap-y-2',
      'grid-cols-[72px_1fr_72px]',  // sx / centro / dx
      fullyPaid ? 'opacity-70' : '',
    ].join(' ')}
  >
    {/* TEAM NAME (span 3) */}
    {isTeam && (
      <div className="col-span-3 text-center font-semibold text-blue-400 leading-tight">
        {r.team_name}
      </div>
    )}

    {/* ROW 1: A / (A-B names) / B */}
    <label className="flex items-center gap-2 text-xs sm:text-sm justify-start">
      <input
        type="checkbox"
        checked={!!r.paid_a}
        onChange={e => togglePaid(r.id, 'A', e.target.checked)}
      />
      <span>A</span>
    </label>

    <div className="text-center text-sm text-white leading-tight">
      {r.a} — {r.b}
    </div>

    <label className="flex items-center gap-2 text-xs sm:text-sm justify-end">
      <span>B</span>
      <input
        type="checkbox"
        checked={!!r.paid_b}
        onChange={e => togglePaid(r.id, 'B', e.target.checked)}
      />
    </label>

    {/* ROW 2: C / (C-D names) / D */}
    {isTeam ? (
      <>
        <label className="flex items-center gap-2 text-xs sm:text-sm justify-start">
          <input
            type="checkbox"
            checked={!!r.paid_c}
            onChange={e => togglePaid(r.id, 'C', e.target.checked)}
          />
          <span>C</span>
        </label>

        <div className="text-center text-sm text-white/90 leading-tight">
          {r.c || '—'}
          {is4 ? ` — ${r.d || '—'}` : ''}
        </div>

        {is4 ? (
          <label className="flex items-center gap-2 text-xs sm:text-sm justify-end">
            <span>D</span>
            <input
              type="checkbox"
              checked={!!r.paid_d}
              onChange={e => togglePaid(r.id, 'D', e.target.checked)}
            />
          </label>
        ) : (
          <div /> // placeholder per 3x3
        )}
      </>
    ) : (
      // 2x2: seconda riga vuota
      <>
        <div />
        <div />
        <div />
      </>
    )}
  </div>
)


  })}
</div>

        )}
      </div>
    </div>
  )
}
