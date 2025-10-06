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

  const txt = await r.text()  // leggiamo SEMPRE il corpo per capire eventuali errori
  if (!r.ok) {
    console.error('PUT /api/leaderboard/snapshots failed:', r.status, txt)
    throw new Error(`snapshot put failed (${r.status}): ${txt}`)
  }

  let js: any = {}
  try { js = JSON.parse(txt) } catch {}
  // piccolo log di diagnosi
  if (!js?.ok) {
    console.warn('PUT /api/leaderboard/snapshots response without ok:true', js)
  } else {
    console.log('Snapshot salvato:', js?.saved)
  }
  return js as { ok: true, saved?: { tour:string; gender:string; updated_at:string } }
}
async function apiListTours(): Promise<string[]> {
  // 1) elenco ufficiale (tabella tours)
  try {
    const r = await fetch('/api/tours', {
      headers: { 'x-role': 'admin' },
      cache: 'no-store',
    })
    const j = await r.json().catch(() => ({} as any))
    if (r.ok && Array.isArray(j?.items)) {
      return j.items
        .map((t: any) => String(t?.name || '').trim())
        .filter(Boolean)
    }
  } catch {}

  // 2) fallback: nomi tour presenti negli snapshot
  try {
    const r2 = await fetch('/api/leaderboard/snapshots/tours', { cache: 'no-store' })
    const j2 = await r2.json().catch(() => ({} as any))
    if (r2.ok && Array.isArray(j2?.tours)) return j2.tours
  } catch {}

  return []
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
React.useEffect(() => {
  apiListTours()
    .then(ts => setAvailableTours(ts))
    .catch(() => setAvailableTours([]))
}, [])
  

 // header state (persist) — no SSR localStorage
const [tour, setTour] = React.useState<string>('')
const [gender, setGender] = React.useState<Gender>('M')
// Se dopo aver caricato i tour il valore è ancora vuoto,
// prova a ripristinare dal localStorage (ma solo se esiste davvero nella lista)
React.useEffect(() => {
  if (tour) return
  if (typeof window === 'undefined') return
  const last = (localStorage.getItem('semi:lastTour') || '').trim()
  if (last && availableTours.includes(last)) {
    setTour(last)
  }
}, [availableTours, tour])
// leggi localStorage SOLO al mount, lato client
React.useEffect(() => {
  const lastTour = typeof window !== 'undefined' ? localStorage.getItem('semi:lastTour') : null
  const lastGender = typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender | null) : null
  setTour((lastTour || '').trim())
  setGender(lastGender || 'M')
}, [])

// persisti quando cambiano (solo client)
React.useEffect(() => {
  if (typeof window === 'undefined') return
  if (!tour) return                   // ⛔ non scrivere '' in localStorage
  localStorage.setItem('semi:lastTour', tour)
  setAvailableTours(ts => {
    if (!tour) return ts              // guardia extra
    if (ts.includes(tour)) return ts
    return [...ts, tour]
  })
}, [tour])


React.useEffect(() => {
  if (typeof window === 'undefined') return
  localStorage.setItem('semi:lastGender', gender)
}, [gender])


  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)

// carica le impostazioni dei punti da Supabase quando cambiano tour/genere
React.useEffect(() => {
  let alive = true

  if (!tour) { // senza tour, default
    setScoreSet(DEFAULT_SET)
    return () => { alive = false }
  }

  apiGetSettings(tour, gender)
    .then(({ settings }) => {              // ⬅️ destruttura "settings", NON "data"
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
    if (!tour) return                 // ⛔ senza tour non chiamare API
    apiGetSettings(tour, gender)
      .then(({ settings }) => setScoreSet(settings ?? DEFAULT_SET))
      .catch(() => {})
  }
  window.addEventListener('focus', onFocus)
  return () => window.removeEventListener('focus', onFocus)
}, [tour, gender])

   // --- SNAPSHOT STATE ---
  const [players, setPlayers] = React.useState<PlayerRow[]>([])
  const [tappe, setTappe]     = React.useState<Tappa[]>([])
  const [results, setResults] = React.useState<Results>({})
  const [loaded, setLoaded]   = React.useState(false)

// 🔒 snapshot refs sempre aggiornati
const playersRef = React.useRef<PlayerRow[]>([])
const tappeRef   = React.useRef<Tappa[]>([])
const resultsRef = React.useRef<Results>({})
const editedRef  = React.useRef(false)

// ignora risposte GET “in ritardo”
const loadKeyRef = React.useRef<string>('')

// sequenziatore dei salvataggi: solo l’ultimo “vince”
const saveSeqRef = React.useRef<number>(0)

// tieni i ref allineati allo stato
React.useEffect(() => { playersRef.current = players }, [players])
React.useEffect(() => { tappeRef.current   = tappe   }, [tappe])
React.useEffect(() => { resultsRef.current = results }, [results])

// load snapshot
React.useEffect(() => {
  let alive = true
  setLoaded(false)

  if (!tour) {
    setPlayers([]); setTappe([]); setResults({})
    setLoaded(true)
    return () => { alive = false }
  }

  // Chiave unica di questo ciclo di load
  const myKey = `load|${tour}|${gender}|${Date.now()}`
  loadKeyRef.current = myKey

  apiGetSnapshot(tour, gender)
    .then(({ data }) => {
      if (!alive) return
      if (loadKeyRef.current !== myKey) return // risposta vecchia? ignora.

      const s: SaveShape = data ?? { players: [], tappe: [], results: {} }
      setPlayers(Array.isArray(s.players) ? s.players : [])
      setTappe(Array.isArray(s.tappe) ? s.tappe : [])
      setResults(s.results && typeof s.results === 'object' ? s.results : {})
      setLoaded(true)
      editedRef.current = false
    })
    .catch(() => {
      if (!alive) return
      if (loadKeyRef.current !== myKey) return
      setPlayers([]); setTappe([]); setResults({}); setLoaded(true)
      editedRef.current = false
    })

  return () => { alive = false }
}, [tour, gender])

  // saveNow per salvataggi immediati (niente hook qui dentro!)
const saveNow = React.useCallback((
  nextPlayers: PlayerRow[],
  nextTappe: Tappa[],
  nextResults: Results
) => {
  if (!tour) return
  apiUpsertSnapshot(tour, gender, {
    players: nextPlayers,
    tappe: nextTappe,
    results: nextResults
  }).catch((e:any) => {
    console.error('[saveNow] PUT failed', e)
    alert('Errore salvataggio: ' + (e?.message || ''))
  })
}, [tour, gender])

// Sequenziatore dei salvataggi: solo l’ultimo “vince”
const saveSeqRef = React.useRef(0)
// Ignora risposte GET “in ritardo”
const loadKeyRef = React.useRef<string>('')

const saveNow = React.useCallback(async (
  nextPlayers: PlayerRow[],
  nextTappe: Tappa[],
  nextResults: Results
) => {
  if (!tour) return

  // Numero progressivo di questo save
  const mySeq = ++saveSeqRef.current
  // Chiave per invalidare eventuali GET/risposte vecchie
  const myKey = `save|${tour}|${gender}|${Date.now()}`
  loadKeyRef.current = myKey

  try {
    // 1) Salva
    await apiUpsertSnapshot(tour, gender, {
      players: nextPlayers,
      tappe: nextTappe,
      results: nextResults
    })
    console.log('[saveNow] PUT ok')
  } catch (e: any) {
    console.error('[saveNow] PUT failed', e)
    alert('Errore salvataggio: ' + (e?.message || ''))
    return
  }

  // Se nel frattempo è partito un altro save, non ricaricare
  if (mySeq !== saveSeqRef.current) return

  // 2) Round-trip: rileggi SUBITO dal server (server = fonte di verità)
  try {
    const { data } = await apiGetSnapshot(tour, gender)
    if (mySeq !== saveSeqRef.current) return        // un altro save più nuovo? esci
    if (loadKeyRef.current !== myKey) return        // c’è stato un altro load/save? esci
    if (!data || typeof data !== 'object') return

    setPlayers(Array.isArray(data.players) ? data.players : [])
    setTappe(Array.isArray(data.tappe) ? data.tappe : [])
    setResults(data.results && typeof data.results === 'object' ? data.results : {})
  } catch (e) {
    console.warn('[saveNow] GET after save failed', e)
  }
}, [tour, gender])

  // players
  const addPlayer = React.useCallback((p: PlayerLite) => {
    if (!loaded) return
      editedRef.current = true
    setPlayers(prev => {
      if (prev.some(x => x.id === p.id)) return prev
      const nextPlayers = [...prev, { id: p.id, name: fullName(p) }]
      // crea la riga results se manca
      setResults(r => (r[p.id] ? r : { ...r, [p.id]: {} }))

      // 🔁 usa SEMPRE i ref aggiornati
      const nextResults = { ...resultsRef.current, [p.id]: resultsRef.current[p.id] || {} }
      saveNow(nextPlayers, tappeRef.current, nextResults)
      return nextPlayers
    })
  }, [loaded, saveNow])


   const removePlayer = React.useCallback((playerId: string) => {
    if (!loaded) return
    if (!confirm('Eliminare questo giocatore dalla classifica?')) return
       editedRef.current = true
    setPlayers(prev => {
      const nextPlayers = prev.filter(p => p.id !== playerId)
      setResults(prevR => {
        const c = { ...prevR }; delete c[playerId]
        saveNow(nextPlayers, tappeRef.current, c) // 🔁
        return c
      })
      return nextPlayers
    })
  }, [loaded, saveNow])



  // tappe (form)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDate,  setNewDate ] = React.useState('') // gg/mm
  const [newMult,  setNewMult ] = React.useState<number>(1)
  const [newTotal, setNewTotal] = React.useState<number>(8)

  const addTappa = React.useCallback(() => {
    if (!loaded) return
    if (!newTitle.trim()) { alert('Titolo tappa mancante'); return }
    if (newTotal < 1)     { alert('Totale squadre deve essere ≥ 1'); return }
  editedRef.current = true
    const t: Tappa = {
      id: uid(),
      title: newTitle.trim(),
      date: newDate.trim(),
      multiplier: Number(newMult) || 1,
      totalTeams: Number(newTotal) || 1
    }

    setTappe(prev => {
      const nextTappe = [...prev, t]
      saveNow(playersRef.current, nextTappe, resultsRef.current) // 🔁
      return nextTappe
    })

    setNewTitle(''); setNewDate(''); setNewMult(1); setNewTotal(8)
    const selKey = `semi:legendSel:${tour}:${gender}`
    if (typeof window !== 'undefined') {
      if (!localStorage.getItem(selKey)) localStorage.setItem(selKey, t.id)
    }
  }, [loaded, newTitle, newDate, newMult, newTotal, tour, gender, saveNow])


  const removeTappa = React.useCallback((tappaId: string) => {
    if (!loaded) return
    if (!confirm('Eliminare la tappa?')) return
      editedRef.current = true
    setTappe(prev => {
      const nextTappe = prev.filter(t => t.id !== tappaId)
      setResults(prevR => {
        const c: Results = {}
        for (const pid of Object.keys(prevR)) {
          const row = { ...prevR[pid] }
          delete row[tappaId]
          c[pid] = row
        }
        saveNow(playersRef.current, nextTappe, c) // 🔁
        return c
      })
      const selKey = `semi:legendSel:${tour}:${gender}`
      if (typeof window !== 'undefined') {
        if (localStorage.getItem(selKey) === tappaId) localStorage.removeItem(selKey)
      }
      return nextTappe
    })
  }, [loaded, tour, gender, saveNow])



// pos
  function setPos(playerId: string, tappaId: string, pos: number | undefined) {
    if (!loaded) return
      editedRef.current = true
    setResults(prev => {
      const row = { ...(prev[playerId] || {}) }
      row[tappaId] = { pos }
      const next = { ...prev, [playerId]: row }
      saveNow(playersRef.current, tappeRef.current, next) // 🔁
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
  className="input input-sm w-[220px]"
  value={tour}
  onChange={(e) => setTour(e.target.value.trim())}
>
  {(!availableTours.length || !tour) && (
    <option value="" disabled>Seleziona un tour…</option>
  )}
  {availableTours.map((t) => (
    <option key={t} value={t}>{t}</option>
  ))}
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
            <div className={`w-64 ${!loaded ? 'opacity-60 pointer-events-none' : ''}`}>
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
              <button className="btn w-full" onClick={addTappa} disabled={!loaded}>Aggiungi tappa</button>
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
          disabled={!loaded} 
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
