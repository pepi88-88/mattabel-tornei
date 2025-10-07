// app/atleta/classifica2/page.tsx
'use client'

import * as React from 'react'

type Gender = 'M'|'F'
type PlayerRow  = { id: string; name: string }
type Tappa      = { id: string; title: string; date: string; multiplier: number; totalTeams: number }
type Results    = Record<string, Record<string, { pos?: number }>>
type SaveShape  = { players: PlayerRow[]; tappe: Tappa[]; results: Results }

type ScoreCfg     = { base: number; minLast: number; curvePercent: number }
type ScoreCfgSet  = { S: ScoreCfg; M: ScoreCfg; L: ScoreCfg; XL: ScoreCfg }

const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 },
  M:  { base:100, minLast:10, curvePercent:100 },
  L:  { base:100, minLast:10, curvePercent:100 },
  XL: { base:100, minLast:10, curvePercent:100 },
}
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

async function apiGetSnapshot2(tour: string, gender: Gender) {
  const url = `/api/lb2/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error('GET failed')
  return r.json() as Promise<{ data: SaveShape | null }>
}
async function apiListTours2(): Promise<string[]> {
  const r = await fetch(`/api/lb2/snapshots/tours?ts=${Date.now()}`, { cache:'no-store' })
  if (!r.ok) return []
  const j = await r.json().catch(()=>({}))
  return Array.isArray(j?.tours) ? j.tours : []
}

export default function Page(){
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  const [tour, setTour]     = React.useState<string>('')
  const [gender, setGender] = React.useState<Gender>('M')
  const [scoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  const [state, setState] = React.useState<SaveShape>({players:[],tappe:[],results:{}})
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState('')

  React.useEffect(()=>{ apiListTours2().then(setAvailableTours) },[])
  React.useEffect(()=>{
    if (!tour) return
    setLoading(true); setErr('')
    apiGetSnapshot2(tour, gender)
      .then(({data})=>{
        const s: SaveShape = data ?? {players:[],tappe:[],results:{}}
        setState({
          players: Array.isArray(s.players)? s.players : [],
          tappe:   Array.isArray(s.tappe)?   s.tappe   : [],
          results: (s.results && typeof s.results==='object') ? s.results : {},
        })
      })
      .catch((e:any)=> setErr(e?.message || 'Errore caricamento'))
      .finally(()=> setLoading(false))
  },[tour, gender])

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
    out.sort((a,b)=> (b.total - a.total) || ((a.bestPos===b.bestPos?0:(a.bestPos - b.bestPos))) || a.player.name.localeCompare(b.player.name,'it'))
    return out
  },[state, scoreSet])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span>Tour</span>
        <select className="input input-sm w-[240px]" value={tour} onChange={e=>setTour(e.target.value)}>
          <option value="">— seleziona —</option>
          {availableTours.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>M</button>
        <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>F</button>
      </div>

      <div className="card p-4 overflow-x-auto">
        {loading ? <div className="text-sm text-neutral-500">Carico…</div>
        : err ? <div className="text-sm text-red-400">{err}</div>
        : rows.length===0 ? <div className="text-sm text-neutral-500">Nessun dato.</div>
        : (
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="text-left py-2 pr-4 w-[360px]">Nome</th>
                <th className="text-left py-2 pr-2 w-[100px]">Totale</th>
                {state.tappe.map(t=>(
                  <th key={t.id} className="text-left py-2 pr-2 border-l border-neutral-800 pl-3">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs">× {t.multiplier.toFixed(2)} — {t.date || 'gg/mm'}</div>
                    <div className="text-xs text-neutral-500">tot: {t.totalTeams}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.player.id} className="border-t border-neutral-800">
                  <td className="py-2 pr-4">{r.player.name}</td>
                  <td className="py-2 pr-2 tabular-nums font-semibold">{r.total}</td>
                  {state.tappe.map(t=>{
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
