'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Bracket } from './BracketCanvas'

type Side = 'A' | 'B' | undefined
type Winners = Record<string, Record<string, Side>>
type Placement = { local?: number; total?: number }
type Overrides = Record<string, Record<string, Placement>>
type Row = {
  bracketId: string
  title: string
  team: string
  autoLocal: number | null
  local: number | null
  total: number | null
  localEdited: boolean
  totalEdited: boolean
}
const validTeam = (name: string) => {
  const text = name.trim()
  return !!text && !/^(?:[-—?]|BYE|Slot\s+\d+|(?:Winner|Loser|Vincente|Perdente)\b.*|[A-Z]\d{1,2}|\d+)$/i.test(text)
}
const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it-IT')
const LETTERS = ['R','Z','Y','X','W','V','U']
const pow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p }

function categoryProposal(
  bracket: Bracket,
  winners: Record<string, Side>,
  resolve: (t: string) => string
) {
  const nameFor = (token: string) => {
    const name = resolve(String(token || '')) || String(token || '')
    return validTeam(name) ? normal(name) : ''
  }
  const participants = new Set<string>()
  const inputMatches = [...(bracket.prelims || []), ...(bracket.r1 || [])]
  for (const match of inputMatches) {
    for (const token of [match.A, match.B]) {
      const name = nameFor(token)
      if (name) participants.add(name)
    }
  }
  for (const token of bracket.slots || []) {
    const name = nameFor(token)
    if (name) participants.add(name)
  }
  const assigned = new Map<string,number>()
  // Solo la singola eliminazione classica ha una proposta deterministica
  // indipendente da ripescaggi e schemi particolari.
  if (bracket.type === 'SE') {
    const rounds = Math.log2(pow2(Math.max(bracket.nTeams || 2, 2)))
    let previous: Array<{ winner: string; loser: string }> = []
    let semiLosers: string[] = []
    for (let round = 1; round <= rounds; round++) {
      const count = pow2(bracket.nTeams || 2) / Math.pow(2,round)
      const result: Array<{winner:string;loser:string}> = []
      for (let i=0;i<count;i++) {
        const code = (LETTERS[round-1] || 'R') + (i+1)
        const a = round === 1 ? nameFor(bracket.r1?.[i]?.A || '') : (previous[i*2]?.winner || '')
        const b = round === 1 ? nameFor(bracket.r1?.[i]?.B || '') : (previous[i*2+1]?.winner || '')
        const side = winners[code]
        const winner = a && b && side ? (side === 'A' ? a : b) : ''
        const loser = a && b && side ? (side === 'A' ? b : a) : ''
        if (loser) assigned.set(loser, Math.pow(2, rounds-round) + 1)
        result.push({winner,loser})
      }
      if (round === rounds-1) semiLosers = result.map(item=>item.loser).filter(Boolean)
      previous = result
    }
    if (previous[0]?.winner) assigned.set(previous[0].winner,1)
    if (rounds >= 2 && semiLosers.length === 2 && winners.THIRD) {
      const third = winners.THIRD === 'A' ? semiLosers[0] : semiLosers[1]
      const fourth = winners.THIRD === 'A' ? semiLosers[1] : semiLosers[0]
      if (third) assigned.set(third,3)
      if (fourth) assigned.set(fourth,4)
    }
  }
  return {
    teams: Array.from(participants),
    places: assigned,
  }
}

export default function BracketRankings({
  brackets, winnersById, tourId, tId, resolveToken,
}: {
  brackets: Bracket[]
  winnersById: Winners
  tourId: string
  tId: string
  resolveToken: (s: string) => string
}) {
  const [overrides,setOverrides] = useState<Overrides>({})
  const [loaded,setLoaded] = useState(false)
  const [dirty,setDirty] = useState(false)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [show,setShow] = useState(false)

  useEffect(()=>{
    let cancelled = false
    setLoaded(false);setShow(false);setDirty(false);setMessage('');setOverrides({})
    if (!tId) return
    fetch('/api/brackets/state?tournament_id='+encodeURIComponent(tId),{
      headers:{'x-role':'admin'},cache:'no-store'
    }).then(async response => {
      if (!response.ok) throw new Error('Caricamento classifica fallito')
      return response.json()
    }).then(json=>{
      if(cancelled)return
      const value = json?.state?.rankingOverrides
      setOverrides(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
      setLoaded(true)
    }).catch(()=>{
      if(cancelled)return
      setMessage('Impossibile caricare la classifica. Ricarica la pagina prima di modificarla.')
    })
    return ()=>{cancelled=true}
  },[tId])

  const categories = useMemo(()=>{
    const proposed = brackets.map((bracket,index)=>({
      bracket,index,...categoryProposal(bracket,winnersById[bracket.id] || {},resolveToken)
    }))
    // Se una coppia è passata a un tabellone inferiore, figura SOLO
    // nel tabellone di livello finale, non anche nella categoria superiore.
    return proposed.map((cat,index)=>{
      const movedDown = new Set(proposed.slice(index+1).flatMap(c=>c.teams))
      return {...cat, teams:cat.teams.filter(team=>!movedDown.has(team))}
    })
  },[brackets,winnersById,resolveToken])

  const categoriesWithRows = useMemo(()=>{
    let consumed = 0
    return categories.map(cat=>{
      const rows = cat.teams.map(team=>{
        const edit = overrides[cat.bracket.id]?.[team] || {}
        const autoLocal = cat.places.get(team) || null
        const local = edit.local ?? autoLocal
        return {
          bracketId:cat.bracket.id,
          title:cat.bracket.title,
          team,autoLocal,local,total:null,
          localEdited:edit.local != null,totalEdited:edit.total != null,
        } as Row
      })
      // Posizioni ex aequo non giocati mantengono lo stesso numero (es. 3° pari).
      const ranked = rows.filter(row=>row.local != null)
        .sort((a,b)=>(a.local! - b.local!) || a.team.localeCompare(b.team))
      let lastLocal = -1, lastTotal = -1
      for(let index=0;index<ranked.length;index++){
        const row=ranked[index]
        if(row.local !== lastLocal){lastLocal=row.local!;lastTotal=consumed+index+1}
        row.total=lastTotal
      }
      consumed += rows.length
      for(const row of rows){
        const globalOverride=overrides[cat.bracket.id]?.[row.team]?.total
        if(globalOverride != null) row.total=globalOverride
      }
      return {...cat, rows}
    })
  },[categories,overrides])

  const change = (bracketId:string,team:string,kind:'local'|'total',value:string)=>{
    const num = value === '' ? undefined : Number(value)
    if(num !== undefined && (!Number.isInteger(num)||num<1||num>1024))return
    setOverrides(prev=>{
      const next={...prev}
      const category={...(next[bracketId]||{})}
      const placement={...(category[team]||{})}
      if(num === undefined)delete placement[kind]
      else placement[kind]=num
      if(Object.keys(placement).length)category[team]=placement
      else delete category[team]
      if(Object.keys(category).length)next[bracketId]=category
      else delete next[bracketId]
      return next
    })
    setDirty(true);setMessage('')
  }

  const save = async ()=>{
    if(!loaded||saving||!tId)return
    setSaving(true);setMessage('')
    try{
      const response=await fetch('/api/brackets/rankings',{
        method:'PATCH',
        headers:{'Content-Type':'application/json','x-role':'admin'},
        body:JSON.stringify({tournament_id:tId,rankingOverrides:overrides})
      })
      const json=await response.json().catch(()=>({}))
      if(!response.ok||!json.ok)throw new Error(json.error||'Salvataggio classifica fallito')
      setDirty(false);setMessage('Classifica salvata. Le posizioni manuali sono conservate.')
    }catch(error:any){setMessage(error?.message||'Errore di salvataggio')}
    finally{setSaving(false)}
  }
  const allRows=categoriesWithRows.flatMap(cat=>cat.rows)
  const known = allRows.filter(row=>row.total!=null)
    .sort((a,b)=>(a.total! - b.total!)||a.bracketId.localeCompare(b.bracketId))
  const unknown=allRows.filter(row=>row.total==null)
  const hasCollisions = new Set(known.map(row=>row.total)).size<known.length

  return <section className="mt-bracket-rankings card" aria-label="Classifica tabelloni">
    <div className="mt-bracket-rankings-heading">
      <div>
        <strong>Classifica tabelloni e classifica totale</strong>
        <p className="text-xs text-neutral-400">La categoria finale prevale sui tabelloni superiori. Le posizioni non certe restano da assegnare.</p>
      </div>
      <button type="button" className="btn" onClick={()=>setShow(x=>!x)}>{show?'Chiudi classifica':'Apri classifica'}</button>
    </div>
    {show&&<div className="mt-bracket-rankings-body">
      {!loaded?<p role="status" className="text-sm text-amber-400">{message||'Caricamento classifica…'}</p>:<>
      {categoriesWithRows.map((cat,index)=>(
        <div className="mt-bracket-rankings-category" key={cat.bracket.id}>
          <div className="mt-bracket-rankings-bar">
            <strong>L{index+1} · {cat.bracket.title}</strong>
            <span>{cat.rows.length} squadre nella categoria finale</span>
          </div>
          {cat.rows.length===0?<p className="text-sm text-neutral-400 p-2">Nessuna squadra risolta in questa categoria.</p>:
          <div className="mt-bracket-rankings-table-wrap">
            <table className="mt-bracket-rankings-table">
              <thead><tr><th>Squadra</th><th>Pos. tabellone</th><th>Pos. totale</th></tr></thead>
              <tbody>{cat.rows.map(row=>(
                <tr key={row.team}>
                  <td>{row.team}<span className="mt-ranking-proposal">{row.localEdited?'Manuale':row.autoLocal!=null?'Proposta automatica':'Da definire'}</span></td>
                  <td><input type="number" min={1} max={1024} className="input"
                    aria-label={'Posizione in '+cat.bracket.title+' per '+row.team}
                    value={row.local??''} placeholder="—"
                    onChange={e=>change(cat.bracket.id,row.team,'local',e.target.value)}/></td>
                  <td><input type="number" min={1} max={1024} className="input"
                    aria-label={'Posizione totale per '+row.team}
                    value={row.total??''} placeholder="—"
                    onChange={e=>change(cat.bracket.id,row.team,'total',e.target.value)}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
        </div>
      ))}
      <div className="mt-bracket-rankings-preview">
        <strong>Riepilogo generale della tappa</strong>
        {known.map(row=><div className="mt-bracket-rankings-final-row" key={row.bracketId+'-'+row.team}>
          <strong>{row.total}°</strong><span>{row.team}</span><small>{row.title}</small>
        </div>)}
        {unknown.length>0&&<p className="text-xs text-amber-300">Da definire: {unknown.length} {unknown.length===1?'squadra':'squadre'}.</p>}
        {hasCollisions&&<p className="text-xs text-amber-300">Alcune squadre hanno la stessa posizione totale: verifica se è un pari merito intenzionale.</p>}
      </div>
      <div className="mt-bracket-rankings-footer">
        <button type="button" className="btn" onClick={save} disabled={!dirty||saving}>{saving?'Salvataggio…':'Salva classifica'}</button>
        <button type="button" className="btn" onClick={()=>{setOverrides({});setDirty(true);setMessage('Proposte automatiche ripristinate: salva per confermare.')}}>Ripristina proposta automatica</button>
        <small>{dirty?'Modifiche da salvare':message||'Nessuna modifica da salvare'}</small>
      </div>
      </>}
    </div>}
  </section>
}
