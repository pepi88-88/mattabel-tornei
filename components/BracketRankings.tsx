'use client'
import { useEffect, useMemo, useState } from 'react'
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
  brackets, winnersById, tourId, tId, resolveToken, onClose,
}: {
  brackets: Bracket[]
  winnersById: Winners
  tourId: string
  tId: string
  resolveToken: (s: string) => string
  onClose: () => void
}) {
  const [overrides, setOverrides] = useState<Overrides>({})
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [compact, setCompact] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
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
      bracket, index, ...categoryProposal(bracket, winnersById[bracket.id] || {}, resolveToken)
    }))
    // Same team in multiple brackets belongs to its last (lowest) category.
    // Manual transfer is an override of the EVENT RANKING only: the bracket
    // matches, live results and seasonal ranking remain unchanged.
    const unique = new Map<string, { team: string; sourceId: string; inputOrder: number }>()
    for (const source of categoryInputs) {
      source.teams.forEach((team, index) => {
        unique.set(team, { team, sourceId: source.bracket.id, inputOrder: index })
      })
    }
    const byCategory = new Map(brackets.map(bracket => [bracket.id, [] as Array<{
      team: string; sourceId: string; inputOrder: number; auto: number | null;
      edit: Placement
    }>]))
    for (const entry of unique.values()) {
      const edit = overrides[entry.sourceId]?.[entry.team] || {}
      const target = brackets.some(b => b.id === edit.category) ? edit.category! : entry.sourceId
      const source = categoryInputs.find(cat => cat.bracket.id === entry.sourceId)
      byCategory.get(target)?.push({
        ...entry, edit,
        auto: target === entry.sourceId ? (source?.places.get(entry.team) || null) : null,
      })
    }
    let offset = 0
    return categoryInputs.map(source => {
      const items = byCategory.get(source.bracket.id) || []
      items.sort((a,b) => {
        const rankA = a.edit.local ?? a.auto ?? 999
        const rankB = b.edit.local ?? b.auto ?? 999
        return rankA - rankB || a.inputOrder - b.inputOrder || a.team.localeCompare(b.team)
      })
      const rows = items.map((item, index) => ({
        ...item,
        categoryId: source.bracket.id,
        local: item.edit.local ?? index + 1,
        total: item.edit.total ?? offset + index + 1,
        provisional: item.edit.local == null && item.auto == null,
      }))
      offset += rows.length
      return { ...source, rows }
    })
  }, [brackets, winnersById, resolveToken, overrides])

  const modify = (sourceId: string, team: string, patch: Partial<Placement>) => {
    setOverrides(prev => {
      const next = { ...prev }
      const current = { ...(next[sourceId] || {}) }
      const edited = { ...(current[team] || {}), ...patch }
      current[team] = edited
      next[sourceId] = current
      return next
    })
    setDirty(true)
    setMessage('')
  }
  const changeNumber = (sourceId: string, team: string, key: 'local' | 'total', value: string) => {
    if (value === '') {
      setOverrides(prev => {
        const next = { ...prev }
        const item = { ...(next[sourceId] || {}) }
        const row = { ...(item[team] || {}) }
        delete row[key]
        if (Object.keys(row).length) item[team] = row
        else delete item[team]
        if (Object.keys(item).length) next[sourceId] = item
        else delete next[sourceId]
        return next
      })
      setDirty(true)
      return
    }
    const number = Number(value)
    if (!Number.isInteger(number) || number < 1 || number > 1024) return
    modify(sourceId, team, { [key]: number })
  }
  const transfer = (sourceId: string, team: string, destination: string) => {
    // Category changed => reset old placements so new proposed numbers are
    // consistent with the destination category (still editable).
    setOverrides(prev => {
      const next = { ...prev }
      const category = { ...(next[sourceId] || {}) }
      category[team] = { category: destination }
      next[sourceId] = category
      return next
    })
    setDirty(true)
    setMessage('Coppia spostata nella classifica provvisoria. Salva per confermare.')
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
  const all = groups.flatMap(group => group.rows.map(row => ({
    ...row, categoryName: group.bracket.title
  }))).sort((a,b)=>a.total-b.total || a.team.localeCompare(b.team))
  const textForSocial = groups.map(group => [
    (group.index+1) + '. ' + group.bracket.title.toUpperCase(),
    ...group.rows.map(row => row.local + '° ' + row.team + ' (' + row.total + '° totale)')
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
      <div className="mt-rankings-dialog-actions">
        <button type="button" className="btn" aria-pressed={compact}
          onClick={() => setCompact(value => !value)}>
          {compact ? 'Mostra totale' : 'Vista social compatta'}
        </button>
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
            {group.rows.length === 0 && <p className="p-2 text-xs">Nessuna coppia in questa categoria.</p>}
            <div className="mt-rankings-lines">
              {group.rows.map(row => <div className="mt-rankings-line" key={row.sourceId + '/' + row.team}>
                <input type="number" className="input mt-rankings-place" min={1} max={1024}
                  aria-label={'Posizione ' + group.bracket.title + ': ' + row.team}
                  value={row.local} onChange={e => changeNumber(row.sourceId,row.team,'local',e.target.value)}/>
                <span className="mt-rankings-name">{row.team}{row.provisional && <small>provvisoria</small>}</span>
                {!compact && <input type="number" className="input mt-rankings-total" min={1} max={1024}
                  aria-label={'Posizione totale: ' + row.team}
                  value={row.total} onChange={e => changeNumber(row.sourceId,row.team,'total',e.target.value)}/>}
                {!compact && <select className="input mt-rankings-move" aria-label={'Categoria di ' + row.team}
                  value={row.categoryId} onChange={e => transfer(row.sourceId,row.team,e.target.value)}>
                  {brackets.map((bracket,i) => <option key={bracket.id} value={bracket.id}>L{i+1} {bracket.title}</option>)}
                </select>}
              </div>)}
            </div>
          </section>)}
          <p className="mt-rankings-note">
            Numeri precompilati come riferimento, anche con risultati incompleti.
            Per correggere la categoria e il piazzamento totale premi “Mostra totale”.
            Spostare una coppia qui non cambia gli incontri del tabellone.
          </p>
          {!compact && <section className="mt-rankings-total-list">
            <strong>Ordine generale della tappa</strong>
            {all.map(row => <div key={row.sourceId + row.team} className="mt-rankings-total-row">
              <b>{row.total}°</b><span>{row.team}</span><small>{row.categoryName}</small>
            </div>)}
          </section>}
        </>}
      </div>
      <footer className="mt-rankings-dialog-footer">
        <small role="status">{dirty ? 'Modifiche non salvate' : message || 'Classifica di servizio per staff e social'}</small>
        <button className="btn" type="button" onClick={close}>Chiudi</button>
      </footer>
    </section>
  </div>
}
