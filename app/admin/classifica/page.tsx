'use client'

import * as React from 'react'
import useSWR from 'swr'
import dynamic from 'next/dynamic'

// opzionale: se hai già il componente
const PlayerPicker = dynamic(() => import('@/components/PlayerPicker'), { ssr: false })

/* ================== Tipi ================== */
type Gender = 'M'|'F'
type PlayerRow  = { id: string; name: string }
type Tappa      = { id: string; title: string; date: string; multiplier: number; totalTeams: number }
type Results    = Record<string /*playerId*/, Record<string /*tappaId*/, { pos?: number }>>
type SaveShape  = { players: PlayerRow[]; tappe: Tappa[]; results: Results }

type ScoreCfg     = { base: number; minLast: number; curvePercent: number }
type ScoreCfgSet  = { S: ScoreCfg; M: ScoreCfg; L: ScoreCfg; XL: ScoreCfg }

const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 },
  M:  { base:100, minLast:10, curvePercent:100 },
  L:  { base:100, minLast:10, curvePercent:100 },
  XL: { base:100, minLast:10, curvePercent:100 },
}

/* ================== Utils ================== */
const uid = () => Math.random().toString(36).slice(2, 9)
const fullName = (p: { first_name?: string; last_name?: string }) =>
  `${p?.last_name ?? ''} ${p?.first_name ?? ''}`.trim()

/* ===== punteggi ===== */
function pickBucket(total:number): keyof ScoreCfgSet {
  if (total <= 8) return 'S'
  if (total <= 16) return 'M'
  if (total <= 32) return 'L'
  return 'XL'
}
function pointsOfBucket(pos: number | undefined, total: number, mult: number, set:ScoreCfgSet) {
  if (!pos || pos < 1 || total < 1) return 0
  const cfg = set[pickBucket(total)]
  if (total === 1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent / 100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

/* ================== API helpers ================== */
// fetcher “alla iscritti”: header + anti-cache
const fetchNoCache = (u: string) =>
  fetch(u + (u.includes('?') ? '&' : '?') + '_ts=' + Date.now(), {
    headers: { 'x-role': 'admin' },
    cache: 'no-store',
  }).then(async r => {
    const txt = await r.text()
    if (!r.ok) throw new Error(txt || 'HTTP error')
    try { return JSON.parse(txt) } catch { return {} }
  })

async function apiGetSettings(tour: string, gender: Gender) {
  const url = `/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}`
  const r = await fetchNoCache(url)
  return (r?.settings ?? null) as (ScoreCfgSet|null)
}
async function apiUpsertSnapshot(tour: string, gender: Gender, data: SaveShape) {
  const r = await fetch('/api/leaderboard/snapshots', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
    body: JSON.stringify({ tour, gender, data }),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(txt || 'PUT failed')
  return JSON.parse(txt)
}
async function apiListTours(): Promise<string[]> {
  // come negli iscritti: proviamo snapshot/tours
  try {
    const j = await fetchNoCache('/api/leaderboard/snapshots/tours')
    if (Array.isArray(j?.tours)) return j.tours
  } catch {}
  return []
}

/* ================== Pagina ================== */
export default function Page() {
  // tour/gender: come “iscritti”, very simple
  const [tour, setTour] = React.useState<string>(() =>
    (typeof window !== 'undefined' ? (localStorage.getItem('semi:lastTour')||'') : '') || '')
  const [gender, setGender] = React.useState<Gender>(() =>
    (typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender|null) : null) || 'M'
  )

  React.useEffect(()=>{ if (tour) localStorage.setItem('semi:lastTour', tour) },[tour])
  React.useEffect(()=>{ localStorage.setItem('semi:lastGender', gender) },[gender])

  // tours per tendina
  const tours = useSWR('/api/leaderboard/snapshots/tours', fetchNoCache, {
    revalidateOnFocus: false, revalidateOnReconnect: false,
  })
  React.useEffect(()=>{
    if (!tour && Array.isArray(tours.data?.tours) && tours.data.tours[0]) {
      setTour(String(tours.data.tours[0]))
    }
  }, [tours.data, tour])

  // snapshot + settings (SWR, niente autosave)
  const snapKey = tour ? `/api/leaderboard/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}` : null
  const snapSWR = useSWR(snapKey, fetchNoCache, {
    revalidateOnFocus: false, revalidateOnReconnect: false,
  })

  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  React.useEffect(()=>{
    if (!tour) return
    let alive = true
    apiGetSettings(tour, gender).then(s => {
      if (!alive) return
      setScoreSet(s ?? DEFAULT_SET)
    }).catch(()=> setScoreSet(DEFAULT_SET))
    return ()=>{ alive = false }
  }, [tour, gender])

  // draft locale da modificare (fonte di verità = server; qui si edita e poi “Salva”)
  const [draft, setDraft] = React.useState<SaveShape>({ players:[], tappe:[], results:{} })
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [err, setErr] = React.useState<string>('')

  React.useEffect(()=>{
    const s: SaveShape = (snapSWR.data?.data && typeof snapSWR.data.data==='object')
      ? snapSWR.data.data
      : { players:[], tappe:[], results:{} }
    setDraft({
      players: Array.isArray(s.players)? s.players : [],
      tappe:   Array.isArray(s.tappe)?   s.tappe   : [],
      results: (s.results && typeof s.results==='object') ? s.results : {},
    })
    setDirty(false)
  }, [snapSWR.data])

  function setPos(playerId: string, tappaId: string, pos: number | undefined) {
    setDraft(prev => {
      const results = { ...prev.results }
      const row = { ...(results[playerId] || {}) }
      row[tappaId] = { pos }
      results[playerId] = row
      return { ...prev, results }
    })
    setDirty(true)
  }
  function addPlayer(p: {id:string; first_name?:string; last_name?:string}) {
    setDraft(prev => {
      if (prev.players.some(x => x.id === p.id)) return prev
      const players = [...prev.players, { id: p.id, name: fullName(p) }]
      const results = { ...prev.results, [p.id]: prev.results[p.id] || {} }
      return { ...prev, players, results }
    })
    setDirty(true)
  }
  function removePlayer(playerId: string) {
    if (!confirm('Eliminare questo giocatore dalla classifica?')) return
    setDraft(prev => {
      const players = prev.players.filter(p => p.id !== playerId)
      const results = { ...prev.results }; delete results[playerId]
      return { ...prev, players, results }
    })
    setDirty(true)
  }
  // tappe
  const [newTitle, setNewTitle] = React.useState('')
  const [newDate,  setNewDate ] = React.useState('')
  const [newMult,  setNewMult ] = React.useState<number>(1)
  const [newTotal, setNewTotal] = React.useState<number>(8)

  function addTappa() {
    if (!newTitle.trim()) { alert('Titolo tappa mancante'); return }
    if (newTotal < 1) { alert('Totale squadre deve essere ≥ 1'); return }
    const t: Tappa = {
      id: uid(),
      title: newTitle.trim(),
      date: newDate.trim(),
      multiplier: Number(newMult) || 1,
      totalTeams: Number(newTotal) || 1
    }
    setDraft(prev => ({ ...prev, tappe: [...prev.tappe, t] }))
    setNewTitle(''); setNewDate(''); setNewMult(1); setNewTotal(8)
    setDirty(true)
  }
  function removeTappa(tappaId: string) {
    if (!confirm('Eliminare la tappa?')) return
    setDraft(prev => {
      const tappe = prev.tappe.filter(t => t.id !== tappaId)
      const results: Results = {}
      for (const pid of Object.keys(prev.results)) {
        const row = { ...prev.results[pid] }; delete row[tappaId]
        results[pid] = row
      }
      return { ...prev, tappe, results }
    })
    setDirty(true)
  }

  async function doSave() {
    if (!tour) { alert('Seleziona un tour'); return }
    setErr(''); setSaving(true)
    try {
      await apiUpsertSnapshot(tour, gender, draft)
      await snapSWR.mutate() // ricarica dal server -> UI allineata
      setDirty(false)
    } catch (e:any) {
      setErr(e?.message || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }
  function cancelChanges() {
    // butta il draft e ricarica l’ultima versione dal server
    snapSWR.mutate()
  }

  // computed (su draft)
  const rows = React.useMemo(()=>{
    const out = draft.players.map(p=>{
      let total=0, bestPos=Infinity
      for (const t of draft.tappe){
        const pos = draft.results[p.id]?.[t.id]?.pos
        const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
        total += pts
        if (pos && pos < bestPos) bestPos = pos
      }
      return { player:p, total, bestPos }
    })
    out.sort((a,b)=>
      (b.total - a.total)
      || ((a.bestPos===b.bestPos?0:(a.bestPos - b.bestPos)))
      || a.player.name.localeCompare(b.player.name,'it')
    )
    return out
  },[draft, scoreSet])

  const classForRow = (rank:number)=> rank===1 ? 'bg-yellow-900/20'
                        : (rank>=2 && rank<=8 ? 'bg-green-900/10' : '')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Classifica (SWR, salva esplicito)</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-sm text-neutral-400">Tour</div>
          <select
            className="input input-sm w-[220px]"
            value={tour}
            onChange={(e)=>setTour(e.target.value)}
          >
            {(tours.data?.tours?.length ? tours.data.tours : (tour ? [tour] : []))
              .map((t:string)=> <option key={t} value={t}>{t}</option>)}
          </select>
          <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>Maschile</button>
          <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>Femminile</button>
        </div>
      </div>

      {/* barra azioni */}
      <div className="flex items-center gap-2">
        <div className="text-sm text-neutral-400">
          {snapSWR.isLoading ? 'Carico…' : (dirty ? 'Modifiche non salvate' : 'Allineato al server')}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={cancelChanges} disabled={snapSWR.isLoading || saving}>Annulla modifiche</button>
          <button className="btn btn-sm" onClick={doSave} disabled={!dirty || saving || snapSWR.isLoading}>
            {saving ? 'Salvo…' : 'Salva'}
          </button>
        </div>
      </div>
      {err && <div className="text-red-400 text-sm">{String(err)}</div>}

      {/* tools */}
      <div className="card p-4 space-y-4">
        <div className="flex items-end gap-3">
          <div className="w-64">
            <div className="text-xs mb-1">Aggiungi giocatore</div>
            {PlayerPicker
              ? <PlayerPicker onSelect={(p:any)=>addPlayer(p)} />
              : <div className="text-xs text-neutral-500">PlayerPicker non disponibile</div>}
          </div>
          <div className="text-xs text-neutral-500">Usa “Salva” per applicare su Supabase.</div>
        </div>

        <div className="border-t border-neutral-800 pt-4" />
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-3">
            <div className="text-xs mb-1">Titolo tappa</div>
            <input className="input w-full" value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Es. Tappa 1" />
          </div>
          <div className="col-span-2">
            <div className="text-xs mb-1">Data (gg/mm)</div>
            <input className="input w-full" value={newDate} onChange={e=>setNewDate(e.target.value)} placeholder="gg/mm" />
          </div>
          <div className="col-span-2">
            <div className="text-xs mb-1">Moltiplicatore</div>
            <input className="input w-full" type="number" step="0.01" value={newMult} onChange={e=>setNewMult(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <div className="text-xs mb-1">Totale squadre</div>
            <input className="input w-full" type="number" min={1} value={newTotal} onChange={e=>setNewTotal(Number(e.target.value))} />
          </div>
          <div className="col-span-3">
            <button className="btn w-full" onClick={addTappa}>Aggiungi tappa</button>
          </div>
        </div>
      </div>

      {/* tabella */}
      <div className="text-center font-semibold text-neutral-200">
        <div className="inline-flex items-center gap-2 text-2xl">
          <span>Classifica</span>
          <span className="font-bold">{tour || '—'}</span>
          <span className="ml-2 align-middle px-2 py-0.5 rounded bg-neutral-800 text-neutral-100 text-xs">
            {gender === 'M' ? 'Maschile' : 'Femminile'}
          </span>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        {!tour ? (
          <div className="text-sm text-neutral-500">Seleziona un tour.</div>
        ) : snapSWR.isLoading ? (
          <div className="text-sm text-neutral-500">Carico…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-500">Nessun dato.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left py-2 pr-2 w-10">#</th>
                <th className="text-left py-2 pr-4 w-[360px]">Nome</th>
                <th className="text-left py-2 pr-2 w-[100px]">Totale</th>
                {draft.tappe.map((t)=>(
                  <th key={t.id} className="text-left py-2 pr-2 border-l border-neutral-800 pl-3">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs">× {t.multiplier.toFixed(2)} — {t.date || 'gg/mm'}</div>
                    <div className="text-xs text-neutral-500">tot: {t.totalTeams}</div>
                    <button className="btn btn-ghost btn-xs mt-1" onClick={()=>removeTappa(t.id)}>Elimina colonna</button>
                  </th>
                ))}
                <th className="text-center py-2 pl-2 w-[48px]">Azione</th>
              </tr>
              {draft.tappe.length>0 && (
                <tr className="text-neutral-400">
                  <th /><th /><th />
                  {draft.tappe.map((t)=>(
                    <th key={t.id} className="py-1 border-l border-neutral-800 pl-3">
                      <div className="grid grid-cols-2 w-32">
                        <span className="text-left">POS</span>
                        <span className="text-right">PTS</span>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((r, i)=>(
                <tr key={r.player.id} className={`border-t border-neutral-800 ${classForRow(i+1)}`}>
                  <td className="py-2 pr-2 tabular-nums">{i+1}</td>
                  <td className="py-2 pr-4">
                    <span className={`font-medium ${i===0 ? 'text-yellow-300' : ''}`}>
                      {r.player.name}{i===0 ? ' 👑' : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-2 tabular-nums font-semibold">{r.total}</td>
                  {draft.tappe.map((t)=>{
                    const pos = draft.results[r.player.id]?.[t.id]?.pos
                    const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
                    return (
                      <td key={t.id} className="py-2 pr-2 border-l border-neutral-800 pl-3">
                        <div className="grid grid-cols-2 items-center w-32">
                          <input
                            className="input input-sm w-16"
                            type="number"
                            min={1}
                            max={t.totalTeams}
                            value={pos ?? ''}
                            onChange={(e)=>{
                              const v = e.target.value === '' ? undefined : Math.max(1, Math.min(t.totalTeams, Number(e.target.value)))
                              setPos(r.player.id, t.id, v)
                            }}
                            placeholder="—"
                            title="Posizione finale"
                          />
                          <div className="w-16 tabular-nums text-right">{pts}</div>
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-2 pl-2 align-middle text-center">
                    <button className="btn btn-ghost btn-xs" onClick={()=>removePlayer(r.player.id)}>Rimuovi</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
