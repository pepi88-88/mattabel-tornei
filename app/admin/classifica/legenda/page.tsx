'use client'

import * as React from 'react'

type Gender = 'M'|'F'
type Tappa = { id:string; title:string; date:string; multiplier:number; totalTeams:number }
type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }
/* ===== API helpers (Supabase routes) ===== */
async function apiListTours(): Promise<string[]> {
  const r = await fetch(`/api/leaderboard/snapshots/tours`, { cache: 'no-store' })
  if (!r.ok) return []
  const j = await r.json()
  return Array.isArray(j?.tours) ? j.tours : []
}
async function apiGetSnapshot(tour: string, gender: Gender) {
  const r = await fetch(`/api/leaderboard/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('snapshot get failed')
  return r.json() as Promise<{ data?: { players:any[]; tappe:Tappa[]; results:any }|null }>
}
async function apiGetSettings(tour: string, gender: 'M'|'F') {
  const r = await fetch(`/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('GET settings failed')
  return r.json() as Promise<{ settings: any|null }>
}

async function apiSaveSettings(tour: string, gender: 'M'|'F', settings: any) {
  const r = await fetch('/api/leaderboard/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour, gender, settings }),
  })
  if (!r.ok) throw new Error(await r.text())
}



const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 },
  M:  { base:100, minLast:10, curvePercent:100 },
  L:  { base:100, minLast:10, curvePercent:100 },
  XL: { base:100, minLast:10, curvePercent:100 },
}
function pickBucket(totalTeams:number){ if (totalTeams<=8) return 'S' as const; if (totalTeams<=16) return 'M' as const; if (totalTeams<=32) return 'L' as const; return 'XL' as const }
function pointsOfBucket(pos:number, total:number, mult:number, set:ScoreCfgSet) {
  const cfg = set[pickBucket(total)]
  if (total<=1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent/100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw*mult)
}

/* ---- helpers ---- */


/* ---- component ---- */
export default function LegendAdminPage(){
  // tours
 const [availableTours, setAvailableTours] = React.useState<string[]>([])
React.useEffect(()=>{ 
  apiListTours().then(ts => {
    const last = localStorage.getItem('semi:lastTour')
    const set = new Set(ts)
    if (last) set.add(last)
    setAvailableTours(Array.from(set))
  }).catch(()=> {
    const last = localStorage.getItem('semi:lastTour')
    setAvailableTours(last ? [last] : [])
  })
},[])

// stato base con default “neutro”
const [tour, setTour] = React.useState<string>('Tour Demo')
const [gender, setGender] = React.useState<Gender>('M')

// leggi localStorage SOLO al mount
React.useEffect(() => {
  const lastTour = typeof window !== 'undefined' ? localStorage.getItem('semi:lastTour') : null
  const lastGender = typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender | null) : null
  setTour(lastTour || (toursFromStorage()[0] || 'Tour Demo'))
  setGender(lastGender || 'M')
}, [])

// persisti su localStorage quando cambiano
React.useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem('semi:lastTour', tour)
  setAvailableTours(ts => Array.from(new Set([...ts, tour])))
}, [tour])

React.useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem('semi:lastGender', gender)
}, [gender])

// utility sicura per SSR
function toursFromStorage(): string[] {
  if (typeof window === 'undefined') return []
  const out = new Set<string>()
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i)!
    const m = k.match(/^semi:leaderboard:([^:]+):[MF]$/)
    if (m) out.add(m[1])
  }
  const last = localStorage.getItem('semi:lastTour')
  if (last) out.add(last)
  return Array.from(out)
}


  // tappe & selezione persistente per tour+genere
  const [tappe,setTappe] = React.useState<Tappa[]>([])
  const [tappaId,setTappaId] = React.useState<string>('')
// impostazioni punteggio (bucket S/M/L/XL)
const [setCfg, setSetCfg] = React.useState<ScoreCfgSet>(DEFAULT_SET)

// carica le impostazioni (UNA volta per tour/genere)
React.useEffect(()=>{
  let alive = true
  apiGetSettings(tour, gender)
    .then(({ settings })=>{
      if (!alive) return
      if (settings && typeof settings === 'object') {
        setSetCfg({
          S: settings.S || DEFAULT_SET.S,
          M: settings.M || DEFAULT_SET.M,
          L: settings.L || DEFAULT_SET.L,
          XL: settings.XL || DEFAULT_SET.XL,
        })
      } else {
        setSetCfg(DEFAULT_SET)
      }
    })
    .catch((err)=>{
      console.error('[Legenda] GET settings failed', err)
      if (!alive) return
      setSetCfg(DEFAULT_SET)
    })
  return ()=>{ alive = false }
},[tour, gender])




  React.useEffect(()=>{
    if (!tappaId) return
    localStorage.setItem(`semi:legendSel:${tour}:${gender}`, tappaId)
  },[tappaId, tour, gender])

  

 const [inputKey,setInputKey] = React.useState<string>('')
const [storedKey,setStoredKey] = React.useState<string>('')  // chiave salvata (se esiste)
const [isAdmin,setIsAdmin] = React.useState<boolean>(false)

React.useEffect(()=>{
  setStoredKey(localStorage.getItem('ADMIN_SUPER_KEY') || '')
},[]) // carica una sola volta

React.useEffect(()=>{
  setIsAdmin(!!storedKey && inputKey === storedKey)
},[inputKey, storedKey])

React.useEffect(()=>{
  let alive = true
  apiGetSnapshot(tour, gender)
    .then(({ data })=>{
      if (!alive) return
      const ts = Array.isArray(data?.tappe) ? data!.tappe : []
      setTappe(ts)
      const selKey = `semi:legendSel:${tour}:${gender}`
      const saved = (typeof window !== 'undefined') ? localStorage.getItem(selKey) : ''
      if (saved && ts.some(t=>t.id===saved)) setTappaId(saved)
      else setTappaId(ts[0]?.id || '')
    })
    .catch((err)=>{
      console.error('[Legenda] GET snapshot failed', err)
      if (!alive) return
      setTappe([]); setTappaId('')
    })
  return ()=>{ alive = false }
},[tour, gender])


  const tappa = tappe.find(t=>t.id===tappaId)
  const legend = React.useMemo(()=>{
    if (!tappa) return []
    return Array.from({length:tappa.totalTeams}, (_,i)=>{
      const pos = i+1
      return { pos, pts: pointsOfBucket(pos, tappa.totalTeams, tappa.multiplier, setCfg) }
    })
  },[tappa,setCfg])

  // Tab bar: M/F tornano alla classifica
  const TabLink: React.FC<{active?:boolean; label:string; gender?:Gender}> = ({active,label,gender:targetGender})=>{
    const cls = `btn ${active?'btn-primary border-2 border-primary ring-2 ring-primary/30':'btn-outline border-2 border-neutral-700 hover:border-neutral-500'} btn-sm`
    if (!targetGender) return <span className={`${cls} pointer-events-none`}>{label}</span>
    return (
      <a
        className={cls}
        href="/admin/classifica"
        onClick={()=>{
          if (targetGender) localStorage.setItem('semi:lastGender', targetGender)
        }}
      >{label}</a>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2">
        <TabLink active={false} label="Maschile" gender="M" />
        <TabLink active={false} label="Femminile" gender="F" />
        <TabLink active label="Legenda punti" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-neutral-400">Tour</span>
         <select
  className="
    select select-bordered select-sm max-w-xs
    bg-neutral-900 text-neutral-100 border-neutral-700
    focus:border-neutral-400
    disabled:bg-neutral-900 disabled:text-neutral-400 disabled:border-neutral-700 disabled:opacity-100
  "
  value={tour}
  onChange={(e)=>setTour(e.target.value)}
>

            {availableTours.length===0 && <option value={tour}>{tour}</option>}
            {availableTours.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={()=>{
              const name = prompt('Nuovo tour?')
              if (name && name.trim()) setTour(name.trim())
            }}
          >+ Nuovo tour</button>
        </div>
      </div>

      {/* Avviso */}
      <div className="card p-4 space-y-2">
        <div className="text-xl font-semibold">Legenda punti — impostazioni</div>
        <div className="text-sm text-yellow-400">
          ⚠️ Modificare i parametri cambia <b>tutta</b> la classifica di questo tour/categoria.  
          Evita di farlo a tour iniziato.
        </div>
      </div>

      {/* Selettori tappa */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-28 text-sm text-neutral-400">Tappa</div>
         <select
  className="
    select select-bordered
    bg-neutral-900 text-neutral-100 border-neutral-700
    focus:border-neutral-400
    disabled:bg-neutral-900 disabled:text-neutral-400 disabled:border-neutral-700 disabled:opacity-100
  "
  value={tappaId}
  onChange={e=>setTappaId(e.target.value)}
>

            {tappe.map(t => {
              const bucket = pickBucket(t.totalTeams)
              const label = bucket==='S'?'1–8':bucket==='M'?'9–16':bucket==='L'?'17–32':'33+'
              return (
                <option key={t.id} value={t.id}>
                  {t.title} — ×{t.multiplier.toFixed(2)} — {t.date||'gg/mm'} (tot {t.totalTeams} • schema {label})
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
          <div className="text-sm text-neutral-500">Nessuna tappa trovata in questo tour/categoria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead className="text-neutral-400"><tr><th className="text-left pr-4">Pos</th><th className="text-left">Punti</th></tr></thead>
              <tbody>
                {legend.map(r => <tr key={r.pos}><td className="py-1 pr-4">{r.pos}</td><td className="py-1">{r.pts}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Parametri (protetti) */}
      <div className="card p-4 space-y-3">
        <div className="font-medium">Parametri di calcolo per dimensione tabellone (protetto)</div>
        <div className="text-xs text-neutral-500">Inserisci l’<code>ADMIN_SUPER_KEY</code> per sbloccare la modifica.</div>

       <div className="flex items-end gap-3">
  <div>
    <div className="text-xs mb-1">ADMIN_SUPER_KEY</div>
    <input
      className="input"
      type="password"
      value={inputKey}
      onChange={e=>setInputKey(e.target.value)}
      placeholder={storedKey ? 'Inserisci chiave per sbloccare' : 'Imposta una chiave…'}
    />
  </div>

  {!storedKey ? (
    <button
      className="btn"
      onClick={()=>{
        const k = inputKey.trim()
        if (!k) { alert('Inserisci una chiave.'); return }
        localStorage.setItem('ADMIN_SUPER_KEY', k)
        setStoredKey(k)
        setIsAdmin(true)
        alert('Chiave impostata. Campi sbloccati.')
      }}
    >Imposta chiave</button>
  ) : (
    <div className={`text-xs ${isAdmin ? 'text-green-400' : 'text-neutral-500'}`}>
      {isAdmin ? 'Chiave valida: campi sbloccati.' : 'Inserisci la chiave per sbloccare.'}
    </div>
  )}
</div>



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
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], base: Number(e.target.value)}})}
                disabled={!isAdmin}/>
            </div>
            <div>
              <div className="text-xs mb-1">Punteggio ultimo (MIN_LAST)</div>
              <input className="input w-full" type="number"
                value={setCfg[k].minLast}
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], minLast: Number(e.target.value)}})}
                disabled={!isAdmin}/>
            </div>
            <div>
              <div className="text-xs mb-1">Curvatura %</div>
              <input className="input w-full" type="number" step="1"
                value={setCfg[k].curvePercent}
                onChange={e=>setSetCfg({...setCfg, [k]: {...setCfg[k], curvePercent: Number(e.target.value)}})}
                disabled={!isAdmin}/>
            </div>
          </div>
        ))}

        <div>
         <button
  className="btn"
  disabled={!isAdmin}
  onClick={async ()=>{
    try {
      await apiSaveSettings(tour, gender, setCfg)
      alert('Impostazioni salvate.')
    } catch (e:any) {
      console.error('[Legenda] PUT settings failed', e)
      alert('Errore salvataggio impostazioni: ' + (e?.message || ''))
    }
  }}
>
  Salva impostazioni
</button>


        </div>

        {!isAdmin && (
          <div className="text-xs text-neutral-500">
            Modifica bloccata: inserisci la chiave corretta per abilitare i campi.
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500">
        Formula: <code>punti = minLast + (base - minLast) * ((total - pos)/(total - 1))^(curvatura/100)</code>, poi × moltiplicatore.  
        Bucket usato: S(1–8) / M(9–16) / L(17–32) / XL(33+).
      </div>
    </div>
  )
}
