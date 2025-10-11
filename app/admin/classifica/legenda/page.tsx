'use client'

import * as React from 'react'

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

/* ===== API ===== */
async function apiListTours(): Promise<string[]> {
  // usa /api/tours (ritorna {items:[{id,name}]})
  const r = await fetch('/api/tours', { cache: 'no-store' })
  const j = await r.json().catch(()=>({}))
  const items = Array.isArray(j?.items) ? j.items : []
  // Se la tua UI mostrava il nome “testuale” del tour, restituisci name;
  // se preferisci usare l'id del tour, restituisci id.
  return items.map((t:any) => t.id) // OPPURE: t.name
}

async function apiGetSettings(tour: string, gender: Gender) {
  const r = await fetch(`/api/ranking/legend-curve?tour_id=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) return { settings: DEFAULT_SET }
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}

async function apiSaveSettings(tour: string, gender: Gender, settings: ScoreCfgSet) {
  // genera rank_legend per tutte le taglie 2..64 (personalizzabile con totalsFrom/totalsTo)
  const r = await fetch('/api/ranking/legend-curve', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour_id: tour, gender, settings, totalsFrom: 2, totalsTo: 64 }),
  })
  if (!r.ok) throw new Error(await r.text())
}


export default function LegendAdminPage(){
  // tours
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  React.useEffect(()=>{ 
    let alive = true
    apiListTours()
      .then(ts => { if (alive) setAvailableTours(ts) })
      .catch(()=>{ if (alive) setAvailableTours([]) })
    return ()=>{ alive = false }
  },[])

  // stato base + persistenza
  const [tour, setTour] = React.useState<string>(() =>
    (typeof window !== 'undefined' && (localStorage.getItem('lb2:lastTour') || '')) || ''
  )
  const [gender, setGender] = React.useState<Gender>(() =>
    ((typeof window !== 'undefined' && (localStorage.getItem('lb2:lastGender') as Gender|null)) || 'M')
  )

  // default al primo tour disponibile
  React.useEffect(()=>{
    if (tour) return
    if (!availableTours.length) return
    setTour(availableTours[0])
  },[availableTours, tour])

  // persisti
  React.useEffect(()=>{ if (tour) localStorage.setItem('lb2:lastTour', tour) },[tour])
  React.useEffect(()=>{ localStorage.setItem('lb2:lastGender', gender) },[gender])

  // tappe + selezione
  const [tappe,setTappe] = React.useState<Tappa[]>([])
  const [tappaId,setTappaId] = React.useState<string>('')

  // impostazioni
  const [setCfg, setSetCfg] = React.useState<ScoreCfgSet>(DEFAULT_SET)

  // carica snapshot + settings quando cambiano tour/genere
  React.useEffect(()=>{
    let alive = true
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
    .catch(()=>{ if (alive){ setTappe([]); setTappaId(''); setSetCfg(DEFAULT_SET) }})
    return ()=>{ alive = false }
  },[tour, gender])

  const tappa = tappe.find(t=>t.id===tappaId)
  const legend = React.useMemo(()=>{
    if (!tappa) return []
    return Array.from({length:tappa.totalTeams}, (_,i)=>({
      pos: i+1, pts: pointsOfBucket(i+1, tappa.totalTeams, tappa.multiplier, setCfg)
    }))
  },[tappa,setCfg])

  return (
    <div className="p-6 space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <a className="btn btn-outline btn-sm" href="/admin/classifica2">Classifica</a>
        <span className="btn btn-primary btn-sm border-2 border-primary ring-2 ring-primary/30">Legenda punti</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-neutral-400">Tour</span>
          <select className="input input-sm max-w-xs" value={tour} onChange={e=>setTour(e.target.value)}>
            {!tour && <option value="">— seleziona —</option>}
            {(availableTours.length ? availableTours : (tour ? [tour] : []))
              .map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="ml-2 flex gap-2">
            <button className={`btn btn-sm ${gender==='M'?'btn-primary':''}`} onClick={()=>setGender('M')}>M</button>
            <button className={`btn btn-sm ${gender==='F'?'btn-primary':''}`} onClick={()=>setGender('F')}>F</button>
          </div>
        </div>
      </div>

      {/* Selettori tappa */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-28 text-sm text-neutral-400">Tappa</div>
          <select className="select select-bordered" value={tappaId} onChange={e=>setTappaId(e.target.value)}>
            {tappe.map(t=>{
              const b = pickBucket(t.totalTeams)
              const lab = b==='S'?'1–8':b==='M'?'9–16':b==='L'?'17–32':'33+'
              return (
                <option key={t.id} value={t.id}>
                  {t.title} — ×{t.multiplier.toFixed(2)} — {t.date || 'gg/mm'} (tot {t.totalTeams} • {lab})
                </option>
              )
            })}
          </select>
        </div>
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

      {/* Parametri */}
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
              try {
                await apiSaveSettings(tour, gender, setCfg)
                alert('Impostazioni salvate.')
              } catch (e:any) {
                alert('Errore salvataggio: ' + (e?.message || ''))
              }
            }}
          >Salva impostazioni</button>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        Formula: <code>punti = minLast + (base - minLast) * ((total - pos)/(total - 1))^(curvatura/100)</code>, poi × moltiplicatore.
      </div>
    </div>
  )
}
