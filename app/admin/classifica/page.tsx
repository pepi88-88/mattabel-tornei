'use client'

import * as React from 'react'
import useSWR from 'swr'

/** Costante usata dalle API delle edizioni (la tua GET richiede tour_id) */
const TOUR_ID = 'GLOBAL'

type Edition = { id: string; name: string }
type Player  = { player_id: string; display_name: string }
type Stage   = { id: string; name: string; day: number; month: number; multiplier: number; total_teams: number }
type Tot     = { player_id: string; display_name: string; points_from_stages: number; delta_points: number; total_points: number }
type GlobalPlayer = { id: string; display_name: string }

const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null)
const asNum = (v: any, d=0) => Number.isFinite(Number(v)) ? Number(v) : d

export default function ClassificaPage() {
  /* ------------------------ Stato base ------------------------ */
  const [gender, setGender] = React.useState<'M'|'F'>('M')
// — legend-curve settings
type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }
const DEFAULT_SET: ScoreCfgSet = {
  S:{ base:100, minLast:10, curvePercent:100 },
  M:{ base:100, minLast:10, curvePercent:100 },
  L:{ base:100, minLast:10, curvePercent:100 },
  XL:{ base:100, minLast:10, curvePercent:100 },
}
const pickBucket = (n:number): keyof ScoreCfgSet => n<=8?'S':n<=16?'M':n<=32?'L':'XL'
const pointsOfBucket = (pos:number, total:number, mult:number, set:ScoreCfgSet) => {
  const cfg = set[pickBucket(total)]
  if (total<=1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent/100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}
  // carica i parametri della curva per calcolo punti in client
const { data: legendRes } = useSWR(
  `/api/ranking/legend-curve?tour_id=${encodeURIComponent(TOUR_ID)}&gender=${gender}`,
  fetcher,
  { revalidateOnFocus:false }
)
const legendSet: ScoreCfgSet = legendRes?.settings ?? DEFAULT_SET

  // Edizioni per GENERE (richiede tour_id)
  const { data: edRes, mutate: refetchEd } = useSWR(
    `/api/ranking/editions?tour_id=${encodeURIComponent(TOUR_ID)}&gender=${gender}`,
    fetcher,
    { revalidateOnFocus:false }
  )
  const editions: Edition[] = edRes?.items ?? []
  const [editionId, setEditionId] = React.useState('')
  React.useEffect(()=>{
    if (editions.length && !editionId) setEditionId(editions[0].id)
    if (!editions.length) setEditionId('')
  },[editions, editionId])

  // Giocatori / Tappe / Totali dell’edizione
  const { data: plRes, mutate: refetchPlayers } = useSWR(
    editionId ? `/api/ranking/players?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const players: Player[] = plRes?.items ?? []

  const { data: stRes, mutate: refetchStages } = useSWR(
    editionId ? `/api/ranking/stages?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const stages: Stage[] = stRes?.items ?? []

  const { data: totRes, mutate: refetchTotals } = useSWR(
    editionId ? `/api/ranking/totals?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const totals: Tot[] = totRes?.items ?? []

  /* ------------------------ TOUR (crea/rinomina/elimina) ------------------------ */
  const [tourNameInput, setTourNameInput] = React.useState('')

  const createEdition = async () => {
    const name = tourNameInput.trim()
    if (!name) return alert('Inserisci un nome tour')
    try {
      const r = await fetch('/api/ranking/editions', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ tour_id: TOUR_ID, gender, name })
      })
      if (!r.ok) throw new Error(await r.text())

      let newId = ''
      try {
        const j = await r.json().catch(()=>null)
        newId = j?.id || j?.item?.id || j?.data?.id || ''
      } catch {}

      const fresh = await refetchEd()
      const list: Edition[] = fresh?.items ?? []
      if (!newId) {
        const match = list.find(e => e.name.trim().toLowerCase() === name.toLowerCase())
        newId = match?.id || ''
      }
      if (newId) setEditionId(newId)
      setTourNameInput('')
    } catch (e:any) {
      alert('Errore creazione tour: ' + (e?.message || ''))
    }
  }

  const renameEdition = async () => {
    const name = tourNameInput.trim()
    if (!editionId) return alert('Seleziona un tour')
    if (!name) return alert('Inserisci il nuovo nome')
    try {
      const r = await fetch('/api/ranking/editions', {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ edition_id: editionId, name })
      })
      if (!r.ok) throw new Error(await r.text())
      await refetchEd()
      setTourNameInput('')
    } catch (e:any) {
      alert('Errore rinomina tour: ' + (e?.message || ''))
    }
  }

  const deleteEdition = async () => {
    if (!editionId) return
    const cur = editions.find(e => e.id === editionId)
    if (!cur) return
    if (!confirm(`Eliminare il tour “${cur.name}”?\n⚠️ Saranno rimossi i giocatori, le tappe e i risultati collegati.`)) return
    try {
      const r = await fetch('/api/ranking/editions', {
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ edition_id: editionId })
      })
      if (!r.ok) throw new Error(await r.text())
      await refetchEd()
      setEditionId('')
      setTourNameInput('')
      await Promise.all([refetchPlayers(), refetchStages(), refetchTotals()])
    } catch (e:any) {
      alert('Errore eliminazione tour: ' + (e?.message || ''))
    }
  }

  /* ------------------------ Aggiungi giocatore (autocomplete da "players") ------------------------ */
  const [playerInput, setPlayerInput] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<GlobalPlayer[]>([])
  const [suggestOpen, setSuggestOpen] = React.useState(false)
  const [isSearching, setIsSearching] = React.useState(false)

  React.useEffect(() => {
    const q = playerInput.trim()
    if (!q) { setSuggestions([]); setSuggestOpen(false); return }
    const t = setTimeout(async () => {
      try {
        setIsSearching(true)
        const r = await fetch(`/api/players?search=${encodeURIComponent(q)}`, { cache:'no-store' })
        const j = await r.json().catch(()=>({}))
        const items: GlobalPlayer[] = j?.items ?? []
        setSuggestions(items.slice(0, 12))
        setSuggestOpen(true)
      } catch {
        setSuggestions([]); setSuggestOpen(false)
      } finally {
        setIsSearching(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [playerInput])

  const addPlayerById = async (p: GlobalPlayer) => {
    if (!editionId) { alert('Seleziona un tour'); return }
    try {
      const r = await fetch('/api/ranking/players', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          edition_id: editionId,
          player_id: p.id,
          display_name: p.display_name,
        })
      })
      if (!r.ok) throw new Error(await r.text())
      setPlayerInput(''); setSuggestions([]); setSuggestOpen(false)
      await Promise.all([refetchPlayers(), refetchTotals()])
    } catch (e:any) {
      alert('Errore aggiunta giocatore: ' + (e?.message || ''))
    }
  }

  /* ------------------------ TAPPE inline + placements per colonna ------------------------ */
  const [stageForm, setStageForm] = React.useState({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })
  // mappa: stageId -> (player_id -> posizionestring | '-')
  const [placementsByStage, setPlacementsByStage] = React.useState<Record<string, Record<string,string>>>({})

  // Inizializza entry vuote per (stages x players)
  React.useEffect(()=>{
    setPlacementsByStage(prev=>{
      const next = { ...prev }
      stages.forEach(st=>{
        const cur = next[st.id] || {}
        players.forEach(p=>{
          if (cur[p.player_id] === undefined) cur[p.player_id] = '-' // default vuoto
        })
        next[st.id] = cur
      })
      // pulisci chiavi orfane se tappe rimosse
      const valid = new Set(stages.map(s=>s.id))
      Object.keys(next).forEach(k=>{ if(!valid.has(k)) delete (next as any)[k] })
      return next
    })
  }, [stages.map(s=>s.id).join(','), players.map(p=>p.player_id).join(',')])

  const addStage = async () => {
    const payload = {
      edition_id: editionId,
      name: stageForm.name.trim(),
      day: asNum(stageForm.day,0),
      month: asNum(stageForm.month,0),
      multiplier: asNum(stageForm.multiplier,1),
      total_teams: asNum(stageForm.total_teams,0),
    }
    if (!payload.edition_id) return alert('Seleziona un tour')
    if (!payload.name || !payload.day || !payload.month || !payload.total_teams) {
      return alert('Compila Nome, Giorno, Mese e Totale squadre')
    }
    const r = await fetch('/api/ranking/stages', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    })
    if (!r.ok) return alert('Errore creazione tappa: ' + await r.text())
    setStageForm({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })
    await refetchStages()
  }

  const deleteStage = async (stage_id: string, label:string) => {
    if (!confirm(`Eliminare la tappa "${label}"?`)) return
    const r = await fetch('/api/ranking/stages', {
      method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ stage_id })
    })
    if (!r.ok) return alert('Errore eliminazione tappa: ' + await r.text())
    await refetchStages()
    await refetchTotals()
  }

  // autosave debounced per singola tappa
  const _saveTimers = React.useRef<Record<string, any>>({})
  const setPlacement = (stageId: string, playerId: string, value: string) => {
    setPlacementsByStage(prev=>{
      const map = { ...(prev[stageId]||{}) , [playerId]: value }
      return { ...prev, [stageId]: map }
    })

    clearTimeout(_saveTimers.current[stageId])
    _saveTimers.current[stageId] = setTimeout(async ()=>{
      const stage = stages.find(s=>s.id===stageId)
      if (!stage) return
      const maxPos = Math.max(1, Number(stage.total_teams||0))
      const map = placementsByStage[stageId] || {}
      const tuples = Object.entries(map)
        .filter(([,v]) => v && v !== '-')
        .map(([pid, v]) => ({ pid, pos: Number(v) }))
        .filter(x => Number.isFinite(x.pos) && x.pos>=1 && x.pos<=maxPos)
        .sort((a,b) => a.pos - b.pos)
      const orderedPlayerIds = tuples.map(t => t.pid)
      try {
        const r = await fetch('/api/ranking/stages/placements', {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ stage_id: stageId, placements: orderedPlayerIds })
        })
        if (!r.ok) throw new Error(await r.text())
        await refetchTotals()
      } catch (e:any) {
        console.error(e)
      }
    }, 400)
  }
// ===== Ordinamento righe classifica + helper per “miglior piazzamento”
const bestPlacementOf = (pid:string) => {
  let best = Infinity
  stages.forEach(st=>{
    const v = placementsByStage[st.id]?.[pid]
    const n = Number(v)
    if (v && v !== '-' && Number.isFinite(n)) best = Math.min(best, n)
  })
  return best
}

const totalsSorted = [...totals].sort((a,b)=>{
  const t = Number(b.total_points||0) - Number(a.total_points||0)  // 1) totale punti
  if (t) return t
  const ba = bestPlacementOf(a.player_id)                           // 2) miglior piazzamento (più basso meglio)
  const bb = bestPlacementOf(b.player_id)
  if (ba !== bb) return ba - bb
  return a.display_name.localeCompare(b.display_name)               // 3) alfabetico
})

  /* ------------------------ RENDER ------------------------ */
  return (
    <div className="p-6 space-y-6">
      {/* top: genere + link legenda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl overflow-hidden border border-neutral-700">
          <button className={`px-3 py-2 text-sm ${gender==='M'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`} onClick={()=>setGender('M')}>Maschile</button>
          <button className={`px-3 py-2 text-sm ${gender==='F'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`} onClick={()=>setGender('F')}>Femminile</button>
        </div>
        <a className="btn btn-outline btn-sm ml-auto" href="/admin/classifica/legenda">Legenda punti</a>
      </div>

      {/* TOUR: select + azioni */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Tour</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-80" value={editionId} onChange={e=>setEditionId(e.target.value)}>
            <option value="">— seleziona —</option>
            {editions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input className="input w-72" placeholder="Nome tour (crea/rinomina)" value={tourNameInput} onChange={e=>setTourNameInput(e.target.value)} />
          <button className="btn" onClick={createEdition}>Crea</button>
          <button className="btn" onClick={renameEdition} disabled={!editionId}>Rinomina</button>
          <button className="btn" onClick={deleteEdition} disabled={!editionId}>Elimina</button>
        </div>
        <div className="text-xs text-neutral-500">Suggerimento: crea il tour, selezionalo nella tendina, poi rinominalo se serve.</div>
      </div>

      {/* AGGIUNGI GIOCATORE */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Aggiungi giocatore</div>
        <div className="relative max-w-[560px]">
          <input
            className="input w-full"
            placeholder="Cerca un giocatore creato in “Crea giocatori”…"
            value={playerInput}
            onChange={(e)=>setPlayerInput(e.target.value)}
            onFocus={()=> playerInput.trim() && setSuggestOpen(true)}
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">…</div>
          )}
          {suggestOpen && suggestions.length>0 && (
            <div
              className="absolute z-20 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl max-h-72 overflow-auto shadow-lg"
              onMouseLeave={()=>setSuggestOpen(false)}
            >
              {suggestions.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800"
                  onClick={()=>addPlayerById(p)}
                >
                  {p.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-xs text-neutral-500">
          I suggerimenti vengono dalla tabella <code>players</code>. Se non trovi il nome, crealo prima in “Crea giocatori”.
        </div>
      </div>

    {/* AGGIUNGI TAPPA (inline) */}
<div className="card p-4 space-y-3">
  <div className="text-sm font-semibold">Aggiungi tappa</div>

  <div className="grid gap-3 sm:grid-cols-4">
    <div>
      <div className="text-xs text-neutral-400 mb-1">Nome tappa</div>
      <input
        className="input w-full"
        placeholder="Nome tappa"
        value={stageForm.name}
        onChange={e=>setStageForm(s=>({...s, name:e.target.value}))}
      />
    </div>

    <div>
      <div className="text-xs text-neutral-400 mb-1">Data (gg/mm)</div>
      <input
        className="input w-full"
        placeholder="es. 05/08"
        value={`${stageForm.day || ''}${stageForm.day || stageForm.month ? '/' : ''}${stageForm.month || ''}`}
        onChange={(e)=>{
          const v = e.target.value.replace(/\s+/g,'')
          const m = v.match(/^(\d{0,2})(?:\/)?(\d{0,2})$/)
          const d = m ? m[1] : ''
          const mo = m ? m[2] : ''
          setStageForm(s=>({...s, day: d, month: mo }))
        }}
      />
    </div>

    <div>
      <div className="text-xs text-neutral-400 mb-1">Moltiplicatore</div>
      <input
        className="input w-full"
        placeholder="x1.00"
        value={stageForm.multiplier}
        onChange={e=>setStageForm(s=>({...s, multiplier:e.target.value}))}
      />
    </div>

    <div>
      <div className="text-xs text-neutral-400 mb-1">Totale squadre</div>
      <input
        className="input w-full"
        placeholder="es. 12"
        value={stageForm.total_teams}
        onChange={e=>setStageForm(s=>({...s, total_teams:e.target.value}))}
      />
    </div>
  </div>

  <div>
    <button className="btn" onClick={addStage} disabled={!editionId}>Aggiungi</button>
  </div>
</div>


      {/* CLASSIFICA TOTALE */}
      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-sm font-semibold">Classifica totale</div>
          <button className="btn btn-sm" onClick={()=>refetchTotals()}>Aggiorna</button>
        </div>

        <div className="p-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase opacity-70">
              <tr>
                <th className="text-left w-14">#</th>
                <th className="text-left">Giocatore</th>

                {/* Colonne TAPPE dinamiche */}
              {stages.map((st, idx)=>(
  <th
    key={st.id}
    className={`min-w-[160px] align-bottom ${idx>0 ? 'border-l border-neutral-800' : ''}`}
  >
    <div className="flex flex-col items-center gap-1 py-1">
      <div className="font-medium">{st.name}</div>
      <div className="text-xs text-neutral-400">
        {String(st.day).padStart(2,'0')}/{String(st.month).padStart(2,'0')}
      </div>
      <div className="text-[11px] text-neutral-500">x{Number(st.multiplier).toFixed(2)} · {st.total_teams} sq</div>
      <button
        className="btn btn-xs mt-1"
        onClick={()=>deleteStage(st.id, st.name)}
        title="Elimina tappa"
      >Elimina</button>
    </div>
  </th>
))}

                <th className="text-right w-28">Totale</th>
                <th className="text-right w-28">Azioni</th>
              </tr>
            </thead>

            <tbody>
             {totalsSorted.map((r,i)=>(
  <tr
    key={r.player_id}
    className={`border-t border-neutral-800 ${i===0 ? 'bg-yellow-500/10' : i>0 && i<8 ? 'bg-emerald-500/5' : ''}`}
  >
    <td className="py-1">
      {i+1}
      {i===0 && <span className="ml-1">👑</span>}
    </td>
    <td className="py-1 truncate">{r.display_name}</td>
    {/* ... celle delle TAPPE ... */}
    <td className="py-1 text-right font-semibold">{Number(r.total_points||0).toFixed(2)}</td>
    {/* ... azioni ... */}

                  {/* Celle selezione piazzamento per OGNI TAPPA */}
               {stages.map((st, idx)=>{
  const maxPos = Math.max(1, Number(st.total_teams||0))
  const cur = placementsByStage[st.id]?.[r.player_id] ?? '-'
  const posNum = Number(cur)
  const pts = (cur !== '-' && Number.isFinite(posNum))
    ? pointsOfBucket(posNum, maxPos, Number(st.multiplier||1), legendSet)
    : ''

  return (
    <td key={`${st.id}-${r.player_id}`} className={`py-1 ${idx>0 ? 'border-l border-neutral-800' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <select
          className="input w-24"
          value={cur}
          onChange={e=>setPlacement(st.id, r.player_id, e.target.value)}
          title="Posizione"
        >
          <option value="-">-</option>
          {Array.from({length: maxPos}, (_,n)=>n+1).map(n=>(
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </select>
        <div className="w-14 text-right tabular-nums">{pts!=='' ? pts : '—'}</div>
      </div>
    </td>
  )
})}

<td className="py-1 text-right font-semibold">{Number(r.total_points||0).toFixed(2)}</td>

                  {/* Elimina giocatore dal tour */}
                  <td className="py-1 text-right">
                    <button
                      className="btn btn-sm"
                      onClick={async ()=>{
                        if (!editionId) return
                        if (!confirm(`Eliminare il giocatore “${r.display_name}” dal tour?\n⚠️ Verranno rimossi anche i suoi risultati.`)) return
                        try {
                          const del = await fetch('/api/ranking/players', {
                            method:'DELETE',
                            headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ edition_id: editionId, player_id: r.player_id })
                          })
                          if (!del.ok) throw new Error(await del.text())
                          await Promise.all([refetchPlayers(), refetchTotals()])
                        } catch (e:any) {
                          alert('Errore eliminazione: ' + (e?.message || ''))
                        }
                      }}
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}

              {totals.length===0 && (
                <tr><td colSpan={5 + stages.length} className="py-4 text-center text-neutral-500">Nessun dato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
