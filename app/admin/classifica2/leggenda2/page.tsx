'use client'

import * as React from 'react'

/* ================== Tipi ================== */
type Gender = 'M'|'F'
type Tappa = { id:string; title:string; date:string; multiplier:number; totalTeams:number }
type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }

const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 },
  M:  { base:100, minLast:10, curvePercent:100 },
  L:  { base:100, minLast:10, curvePercent:100 },
  XL: { base:100, minLast:10, curvePercent:100 },
}

const pickBucket = (n:number): keyof ScoreCfgSet => n<=8?'S':n<=16?'M':n<=32?'L':'XL'
const pointsOfBucket = (pos:number, total:number, mult:number, set:ScoreCfgSet) => {
  const cfg = set[pickBucket(total)]
  if (total<=1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent/100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw*mult)
}

/* ================== TOURS IN LOCALE ================== */
const TOURS_KEY = 'lb2:tours'
function loadLocalTours(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TOURS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(Boolean) : []
  } catch { return [] }
}
function saveLocalTours(tours: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOURS_KEY, JSON.stringify([...new Set(tours)].filter(Boolean)))
}

/* ================== API (snapshot + settings) ================== */
// Prendiamo tappe dallo snapshot del tour selezionato (stessa logica delle altre pagine)
async function apiGetSnapshot(tour: string, gender: Gender) {
  const r = await fetch(
    `/api/lb2/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!r.ok) throw new Error('snapshot get failed')
  return r.json() as Promise<{ data?: { tappe:Tappa[] }|null }>
}
async function apiGetSettings(tour: string, gender: Gender) {
  const r = await fetch(
    `/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!r.ok) return { settings: DEFAULT_SET }
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}
async function apiSaveSettings(tour: string, gender: Gender, settings: ScoreCfgSet) {
  const r = await fetch('/api/leaderboard/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour, gender, settings }),
  })
  if (!r.ok) throw new Error(await r.text())
}

/* ================== Pagina ================== */
export default function LegendV2Page(){
  /* Tours (locale) */
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  React.useEffect(()=>{
    setAvailableTours(loadLocalTours())
  },[])

  /* Stato base + persistenza */
  const [tour, setTour] = React.useState<string>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('lb2:lastTour') || '')) || ''
  )
  const [gender, setGender] = React.useState<Gender>(() =>
    ((typeof window !== 'undefined' && (localStorage.getItem('lb2:lastGender') as Gender|null)) || 'M')
  )

  // Seleziona automaticamente il primo tour appena disponibile, se non c'è selezione
  React.useEffect(()=>{
    if (tour) return
    if (!availableTours.length) return
    setTour(availableTours[0])
  },[availableTours, tour])

  // Persisti
  React.useEffect(()=>{ if (tour) localStorage.setItem('lb2:lastTour', tour) },[tour])
  React.useEffect(()=>{ localStorage.setItem('lb2:lastGender', gender) },[gender])

  /* Tappe + selezione tappa */
  const [tappe,setTappe] = React.useState<Tappa[]>([])
  const [tappaId,setTappaId] = React.useState<string>('')

  /* Impostazioni calcolo */
  const [setCfg, setSetCfg] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState('')

  // Carica snapshot + settings quando cambiano tour/genere (e al mount)
  React.useEffect(()=>{
    if (!tour) { setTappe([]); setTappaId(''); setSetCfg(DEFAULT_SET); return }
    let alive = true
    setLoading(true); setErr('')
    Promise.all([
      apiGetSnapshot(tour, gender),
      apiGetSettings(tour, gender),
    ])
    .then(([snap, setts])=>{
      if (!alive) return
      const ts = Array.isArray(snap?.data?.tappe) ? snap!.data!.tappe : []
      setTappe(ts)
      setSetCfg(setts?.settings ?? DEFAULT_SET)
      setTappaId(prev => (prev && ts.some(t=>t.id===prev)) ? prev : (ts[0]?.id || ''))
    })
    .catch((e:any)=>{
      if (!alive) return
      setErr(e?.message || 'Errore caricamento')
      setTappe([]); setTappaId(''); setSetCfg(DEFAULT_SET)
    })
    .finally(()=>{ if (alive) setLoading(false) })
    return ()=>{ alive = false }
  },[tour, gender])

  const tappa = tappe.find(t=>t.id===tappaId)
  const legend = React.useMemo(()=>{
    if (!tappa) return []
    return Array.from({length:tappa.totalTeams}, (_,i)=>({
      pos: i+1, pts: pointsOfBucket(i+1, tappa.totalTeams, tappa.multiplier, setCfg)
    }))
  },[tappa,setCfg])

  /* ====== Handlers Tours (locale) ====== */
  function handleCreateTour() {
    const name = prompt('Nome nuovo tour?')?.trim()
    if (!name) return
    const next = [...new Set([...availableTours, name])]
    saveLocalTours(next)
    setAvailableTours(next)
    setTour(name)
  }
  function handleEditTour() {
    if (!tour) return
    const name = prompt('Rinomina tour', tour)?.trim()
    if (!name || name === tour) return
    const next = availableTours.map(t => (t === tour ? name : t))
    saveLocalTours(next)
    setAvailableTours(next)
    setTour(name)
  }
  function handleDeleteTour() {
    if (!tour) return
    if (!confirm(`Eliminare il tour "${tour}"?`)) return
    const next = availableTours.filter(t => t !== tour)
    saveLocalTours(next)
    setAvailableTours(next)
    setTour(next[0] || '')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <a className="btn btn-outline btn-sm" href="/admin/classifica2">Classifica v2</a>
        <span className="btn btn-primary btn-sm border-2 border-primary ring-2 ring-primary/30">Legenda v2</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-neutral-400">Tour</span>

          <select
            className="input input-sm max-w-xs"
            value={tour}
            onChange={e=>setTour(e.target.value)}
            disabled={!availableTours.length}
          >
            {availableTours.length === 0
              ? <option value="">-</option>
              : availableTours.map(t => <option key={t} value={t}>{t}</option>)
            }
          </select>

          <div className="flex gap-1">
            <button className="btn btn-sm" onClick={handleCreateTour}>Crea</button>
            <button className="btn btn-sm" onClick={handleEditTour} disabled={!tour}>Modifica</button>
            <button className="btn btn-sm" onClick={handleDeleteTour} disabled={!tour}>Elimina</button>
          </div>

          <div className="ml-2 flex gap-2">
            <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')} disabled={!tour}>M</button>
            <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')} disabled={!tour}>F</button>
          </div>
        </div>
      </div>

      {/* Avviso se nessun tour */}
      {!tour && (
        <div className="text-sm text-amber-400">
          Nessun tour selezionato: crea un tour per poter inserire dati.
        </div>
      )}

      {/* Selettori tappa */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-28 text-sm text-neutral-400">Tappa</div>
          <select
            className="select select-bordered"
            value={tappaId}
            onChange={e=>setTappaId(e.target.value)}
            disabled={!tour || !tappe.length}
          >
            {tappe.map(t=>{
              const b = pickBucket(t.totalTeams)
              const lab = b==='S'?'1–8':b==='M'?'9–16':b==='L'?'17–32':'33+'
              return (
                <option key={t.id} value={t.id}>
                  {t.title} — ×{t.multiplier.toFixed(2)} — {t.date || 'gg/mm'} (tot {t.totalTeams} • {lab})
                </option>
              )
            })}
            {!tappe.length && <option value="">—</option>}
          </select>
        </div>
        {loading && <div className="text-xs text-neutral-500">Carico…</div>}
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>

      {/* Legenda calcolata */}
      <div className="card p-4">
        <div className="font-medium mb-2">Legenda calcolata</div>
        {!tappa ? (
          <div className="text-sm text-neutral-500">Nessuna tappa trovata.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="text-neutral-400">
                <tr><th className="text-left pr-4">Pos</th><th className="text-left">Punti</th></tr>
              </thead>
              <tbody>
                {legend.map(r => (
                  <tr key={r.pos}><td className="py-1 pr-4">{r.pos}</td><td className="py-1">{r.pts}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Parametri (S/M/L/XL) */}
      <div className="card p-4 space-y-3">
        <div className="font-medium">Parametri di calcolo (S/M/L/XL)</div>

        {(['S','M','L','XL'] as (keyof ScoreCfgSet)[]).map(k=>(
          <div key={k} className="grid grid-cols-4 gap-3 items-end border-t border-neutral-800 pt-3 mt-3">
            <div className="font-medium">
              {k==='S' ? '1–8 squadre'
               : k==='M' ? '9–16 squadre'
               : k==='L' ? '17–32 squadre'
               : '33+ squadre'}
            </div>
            <div>
              <div className="text-xs mb-1">Punteggio 1° (BASE)</div>
              <input className="input w-full" type="number"
                value={setCfg[k].base}
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], base: Number(e.target.value)}})} />
            </div>
            <div>
              <div className="text-xs mb-1">Punteggio ultimo (MIN_LAST)</div>
              <input className="input w-full" type="number"
                value={setCfg[k].minLast}
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], minLast: Number(e.target.value)}})} />
            </div>
            <div>
              <div className="text-xs mb-1">Curvatura %</div>
              <input className="input w-full" type="number" step="1"
                value={setCfg[k].curvePercent}
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], curvePercent: Number(e.target.value)}})} />
            </div>
          </div>
        ))}

        <div>
          <button
            className="btn"
            onClick={async ()=>{
              if (!tour) return
              try {
                await apiSaveSettings(tour, gender, setCfg)
                alert('Impostazioni salvate.')
              } catch (e:any) {
                alert('Errore salvataggio: ' + (e?.message || ''))
              }
            }}
            disabled={!tour}
          >Salva impostazioni</button>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        Formula: <code>punti = minLast + (base - minLast) * ((total - pos)/(total - 1))^(curvatura/100)</code>, poi × moltiplicatore.
      </div>
    </div>
  )
}
