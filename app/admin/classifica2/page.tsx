'use client'
export const dynamic = 'force-dynamic' // ← niente SSG/ISR: evita l'errore in build

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

/* ===== Helpers API (versione lb2) ===== */
async function apiLb2ListTours(): Promise<string[]> {
  try {
    const r = await fetch('/api/lb2/tours', { cache: 'no-store' })
    const j = await r.json().catch(()=> ({} as any))
    return Array.isArray(j?.tours) ? j.tours : []
  } catch { return [] }
}
async function apiLb2Get(tour:string, gender:Gender) {
  const r = await fetch(`/api/lb2/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`, { cache:'no-store' })
  if (!r.ok) throw new Error('GET failed')
  return r.json() as Promise<{ data: SaveShape|null }>
}
async function apiLb2Put(tour:string, gender:Gender, data:SaveShape) {
  const r = await fetch('/api/lb2/snapshots', {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ tour, gender, data })
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`PUT ${r.status}: ${txt}`)
  return JSON.parse(txt)
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

export default function AdminClassifica2() {
  /* --- stato base --- */
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  const [tour, setTour] = React.useState<string>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('lb2:lastTour') || '') : ''
  )
  const [gender, setGender] = React.useState<Gender>('M')

  const [jsonText, setJsonText] = React.useState<string>(
    JSON.stringify({ players:[], tappe:[], results:{} }, null, 2)
  )
  const [rows, setRows] = React.useState<{ name:string; total:number }[]>([])
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState('')

  /* --- mount: carica tours una sola volta --- */
  React.useEffect(() => {
    let alive = true
    apiLb2ListTours()
      .then(ts => { if (alive) setAvailableTours(ts) })
      .catch(()=> { if (alive) setAvailableTours([]) })
    return () => { alive = false }
  }, [])

  /* --- persisti tour scelto (se non vuoto) --- */
  React.useEffect(() => {
    if (typeof window !== 'undefined' && tour) {
      localStorage.setItem('lb2:lastTour', tour)
    }
  }, [tour])

  /* --- calcolo preview ogni volta che cambia il testo --- */
  React.useEffect(() => {
    try {
      const s = JSON.parse(jsonText) as SaveShape
      const cfg = DEFAULT_SET
      const out = (s.players || []).map(p => {
        let total = 0
        for (const t of (s.tappe || [])) {
          const pos = s.results?.[p.id]?.[t.id]?.pos
          total += pointsOfBucket(pos, t.totalTeams, t.multiplier, cfg)
        }
        return { name: p.name, total }
      })
      out.sort((a,b)=> b.total - a.total || a.name.localeCompare(b.name,'it'))
      setRows(out)
      setErr('')
    } catch (e:any) {
      setRows([])
      setErr('JSON non valido')
    }
  }, [jsonText])

  /* --- handlers --- */
  async function loadNow() {
    if (!tour) { setErr('Scegli/scrivi un tour'); return }
    setLoading(true); setErr('')
    try {
      const { data } = await apiLb2Get(tour, gender)
      const s: SaveShape = data ?? { players:[], tappe:[], results:{} }
      setJsonText(JSON.stringify(s, null, 2))
      // se è un tour nuovo, aggiungilo alla lista locale
      setAvailableTours(ts => (tour && !ts.includes(tour)) ? [...ts, tour] : ts)
    } catch (e:any) {
      setErr(e?.message || 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }

  async function saveNow() {
    if (!tour) { setErr('Scegli/scrivi un tour'); return }
    setLoading(true); setErr('')
    try {
      const payload = JSON.parse(jsonText) as SaveShape
      await apiLb2Put(tour, gender, payload)
      setAvailableTours(ts => (tour && !ts.includes(tour)) ? [...ts, tour] : ts)
    } catch (e:any) {
      setErr(e?.message || 'Errore salvataggio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Classifica v2 (tabella: lb2_snapshots)</h1>

      {/* controlli */}
      <div className="flex gap-2 items-center">
        <span>Tour</span>

        {/* input di testo con datalist dei tour esistenti */}
        <input
          className="input input-sm w-[260px]"
          placeholder="es. Beach Cup 2025"
          value={tour}
          onChange={e=>setTour(e.target.value)}
          list="lb2-tours-list"
        />
        <datalist id="lb2-tours-list">
          {availableTours.map(t => <option key={t} value={t} />)}
        </datalist>

        <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>M</button>
        <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>F</button>

        <button className="btn btn-sm ml-auto" onClick={loadNow} disabled={loading}>Carica</button>
        <button className="btn btn-sm" onClick={saveNow} disabled={loading}>Salva</button>
      </div>

      {/* editor e preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-neutral-400 mb-1">JSON (players, tappe, results)</div>
          <textarea
            className="textarea w-full h-[420px]"
            value={jsonText}
            onChange={e=>setJsonText(e.target.value)}
            spellCheck={false}
          />
          {err && <div className="text-sm text-red-400 mt-1">{err}</div>}
        </div>
        <div>
          <div className="text-xs text-neutral-400 mb-1">Preview calcolata</div>
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr><th className="text-left py-2">Nome</th><th className="text-right py-2">Totale</th></tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.name} className="border-t border-neutral-800">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-right">{r.total}</td>
                </tr>
              ))}
              {!rows.length && <tr><td className="py-2 text-neutral-500" colSpan={2}>—</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
