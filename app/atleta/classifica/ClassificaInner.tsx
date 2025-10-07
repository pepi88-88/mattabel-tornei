// app/atleta/classifica/ClassificaInner.tsx
'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

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

/* ===== API helpers ===== */
async function apiGetSnapshot(tour: string, gender: Gender) {
  const r = await fetch(
    `/api/leaderboard/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!r.ok) throw new Error('snapshot get failed')
  return r.json() as Promise<{ data: SaveShape|null }>
}

async function apiGetSettings(tour: string, gender: Gender) {
  const r = await fetch(
    `/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!r.ok) throw new Error('settings get failed')
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}

async function apiListTours(): Promise<string[]> {
  const r = await fetch(`/api/leaderboard/snapshots/tours`, { cache: 'no-store' })
  if (!r.ok) return []
  const j = await r.json()
  return Array.isArray(j?.tours) ? j.tours : []
}

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

export default function ClassificaInner() {
  const params = useSearchParams()

  // tendina tour popolata dal server
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  React.useEffect(()=>{ 
    let alive = true
    apiListTours()
      .then(ts => { if (alive) setAvailableTours(ts) })
      .catch(()=>{ if (alive) setAvailableTours([]) })
    return ()=>{ alive = false }
  },[])

  // stato iniziale tour/genere
  const initialTour =
    params.get('tour')
    || (typeof window !== 'undefined' ? localStorage.getItem('semi:lastTour') : '')
    || (availableTours[0] || 'Tour Demo')

  const [tour, setTour] = React.useState<string>(initialTour)
  const [gender, setGender] = React.useState<Gender>(() =>
    (typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender|null) : null) || 'M'
  )

  // persistenza lato client
  React.useEffect(()=>{ if (typeof window!=='undefined') localStorage.setItem('semi:lastTour', tour) },[tour])
  React.useEffect(()=>{ if (typeof window!=='undefined') localStorage.setItem('semi:lastGender', gender) },[gender])

  // dati classifica dal SERVER
  const [state, setState] = React.useState<SaveShape>({players:[],tappe:[],results:{}})
  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  const [loading, setLoading] = React.useState(false)
  const [errorText, setErrorText] = React.useState<string>('')

  React.useEffect(()=>{
    let alive = true
    setLoading(true); setErrorText('')
    Promise.all([ apiGetSnapshot(tour, gender), apiGetSettings(tour, gender) ])
      .then(([snap, setts])=>{
        if (!alive) return
        const s: SaveShape = snap?.data ?? { players:[], tappe:[], results:{} }
        setState({
          players: Array.isArray(s.players)? s.players : [],
          tappe:   Array.isArray(s.tappe)?   s.tappe   : [],
          results: (s.results && typeof s.results==='object') ? s.results : {},
        })
        setScoreSet(setts?.settings ?? DEFAULT_SET)
      })
      .catch((err:any)=>{ if (alive) setErrorText(err?.message || 'Errore caricamento dati') })
      .finally(()=>{ if (alive) setLoading(false) })
    return ()=>{ alive = false }
  },[tour, gender])

  // computed
  const rows = React.useMemo(()=>{
    const out = state.players.map(p=>{
      let total=0, bestPos=Infinity
      for (const t of state.tappe){
        const pos = state.results[p.id]?.[t.id]?.pos
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
  },[state, scoreSet])

  const classForRow = (rank:number)=> rank===1 ? 'bg-yellow-900/20'
                        : (rank>=2 && rank<=8 ? 'bg-green-900/10' : '')

  return (
    <div className="space-y-4">
      {/* selezione tour/genere (tour da server) */}
      <div className="flex items-center gap-2">
        <div className="text-sm text-neutral-400">Tour</div>
        <select className="input input-sm w-[220px]" value={tour} onChange={(e)=>setTour(e.target.value)}>
          {(availableTours.length?availableTours:[tour]).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="ml-2 flex gap-2">
          <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>Maschile</button>
          <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>Femminile</button>
        </div>
      </div>

      {/* titolo */}
      <div className="text-center font-semibold text-neutral-200">
        <div className="inline-flex items-center gap-2 text-2xl">
          <span>Classifica</span>
          <span className="font-bold">{tour}</span>
          <span className="ml-2 align-middle px-2 py-0.5 rounded bg-neutral-800 text-neutral-100 text-xs">
            {gender === 'M' ? 'Maschile' : 'Femminile'}
          </span>
        </div>
      </div>

      <div className="card p-4 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-neutral-500">Carico…</div>
        ) : errorText ? (
          <div className="text-sm text-red-400">{errorText}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-500">Nessun dato.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left py-2 pr-2 w-10">#</th>
                <th className="text-left py-2 pr-4 w-[360px]">Nome</th>
                <th className="text-left py-2 pr-2 w-[100px]">Totale</th>
                {state.tappe.map((t)=>(
                  <th key={t.id} className="text-left py-2 pr-2 border-l border-neutral-800 pl-3">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs">× {t.multiplier.toFixed(2)} — {t.date || 'gg/mm'}</div>
                    <div className="text-xs text-neutral-500">tot: {t.totalTeams}</div>
                  </th>
                ))}
              </tr>
              {state.tappe.length>0 && (
                <tr className="text-neutral-400">
                  <th /><th /><th />
                  {state.tappe.map((t)=>(
                    <th key={t.id} className="py-1 border-l border-neutral-800 pl-3">
                      <div className="grid grid-cols-2 w-32">
                        <span className="text-left">POS</span>
                        <span className="text-right">PTS</span>
                      </div>
                    </th>
                  ))}
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
                  {state.tappe.map((t)=>{
                    const pos = state.results[r.player.id]?.[t.id]?.pos
                    const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
                    return (
                      <td key={t.id} className="py-2 pr-2 border-l border-neutral-800 pl-3">
                        <div className="grid grid-cols-2 items-center w-32">
                          <div className="w-16 tabular-nums">{pos ?? '—'}</div>
                          <div className="w-16 tabular-nums text-right">{pts}</div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
