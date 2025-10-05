'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'

// se l'alias @ funziona:
import AdminGate from '../../../components/AdminGate'
// se NON funziona l'alias, usa la riga sotto e cancella quella sopra:
// import AdminGate from '../../../components/AdminGate'

const PlayerPicker = dynamic(() => import('@/components/PlayerPicker'), { ssr: false })
/* ===== API helpers (Supabase routes) ===== */

async function apiGetSettings(tour: string, gender: 'M'|'F') {
  const r = await fetch(`/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('GET settings failed')
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}

async function apiGetSnapshot(tour: string, gender: Gender) {
  const r = await fetch(`/api/leaderboard/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('snapshot get failed')
  return r.json() as Promise<{ data: SaveShape | null }>
}

async function apiUpsertSnapshot(tour: string, gender: Gender, data: SaveShape) {
  const r = await fetch(`/api/leaderboard/snapshots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour, gender, data }),
  })
  if (!r.ok) throw new Error('snapshot put failed')
  return r.json() as Promise<{ ok: true }>
}

async function apiListTours(): Promise<string[]> {
  // 1) Elenco ufficiale dai TOUR (tabella `tours`)
  try {
    const r = await fetch('/api/tours', {
      headers: { 'x-role': 'admin' },
      cache: 'no-store',
    })
    const j = await r.json().catch(() => ({} as any))
    if (r.ok && Array.isArray(j?.items)) {
      // la tendina di Classifica usa il NOME del tour
      return j.items
        .map((t: any) => String(t?.name || '').trim())
        .filter(Boolean)
    }
  } catch {}

  // 2) Fallback: vecchio elenco dai snapshots (se per qualche motivo /api/tours fallisce)
  try {
    const r2 = await fetch(`/api/leaderboard/snapshots/tours`, { cache: 'no-store' })
    const j2 = await r2.json().catch(() => ({} as any))
    if (r2.ok && Array.isArray(j2?.tours)) return j2.tours
  } catch {}

  return []
}


async function apiRenameTour(oldName: string, newName: string) {
  const r = await fetch('/api/leaderboard/tours/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldName, newName }),
  })
  if (!r.ok) throw new Error(await r.text())
}

async function apiDeleteTour(tour: string) {
  const r = await fetch('/api/leaderboard/tours/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour }),
  })
  if (!r.ok) throw new Error(await r.text())
}


/* ================== Tipi ================== */
type Gender = 'M'|'F'
type PlayerLite = { id: string; first_name: string; last_name: string }
type PlayerRow  = { id: string; name: string }
type Tappa      = { id: string; title: string; date: string; multiplier: number; totalTeams: number }
type Results    = Record<string /*playerId*/, Record<string /*tappaId*/, { pos?: number }>>
type SaveShape  = { players: PlayerRow[]; tappe: Tappa[]; results: Results }

type ScoreCfg     = { base: number; minLast: number; curvePercent: number }
type ScoreCfgSet  = { S: ScoreCfg; M: ScoreCfg; L: ScoreCfg; XL: ScoreCfg }

/* ================== Utils ================== */
const uid = () => Math.random().toString(36).slice(2, 9)

function fullName(p: { first_name?: string; last_name?: string }) {
  return `${p?.last_name ?? ''} ${p?.first_name ?? ''}`.trim()
}

/* ------- storage ------- */


/* ------- punteggi (multi-bucket) ------- */
const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 }, // 1–8
  M:  { base:100, minLast:10, curvePercent:100 }, // 9–16
  L:  { base:100, minLast:10, curvePercent:100 }, // 17–32
  XL: { base:100, minLast:10, curvePercent:100 }, // 33+
}

function pickBucket(totalTeams:number): keyof ScoreCfgSet {
  if (totalTeams <= 8)  return 'S'
  if (totalTeams <= 16) return 'M'
  if (totalTeams <= 32) return 'L'
  return 'XL'
}



/** calcolo con curvatura; sceglie il bucket in base al numero di squadre */
function pointsOfBucket(pos: number | undefined, total: number, mult: number, set:ScoreCfgSet) {
  if (!pos || pos < 1 || total < 1) return 0
  const cfg = set[pickBucket(total)]
  if (total === 1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent / 100)
  const t = (total - pos) / (total - 1) // 1→0
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

/* ================== UI helpers ================== */
type TabButtonProps = {
  active?: boolean
  onClick?: () => void
  href?: string
  title?: string
  children?: React.ReactNode
}

function TabButton({ active, onClick, href, children, title }: TabButtonProps) {
  const cls = [
    'btn','btn-sm','transition-all',
    active
      ? 'btn-primary border-2 border-primary ring-2 ring-primary/30'
      : 'btn-outline border-2 border-neutral-700 hover:border-neutral-500'
  ].join(' ')

  if (href) {
    return (
      <a className={cls} href={href} title={title} aria-current={active ? 'page' : undefined}>
        {children}
      </a>
    )
  }

  return (
    <button className={cls} onClick={onClick} title={title} aria-pressed={!!active}>
      {children}
    </button>
  )
}
/* ================== Pagina ================== */
export default function SemiManualLeaderboardPage() {
  // tours per tendina
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
React.useEffect(()=>{ 
  apiListTours().then(ts => {
    const last = localStorage.getItem('semi:lastTour')
    const set = new Set(ts)
    if (last) set.add(last)
    setAvailableTours(Array.from(set))
  }).catch(()=> {
    // fallback: solo lastTour
    const last = localStorage.getItem('semi:lastTour')
    setAvailableTours(last ? [last] : [])
  })
},[])

 // header state (persist) — no SSR localStorage
const [tour, setTour] = React.useState<string>('Tour Demo')
const [gender, setGender] = React.useState<Gender>('M')

// leggi localStorage SOLO al mount, lato client
React.useEffect(() => {
  const lastTour = typeof window !== 'undefined' ? localStorage.getItem('semi:lastTour') : null
  const lastGender = typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender | null) : null
  setTour(lastTour || 'Tour Demo')
  setGender(lastGender || 'M')
}, [])

// persisti quando cambiano (solo client)
React.useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem('semi:lastTour', tour)
  setAvailableTours(ts => Array.from(new Set([...ts, tour])))
}, [tour])

React.useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem('semi:lastGender', gender)
}, [gender])


  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)

// carica le impostazioni dei punti da Supabase quando cambiano tour/genere
React.useEffect(()=> {
  let alive = true
  apiGetSettings(tour, gender)
    .then(({ settings }) => {
      if (!alive) return
      setScoreSet(settings ?? DEFAULT_SET)
    })
    .catch(() => {
      if (!alive) return
      setScoreSet(DEFAULT_SET)
    })
  return () => { alive = false }
}, [tour, gender])

// opzionale: se torni su questa tab o fai switch, ricarica le settings
React.useEffect(() => {
  if (typeof window === 'undefined') return
  const onFocus = () => {
    apiGetSettings(tour, gender)
      .then(({ settings }) => setScoreSet(settings ?? DEFAULT_SET))
      .catch(() => {})
  }
  window.addEventListener('focus', onFocus)
  return () => window.removeEventListener('focus', onFocus)
}, [tour, gender])


  // dati + flag loaded (per evitare autosave prima del load)
  const [players, setPlayers] = React.useState<PlayerRow[]>([])
  const [tappe, setTappe]     = React.useState<Tappa[]>([])
  const [results, setResults] = React.useState<Results>({})
  const [loaded, setLoaded]   = React.useState(false)

  // load
React.useEffect(()=>{
  let alive = true
  setLoaded(false)
  apiGetSnapshot(tour, gender)
    .then(({data})=>{
      const s: SaveShape = data ?? { players: [], tappe: [], results: {} }
      if (!alive) return
      setPlayers(Array.isArray(s.players) ? s.players : [])
      setTappe(Array.isArray(s.tappe) ? s.tappe : [])
      setResults(s.results && typeof s.results === 'object' ? s.results : {})
      setLoaded(true)
    })
    .catch(()=>{
      if (!alive) return
      setPlayers([]); setTappe([]); setResults({}); setLoaded(true)
    })
  return ()=>{ alive = false }
},[tour, gender])



  // autosave SOLO dopo il primo load
React.useEffect(() => {
  if (!loaded) return
  // 🚫 non salvare uno snapshot completamente vuoto (evita di cancellare il precedente)
  const isEmpty =
    players.length === 0 &&
    tappe.length === 0 &&
    Object.keys(results || {}).length === 0

  if (isEmpty) return

  const t = setTimeout(() => {
    apiUpsertSnapshot(tour, gender, { players, tappe, results })
      .catch((e:any) => {
        console.error('[autosave] snapshot put failed', e)
      })
  }, 300)

  return () => clearTimeout(t)
}, [tour, gender, players, tappe, results, loaded])



  // saveNow per salvataggi immediati
const saveNow = React.useCallback((nextPlayers:PlayerRow[], nextTappe:Tappa[], nextResults:Results)=>{
  apiUpsertSnapshot(tour, gender, { players: nextPlayers, tappe: nextTappe, results: nextResults })
    .catch((e:any)=>{
      alert('Errore salvataggio: ' + (e?.message || ''));
      console.error('[saveNow] snapshot put failed', e);
    })
},[tour, gender])

  // players
  const addPlayer = React.useCallback((p: PlayerLite) => {
    setPlayers(prev => {
      if (prev.some(x => x.id === p.id)) return prev
      const next = [...prev, { id: p.id, name: fullName(p) }]
      setResults(r => (r[p.id] ? r : { ...r, [p.id]: {} }))
      saveNow(next, tappe, { ...results, [p.id]: results[p.id] || {} })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[results, tappe, saveNow])

  const removePlayer = React.useCallback((playerId: string) => {
    if (!confirm('Eliminare questo giocatore dalla classifica?')) return
    setPlayers(prev => {
      const nextPlayers = prev.filter(p => p.id !== playerId)
      setResults(prevR => {
        const c = { ...prevR }; delete c[playerId]
        saveNow(nextPlayers, tappe, c)
        return c
      })
      return nextPlayers
    })
  },[tappe, saveNow])


  // tappe (form)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDate,  setNewDate ] = React.useState('') // gg/mm
  const [newMult,  setNewMult ] = React.useState<number>(1)
  const [newTotal, setNewTotal] = React.useState<number>(8)

  const addTappa = React.useCallback(()=>{
    if (!newTitle.trim()) { alert('Titolo tappa mancante'); return }
    if (newTotal < 1)     { alert('Totale squadre deve essere ≥ 1'); return }
    const t: Tappa = {
      id: uid(),
      title: newTitle.trim(),
      date: newDate.trim(),
      multiplier: Number(newMult)||1,
      totalTeams: Number(newTotal)||1
    }

    setTappe(prev => {
  const nextTappe = [...prev, t]
  // salva subito lo snapshot, così anche se fai F5 non perdi la modifica
  saveNow(players, nextTappe, results)
  return nextTappe
})

    setNewTitle(''); setNewDate(''); setNewMult(1); setNewTotal(8)

   const selKey = `semi:legendSel:${tour}:${gender}`
if (typeof window !== 'undefined') {
  if (!localStorage.getItem(selKey)) localStorage.setItem(selKey, t.id)
}

  },[newTitle,newDate,newMult,newTotal,players,results,tour,gender])

const removeTappa = React.useCallback((tappaId: string) => {
  if (!confirm('Eliminare la tappa?')) return
  setTappe(prev => {
    const nextTappe = prev.filter(t => t.id !== tappaId)

    // ripulisci i risultati di quella tappa
    setResults(prevR => {
      const c: Results = {}
      for (const pid of Object.keys(prevR)) {
        const row = { ...prevR[pid] }
        delete row[tappaId]
        c[pid] = row
      }
      saveNow(players, nextTappe, c)
      return c
    })

    // selezione persistita
    const selKey = `semi:legendSel:${tour}:${gender}`
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(selKey) === tappaId) localStorage.removeItem(selKey)
    }

    return nextTappe   // 👈 mancava
  })
}, [players, tour, gender, saveNow])


  // pos
   // pos
  function setPos(playerId: string, tappaId: string, pos: number | undefined) {
    setResults(prev => {
      const row = { ...(prev[playerId] || {}) }
      row[tappaId] = { pos }
      const next = { ...prev, [playerId]: row }
      // ⬇️ salva SUBITO lo snapshot quando cambi una posizione
      saveNow(players, tappe, next)
      return next
    })
  }


  // computed
  const computed = React.useMemo(()=>{
    const rows = players.map(p=>{
      let total=0, bestPos=Infinity
      for (const t of tappe){
        const pos = results[p.id]?.[t.id]?.pos
        const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
        total += pts
        if (pos && pos < bestPos) bestPos = pos
      }
      return { player:p, total, bestPos }
    })
    rows.sort((a,b)=> (b.total - a.total) || ((a.bestPos===b.bestPos?0:(a.bestPos - b.bestPos))) || a.player.name.localeCompare(b.player.name,'it'))
    return rows
  },[players,tappe,results,scoreSet])

  const classForRow = (rank:number)=> rank===1 ? 'bg-yellow-900/20'
                        : (rank>=2 && rank<=8 ? 'bg-green-900/10' : '')



  /* ============ RENDER ============ */
  return (
    <AdminGate>
      <div className="p-6 space-y-6">

        {/* Tab bar */}
        <div className="flex items-center gap-2">
          <TabButton active={gender==='M'} onClick={()=>setGender('M')} title="Mostra classifica Maschile">Maschile</TabButton>
          <TabButton active={gender==='F'} onClick={()=>setGender('F')} title="Mostra classifica Femminile">Femminile</TabButton>
          <TabButton href="/admin/classifica/legenda" title="Apri pagina Legenda punti">Legenda punti</TabButton>

          {/* Tour + azioni */}
          <div className="ml-auto flex items-center gap-2">
           <span className="text-sm text-neutral-300 mr-2">Tour</span>

<select
  className="input input-sm w-[220px]"   // usa il nostro stile scuro
  value={tour}
  onChange={(e)=>setTour(e.target.value)}
>

              {availableTours.length===0 && <option value={tour}>{tour}</option>}
              {availableTours.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* La rinomina/elimina si fanno da /admin/tour — qui solo scelta */}
<a href="/admin/tour" className="btn btn-ghost btn-sm" title="Gestione tour">
  Gestisci tour
</a>

{/* Se in futuro vorrai riattivarli, rimangono qui pronti:
{false && (
  <>
    <button className="btn btn-ghost btn-sm" onClick={/* rename handler *!/}>Rinomina</button>
    <button className="btn btn-outline btn-sm border-red-700 text-red-400 hover:border-red-500" onClick={/* delete handler *!/}>Elimina</button>
  </>
)}
*/}


          </div>
        </div>

        {/* Tools: aggiungi giocatore & tappa */}
        <div className="card p-4 space-y-4">
          <div className="flex items-end gap-3">
            <div className="w-64">
              <div className="text-xs mb-1">Aggiungi giocatore</div>
              <PlayerPicker onSelect={(p:any)=>addPlayer(p)} />
            </div>
            <div className="text-xs text-neutral-500">I giocatori aggiunti compaiono nella tabella sotto.</div>
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
{/* Etichetta tour attivo (centrata, dimensione regolabile) */}
<div className="text-center font-semibold text-neutral-200">
  <div className="inline-flex items-center gap-2
                  text-3xl /* <— CAMBIA QUI: text-xl | text-2xl | text-3xl | text-4xl */
  ">
    <span>Tour:</span>
    <span className="font-bold">{tour}</span>
    <span className="ml-2 align-middle px-2 py-0.5 rounded bg-neutral-800 text-neutral-100
                    text-xs /* <— se vuoi più grande: text-sm | text-base */
    ">
      {gender === 'M' ? 'Maschile' : 'Femminile'}
    </span>
  </div>
</div>



        {/* Tabella classifica */}
        <div className="card p-4 overflow-x-auto">
          {players.length===0 ? (
            <div className="text-sm text-neutral-500">Aggiungi almeno un giocatore.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="text-center py-2 pr-4 w-[400px]">Nome</th>
                  <th className="text-left py-2 pr-4 w-[120px]">Totale</th>
                 {tappe.map((t, i)=>(
 <th
  key={t.id}
  className="text-left py-2 pr-2 border-l border-neutral-800 pl-3"
>
  <div className="font-medium">{t.title}</div>
  <div className="text-xs">× {t.multiplier.toFixed(2)} — {t.date || 'gg/mm'}</div>
  <div className="text-xs text-neutral-500">tot: {t.totalTeams}</div>
  <button className="btn btn-ghost btn-xs mt-1" onClick={()=>removeTappa(t.id)}>Elimina colonna</button>
</th>

))}

                  <th className="text-center py-2 pl-2 w-[48px]">Azione</th>
                </tr>

                {tappe.length>0 && (
                  <tr className="text-neutral-400">
                    <th />
                    <th />
                    {tappe.map((t, i)=>(
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
                {computed.map((row, idx)=>{
                  const rank = idx+1
                  return (
                    <tr key={row.player.id} className={`border-t border-neutral-800 ${classForRow(rank)}`}>
                      {/* NOME */}
                      <td className="py-2 pr-4 text-center">
                        <div className={`font-medium ${rank===1?'text-yellow-300':''}`}>
                          {row.player.name}{rank===1?' 👑':''}
                        </div>
                      </td>

                      {/* TOTALE */}
                      <td className="py-2 pr-4 font-semibold">{row.total}</td>

                      {/* TAPPE */}
                      {tappe.map((t, i)=>{
  const pos = results[row.player.id]?.[t.id]?.pos
  const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
  return (
    <td
      key={t.id}
      className="py-2 pr-2 border-l border-neutral-800 pl-3"
    >
      <div className="grid grid-cols-2 items-center w-32">
        <input
          className="input input-sm w-16"
          type="number"
          min={1}
          max={t.totalTeams}
          value={pos ?? ''}
          onChange={(e)=>{
            const v = e.target.value === '' ? undefined : Math.max(1, Math.min(t.totalTeams, Number(e.target.value)))
            setPos(row.player.id, t.id, v)
          }}
          placeholder="—"
          title="Posizione finale"
        />
        <div className="w-16 tabular-nums text-right">{pts}</div>
      </div>
    </td>
  )
})}


                      {/* AZIONE */}
                      <td className="py-2 pl-2 align-middle text-center">
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          onClick={()=>removePlayer(row.player.id)}
                          title="Rimuovi"
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-xs text-neutral-500">
          Imposta i parametri di punteggio in <a className="link link-primary" href="/admin/classifica/legenda">/admin/classifica/legenda</a>.
        </div>
      </div>
    </AdminGate>
  )
}
