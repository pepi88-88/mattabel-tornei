'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import type { Bracket } from './BracketCanvas'

type Side = 'A' | 'B' | undefined
type Winners = Record<string, Record<string, Side>>
type Placement = { local?: number; total?: number; category?: string; frozen?: boolean }
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


function computeRankingGroups(brackets: Bracket[], winnersById: Winners, resolveToken:(s:string)=>string, overrides:Overrides) {
    const categoryInputs = brackets.map((bracket, index) => ({
      bracket, index, ...categoryProposal(bracket,winnersById[bracket.id] || {},resolveToken)
    }))
    // Exactly one team per EVENT: the lowest bracket it actually entered wins.
    const unique = new Map<string,{team:string;sourceId:string;inputOrder:number}>()
    // An explicitly saved snapshot is frozen until the operator presses
    // Rigenera. New results must not silently change the list or its ranks.
    const frozen=Object.values(overrides).some(category =>
      Object.values(category).some(value=>value.frozen===true))
    if(frozen){
      for(const cat of categoryInputs){
        for(const [team,value] of Object.entries(overrides[cat.bracket.id]||{})){
          if(value.frozen!==true)continue
          unique.set(team,{team,sourceId:cat.bracket.id,inputOrder:unique.size})
        }
      }
    }else{
      for (const cat of categoryInputs) cat.teams.forEach((team,index) =>
        unique.set(team,{team,sourceId:cat.bracket.id,inputOrder:index}))
      // Old hand-edited standings can contain teams whose bracket slots were
      // later modified. Keep those teams visible until an explicit regenerate.
      for(const cat of categoryInputs)for(const team of Object.keys(overrides[cat.bracket.id]||{})){
        if(!unique.has(team))unique.set(team,{team,sourceId:cat.bracket.id,inputOrder:unique.size})
      }
    }
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
      // Stable provisional rank is determined BEFORE manual edits.
      // Editing one team's position must NEVER renumber another team.
      const base=entries.slice().sort((a,b)=>(a.auto??999)-(b.auto??999)
        ||a.inputOrder-b.inputOrder||a.team.localeCompare(b.team))
      const rows=base.map((entry,index)=>({
        ...entry,categoryId:cat.bracket.id,
        local:entry.edit.local??entry.auto??index+1,
        provisional:entry.edit.local==null&&entry.auto==null,
        total:0
      }))
      // Reorder rows only after the edit is committed (onBlur).
      rows.sort((a,b)=>a.local-b.local||a.inputOrder-b.inputOrder||a.team.localeCompare(b.team))
      // Competition ranks: if two teams are 3rd, both have total rank 3;
      // next bracket starts after all entrants (e.g. 5th for four teams).
      for(const row of rows){
        row.total=offset+rows.filter(other=>other.local<row.local).length+1
      }
      offset+=rows.length
      return {...cat,rows}
    })
}

export default function BracketRankings({
  brackets, winnersById, tourId, tId, resolveToken, onClose, selection, floating = false, readOnly = false, loading = false, loadError = '',
}: {
  brackets: Bracket[]
  winnersById: Winners
  tourId: string
  tId: string
  resolveToken: (s: string) => string
  onClose: () => void
  selection?: ReactNode
  floating?: boolean
  readOnly?: boolean
  loading?: boolean
  loadError?: string
}) {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [drafts, setDrafts] = useState<Record<string,string>>({})
  const [regenerating,setRegenerating] = useState(false)
  const [panelPosition,setPanelPosition] = useState<{x:number;y:number}|null>(null)
  const drag = useRef<{x:number;y:number;left:number;top:number}|null>(null)
  const panelRef = useRef<HTMLElement|null>(null)
  const startDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    if(!floating || event.button!==0 || (event.target as HTMLElement).closest('button,input,select'))return
    const rect=panelRef.current?.getBoundingClientRect()
    if(!rect)return
    drag.current={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top}
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    if(!drag.current)return
    const width=panelRef.current?.offsetWidth||600
    const height=panelRef.current?.offsetHeight||450
    setPanelPosition({
      x:Math.max(0,Math.min(window.innerWidth-width,drag.current.left+event.clientX-drag.current.x)),
      y:Math.max(0,Math.min(window.innerHeight-Math.min(height,80),drag.current.top+event.clientY-drag.current.y))
    })
  }
  const endDrag=(event:ReactPointerEvent<HTMLElement>)=>{
    drag.current=null
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
  }


  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setDrafts({})
    setMessage('')
    setOverrides({})
    setDirty(false)
    setFreshData(null)
    if (!tId) return () => { cancelled = true }
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

  const [freshData,setFreshData] = useState<{brackets:Bracket[];winners:Winners}|null>(null)
  const effectiveBrackets=freshData?.brackets||brackets
  const effectiveWinners=freshData?.winners||winnersById
  const groups=useMemo(()=>computeRankingGroups(effectiveBrackets,effectiveWinners,resolveToken,overrides),
    [effectiveBrackets,effectiveWinners,resolveToken,overrides])
  const fullSnapshot=(computed:ReturnType<typeof computeRankingGroups>):Overrides=>{
    const result:Overrides={}
    for(const cat of computed)for(const row of cat.rows){
      result[row.sourceId]??={}
      result[row.sourceId][row.team]={
        local:row.local,
        frozen:true,
        ...(row.categoryId!==row.sourceId?{category:row.categoryId}:{})
      }
    }
    return result
  }

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
        ...(prev[sourceId]||{}),[team]:{...(prev[sourceId]?.[team]||{}),category:target}
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
        body: JSON.stringify({ tournament_id: tId, rankingOverrides: fullSnapshot(groups) })
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Salvataggio classifica non riuscito')
      setOverrides(fullSnapshot(groups))
      setDirty(false)
      setMessage('Classifica congelata e salvata. Usa Rigenera per ripartire dai risultati più recenti.')
    } catch (error: any) {
      setMessage(error?.message || 'Errore di salvataggio')
    } finally {
      setSaving(false)
    }
  }
  const regenerate=async()=>{
    if(!loaded || saving || regenerating || readOnly)return
    if(!window.confirm('Rigenerare la classifica dai risultati attuali? Le posizioni e i trasferimenti manuali salvati verranno sostituiti. I tabelloni e la classifica stagionale NON cambiano.'))return
    setRegenerating(true);setMessage('')
    try{
      // Get the latest bracket winners, not the snapshot from when the panel opened.
      const response=await fetch('/api/brackets/state?tournament_id='+encodeURIComponent(tId),{
        cache:'no-store',headers:{'x-role':'admin'}
      })
      const data=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(data.error||'Impossibile aggiornare i risultati')
      const state=data.state||{}
      const latestBrackets=Array.isArray(state)?state:(state.items||[])
      const latestWinners=Array.isArray(state)?{}:(state.winnersById||{})
      if(!Array.isArray(latestBrackets)||!latestBrackets.length)throw new Error('Nessun tabellone da rigenerare')
      const proposal=computeRankingGroups(latestBrackets,latestWinners,resolveToken,{})
      const proposedCount=proposal.reduce((sum,cat)=>sum+cat.rows.length,0)
      const previousCount=Object.values(overrides).reduce((sum,category)=>sum+
        Object.values(category).filter(row=>row.frozen===true).length,0)
      if(!proposedCount || (previousCount>proposedCount)){
        throw new Error('Rigenerazione non eseguita: non tutte le squadre risultano risolte ('+
          proposedCount+' su '+previousCount+' già salvate). Completa i risultati oppure verifica i riferimenti tra tabelloni.')
      }
      const next=fullSnapshot(proposal)
      const saved=await fetch('/api/brackets/rankings',{
        method:'PATCH',
        headers:{'Content-Type':'application/json','x-role':'admin'},
        body:JSON.stringify({tournament_id:tId,rankingOverrides:next})
      })
      const json=await saved.json().catch(()=>({}))
      if(!saved.ok||!json.ok)throw new Error(json.error||'Rigenerazione non salvata')
      setFreshData({brackets:latestBrackets,winners:latestWinners})
      setDrafts({})
      setOverrides(next)
      setDirty(false)
      setMessage('Classifica rigenerata e salvata dai risultati attuali.')
    }catch(error:any){
      setMessage(error?.message||'Errore: la vecchia classifica non è stata sostituita')
    }finally{
      setRegenerating(false)
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

  return <div className={floating?'mt-rankings-overlay mt-rankings-floating-overlay':'mt-rankings-overlay'} role="presentation" onMouseDown={event => {
    if (!floating && event.target === event.currentTarget) close()
  }}>
    <section ref={panelRef} className={floating?'mt-rankings-dialog mt-rankings-floating-dialog':'mt-rankings-dialog'}
      role="dialog" aria-modal={!floating} aria-label="Classifica tabelloni"
      style={floating?{left:panelPosition?.x,top:panelPosition?.y??112,right:panelPosition?undefined:20}:undefined}>
      <header className={floating?'mt-rankings-dialog-header mt-rankings-drag-handle':'mt-rankings-dialog-header'}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div>
          <h2>{floating?'⠿ Classifica tabelloni':'Classifica tabelloni'}</h2>
          <p>{readOnly?'Solo consultazione · Non modifica i punti stagionali':'Classifica di servizio modificabile · Indipendente dai punti stagionali'}</p>
        </div>
        <button type="button" className="btn" onClick={close} aria-label="Chiudi classifica">✕</button>
      </header>
      {selection && <div className="mt-rankings-selector-bar">{selection}</div>}
      <div className="mt-rankings-dialog-actions">
        {!readOnly && <button type="button" className="btn mt-rankings-regenerate"
          onClick={regenerate} disabled={!loaded||saving||regenerating}>
          {regenerating?'Rigenerazione…':'↻ Rigenera classifica'}
        </button>}
        <button type="button" className="btn" onClick={() => {
          navigator.clipboard?.writeText(textForSocial).then(
            () => setMessage('Classifica copiata negli appunti.'),
            () => setMessage('Copia non disponibile in questo browser.')
          )
        }}>Copia lista per social</button>
        {!readOnly && <button type="button" className="btn" onClick={save} disabled={!loaded || !dirty || saving}>
          {saving ? 'Salvataggio…' : 'Salva classifica'}
        </button>}
      </div>
      <div className="mt-rankings-dialog-scroll">
        {loading || !tId || !loaded || !!loadError ? <p role="status" className="p-4 text-sm text-amber-400">{loadError || message || (loading || tId ? 'Caricamento classifica…' : 'Seleziona un torneo e una tappa aperta.')}</p> : <>
          {groups.map(group => <section className="mt-rankings-group" key={group.bracket.id}>
            <div className="mt-rankings-group-heading" style={{ borderLeftColor: group.bracket.color }}>
              <strong>L{group.index + 1} · {group.bracket.title.toUpperCase()}</strong>
              <small>{group.rows.length} squadre</small>
            </div>
            {group.rows.length===0 && <p className="p-2 text-xs">Nessuna coppia in questa categoria.</p>}
            <div className="mt-rankings-lines">
              {group.rows.map(row => <div className="mt-rankings-line" key={row.sourceId+'/'+row.team}>
                <span className="mt-rankings-overall" title="Posizione totale, calcolata automaticamente">{row.total}°</span>
                {readOnly
                  ? <span className="mt-rankings-place-readonly" title="Piazzamento del tabellone">{row.local}°</span>
                  : <input type="text" inputMode="numeric" pattern="[0-9]*"
                    className="input mt-rankings-place"
                    aria-label={'Posizione ' + group.bracket.title + ': ' + row.team}
                    value={drafts[editKey(row.sourceId,row.team)] ?? String(row.local)}
                    onChange={event=>setDrafts(prev=>({...prev,[editKey(row.sourceId,row.team)]:event.target.value.replace(/[^0-9]/g,'').slice(0,4)}))}
                    onBlur={()=>commitNumber(row.sourceId,row.team,row.local)}
                    onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur()}}
                  />}
                <span className="mt-rankings-name">
                  {row.team}{row.provisional && <small>provvisoria</small>}
                </span>
                {readOnly
                  ? <span className="mt-rankings-category-readonly">L{group.index+1}</span>
                  : <select className="input mt-rankings-move" aria-label={'Sposta '+row.team+' in categoria'}
                    title="Cambia tabellone nella classifica"
                    value={row.categoryId}
                    onChange={event=>transfer(row.sourceId,row.team,event.target.value)}>
                    {brackets.map((bracket,i)=><option key={bracket.id} value={bracket.id}>
                      L{i+1} · {bracket.title}
                    </option>)}
                  </select>}
              </div>)}
              {Array.from({length:Math.min(64,Math.max(0,(group.bracket.nTeams||0)-group.rows.length))},(_,index)=>(
                <div className="mt-rankings-line mt-rankings-missing-line" key={'missing-'+group.bracket.id+'-'+index}>
                  <span className="mt-rankings-overall">—</span>
                  <span className="mt-rankings-place-readonly">—</span>
                  <span className="mt-rankings-name">Squadra da determinare <small>in attesa dei risultati</small></span>
                  <span className="mt-rankings-category-readonly">L{group.index+1}</span>
                </div>
              ))}
            </div>
          </section>)}
          <p className="mt-rankings-note">
            {readOnly
              ? 'Vista di consultazione: per correggere e rigenerare i piazzamenti usa Risultati → Tabellone.'
              : 'A sinistra la posizione totale automatica. Modifica soltanto il numero della coppia desiderata: gli altri rimangono invariati, anche in caso di pari merito.'}
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
