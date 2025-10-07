'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'

// se l'alias @ funziona:
import AdminGate from '../../../components/AdminGate'
// se NON funziona l'alias, usa la riga sotto e cancella quella sopra:
// import AdminGate from '../../../components/AdminGate'

const PlayerPicker = dynamic(() => import('@/components/PlayerPicker'), { ssr: false })

/* ===== Tipi ===== */
type Gender = 'M'|'F'
type PlayerLite = { id: string; first_name: string; last_name: string }
type PlayerRow  = { id: string; name: string }
type Tappa      = { id: string; title: string; date: string; multiplier: number; totalTeams: number }
type Results    = Record<string /*playerId*/, Record<string /*tappaId*/, { pos?: number }>>
type SaveShape  = { players: PlayerRow[]; tappe: Tappa[]; results: Results }

type ScoreCfg     = { base: number; minLast: number; curvePercent: number }
type ScoreCfgSet  = { S: ScoreCfg; M: ScoreCfg; L: ScoreCfg; XL: ScoreCfg }

/* ===== Utils ===== */
const uid = () => Math.random().toString(36).slice(2, 9)
const fullName = (p: { first_name?: string; last_name?: string }) =>
  `${p?.last_name ?? ''} ${p?.first_name ?? ''}`.trim()

/* ===== Punteggi ===== */
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
function pointsOfBucket(pos: number | undefined, total: number, mult: number, set:ScoreCfgSet) {
  if (!pos || pos < 1 || total < 1) return 0
  const cfg = set[pickBucket(total)]
  if (total === 1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent / 100)
  const t = (total - pos) / (total - 1) // 1→0
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

/* ===== API helpers (tutte no-store + cache-buster ts) ===== */
async function apiGetSettings(tour: string, gender: 'M'|'F') {
  const r = await fetch(`/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('GET settings failed')
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}
async function apiGetSnapshot(tour: string, gender: Gender) {
  const r = await fetch(`/api/leaderboard/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('snapshot get failed')
  return r.json() as Promise<{ data: SaveShape | null }>
}
async function apiUpsertSnapshot(tour: string, gender: Gender, data: SaveShape) {
  const r = await fetch(`/api/leaderboard/snapshots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour, gender, data }),
  })
  const txt = await r.text()
  if (!r.ok) {
    console.error('PUT /api/leaderboard/snapshots failed:', r.status, txt)
    throw new Error(`snapshot put failed (${r.status}): ${txt}`)
  }
  let js: any = {}
  try { js = JSON.parse(txt) } catch {}
  if (!js?.ok) console.warn('PUT /api/leaderboard/snapshots response without ok:true', js)
  return js as { ok: true, saved?: { tour:string; gender:string; updated_at:string } }
}
async function apiListTours(): Promise<string[]> {
  // 1) elenco ufficiale (tabella tours)
  try {
    const r = await fetch('/api/tours', { headers: { 'x-role': 'admin' }, cache: 'no-store' })
    const j = await r.json().catch(() => ({} as any))
    if (r.ok && Array.isArray(j?.items)) {
      return j.items.map((t: any) => String(t?.name || '').trim()).filter(Boolean)
    }
  } catch {}
  // 2) fallback: nomi tour presenti negli snapshot
  try {
    const r2 = await fetch('/api/leaderboard/snapshots/tours?ts=' + Date.now(), { cache: 'no-store' })
    const j2 = await r2.json().catch(() => ({} as any))
    if (r2.ok && Array.isArray(j2?.tours)) return j2.tours
  } catch {}
  return []
}

/* ===== UI helpers ===== */
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
    return <a className={cls} href={href} title={title} aria-current={active ? 'page' : undefined}>{children}</a>
  }
  return <button className={cls} onClick={onClick} title={title} aria-pressed={!!active}>{children}</button>
}

/* ===== Pagina ===== */
export default function SemiManualLeaderboardPage() {
  /* Tours */
  const [availableTours, setAvailableTours] = React.useState<string[]>([])
  React.useEffect(() => {
    apiListTours().then(setAvailableTours).catch(()=>setAvailableTours([]))
  }, [])

  /* Header (persist) */
  const [tour, setTour] = React.useState<string>('')
  const [gender, setGender] = React.useState<Gender>('M')

  // ripristina dal localStorage
  React.useEffect(() => {
    const lastTour = typeof window !== 'undefined' ? localStorage.getItem('semi:lastTour') : null
    const lastGender = typeof window !== 'undefined' ? (localStorage.getItem('semi:lastGender') as Gender | null) : null
    setTour((lastTour || '').trim())
    setGender(lastGender || 'M')
  }, [])
  // persisti cambi
  React.useEffect(() => {
    if (!tour) return
    if (typeof window !== 'undefined') localStorage.setItem('semi:lastTour', tour)
    setAvailableTours(ts => (tour && !ts.includes(tour)) ? [...ts, tour] : ts)
  }, [tour])
  React.useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('semi:lastGender', gender)
  }, [gender])

  /* Settings punti */
  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  React.useEffect(() => {
    let alive = true
    if (!tour) { setScoreSet(DEFAULT_SET); return }
    apiGetSettings(tour, gender)
      .then(({ settings }) => { if (alive) setScoreSet(settings ?? DEFAULT_SET) })
      .catch(() => { if (alive) setScoreSet(DEFAULT_SET) })
    return () => { alive = false }
  }, [tour, gender])

  /* Snapshot (stato locale = bozza) */
  const [players, setPlayers] = React.useState<PlayerRow[]>([])
  const [tappe, setTappe] = React.useState<Tappa[]>([])
  const [results, setResults] = React.useState<Results>({})
  const [loaded, setLoaded] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [errorText, setErrorText] = React.useState('')

  const loadSnapshot = React.useCallback(async () => {
    if (!tour) {
      setPlayers([]); setTappe([]); setResults({})
      setLoaded(true); setDirty(false)
      return
    }
    setLoaded(false); setErrorText('')
    try {
      const { data } = await apiGetSnapshot(tour, gender)
      const s: SaveShape = data ?? { players: [], tappe: [], results: {} }
      setPlayers(Array.isArray(s.players) ? s.players : [])
      setTappe(Array.isArray(s.tappe) ? s.tappe : [])
      setResults(s.results && typeof s.results === 'object' ? s.results : {})
      setDirty(false)
    } catch (e:any) {
      console.error('[loadSnapshot] failed', e)
      setErrorText(e?.message || 'Errore caricamento dati')
      setPlayers([]); setTappe([]); setResults({})
      setDirty(false)
    } finally {
      setLoaded(true)
    }
  }, [tour, gender])

  React.useEffect(() => { loadSnapshot() }, [loadSnapshot])

  /* Azioni locali (bozza) */
  const addPlayer = React.useCallback((p: PlayerLite) => {
    if (!loaded) return
    setPlayers(prev => {
      if (prev.some(x => x.id === p.id)) return prev
      setDirty(true)
      // assicura riga results
      setResults(r => r[p.id] ? r : { ...r, [p.id]: {} })
      return [...prev, { id: p.id, name: fullName(p) }]
    })
  }, [loaded])

  const removePlayer = React.useCallback((playerId: string) => {
    if (!loaded) return
    if (!confirm('Eliminare questo giocatore dalla classifica?')) return
    setDirty(true)
    setPlayers(prev => prev.filter(p => p.id !== playerId))
    setResults(prevR => {
      const c = { ...prevR }; delete (c as any)[playerId]; return c
    })
  }, [loaded])

  const [newTitle, setNewTitle] = React.useState('')
  const [newDate,  setNewDate ] = React.useState('') // gg/mm
  const [newMult,  setNewMult ] = React.useState<number>(1)
  const [newTotal, setNewTotal] = React.useState<number>(8)

  const addTappa = React.useCallback(() => {
    if (!loaded) return
    if (!newTitle.trim()) { alert('Titolo tappa mancante'); return }
    if (newTotal < 1)     { alert('Totale squadre deve essere ≥ 1'); return }
    setDirty(true)
    const t: Tappa = {
      id: uid(),
      title: newTitle.trim(),
      date: newDate.trim(),
      multiplier: Number(newMult) || 1,
      totalTeams: Number(newTotal) || 1
    }
    setTappe(prev => [...prev, t])
    setNewTitle(''); setNewDate(''); setNewMult(1); setNewTotal(8)
  }, [loaded, newTitle, newDate, newMult, newTotal])

  const removeTappa = React.useCallback((tappaId: string) => {
    if (!loaded) return
    if (!confirm('Eliminare la tappa?')) return
    setDirty(true)
    setTappe(prev => prev.filter(t => t.id !== tappaId))
    setResults(prevR => {
      const c: Results = {}
      for (const pid of Object.keys(prevR)) {
        const row = { ...prevR[pid] }
        delete row[tappaId]
        c[pid] = row
      }
      return c
    })
  }, [loaded])

  const setPos = React.useCallback((playerId: string, tappaId: string, pos: number | undefined) => {
    if (!loaded) return
    setDirty(true)
    setResults(prev => {
      const row = { ...(prev[playerId] || {}) }
      row[tappaId] = { pos }
      return { ...prev, [playerId]: row }
    })
  }, [loaded])

  /* Salvataggio esplicito */
  const handleSave = React.useCallback(async () => {
    if (!tour) { alert('Seleziona un tour'); return }
    setSaving(true); setErrorText('')
    try {
      await apiUpsertSnapshot(tour, gender, { players, tappe, results })
      await loadSnapshot() // ricarica “fonte di verità”
      setDirty(false)
    } catch (e:any) {
      console.error('[save] failed', e)
      setErrorText(e?.message || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }, [tour, gender, players, tappe, results, loadSnapshot])

  const handleDiscard = React.useCallback(() => {
    if (!confirm('Annullare le modifiche locali e ricaricare dal server?')) return
    loadSnapshot()
  }, [loadSnapshot])

  /* computed */
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

  /* RENDER */
  return (
    <AdminGate>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <TabButton active={gender==='M'} onClick={()=>setGender('M')} title="Mostra classifica Maschile">Maschile</TabButton>
          <TabButton active={gender==='F'} onClick={()=>setGender('F')} title="Mostra classifica Femminile">Femminile</TabButton>
          <TabButton href="/admin/classifica/legenda" title="Apri pagina Legenda punti">Legenda punti</TabButton>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-neutral-300 mr-2">Tour</span>
            <select className="input input-sm w-[220px]" value={tour} onChange={(e)=>setTour(e.target.value.trim())}>
              {(!availableTours.length || !tour) && <option value="" disabled>Seleziona un tour…</option>}
              {availableTours.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <a href="/admin/tour" className="btn btn-ghost btn-sm" title="Gestione tour">Gestisci tour</a>
          </div>
        </div>

        {/* Barra azioni salvataggio */}
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!dirty || saving || !loaded}>
            {saving ? 'Salvo…' : 'Salva'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleDiscard} disabled={!dirty || saving}>Annulla modifiche</button>
          {dirty && <span className="text-xs text-yellow-400">Hai modifiche non salvate</span>}
          {!!errorText && <span className="text-xs text-red-400 ml-3">{errorText}</span>}
        </div>

        {/* Tools */}
        <div className={`card p-4 space-y-4 ${!loaded ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="flex items-end gap-3">
            <div className="w-64">
              <div className="text-xs mb-1">Aggiungi giocatore</div>
              <PlayerPicker onSelect={(p:any)=>addPlayer(p)} />
            </div>
            <div className="text-xs text-neutral-500">I giocatori aggiunti compaiono nella tabella sotto. Ricordati di premere “Salva”.</div>
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

        {/* Etichetta tour attivo */}
        <div className="text-center font-semibold text-neutral-200">
          <div className="inline-flex items-center gap-2 text-3xl">
            <span>Tour:</span>
            <span className="font-bold">{tour}</span>
            <span className="ml-2 align-middle px-2 py-0.5 rounded bg-neutral-800 text-neutral-100 text-xs">
              {gender === 'M' ? 'Maschile' : 'Femminile'}
            </span>
          </div>
        </div>

        {/* Tabella */}
        <div className="card p-4 overflow-x-auto">
          {players.length===0 ? (
            <div className="text-sm text-neutral-500">{loaded ? 'Aggiungi almeno un giocatore.' : 'Carico…'}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="text-center py-2 pr-4 w-[400px]">Nome</th>
                  <th className="text-left py-2 pr-4 w-[120px]">Totale</th>
                  {tappe.map((t)=>(
                    <th key={t.id} className="text-left py-2 pr-2 border-l border-neutral-800 pl-3">
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
                    {tappe.map((t)=>(
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
                      <td className="py-2 pr-4 text-center">
                        <div className={`font-medium ${rank===1?'text-yellow-300':''}`}>
                          {row.player.name}{rank===1?' 👑':''}
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-semibold">{row.total}</td>
                      {tappe.map((t)=>{
                        const pos = results[row.player.id]?.[t.id]?.pos
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
