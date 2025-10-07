// app/admin/classifica2/page.tsx
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
async function apiPutSnapshot2(tour: string, gender: Gender, data: SaveShape) {
  const r = await fetch(`/api/lb2/snapshots`, {
    method: 'PUT',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ tour, gender, data })
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(txt || 'PUT failed')
  return JSON.parse(txt)
}
async function apiListTours2(): Promise<string[]> {
  const r = await fetch(`/api/lb2/snapshots/tours?ts=${Date.now()}`, { cache:'no-store' })
  if (!r.ok) return []
  const j = await r.json().catch(()=>({}))
  return Array.isArray(j?.tours) ? j.tours : []
}

export default function Page(){
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  const [tour, setTour]     = React.useState<string>(() => (typeof window!=='undefined' ? localStorage.getItem('lb2:lastTour') : '') || '')
  const [gender, setGender] = React.useState<Gender>(() => (typeof window!=='undefined' ? (localStorage.getItem('lb2:lastGender') as Gender|null) : null) || 'M')

  const [jsonText, setJsonText] = React.useState<string>('{\n  "players": [],\n  "tappe": [],\n  "results": {}\n}')
  const [scoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  const [loading, setLoading] = React.useState(false)
  const [msg, setMsg] = React.useState<string>('')

  React.useEffect(() => { apiListTours2().then(setAvailableTours).catch(()=>setAvailableTours([])) }, [])
  React.useEffect(() => { if (typeof window!=='undefined') localStorage.setItem('lb2:lastTour', tour) }, [tour])
  React.useEffect(() => { if (typeof window!=='undefined') localStorage.setItem('lb2:lastGender', gender) }, [gender])

  async function loadNow(){
    if (!tour) { setMsg('Seleziona un tour'); return }
    setLoading(true); setMsg('')
    try{
      const { data } = await apiGetSnapshot2(tour, gender)
      const s: SaveShape = data ?? { players:[], tappe:[], results:{} }
      setJsonText(JSON.stringify({
        players: Array.isArray(s.players)? s.players : [],
        tappe:   Array.isArray(s.tappe)?   s.tappe   : [],
        results: (s.results && typeof s.results==='object') ? s.results : {}
      }, null, 2))
      setMsg('Caricato dalla NUOVA tabella (lb2).')
    } catch(e:any){
      setMsg('Errore GET: ' + (e?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  async function saveNow(){
    if (!tour) { setMsg('Seleziona un tour'); return }
    let parsed: SaveShape
    try{
      parsed = JSON.parse(jsonText)
    } catch {
      setMsg('JSON non valido.')
      return
    }
    setLoading(true); setMsg('')
    try{
      await apiPutSnapshot2(tour, gender, parsed)
      setMsg('Salvato (lb2). Ora ricarico…')
      await loadNow()
    } catch(e:any){
      setMsg('Errore PUT: ' + (e?.message || ''))
    } finally {
      setLoading(false)
    }
  }

  // preview calcolata
  let preview: Array<{name:string,total:number,bestPos:number}> = []
  try {
    const s = JSON.parse(jsonText) as SaveShape
    preview = (s.players || []).map(p=>{
      let total=0, bestPos=Infinity
      for (const t of (s.tappe || [])){
        const pos = s.results?.[p.id]?.[t.id]?.pos
        const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
        total += pts
        if (pos && pos < bestPos) bestPos = pos
      }
      return { name:p.name, total, bestPos }
    }).sort((a,b)=> (b.total-a.total) || ((a.bestPos===b.bestPos?0:(a.bestPos-a.bestPos))) || a.name.localeCompare(b.name,'it'))
  } catch {}

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Classifica v2 (tabella: lb2_snapshots)</h1>

      <div className="flex gap-2 items-center">
        <span>Tour</span>
        <select className="input input-sm w-[240px]" value={tour} onChange={e=>setTour(e.target.value)}>
          <option value="">— seleziona —</option>
          {availableTours.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>M</button>
        <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>F</button>

        <button className="btn btn-sm ml-auto" onClick={loadNow} disabled={loading || !tour}>Carica</button>
        <button className="btn btn-sm" onClick={saveNow} disabled={loading || !tour}>Salva</button>
      </div>

      {msg && <div className="text-sm text-neutral-400">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm mb-1">JSON (players, tappe, results)</div>
          <textarea
            className="textarea w-full h-[520px] font-mono text-xs"
            value={jsonText}
            onChange={e=>setJsonText(e.target.value)}
          />
        </div>
        <div>
          <div className="text-sm mb-1">Preview calcolata</div>
          <div className="card p-3">
            {!preview.length ? (
              <div className="text-sm text-neutral-500">Nessun dato.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-neutral-400">
                  <tr><th className="text-left">Nome</th><th className="text-left">Totale</th></tr>
                </thead>
                <tbody>
                  {preview.map((r,i)=>(
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="py-1 pr-4">{r.name}</td>
                      <td className="py-1">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
