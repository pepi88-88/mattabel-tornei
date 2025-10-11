'use client'

import * as React from 'react'
import useSWR from 'swr'

type Edition = { id: string; name: string }
type Player  = { player_id: string; display_name: string }
type Stage   = { id: string; name: string; day: number; month: number; multiplier: number; total_teams: number }
type Tot     = { player_id: string; display_name: string; points_from_stages: number; delta_points: number; total_points: number }

const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null)
const asNum = (v: any, d=0) => Number.isFinite(Number(v)) ? Number(v) : d

export default function ClassificaPage() {
  /* ------------------------ Stato base ------------------------ */
  const [gender, setGender] = React.useState<'M'|'F'>('M')

  // Edizioni per GENERE
  const { data: edRes, mutate: refetchEd } = useSWR(
    `/api/ranking/editions?gender=${gender}`, fetcher, { revalidateOnFocus:false }
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
  const [stageId, setStageId] = React.useState('')
  React.useEffect(()=>{ 
    if (stages.length && !stageId) setStageId(stages[0].id)
    if (!stages.length) setStageId('')
  },[stages, stageId])

  const { data: totRes, mutate: refetchTotals } = useSWR(
    editionId ? `/api/ranking/totals?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const totals: Tot[] = totRes?.items ?? []

  /* ------------------------ TOUR (semplice e chiaro) ------------------------ */
  const [tourNameInput, setTourNameInput] = React.useState('')

  const createEdition = async () => {
    const name = tourNameInput.trim()
    if (!name) return alert('Inserisci un nome tour')
    try {
      const r = await fetch('/api/ranking/editions', {
        method:'POST', headers:{'Content-Type':'application/json'},
        // Se il backend richiede un vero tour_id, sostituisci 'GLOBAL'
        body: JSON.stringify({ tour_id: 'GLOBAL', gender, name })
      })
      if (!r.ok) throw new Error(await r.text())
      await refetchEd()
      // seleziona quello appena creato
      const ed = (editions ?? []).find(e => e.name.toLowerCase() === name.toLowerCase())
      if (ed) setEditionId(ed.id)
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
        method:'PUT', headers:{'Content-Type':'application/json'},
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
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ edition_id: editionId })
      })
      if (!r.ok) throw new Error(await r.text())
      await refetchEd()
      setEditionId('')
      setTourNameInput('')
      // pulisci viste
      await Promise.all([refetchPlayers(), refetchStages(), refetchTotals()])
    } catch (e:any) {
      alert('Errore eliminazione tour: ' + (e?.message || ''))
    }
  }

  /* ------------------------ GIOCATORI ------------------------ */
  const [playerInput, setPlayerInput] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<Player[]>([])
  const [suggestOpen, setSuggestOpen] = React.useState(false)
  // debounce ricerca players globali
  React.useEffect(()=>{
    const q = playerInput.trim()
    if (!q) { setSuggestions([]); return }
    const t = setTimeout(async ()=>{
      try {
        // opzionale: endpoint globale dei players (adegua se diverso)
        const r = await fetch(`/api/players?search=${encodeURIComponent(q)}`)
        if (!r.ok) { setSuggestions([]); return }
        const j = await r.json().catch(()=>({}))
        const items: Player[] = j?.items ?? []
        setSuggestions(items.slice(0,10))
        setSuggestOpen(true)
      } catch {
        setSuggestions([]); setSuggestOpen(false)
      }
    }, 250)
    return ()=>clearTimeout(t)
  }, [playerInput])

  const addPlayerFromText = async (display_name: string) => {
    if (!editionId || !display_name.trim()) return
    await fetch('/api/ranking/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id: editionId, display_name: display_name.trim() })
    })
    setPlayerInput(''); setSuggestions([]); setSuggestOpen(false)
    await refetchPlayers(); await refetchTotals()
  }

  const addPlayerFromCatalog = async (p: Player) => {
    if (!editionId) return
    await fetch('/api/ranking/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      // se preferisci passare solo player_id e risolvere server-side, adegua l’API
      body: JSON.stringify({ edition_id: editionId, player_id: p.player_id, display_name: p.display_name })
    })
    setPlayerInput(''); setSuggestions([]); setSuggestOpen(false)
    await refetchPlayers(); await refetchTotals()
  }

  const removePlayer = async (player_id:string) => {
    if (!editionId) return
    await fetch('/api/ranking/players', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id: editionId, player_id })
    })
    await refetchPlayers(); await refetchTotals()
  }

  /* ------------------------ TAPPE ------------------------ */
  const [stageForm, setStageForm] = React.useState({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })

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

  /* ------------------------ PIAZZAMENTI (select per giocatore) ------------------------ */
  // mappa pid -> pos ('-' | 1..N)
  const [placementsMap, setPlacementsMap] = React.useState<Record<string, string>>({})
  const selectedStage = stages.find(s => s.id === stageId)
  const maxPos = selectedStage?.total_teams ? Math.max(1, Number(selectedStage.total_teams)) : 0

  // reset mappa quando cambia stage o elenco players
  React.useEffect(()=>{
    const next: Record<string,string> = {}
    players.forEach(p => { next[p.player_id] = placementsMap[p.player_id] ?? '-' })
    setPlacementsMap(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map(p=>p.player_id).join(','), stageId])

  const setPlacement = (pid:string, value:string) => {
    setPlacementsMap(prev => ({ ...prev, [pid]: value }))
  }

  const savePlacements = async () => {
    if (!stageId) return alert('Seleziona una tappa')
    if (!maxPos)  return alert('Imposta il totale squadre della tappa')

    // costruisci lista ordinata per posizione (1..N), ignorando '-'
    const tuples = Object.entries(placementsMap)
      .filter(([,v]) => v && v !== '-')
      .map(([pid, v]) => ({ pid, pos: Number(v) }))
      .filter(x => Number.isFinite(x.pos) && x.pos >= 1 && x.pos <= maxPos)

    // ordina per posizione
    tuples.sort((a,b)=> a.pos - b.pos)

    // estrai l’array solo dei player_id, in ordine
    const orderedPlayerIds = tuples.map(t => t.pid)

    const r = await fetch('/api/ranking/stage/placements', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stage_id: stageId, placements: orderedPlayerIds })
    })
    if (!r.ok) return alert('Errore salvataggio piazzamenti: ' + await r.text())
    await refetchTotals()
    alert('Piazzamenti salvati')
  }

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

      {/* TOUR: select + azioni chiare */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Tour</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-80" value={editionId} onChange={e=>setEditionId(e.target.value)}>
            <option value="">— seleziona —</option>
            {editions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input className="input w-72" placeholder="Nome tour (per creare/rinominare)" value={tourNameInput} onChange={e=>setTourNameInput(e.target.value)} />
          <button className="btn" onClick={createEdition}>Crea</button>
          <button className="btn" onClick={renameEdition} disabled={!editionId}>Rinomina</button>
          <button className="btn" onClick={deleteEdition} disabled={!editionId}>Elimina</button>
        </div>
        <div className="text-xs text-neutral-500">Suggerimento: crea il tour, selezionalo nella select, poi rinominalo se serve.</div>
      </div>

      {/* GIOCATORI */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Giocatori (tour selezionato)</div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-96" placeholder="Cerca o scrivi nome giocatore…" value={playerInput} onChange={e=>setPlayerInput(e.target.value)} onFocus={()=>setSuggestOpen(true)} />
            <button className="btn" onClick={()=>addPlayerFromText(playerInput)} disabled={!editionId || !playerInput.trim()}>Aggiungi come testo</button>
          </div>
          {suggestOpen && suggestions.length>0 && (
            <div className="absolute z-20 mt-1 w-96 bg-neutral-900 border border-neutral-800 rounded-xl max-h-60 overflow-auto shadow-lg">
              {suggestions.map(p=>(
                <button key={p.player_id} className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-800"
                        onClick={()=>addPlayerFromCatalog(p)}>
                  {p.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-64 overflow-auto border border-neutral-800 rounded-xl p-2 mt-2">
          {players.length===0 ? <div className="text-sm text-neutral-400">Nessun giocatore.</div> : (
            <table className="w-full text-sm"><tbody>
              {players.map(p=>(
                <tr key={p.player_id} className="border-b border-neutral-800">
                  <td className="py-1 pr-2">{p.display_name}</td>
                  <td className="py-1 text-right">
                    <button className="btn btn-sm" onClick={()=>removePlayer(p.player_id)}>Rimuovi</button>
                  </td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {/* TAPPE */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Tappe</div>
        <div className="grid gap-2 sm:grid-cols-6">
          <input className="input" placeholder="Nome tappa" value={stageForm.name} onChange={e=>setStageForm(s=>({...s, name:e.target.value}))}/>
          <input className="input" placeholder="Giorno"      value={stageForm.day} onChange={e=>setStageForm(s=>({...s, day:e.target.value}))}/>
          <input className="input" placeholder="Mese"        value={stageForm.month} onChange={e=>setStageForm(s=>({...s, month:e.target.value}))}/>
          <input className="input" placeholder="Moltiplicatore" value={stageForm.multiplier} onChange={e=>setStageForm(s=>({...s, multiplier:e.target.value}))}/>
          <input className="input" placeholder="Totale squadre" value={stageForm.total_teams} onChange={e=>setStageForm(s=>({...s, total_teams:e.target.value}))}/>
          <button className="btn" onClick={addStage} disabled={!editionId}>Aggiungi tappa</button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <select className="input w-96" value={stageId} onChange={e=>setStageId(e.target.value)}>
            <option value="">— seleziona tappa —</option>
            {stages.map(s=>(
              <option key={s.id} value={s.id}>
                {s.name} — {String(s.day).padStart(2,'0')}/{String(s.month).padStart(2,'0')} · x{Number(s.multiplier).toFixed(2)} · {s.total_teams} sq
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PIAZZAMENTI: select per giocatore */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Piazzamenti tappa</div>
          <button className="btn" onClick={savePlacements} disabled={!stageId || !players.length}>Salva piazzamenti</button>
        </div>
        {!stageId ? (
          <div className="text-sm text-neutral-400">Seleziona una tappa.</div>
        ) : (
          <div className="max-h-80 overflow-auto border border-neutral-800 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase opacity-70">
                <tr>
                  <th className="text-left">Giocatore</th>
                  <th className="text-right w-40">Posizione</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p=>(
                  <tr key={p.player_id} className="border-t border-neutral-800">
                    <td className="py-1 pr-2 truncate">{p.display_name}</td>
                    <td className="py-1 text-right">
                      <select
                        className="input w-28"
                        value={placementsMap[p.player_id] ?? '-'}
                        onChange={e=>setPlacement(p.player_id, e.target.value)}
                      >
                        <option value="-">-</option>
                        {Array.from({length: maxPos}, (_,i)=>i+1).map(n=>(
                          <option key={n} value={String(n)}>{n}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-neutral-500">Le posizioni duplicate sono permesse in input, ma in salvataggio si usa l’ordine 1..N crescente e si ignorano i “-”.</div>
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
                <th className="text-right w-28">Punti tappe</th>
                <th className="text-right w-24">Δ</th>
                <th className="text-right w-28">Totale</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((r,i)=>(
                <tr key={r.player_id} className="border-t border-neutral-800">
                  <td className="py-1">{i+1}</td>
                  <td className="py-1 truncate">{r.display_name}</td>
                  <td className="py-1 text-right">{Number(r.points_from_stages||0).toFixed(2)}</td>
                  <td className="py-1 text-right">{Number(r.delta_points||0).toFixed(2)}</td>
                  <td className="py-1 text-right font-semibold">{Number(r.total_points||0).toFixed(2)}</td>
                </tr>
              ))}
              {totals.length===0 && <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Nessun dato</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
