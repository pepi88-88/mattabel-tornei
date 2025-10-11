'use client'

import React, { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'

const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null)
const asNum = (v: any, d=0) => Number.isFinite(Number(v)) ? Number(v) : d

type Tour = { id: string; name: string }
type Edition = { id: string; name: string }
type Player = { player_id: string; display_name: string }
type Stage = { id: string; name: string; day: number; month: number; multiplier: number; total_teams: number }
type Tot = { player_id: string; display_name: string; points_from_stages: number; delta_points: number; total_points: number }

export default function ClassificaPage() {
  // ——— header
  const { data: toursRes } = useSWR('/api/tours', fetcher)
  const tours: Tour[] = toursRes?.items ?? []
  const [tourId, setTourId] = useState('')
  const [gender, setGender] = useState<'M'|'F'>('M')

  useEffect(()=>{ if(!tourId && tours.length) setTourId(tours[0].id) },[tours, tourId])
{/* Tour (combobox unico) */}
<TourControl
  gender={gender}
  editions={editions}
  editionId={editionId}
  onChangeEditionId={setEditionId}
  refetchEditions={refetchEd}
/>

 // ——— tour (edizioni) — fetch per GENERE soltanto
const { data: edRes, mutate: refetchEd } = useSWR(
  `/api/ranking/editions?gender=${gender}`,
  fetcher,
  { revalidateOnFocus:false }
)
const editions: Edition[] = edRes?.items ?? []
const [editionId, setEditionId] = useState('')
useEffect(() => {
  if (editions.length && !editionId) setEditionId(editions[0].id)
  if (!editions.length) setEditionId('')
}, [editions, editionId])

  // ——— players / stages / totals
  const { data: plRes, mutate: refetchPlayers } = useSWR(editionId ? `/api/ranking/players?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false })
  const players: Player[] = plRes?.items ?? []

  const { data: stRes, mutate: refetchStages } = useSWR(editionId ? `/api/ranking/stages?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false })
  const stages: Stage[] = stRes?.items ?? []
  const [stageId, setStageId] = useState('')
  useEffect(()=>{ if(stages.length && !stageId) setStageId(stages[0].id); if(!stages.length) setStageId('') },[stages, stageId])

  const { data: totRes, mutate: refetchTotals } = useSWR(editionId ? `/api/ranking/totals?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false })
  const totals: Tot[] = totRes?.items ?? []

  // ——— forms locali
  const [newEditionName, setNewEditionName] = useState('Edizione')
  const [renameEdition, setRenameEdition]   = useState('')
  const [newPlayer, setNewPlayer]           = useState('')
  const [stageForm, setStageForm] = useState({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })

  // editor piazzamenti (ordina con ↑↓)
  const [order, setOrder] = useState<string[]>([])
  useEffect(()=>{
    const sorted = [...players].sort((a,b)=>a.display_name.localeCompare(b.display_name))
    setOrder(sorted.map(p=>p.player_id))
  }, [players.map(p=>p.player_id).join(','), editionId])

  const move = (pid:string, dir:-1|1) => {
    setOrder(prev => {
      const a=[...prev]; const i=a.indexOf(pid); const j=i+dir
      if(i<0 || j<0 || j>=a.length) return prev
      ;[a[i],a[j]]=[a[j],a[i]]; return a
    })
  }

  // ——— azioni
  const createEdition = async () => {
    if (!tourId || !newEditionName.trim()) return
    await fetch('/api/ranking/editions', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tour_id:tourId, gender, name:newEditionName.trim() }) })
    setNewEditionName(''); await refetchEd()
  }
  const renameEd = async () => {
    if (!editionId || !renameEdition.trim()) return
    await fetch('/api/ranking/editions', { method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId, name:renameEdition.trim() }) })
    setRenameEdition(''); await refetchEd()
  }
  const deleteEd = async () => {
    if(!editionId || !confirm('Eliminare (archiviare) questa edizione?')) return
    await fetch('/api/ranking/editions', { method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId }) })
    setEditionId(''); await refetchEd()
  }

  const addPlayer = async () => {
    if(!editionId || !newPlayer.trim()) return
    await fetch('/api/ranking/players', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId, display_name:newPlayer.trim() }) })
    setNewPlayer(''); await refetchPlayers(); await refetchTotals()
  }
  const removePlayer = async (player_id:string) => {
    await fetch('/api/ranking/players', { method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId, player_id }) })
    await refetchPlayers(); await refetchTotals()
  }

  const addStage = async () => {
    const payload = {
      edition_id: editionId,
      name: stageForm.name.trim(),
      day: asNum(stageForm.day,0),
      month: asNum(stageForm.month,0),
      multiplier: asNum(stageForm.multiplier,1),
      total_teams: asNum(stageForm.total_teams,0),
    }
    if(!payload.name || !payload.day || !payload.month || !payload.total_teams){ alert('Compila nome/giorno/mese/teams'); return }
    await fetch('/api/ranking/stages', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    setStageForm({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })
    await refetchStages()
  }

  const savePlacements = async () => {
    if(!stageId) { alert('Seleziona tappa'); return }
    await fetch('/api/ranking/stage/placements', { method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stage_id:stageId, placements:order }) })
    await refetchTotals()
    alert('Piazzamenti salvati')
  }

  // ——— render (stile semplice)
  return (
    <div className="p-6 space-y-6">
      {/* top: tour/genere */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-neutral-400 mb-1">Tour</div>
          <select className="input w-64" value={tourId} onChange={e=>setTourId(e.target.value)}>
            {tours.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs text-neutral-400 mb-1">Genere</div>
          <div className="inline-flex rounded-xl overflow-hidden border border-neutral-700">
            <button className={`px-3 py-2 text-sm ${gender==='M'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`} onClick={()=>setGender('M')}>Maschile</button>
            <button className={`px-3 py-2 text-sm ${gender==='F'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`} onClick={()=>setGender('F')}>Femminile</button>
          </div>
        </div>
      </div>

      {/* edizioni */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Edizioni</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-72" value={editionId} onChange={e=>setEditionId(e.target.value)}>
            <option value="">— seleziona —</option>
            {editions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input className="input w-56" placeholder="Nuova edizione" value={newEditionName} onChange={e=>setNewEditionName(e.target.value)} />
          <button className="btn" onClick={createEdition} disabled={!tourId}>Crea</button>
          <input className="input w-56" placeholder="Rinomina…" value={renameEdition} onChange={e=>setRenameEdition(e.target.value)} />
          <button className="btn" onClick={renameEd} disabled={!editionId}>Rinomina</button>
          <button className="btn" onClick={deleteEd} disabled={!editionId}>Elimina</button>
        </div>
      </div>

      {/* giocatori */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Giocatori (edizione)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-80" placeholder="Cognomi / Coppia" value={newPlayer} onChange={e=>setNewPlayer(e.target.value)} />
          <button className="btn" onClick={addPlayer} disabled={!editionId}>Aggiungi</button>
        </div>
        <div className="max-h-64 overflow-auto border border-neutral-800 rounded-xl p-2">
          {players.length===0 ? <div className="text-sm text-neutral-400">Nessun giocatore.</div> : (
            <table className="w-full text-sm"><tbody>
              {players.map(p=>(
                <tr key={p.player_id} className="border-b border-neutral-800">
                  <td className="py-1 pr-2">{p.display_name}</td>
                  <td className="py-1 text-right"><button className="btn btn-sm" onClick={()=>removePlayer(p.player_id)}>Rimuovi</button></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      {/* tappe */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Tappe</div>
        <div className="grid gap-2 sm:grid-cols-6">
          <input className="input" placeholder="Nome tappa" value={stageForm.name} onChange={e=>setStageForm(s=>({...s, name:e.target.value}))}/>
          <input className="input" placeholder="Giorno" value={stageForm.day} onChange={e=>setStageForm(s=>({...s, day:e.target.value}))}/>
          <input className="input" placeholder="Mese" value={stageForm.month} onChange={e=>setStageForm(s=>({...s, month:e.target.value}))}/>
          <input className="input" placeholder="Moltiplicatore" value={stageForm.multiplier} onChange={e=>setStageForm(s=>({...s, multiplier:e.target.value}))}/>
          <input className="input" placeholder="Totale squadre" value={stageForm.total_teams} onChange={e=>setStageForm(s=>({...s, total_teams:e.target.value}))}/>
          <button className="btn" onClick={addStage} disabled={!editionId}>Aggiungi tappa</button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <select className="input w-72" value={stageId} onChange={e=>setStageId(e.target.value)}>
            <option value="">— seleziona tappa —</option>
            {stages.map(s=>(
              <option key={s.id} value={s.id}>
                {s.name} — {String(s.day).padStart(2,'0')}/{String(s.month).padStart(2,'0')} · x{Number(s.multiplier).toFixed(2)} · {s.total_teams} sq
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* piazzamenti */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Piazzamenti tappa</div>
          <button className="btn" onClick={savePlacements} disabled={!stageId || order.length===0}>Salva piazzamenti</button>
        </div>
        <div className="max-h-80 overflow-auto border border-neutral-800 rounded-xl">
          {order.map((pid,i)=>{
            const p = players.find(x=>x.player_id===pid); if(!p) return null
            return (
              <div key={pid} className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 text-right">{i+1}</div>
                  <div className="truncate max-w-[260px]">{p.display_name}</div>
                </div>
                <div className="flex gap-1">
                  <button className="btn btn-sm" onClick={()=>move(pid,-1)}>↑</button>
                  <button className="btn btn-sm" onClick={()=>move(pid,+1)}>↓</button>
                </div>
              </div>
            )
          })}
          {order.length===0 && <div className="p-3 text-sm text-neutral-400">Aggiungi giocatori, poi seleziona la tappa.</div>}
        </div>
      </div>

      {/* classifica */}
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
