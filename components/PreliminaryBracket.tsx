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
}

export default function PreliminaryBracket({title,color,type,nTeams,prelims=[],r1,winners={},resolve=(s)=>s,editable=false,onWinner}:Props) {
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
  const card=(m:{code:string;A:string;B:string})=><div key={m.code} className="rounded-lg border border-neutral-600 bg-neutral-900/60 p-3 min-w-[210px]">
    <div className="text-xs font-bold mb-2" style={{color}}>{m.code} — {title}</div>
    {(['A','B'] as const).map(side=><div key={side} className="flex items-center justify-between gap-2 py-1 border-b border-neutral-700">
      <span className={winners[m.code]===side?'font-bold':''}>{side==='A'?m.A:m.B}</span>
      {winners[m.code]===side&&<span className="text-green-400 text-xs">✓</span>}
    </div>)}
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
    {type==='PDE'&&<p className="text-xs text-amber-300 mt-3">Ramo Losers della doppia eliminazione ancora da completare: non usare per un torneo reale.</p>}
  </div>
}
