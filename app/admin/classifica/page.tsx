'use client'

import * as React from 'react'
import useSWR from 'swr'

type Edition = { id: string; name: string }
type Player  = { player_id: string; display_name: string }
type Stage   = { id: string; name: string; day: number; month: number; multiplier: number; total_teams: number }
type Tot     = { player_id: string; display_name: string; points_from_stages: number; delta_points: number; total_points: number }

const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null)
const asNum = (v: any, d=0) => Number.isFinite(Number(v)) ? Number(v) : d

/* -------------------- TourControl (combobox Tour) -------------------- */
function TourControl({
  gender,
  editions,
  editionId,
  onChangeEditionId,
  refetchEditions,
}: {
  gender: 'M'|'F',
  editions: {id:string; name:string}[],
  editionId: string,
  onChangeEditionId: (id:string)=>void,
  refetchEditions: ()=>Promise<any>,
}) {
  const [text, setText] = React.useState('')
  const [open, setOpen] = React.useState(false)

  React.useEffect(()=>{
    const cur = editions.find(e=>e.id===editionId)
    setText(cur?.name || '')
  }, [editionId, editions])

  const matchByName = (name:string) =>
    editions.find(e => e.name.trim().toLowerCase() === name.trim().toLowerCase())

  const selectByName = (name:string) => {
    const m = matchByName(name)
    if (m) onChangeEditionId(m.id)
  }

  const save = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const existing = matchByName(trimmed)

    // se esiste già: seleziona
    if (existing) { onChangeEditionId(existing.id); return }

    // se ho un id selezionato e il nome è diverso -> rinomina
    if (editionId) {
      await fetch('/api/ranking/editions', {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ edition_id: editionId, name: trimmed })
      })
      await refetchEditions()
      selectByName(trimmed)
      return
    }

    // altrimenti crea (se il tuo endpoint richiede tour_id, usa un default es. "GLOBAL")
    await fetch('/api/ranking/editions', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tour_id: 'GLOBAL', gender, name: trimmed })
    })
    await refetchEditions()
    selectByName(trimmed)
  }

  const del = async () => {
    if (!editionId) return
    const cur = editions.find(e=>e.id===editionId)
    if (!cur) return
    if (!confirm(`Eliminare il tour “${cur.name}”?\n⚠️ Verranno rimossi anche giocatori, tappe e risultati collegati.`)) return
    await fetch('/api/ranking/editions', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id: editionId })
    })
    await refetchEditions()
    onChangeEditionId('')
    setText('')
  }

  const filtered = editions
    .filter(e => e.name.toLowerCase().includes(text.trim().toLowerCase()))
    .slice(0, 12)

  return (
    <div className="card p-4 space-y-2">
      <div className="text-sm font-semibold">Tour</div>

      <div className="relative">
        <input
          className="input w-full"
          placeholder="Scrivi per cercare, selezionare, creare o rinominare…"
          value={text}
          onChange={e=>{ setText(e.target.value); setOpen(true) }}
          onFocus={()=>setOpen(true)}
          onKeyDown={(e)=>{
            if (e.key==='Enter') { e.preventDefault(); save() }
            if (e.key==='Escape') setOpen(false)
          }}
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl max-h-60 overflow-auto shadow-lg">
            {filtered.length===0 ? (
              <div className="px-3 py-2 text-sm text-neutral-500">
                Nessun risultato. Premi <b>Invio</b> per creare “{text.trim()}”.
              </div>
            ) : filtered.map(ed=>(
              <button
                key={ed.id}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 ${ed.id===editionId?'bg-neutral-800':''}`}
                onClick={()=>{ onChangeEditionId(ed.id); setText(ed.name); setOpen(false) }}
              >
                {ed.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button className="btn" onClick={save} disabled={!text.trim()}>Salva</button>
        <button className="btn" onClick={del} disabled={!editionId}>Elimina</button>
      </div>

      <div className="text-xs text-neutral-500">
        • Digita per <b>cercare</b> o inserisci un nome e premi <b>Salva</b> per <b>creare</b>.<br/>
        • Con un tour selezionato, cambia il testo e premi <b>Salva</b> per <b>rinominare</b>.
      </div>
    </div>
  )
}

/* --------------------------- Pagina Classifica --------------------------- */
export default function ClassificaPage() {
  // ——— header
  const [gender, setGender] = React.useState<'M'|'F'>('M')

  // ——— edizioni per GENERE (niente select Tour in alto)
  const { data: edRes, mutate: refetchEd } = useSWR(
    `/api/ranking/editions?gender=${gender}`,
    fetcher,
    { revalidateOnFocus:false }
  )
  const editions: Edition[] = edRes?.items ?? []
  const [editionId, setEditionId] = React.useState('')
  React.useEffect(() => {
    if (editions.length && !editionId) setEditionId(editions[0].id)
    if (!editions.length) setEditionId('')
  }, [editions, editionId])

  // ——— players / stages / totals
  const { data: plRes, mutate: refetchPlayers } = useSWR(
    editionId ? `/api/ranking/players?edition_id=${editionId}` : null,
    fetcher, { revalidateOnFocus:false }
  )
  const players: Player[] = plRes?.items ?? []

  const { data: stRes, mutate: refetchStages } = useSWR(
    editionId ? `/api/ranking/stages?edition_id=${editionId}` : null,
    fetcher, { revalidateOnFocus:false }
  )
  const stages: Stage[] = stRes?.items ?? []
  const [stageId, setStageId] = React.useState('')
  React.useEffect(()=>{ if(stages.length && !stageId) setStageId(stages[0].id); if(!stages.length) setStageId('') },[stages, stageId])

  const { data: totRes, mutate: refetchTotals } = useSWR(
    editionId ? `/api/ranking/totals?edition_id=${editionId}` : null,
    fetcher, { revalidateOnFocus:false }
  )
  const totals: Tot[] = totRes?.items ?? []

  // ——— forms locali
  const [newPlayer, setNewPlayer] = React.useState('')
  const [stageForm, setStageForm] = React.useState({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })

  // editor piazzamenti (ordina con ↑↓)
  const [order, setOrder] = React.useState<string[]>([])
  React.useEffect(()=>{
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
  const addPlayer = async () => {
    if(!editionId || !newPlayer.trim()) return
    await fetch('/api/ranking/players', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId, display_name:newPlayer.trim() })
    })
    setNewPlayer('')
    await refetchPlayers(); await refetchTotals()
  }

  const removePlayer = async (player_id:string) => {
    await fetch('/api/ranking/players', {
      method:'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ edition_id:editionId, player_id })
    })
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
    if(!payload.name || !payload.day || !payload.month || !payload.total_teams){
      alert('Compila nome/giorno/mese/teams')
      return
    }
    await fetch('/api/ranking/stages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })
    setStageForm({ name:'', day:'', month:'', multiplier:'1', total_teams:'8' })
    await refetchStages()
  }

  const savePlacements = async () => {
    if(!stageId) { alert('Seleziona tappa'); return }
    await fetch('/api/ranking/stage/placements', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ stage_id:stageId, placements:order })
    })
    await refetchTotals()
    alert('Piazzamenti salvati')
  }

  // ——— render
  return (
    <div className="p-6 space-y-6">
      {/* top: genere + link legenda */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl overflow-hidden border border-neutral-700">
          <button
            className={`px-3 py-2 text-sm ${gender==='M'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`}
            onClick={()=>setGender('M')}
          >Maschile</button>
          <button
            className={`px-3 py-2 text-sm ${gender==='F'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`}
            onClick={()=>setGender('F')}
          >Femminile</button>
        </div>

        <a className="btn btn-outline btn-sm ml-auto" href="/admin/classifica/legenda">
          Legenda punti
        </a>
      </div>

      {/* Tour (combobox unico) */}
      <TourControl
        gender={gender}
        editions={editions}
        editionId={editionId}
        onChangeEditionId={setEditionId}
        refetchEditions={refetchEd}
      />

      {/* giocatori */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Giocatori (tour selezionato)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-80" placeholder="Cognome e nome" value={newPlayer} onChange={e=>setNewPlayer(e.target.value)} />
          <button className="btn" onClick={addPlayer} disabled={!editionId}>Aggiungi</button>
        </div>
        <div className="max-h-64 overflow-auto border border-neutral-800 rounded-xl p-2">
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

      {/* tappe */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold">Tappe</div>
        <div className="grid gap-2 sm:grid-cols-6">
          <input className="input" placeholder="Nome tappa" value={stageForm.name}  onChange={e=>setStageForm(s=>({...s, name:e.target.value}))}/>
          <input className="input" placeholder="Giorno"      value={stageForm.day}   onChange={e=>setStageForm(s=>({...s, day:e.target.value}))}/>
          <input className="input" placeholder="Mese"        value={stageForm.month} onChange={e=>setStageForm(s=>({...s, month:e.target.value}))}/>
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

      {/* piazzamenti (ordinamento rapido) */}
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

      {/* classifica totale */}
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
              {totals.length===0 && (
                <tr><td colSpan={5} className="py-4 text-center text-neutral-500">Nessun dato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
