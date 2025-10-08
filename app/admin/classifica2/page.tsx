'use client'

import * as React from 'react'

/* ================== Tipi ================== */
type Gender = 'M' | 'F'
type PlayerRow  = { id: string; name: string }
type Tappa      = { id: string; title: string; date: string; multiplier: number; totalTeams: number }
type Results    = Record<string /*playerId*/, Record<string /*tappaId*/, { pos?: number }>>
type SaveShape  = { players: PlayerRow[]; tappe: Tappa[]; results: Results }

type ScoreCfg     = { base: number; minLast: number; curvePercent: number }
type ScoreCfgSet  = { S: ScoreCfg; M: ScoreCfg; L: ScoreCfg; XL: ScoreCfg }

/* ================== Punteggi ================== */
const DEFAULT_SET: ScoreCfgSet = {
  S:  { base:100, minLast:10, curvePercent:100 },
  M:  { base:100, minLast:10, curvePercent:100 },
  L:  { base:100, minLast:10, curvePercent:100 },
  XL: { base:100, minLast:10, curvePercent:100 },
}
const pickBucket = (total:number): keyof ScoreCfgSet =>
  total<=8 ? 'S' : total<=16 ? 'M' : total<=32 ? 'L' : 'XL'

function pointsOfBucket(pos: number | undefined, total: number, mult: number, set:ScoreCfgSet) {
  if (!pos || pos < 1 || total < 1) return 0
  const cfg = set[pickBucket(total)]
  if (total === 1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent / 100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

/* ================== API helpers (lb2) ================== */
// ——— TOURS IN LOCALE ———
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
async function apiLb2Get(tour: string, gender: Gender) {
  const url = `/api/lb2/snapshots?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error('lb2 snapshot get failed')
  return r.json() as Promise<{ data: SaveShape | null }>
}
async function apiLb2Put(tour: string, gender: Gender, data: SaveShape) {
  const r = await fetch('/api/lb2/snapshots', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tour, gender, data }),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(txt || 'lb2 snapshot put failed')
  return txt
}
/* ---- settings (stessa tabella della Legenda) ---- */
async function apiGetSettings(tour: string, gender: Gender) {
  const r = await fetch(
    `/api/leaderboard/settings?tour=${encodeURIComponent(tour)}&gender=${gender}&ts=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!r.ok) return { settings: DEFAULT_SET }
  return r.json() as Promise<{ settings: ScoreCfgSet|null }>
}

/* ================== Pagina ================== */
export default function AdminClassifica2Page() {
// tours (locale)
const [availableTours, setAvailableTours] = React.useState<string[]>([])
React.useEffect(() => {
  setAvailableTours(loadLocalTours())
}, [])


  // header (persistenza locale)
  const [tour, setTour] = React.useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('lb2:lastTour')) || ''
  )
  const [gender, setGender] = React.useState<Gender>(() =>
    ((typeof window !== 'undefined' && (localStorage.getItem('lb2:lastGender') as Gender|null)) || 'M')
  )
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
  // se ho cancellato quello selezionato, svuoto e blocco UI
  setTour(next[0] || '')
}

  // se non ho un tour, prendi il primo disponibile quando arriva la lista
  React.useEffect(() => {
    if (tour) return
    if (!availableTours.length) return
    setTour(availableTours[0])
  }, [availableTours, tour])

  // persisti
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (tour) localStorage.setItem('lb2:lastTour', tour)
  }, [tour])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('lb2:lastGender', gender)
  }, [gender])

  // JSON testo + anteprima
  const [jsonText, setJsonText] = React.useState<string>('{"players":[],"tappe":[],"results":{}}')
  const [scoreSet, setScoreSet] = React.useState<ScoreCfgSet>(DEFAULT_SET)
  const [loading, setLoading] = React.useState(false)
  const [err, setErr] = React.useState('')
type PlayerForm = PlayerRow
type TappaForm = Tappa
type ResultsForm = Results

const [uiMode, setUiMode] = React.useState<'json'|'moduli'>('moduli')

// stati dei moduli (derivati/sincronizzati col JSON)
const [playersForm, setPlayersForm] = React.useState<PlayerForm[]>([])
const [tappeForm, setTappeForm]     = React.useState<TappaForm[]>([])
const [resultsForm, setResultsForm] = React.useState<ResultsForm>({})

// quando carico o cambia il jsonText, aggiorno i moduli (solo se sono in moduli o all'init)
React.useEffect(()=>{
  try {
    const s = JSON.parse(jsonText) as SaveShape
    setPlayersForm(s.players || [])
    setTappeForm(s.tappe || [])
    setResultsForm(s.results || {})
  } catch {/* ignora */}
}, [jsonText])

// helper per scrivere indietro nel jsonText quello che c'è nei moduli
function syncModulesToJson(){
  const next: SaveShape = {
    players: playersForm,
    tappe: tappeForm,
    results: resultsForm,
  }
  setJsonText(JSON.stringify(next, null, 2))
}

  // carica snapshot + settings
  const loadNow = React.useCallback(async () => {
    if (!tour) return
    setLoading(true); setErr('')
    try {
      const [{ data }, { settings }] = await Promise.all([
        apiLb2Get(tour, gender),
        apiGetSettings(tour, gender).catch(()=>({ settings: DEFAULT_SET })),
      ])
      const s: SaveShape = data ?? { players: [], tappe: [], results: {} }
      setJsonText(JSON.stringify(s, null, 2))
      setScoreSet(settings ?? DEFAULT_SET)
    } catch (e:any) {
      setErr(e?.message || 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }, [tour, gender])

  // autoload quando cambiano tour/genere (fix F5)
  React.useEffect(() => {
    if (!tour) return
    loadNow()
  }, [tour, gender, loadNow])

  // salva snapshot
  async function saveNow() {
    setErr('')
    let parsed: SaveShape
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setErr('JSON non valido')
      return
    }
    try {
      await apiLb2Put(tour, gender, parsed)
      // round-trip: ricarico dal server per essere sicuri
      await loadNow()
      alert('Salvato.')
    } catch (e:any) {
      setErr(e?.message || 'Errore salvataggio')
    }
  }

  // calcolo anteprima
  const previewRows = React.useMemo(() => {
    try {
      const s = JSON.parse(jsonText) as SaveShape
      const rows = (s.players || []).map(p => {
        let total = 0, bestPos = Infinity
        for (const t of (s.tappe || [])) {
          const pos = s.results?.[p.id]?.[t.id]?.pos
          const pts = pointsOfBucket(pos, t.totalTeams, t.multiplier, scoreSet)
          total += pts
          if (pos && pos < bestPos) bestPos = pos
        }
        return { player: p, total, bestPos }
      })
      rows.sort((a,b) =>
        (b.total - a.total)
        || ((a.bestPos===b.bestPos?0:(a.bestPos - b.bestPos)))
        || a.player.name.localeCompare(b.player.name,'it')
      )
      return rows
    } catch { return [] }
  }, [jsonText, scoreSet])

return (
  <div className="p-6 space-y-6">
    {/* tabs top */}
    <div className="flex items-center gap-2 mb-3">
      <span className="btn btn-primary btn-sm border-2 border-primary ring-2 ring-primary/30">Classifica v2</span>
      <a className="btn btn-outline btn-sm" href="/admin/classifica2/legenda2">Legenda v2</a>
    </div>

    <h1 className="text-xl font-semibold">Classifica v2 (tabella: lb2_snapshots)</h1>

    {/* header */}
    <div className="flex items-center gap-2">
      <div className="text-sm text-neutral-400">Tour</div>

      <select
        className="input input-sm w-[220px]"
        value={tour}
        onChange={e => setTour(e.target.value)}
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

      {/* toggle + azioni (UNICO gruppo a destra) */}
      <div className="ml-auto flex gap-2 items-center">
        <div className="btn-group btn-group-sm">
          <button
            className={`btn btn-sm ${uiMode==='moduli' ? 'btn-primary' : ''}`}
            onClick={()=>setUiMode('moduli')}
          >Moduli</button>
          <button
            className={`btn btn-sm ${uiMode==='json' ? 'btn-primary' : ''}`}
            onClick={()=>setUiMode('json')}
          >JSON</button>
        </div>

        <button className="btn btn-sm" onClick={loadNow} disabled={!tour || loading}>Carica</button>
        <button
          className="btn btn-sm"
          onClick={async ()=>{
            if (uiMode==='moduli') syncModulesToJson()
            await saveNow()
          }}
          disabled={!tour || loading}
        >Salva</button>
      </div>
    </div>

    {/* avviso quando manca il tour */}
    {!tour ? (
      <div className="text-sm text-amber-400">
        Nessun tour selezionato: crea un tour per poter inserire dati.
      </div>
    ) : null}

    {/* MODULI: editor visuale */}
    {uiMode === 'moduli' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Players */}
        <div className="card p-3">
          <div className="font-medium mb-2">Giocatori</div>
          <div className="space-y-2">
            {playersForm.map((p, idx)=>(
              <div key={p.id} className="grid grid-cols-5 gap-2 items-center">
                <input
                  className="input col-span-2"
                  placeholder="ID"
                  value={p.id}
                  onChange={e=>{
                    const v = e.target.value
                    setPlayersForm(prev => prev.map((x,i)=> i===idx? {...x, id:v}: x))
                  }}
                />
                <input
                  className="input col-span-3"
                  placeholder="Nome"
                  value={p.name}
                  onChange={e=>{
                    const v = e.target.value
                    setPlayersForm(prev => prev.map((x,i)=> i===idx? {...x, name:v}: x))
                  }}
                />
                <button className="btn btn-ghost btn-xs col-span-5"
                  onClick={()=> setPlayersForm(prev => prev.filter((_,i)=>i!==idx))}
                >Elimina</button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              onClick={()=>{
                const nid = crypto.randomUUID?.() || String(Date.now())
                setPlayersForm(prev => [...prev, { id:nid, name:'' }])
              }}
            >+ Aggiungi giocatore</button>
          </div>
        </div>

        {/* Tappe */}
        <div className="card p-3">
          <div className="font-medium mb-2">Tappe</div>
          <div className="space-y-2">
            {tappeForm.map((t, idx)=>(
              <div key={t.id} className="space-y-2 border-t border-neutral-800 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="ID"
                    value={t.id}
                    onChange={e=>{
                      const v=e.target.value
                      setTappeForm(prev=>prev.map((x,i)=>i===idx?{...x,id:v}:x))
                    }}/>
                  <input className="input" placeholder="Titolo"
                    value={t.title}
                    onChange={e=>{
                      const v=e.target.value
                      setTappeForm(prev=>prev.map((x,i)=>i===idx?{...x,title:v}:x))
                    }}/>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input className="input" placeholder="Data (yyyy-mm-dd)"
                    value={t.date}
                    onChange={e=>{
                      const v=e.target.value
                      setTappeForm(prev=>prev.map((x,i)=>i===idx?{...x,date:v}:x))
                    }}/>
                  <input className="input" type="number" step="0.01" placeholder="Moltiplicatore"
                    value={t.multiplier}
                    onChange={e=>{
                      const v=Number(e.target.value)
                      setTappeForm(prev=>prev.map((x,i)=>i===idx?{...x,multiplier:v}:x))
                    }}/>
                  <input className="input" type="number" placeholder="Tot squadre"
                    value={t.totalTeams}
                    onChange={e=>{
                      const v=Number(e.target.value)
                      setTappeForm(prev=>prev.map((x,i)=>i===idx?{...x,totalTeams:v}:x))
                    }}/>
                </div>
                <button className="btn btn-ghost btn-xs"
                  onClick={()=>{
                    const tid = tappeForm[idx].id
                    setTappeForm(prev => prev.filter((_,i)=>i!==idx))
                    setResultsForm(prev=>{
                      const next: ResultsForm = {}
                      for (const pid of Object.keys(prev)) {
                        const rec = {...prev[pid]}
                        delete rec[tid]
                        next[pid] = rec
                      }
                      return next
                    })
                  }}
                >Elimina tappa</button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              onClick={()=>{
                const nid = crypto.randomUUID?.() || String(Date.now())
                setTappeForm(prev => [...prev, { id:nid, title:'', date:'', multiplier:1, totalTeams:8 }])
              }}
            >+ Aggiungi tappa</button>
          </div>
        </div>

        {/* Risultati */}
        <div className="card p-3">
          <div className="font-medium mb-2">Risultati</div>
          <div className="text-xs text-neutral-400 mb-2">Inserisci la <em>posizione</em> (1,2,3…); lascia vuoto se assente.</div>

          <div className="space-y-3">
            {tappeForm.length===0 ? (
              <div className="text-sm text-neutral-500">Aggiungi prima almeno una tappa.</div>
            ) : playersForm.length===0 ? (
              <div className="text-sm text-neutral-500">Aggiungi prima almeno un giocatore.</div>
            ) : (
              <>
                {tappeForm.map(t => (
                  <div key={t.id} className="border-t border-neutral-800 pt-2">
                    <div className="font-medium mb-2">{t.title || t.id} <span className="text-neutral-500">({t.date || 'gg/mm'})</span></div>
                    <div className="grid grid-cols-2 gap-2">
                      {playersForm.map(p => {
                        const val = resultsForm[p.id]?.[t.id]?.pos ?? ''
                        return (
                          <div key={p.id} className="flex items-center gap-2">
                            <div className="w-36 truncate text-xs">{p.name || p.id}</div>
                            <input
                              className="input input-sm w-24"
                              type="number" min={1}
                              placeholder="pos"
                              value={val as any}
                              onChange={e=>{
                                const num = e.target.value ? Number(e.target.value) : undefined
                                setResultsForm(prev=>{
                                  const recP = {...(prev[p.id] || {})}
                                  recP[t.id] = { pos: num }
                                  return { ...prev, [p.id]: recP }
                                })
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    )}

    {/* corpo (solo in modalità JSON) */}
    {uiMode === 'json' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-3">
          <div className="text-xs text-neutral-400 mb-1">JSON (players, tappe, results)</div>
          <textarea
            className="textarea w-full min-h-[420px] font-mono text-xs bg-neutral-900 text-neutral-100 placeholder-neutral-500 border border-neutral-800"
            value={jsonText}
            onChange={e=>setJsonText(e.target.value)}
          />
          {loading && <div className="text-xs text-neutral-500 mt-1">Carico…</div>}
          {err && <div className="text-xs text-red-400 mt-1">{err}</div>}
        </div>

        <div className="card p-3">
          <div className="text-xs text-neutral-400 mb-2">Preview calcolata</div>
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr><th className="text-left">Nome</th><th className="text-right">Totale</th></tr>
            </thead>
            <tbody>
              {previewRows.map(r=>(
                <tr key={r.player.id} className="border-t border-neutral-800">
                  <td className="py-1 pr-2">{r.player.name}</td>
                  <td className="py-1 pl-2 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
              {!previewRows.length && (
                <tr><td colSpan={2} className="py-2 text-neutral-500">Nessun dato.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    ) : null}
  </div>
)
}
