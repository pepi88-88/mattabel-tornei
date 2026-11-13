'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Bracket } from './BracketCanvas'

type Side = 'A' | 'B' | undefined
type Winners = Record<string, Record<string, Side>>
type Placement = { local?: number; total?: number; category?: string }
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
  brackets, winnersById, tourId, tId, resolveToken, onClose, selection,
}: {
  brackets: Bracket[]
  winnersById: Winners
  tourId: string
  tId: string
  resolveToken: (s: string) => string
  onClose: () => void
  selection?: ReactNode
}) {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [drafts, setDrafts] = useState<Record<string,string>>({})

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setDrafts({})
    fetch('/api/brackets/state?tournament_id=' + encodeURIComponent(tId), {
      headers: { 'x-role': 'admin' }, cache: 'no-store'
    }).then(async response => {
      if (!response.ok) throw new Error('Caricamento classifica fallito')
      return response.json()
    }).then(json => {
      if (cancelled) return
      const data = json?.state?.rankingOverrides
      setOverrides(data && typeof data === 'object' && !Array.isArray(data) ? data : {})
      setLoaded(true)
    }).catch(() => {
      if (!cancelled) setMessage('Impossibile leggere la classifica. Ricarica la pagina.')
    })
    return () => { cancelled = true }
  }, [tId])

  const groups = useMemo(() => {
    const categoryInputs = brackets.map((bracket, index) => ({
      bracket, index, ...categoryProposal(bracket,winnersById[bracket.id] || {},resolveToken)
    }))
    // Exactly one team per EVENT: the lowest bracket it actually entered wins.
    const unique = new Map<string,{team:string;sourceId:string;inputOrder:number}>()
    for (const cat of categoryInputs) cat.teams.forEach((team,index) =>
      unique.set(team,{team,sourceId:cat.bracket.id,inputOrder:index}))
    const buckets = new Map(brackets.map(bracket=>[bracket.id,[] as Array<{
      team:string;sourceId:string;inputOrder:number;auto:number|null;edit:Placement
    }>]))
    for (const entry of unique.values()) {
      const edit = overrides[entry.sourceId]?.[entry.team] || {}
      const target = brackets.some(b=>b.id===edit.category) ? edit.category! : entry.sourceId
      const source = categoryInputs.find(cat=>cat.bracket.id===entry.sourceId)
      buckets.get(target)?.push({
        ...entry,edit,
        auto:target===entry.sourceId?(source?.places.get(entry.team)||null):null,
      })
    }
    let offset = 0
    return categoryInputs.map(cat=>{
      const entries=buckets.get(cat.bracket.id)||[]
      // Unresolved games receive a *provisional* sequence.
      // Rank edits are applied only on blur, so editing does not jump the row.
      entries.sort((a,b)=>(a.edit.local??a.auto??999)-(b.edit.local??b.auto??999)
        ||a.inputOrder-b.inputOrder||a.team.localeCompare(b.team))
      const rows=entries.map((entry,index)=>({
        ...entry,categoryId:cat.bracket.id,
        local:entry.edit.local??entry.auto??index+1,
        provisional:entry.edit.local==null&&entry.auto==null,
        total:0
      }))
      rows.sort((a,b)=>a.local-b.local||a.inputOrder-b.inputOrder||a.team.localeCompare(b.team))
      // Competition ranks: if two teams are 3rd, both have total rank 3;
      // next bracket starts after all entrants (e.g. 5th for four teams).
      for(const row of rows){
        row.total=offset+rows.filter(other=>other.local<row.local).length+1
      }
      offset+=rows.length
      return {...cat,rows}
    })
  },[brackets,winnersById,resolveToken,overrides])

  const editKey=(sourceId:string,team:string)=>sourceId+'::'+team
  const commitNumber=(sourceId:string,team:string,current:number)=>{
    const key=editKey(sourceId,team)
    const raw=drafts[key]
    if(raw===undefined)return
    setDrafts(prev=>{const next={...prev};delete next[key];return next})
    const value=Number(raw)
    if(!raw.trim()||!Number.isInteger(value)||value<1||value>1024){
      setMessage('Inserisci un numero di posizione intero da 1 a 1024.')
      return
    }
    if(value===current)return
    setOverrides(prev=>({
      ...prev,[sourceId]:{
        ...(prev[sourceId]||{}),[team]:{
          ...(prev[sourceId]?.[team]||{}),local:value
        }
      }
    }))
    setDirty(true);setMessage('')
  }
  const transfer=(sourceId:string,team:string,target:string)=>{
    setOverrides(prev=>({
      ...prev,[sourceId]:{
        ...(prev[sourceId]||{}),[team]:{category:target}
      }
    }))
    setDrafts({})
    setDirty(true)
    setMessage('Categoria modificata solo nella classifica di servizio.')
  }

  const save = async () => {
    if (!loaded || saving || !tId) return
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/brackets/rankings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
        body: JSON.stringify({ tournament_id: tId, rankingOverrides: overrides })
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Salvataggio classifica non riuscito')
      setDirty(false)
      setMessage('Classifica salvata. Nessuna modifica alla classifica stagionale.')
    } catch (error: any) {
      setMessage(error?.message || 'Errore di salvataggio')
    } finally {
      setSaving(false)
    }
  }
  const close = () => {
    if (dirty && !window.confirm('Hai modifiche alla classifica non salvate. Vuoi uscire?')) return
    onClose()
  }
  const textForSocial=groups.map(group=>[
    'L'+(group.index+1)+' · '+group.bracket.title.toUpperCase(),
    ...group.rows.map(row=>row.total+'° totale | '+row.local+'° '+row.team)
  ].join('\n')).join('\n\n')

  return <div className="mt-rankings-overlay" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) close()
  }}>
    <section className="mt-rankings-dialog" role="dialog" aria-modal="true" aria-label="Classifica tabelloni">
      <header className="mt-rankings-dialog-header">
        <div>
          <h2>Classifica tabelloni</h2>
          <p>Provvisoria e modificabile · Indipendente dalla classifica stagionale</p>
        </div>
        <button type="button" className="btn" onClick={close} aria-label="Chiudi classifica">✕</button>
      </header>
      {selection && <div className="mt-rankings-selector-bar">{selection}</div>}
      <div className="mt-rankings-dialog-actions">
        <button type="button" className="btn" onClick={() => {
          navigator.clipboard?.writeText(textForSocial).then(
            () => setMessage('Classifica copiata negli appunti.'),
            () => setMessage('Copia non disponibile in questo browser.')
          )
        }}>Copia lista per social</button>
        <button type="button" className="btn" onClick={save} disabled={!loaded || !dirty || saving}>
          {saving ? 'Salvataggio…' : 'Salva classifica'}
        </button>
      </div>
      <div className="mt-rankings-dialog-scroll">
        {!loaded ? <p role="status" className="p-4 text-sm text-amber-400">{message || 'Caricamento classifica…'}</p> : <>
          {groups.map(group => <section className="mt-rankings-group" key={group.bracket.id}>
            <div className="mt-rankings-group-heading" style={{ borderLeftColor: group.bracket.color }}>
              <strong>L{group.index + 1} · {group.bracket.title.toUpperCase()}</strong>
              <small>{group.rows.length} squadre</small>
            </div>
            {group.rows.length===0 && <p className="p-2 text-xs">Nessuna coppia in questa categoria.</p>}
            <div className="mt-rankings-lines">
              {group.rows.map(row => <div className="mt-rankings-line" key={row.sourceId+'/'+row.team}>
                <span className="mt-rankings-overall" title="Posizione totale, calcolata automaticamente">{row.total}°</span>
                <input type="text" inputMode="numeric" pattern="[0-9]*"
                  className="input mt-rankings-place"
                  aria-label={'Posizione ' + group.bracket.title + ': ' + row.team}
                  value={drafts[editKey(row.sourceId,row.team)] ?? String(row.local)}
                  onChange={event=>setDrafts(prev=>({...prev,[editKey(row.sourceId,row.team)]:event.target.value.replace(/[^0-9]/g,'').slice(0,4)}))}
                  onBlur={()=>commitNumber(row.sourceId,row.team,row.local)}
                  onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
                />
                <span className="mt-rankings-name">
                  {row.team}{row.provisional && <small>provvisoria</small>}
                </span>
                <select className="input mt-rankings-move" aria-label={'Sposta '+row.team+' in categoria'}
                  title="Cambia tabellone nella classifica"
                  value={row.categoryId}
                  onChange={event=>transfer(row.sourceId,row.team,event.target.value)}>
                  {brackets.map((bracket,i)=><option key={bracket.id} value={bracket.id}>
                    L{i+1} · {bracket.title}
                  </option>)}
                </select>
              </div>)}
            </div>
          </section>)}
          <p className="mt-rankings-note">
            A sinistra: posizione totale automatica (pari merito in caso di uguale posizione nello stesso tabellone).
            Il numero centrale si modifica scrivendo e si riordina quando esci dal campo.
            L'ultima tendina consente di spostare una coppia tra tabelloni senza modificare le partite.
          </p>
        </>}
      </div>
      <footer className="mt-rankings-dialog-footer">
        <small role="status">{dirty ? 'Modifiche non salvate' : message || 'Classifica di servizio per staff e social'}</small>
        <button className="btn" type="button" onClick={close}>Chiudi</button>
      </footer>
    </section>
  </div>
}
