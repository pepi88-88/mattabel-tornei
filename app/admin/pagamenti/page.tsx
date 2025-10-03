'use client'
import useSWR from 'swr'
import { useEffect, useMemo, useState } from 'react'

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function PagamentiPage() {
  // TOUR
  const { data: tours } = useSWR('/api/tours', fetcher)
  const [tourId, setTourId] = useState('')
  useEffect(() => { const s = localStorage.getItem('selectedTourId'); if (s) setTourId(s) }, [])
  function onPickTour(id:string){ setTourId(id); localStorage.setItem('selectedTourId', id); setTId('') }

  // TAPPA (raw)
  const { data: taps } = useSWR(tourId ? `/api/tournaments?tour_id=${tourId}` : null, fetcher)
  const [tId, setTId] = useState('')
  useEffect(() => { const s = localStorage.getItem('selectedTournamentId'); if (s) setTId(s) }, [])

  // ---- PATCH A: elenco tappe visibili (esclude CHIUSE) + ordinamento per data desc
  const parseDate = (s?: string|null) => (s ? new Date(s).getTime() : 0)
  const tappeVisibili = useMemo(() => {
    const arr = (taps?.items ?? []) as any[]
    return arr
      .filter(tp => tp?.status !== 'closed') // 👈 NASCONDI CHIUSE
      .sort((a,b) => parseDate(b?.event_date) - parseDate(a?.event_date))
  }, [taps])

  // ---- PATCH B: se non c'è tId, seleziona la prima visibile
  useEffect(() => {
    if (!tId && tappeVisibili.length) {
      setTId(tappeVisibili[0].id)
    }
  }, [tappeVisibili, tId])

  // ---- PATCH C: se la tappa salvata è chiusa/non più visibile → reset
  useEffect(() => {
    if (!tId) return
    const stillVisible = tappeVisibili.some(t => t.id === tId)
    if (!stillVisible) {
      setTId('')
      const saved = localStorage.getItem('selectedTournamentId')
      if (saved === tId) localStorage.removeItem('selectedTournamentId')
    }
  }, [tId, tappeVisibili])

  function onPickTappa(id:string){ setTId(id); localStorage.setItem('selectedTournamentId', id) }

  // LISTA pagamenti
  const { data, mutate } = useSWR(
    tId ? `/api/registrations/for-payments?tournament_id=${tId}` : null,
    fetcher
  )
  const items = data?.items ?? []
// --- SOLO PAGAMENTI: escludi la waiting list
const maxTeamsRaw =
  tId ? (tappeVisibili.find((t: any) => t.id === tId)?.max_teams) : undefined
const maxTeams = Number.isFinite(+maxTeamsRaw) ? Math.max(0, +maxTeamsRaw) : 0

// mostra in Pagamenti solo i primi "maxTeams" (se > 0). Se maxTeams non impostato → mostra tutto
const payableItems =
  maxTeams > 0 ? items.slice(0, Math.min(maxTeams, items.length)) : items

  // totali
 const stats = useMemo(() => {
  let a = 0, b = 0, both = 0
  for (const r of payableItems) {
    if (r.paid_a) a++
    if (r.paid_b) b++
    if (r.paid_a && r.paid_b) both++
  }
  return { a, b, both, teams: payableItems.length }
}, [payableItems])

  async function togglePaid(id:string, side:'A'|'B', value:boolean){
    const body: any = { id }
    if (side==='A') body.paid_a = value
    else body.paid_b = value

    // ottimistico
    const prev = data
    mutate({ items: items.map((r:any)=> r.id===id ? { ...r, paid_a: side==='A'? value : r.paid_a, paid_b: side==='B'? value : r.paid_b } : r) }, false)
    const res = await fetch('/api/registrations/pay', {
      method:'PATCH', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      mutate(prev, false)
      const js = await res.json().catch(()=>({}))
      alert(js?.error || 'Errore aggiornamento pagamento')
    } else {
      mutate()
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* intestazione: stessi selettori di Iscrizioni */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tour</span>
          <select className="input" value={tourId} onChange={e=>onPickTour(e.target.value)}>
            {tours?.items?.map((tr:any)=>(
              <option key={tr.id} value={tr.id}>
                {tr.name}{tr.season_start&&tr.season_end?` (${tr.season_start}/${tr.season_end})`:''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tappa</span>
          <select className="input" value={tId} onChange={e=>onPickTappa(e.target.value)}>
            {tappeVisibili.map((t:any)=>(
              <option key={t.id} value={t.id}>
                {t.event_date ? `${t.event_date} — ` : ''}{t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto text-sm text-neutral-400">
          Squadre: {stats.teams} · Pagate A: {stats.a} · Pagate B: {stats.b} · Squadre pagate: {stats.both}
        </div>
      </div>

      {/* elenco pagamenti */}
      {/* elenco pagamenti */}
<div className="card p-4">
  {!tId ? (
    <div className="text-neutral-400">Seleziona una tappa visibile.</div>
  ) : payableItems.length === 0 ? (
    items.length > 0 ? (
      <div className="text-neutral-400">
        Solo lista d’attesa per questa tappa. Nessuno da pagare.
      </div>
    ) : (
      <div className="text-neutral-400">Nessuna iscrizione per questa tappa.</div>
    )
  ) : (
    <div className="divide-y divide-neutral-800">
      {payableItems.map((r:any, i:number)=>(
        <div key={r.id} className="py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400 w-8">#{i+1}</span>
            <span className="whitespace-pre">{r.a} — {r.b}</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!r.paid_a}
                onChange={e=>togglePaid(r.id,'A', e.target.checked)}
              />
              <span className="text-sm">Pagato A</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!r.paid_b}
                onChange={e=>togglePaid(r.id,'B', e.target.checked)}
              />
              <span className="text-sm">Pagato B</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

    </div>
  )
}
