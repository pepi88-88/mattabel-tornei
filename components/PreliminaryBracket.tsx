'use client'
import React from 'react'

type Match = { A: string; B: string }
type Props = {
  title: string
  color: string
  type: 'PSE' | 'PDE'
  nTeams: number
  prelims?: Match[]
  r1: Match[]
  winners?: Record<string, 'A' | 'B' | undefined>
  resolve?: (token: string) => string
  editable?: boolean
  onWinner?: (code: string, side: 'A' | 'B' | undefined) => void
  courts?: Record<string, string>
  onCourtChange?: (code: string, court: string) => void
  scores?: Record<string, { A: number | null; B: number | null }>
  onScoreChange?: (code: string, side: 'A' | 'B', value: number | null) => void
}

export default function PreliminaryBracket({title,color,type,nTeams,prelims=[],r1,winners={},resolve=(s)=>s,editable=false,onWinner,courts={},onCourtChange,scores={},onScoreChange}:Props) {
  const count = nTeams === 24 && type === 'PSE' ? 8 : 4
  const rounds: { name: string; games: {code:string; A:string; B:string}[] }[] = []
  const winner = (code:string,a:string,b:string) => winners[code] === 'A' ? a : winners[code] === 'B' ? b : `Vincente ${code}`
  const prelimGames = Array.from({length:count},(_,i)=>{
    const m=prelims[i]||{A:'-',B:'-'}
    return {code:`P${i+1}`,A:resolve(m.A),B:resolve(m.B)}
  })
  rounds.push({name:'Preliminari',games:prelimGames})
  let current = Array.from({length:count},(_,i)=>{
    const m=r1[i]||{A:'-',B:'-'}
    const p=prelimGames[i]
    return {code:`R${i+1}`,A:winner(p.code,p.A,p.B),B:resolve(m.B)}
  })
  rounds.push({name:'Tabellone principale',games:current})
  // PDE: i quattro R sono il primo turno ufficiale DE. Le perdenti P
  // escono dal tabellone e NON entrano nel ramo Losers.
  if (type === 'PDE') {
    const r = current
    const z = [
      {code:'Z1', A:winner('R1',r[0].A,r[0].B), B:winner('R2',r[1].A,r[1].B)},
      {code:'Z2', A:winner('R3',r[2].A,r[2].B), B:winner('R4',r[3].A,r[3].B)},
    ]
    rounds.push({name:'Semifinali vincenti',games:z})
    const loser=(code:string,a:string,b:string)=>winners[code]==='A'?b:winners[code]==='B'?a:`Perdente ${code}`
    const x=[
      {code:'X1',A:loser('R1',r[0].A,r[0].B),B:loser('R2',r[1].A,r[1].B)},
      {code:'X2',A:loser('R3',r[2].A,r[2].B),B:loser('R4',r[3].A,r[3].B)},
    ]
    const w=[
      {code:'W1',A:loser('Z1',z[0].A,z[0].B),B:winner('X1',x[0].A,x[0].B)},
      {code:'W2',A:loser('Z2',z[1].A,z[1].B),B:winner('X2',x[1].A,x[1].B)},
    ]
    const co=[
      {code:'CO1',A:winner('Z1',z[0].A,z[0].B),B:winner('W2',w[1].A,w[1].B)},
      {code:'CO2',A:winner('Z2',z[1].A,z[1].B),B:winner('W1',w[0].A,w[0].B)},
    ]
    rounds.push({name:'Losers — primo turno',games:x})
    rounds.push({name:'Losers — incroci',games:w})
    rounds.push({name:'Finali incrociate',games:co})
    rounds.push({name:'Finale',games:[{code:'F',A:winner('CO1',co[0].A,co[0].B),B:winner('CO2',co[1].A,co[1].B)}]})
    rounds.push({name:'3° / 4° posto',games:[{code:'THIRD',A:loser('CO1',co[0].A,co[0].B),B:loser('CO2',co[1].A,co[1].B)}]})
  } else {
    let level=0
    while(current.length>1){
      const label = current.length===2?'Semifinali':current.length===4?'Quarti di finale':'Turno successivo'
      const next = Array.from({length:current.length/2},(_,i)=>{
        const a=current[i*2],b=current[i*2+1]
        const code=current.length===2?`Y${i+1}`:current.length===4?`Z${i+1}`:`T${level+1}_${i+1}`
        return {code,A:winner(a.code,a.A,a.B),B:winner(b.code,b.A,b.B)}
      })
      rounds.push({name:current.length===2?'Finale':label,games:next})
      current=next
      level++
    }
  }
  const card=(m:{code:string;A:string;B:string})=><div key={m.code} className="rounded-lg border border-neutral-600 bg-neutral-900/60 p-3 min-w-[210px]">
    <div className="text-xs font-bold mb-2" style={{color}}>{m.code} — {title}</div>
    {(['A','B'] as const).map(side=><div key={side} className="flex items-center justify-between gap-2 py-1 border-b border-neutral-700">
      <span className={winners[m.code]===side?'font-bold':''}>{side==='A'?m.A:m.B}</span>
      {winners[m.code]===side&&<span className="text-green-400 text-xs">✓</span>}
    </div>)}
    <div className="flex flex-wrap gap-2 items-center mt-2">
      <span className="text-xs text-neutral-400">Campo:</span>
      {editable && onCourtChange ? (
        <input type="number" min="1" className="input w-16 h-9" placeholder="—"
          value={courts[m.code] || ''} onChange={e => onCourtChange(m.code,e.target.value)} />
      ) : <span className="text-sm">{courts[m.code] || '—'}</span>}
      <span className="text-xs text-neutral-400 ml-2">Punti:</span>
      {(['A','B'] as const).map((side,i)=><React.Fragment key={side}>
        {i===1&&<span className="text-xs">–</span>}
        {editable && onScoreChange ? (
          <input type="number" min="0" className="input w-16 h-9" aria-label={`Punti ${side} ${m.code}`}
            value={scores[m.code]?.[side] ?? ''} onChange={e => onScoreChange(m.code,side,e.target.value===''?null:Number(e.target.value))} />
        ) : <span className="text-sm">{scores[m.code]?.[side] ?? '—'}</span>}
      </React.Fragment>)}
    </div>
    {editable&&onWinner&&<select className="input w-full mt-2" value={winners[m.code]||''} onChange={e=>onWinner(m.code,e.target.value===''?undefined:e.target.value as 'A'|'B')}>
      <option value="">Risultato da inserire</option><option value="A">Vince A</option><option value="B">Vince B</option>
    </select>}
  </div>
  return <div className="card p-4">
    <h3 className="font-bold text-lg mb-3">{title} — {type} {count===8?'16+8':'8+4'}</h3>
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-5 min-w-max">
        {rounds.map((round,i)=><div key={i} className="flex flex-col w-[240px]">
          <h4 className="font-semibold mb-3 text-center">{round.name}</h4>
          <div className="flex flex-1 flex-col justify-around gap-4">{round.games.map(card)}</div>
        </div>)}
      </div>
    </div>
    {type==='PDE'&&<p className="text-xs text-neutral-400 mt-3">Le perdenti P sono escluse dal ramo Losers; X1/X2 partono esclusivamente dalle perdenti R1–R4. La gestione dei punteggi e dei campi è ancora da integrare.</p>}
  </div>
}
