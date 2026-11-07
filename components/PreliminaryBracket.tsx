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
  slotOptions?: string[]
  onSlotChange?: (code: string, side: 'A' | 'B', value: string) => void
  isSlotTaken?: (value: string, code: string, side: 'A' | 'B') => boolean
}

export default function PreliminaryBracket({title,color,type,nTeams,prelims=[],r1,winners={},resolve=(s)=>s,editable=false,onWinner,courts={},onCourtChange,scores={},onScoreChange,slotOptions,onSlotChange,isSlotTaken}:Props) {
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
      const label = current.length===8 ? 'Quarti di finale' : current.length===4 ? 'Semifinali' : 'Finale'
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

  type Game = {code:string; A:string; B:string}
  type Positioned = {m:Game; x:number; y:number; col:number}
  const cardW=234, cardH=(editable && (onScoreChange || onCourtChange)) ? 175 : editable ? 162 : 128
  const colW=cardW+116, rowH=cardH+30
  const upper=rounds.filter(r=>!r.name.startsWith('Losers') && r.name!=='3° / 4° posto')
  const loserRounds=rounds.filter(r=>r.name.startsWith('Losers'))
  const third=rounds.find(r=>r.name==='3° / 4° posto')
  // P and R have one-to-one feeder links. All further single-elimination
  // stages are vertically centered between their two feeder matches.
  const getNodes=(stages:typeof rounds,yOffset=0): Positioned[]=>{
    const firstCount=stages[0]?.games.length||0
    const center=new Map<string,number>()
    const nodes:Positioned[]=[]
    stages.forEach((stage,col)=>{
      stage.games.forEach((m,i)=>{
        let cy:number
        if(col===0) cy=yOffset+i*rowH+cardH/2
        else if(col===1 && stages[0].name==='Preliminari') cy=center.get(stages[0].games[i]?.code)||0
        else {
          const a=center.get(stages[col-1].games[2*i]?.code)
          const b=center.get(stages[col-1].games[2*i+1]?.code)
          cy=a!==undefined && b!==undefined ? (a+b)/2 : yOffset+i*rowH+cardH/2
        }
        center.set(m.code,cy)
        nodes.push({m,x:col*colW+8,y:cy-cardH/2,col})
      })
    })
    return nodes
  }
  const upperNodes=type==='PSE'?getNodes(upper):[]
  const width=(type==='PSE'?upper.length:4)*colW+25
  const mainHeight=Math.max(1,count)*rowH+25
  const renderCard=(node:Positioned)=>{
    const m=node.m
    const slotPair=m.code.startsWith('P') && /^P\d+$/.test(m.code) ? prelims[Number(m.code.slice(1))-1]
      : /^R\d+$/.test(m.code) ? r1[Number(m.code.slice(1))-1] : undefined
    const isPrelim=/^P\d+$/.test(m.code)
    const configSide=isPrelim ? ['A','B'] as const : /^R\d+$/.test(m.code)?['B'] as const:[] as ('A'|'B')[]
    return <div key={m.code} className="absolute rounded-xl border border-neutral-700 bg-neutral-950 p-3 shadow-md"
      style={{left:node.x,top:node.y,width:cardW,minHeight:cardH,borderTop:`3px solid ${color}`}}>
      <div className="text-[11px] font-bold mb-2" style={{color}}>{m.code} — {title}</div>
      {(['A','B'] as const).map(side=>{
        const configurable=!!slotOptions&&!!onSlotChange&&configSide.includes(side)
        const original=slotPair?.[side]||'-'
        return <div key={side} className="mb-2">
          {configurable ? <select aria-label={`${m.code} squadra ${side}`} className="input w-full text-xs h-9"
             value={original} onChange={e=>onSlotChange(m.code,side,e.target.value)}>
              <option value="-">—</option><option value="BYE">BYE</option>
              {slotOptions.map(op=><option value={op} key={op} disabled={!!isSlotTaken?.(op,m.code,side)}>{op}</option>)}
            </select>:
            <div className={`px-1 py-1.5 text-xs border-b border-neutral-800 min-h-7 ${winners[m.code]===side?'font-bold text-amber-300':''}`} title={side==='A'?m.A:m.B}>{side==='A'?m.A:m.B}</div>}
        </div>
      })}
      {editable&&onWinner&&<select aria-label={`Vincente ${m.code}`} className="input w-full text-xs h-8 mt-1"
        value={winners[m.code]||''} onChange={e=>onWinner(m.code,e.target.value===''?undefined:e.target.value as 'A'|'B')}>
        <option value="">Vincente da decidere</option><option value="A">Vince A</option><option value="B">Vince B</option>
      </select>}
      {(onCourtChange||onScoreChange||courts[m.code]||scores[m.code])&&<div className="flex items-center gap-1 flex-wrap text-[10px] mt-2 text-neutral-400">
        <span>Campo</span>
        {editable&&onCourtChange?<input className="input w-10 h-7 text-center" inputMode="numeric" value={courts[m.code]||''} onChange={e=>onCourtChange(m.code,e.target.value.replace(/\D/g,''))}/>:<span>{courts[m.code]||'—'}</span>}
        <span className="ml-1">Punti</span>
        {(['A','B'] as const).map((side,i)=><React.Fragment key={side}>{i>0&&<span>–</span>}{editable&&onScoreChange?
          <input aria-label={`Punti ${side} ${m.code}`} type="number" min="0" className="input w-10 h-7 text-center" value={scores[m.code]?.[side]??''} onChange={e=>onScoreChange(m.code,side,e.target.value===''?null:Number(e.target.value))}/>:
          <span>{scores[m.code]?.[side]??'—'}</span>}</React.Fragment>)}
      </div>}
    </div>
  }
  const drawLines=(nodes:Positioned[],stages:typeof rounds)=><svg className="absolute inset-0 pointer-events-none" width={width} height={Math.max(mainHeight,...nodes.map(n=>n.y+cardH+20))} aria-hidden="true">
    {nodes.filter(n=>n.col>0).flatMap(n=>{
      const prev=stages[n.col-1]?.games||[]
      const refs=n.col===1&&stages[0].name==='Preliminari'?[prev[Number(n.m.code.replace(/\D/g,''))-1]?.code]:[prev[2*stages[n.col].games.indexOf(n.m)]?.code,prev[2*stages[n.col].games.indexOf(n.m)+1]?.code]
      return refs.flatMap((ref,j)=>{
        const from=nodes.find(x=>x.m.code===ref)
        if(!from)return []
        const startX=from.x+cardW, endX=n.x, y1=from.y+cardH/2,y2=n.y+cardH/2, mid=(startX+endX)/2
        return [<path key={`${ref}-${n.m.code}-${j}`} d={`M ${startX} ${y1} H ${mid} V ${y2} H ${endX}`} stroke={color} strokeWidth="2.5" fill="none"/>]
      })
    })}
  </svg>
  return <div className="card p-4 space-y-4">
    <h3 className="font-extrabold text-xl" style={{color}}>{title} — {type} {count===8?'16+8':'8+4'}</h3>
    <div className="overflow-x-auto pb-4">
      {type==='PSE'? <div className="relative" style={{width,height:mainHeight}}>
        {upper.map((r,i)=><div key={i} className="absolute text-xs font-semibold text-center" style={{left:i*colW+8,width:cardW,top:0}}>{r.name}</div>)}
        <div className="absolute" style={{top:30,left:0}}>
          {drawLines(upperNodes,upper)}
          {upperNodes.map(renderCard)}
        </div>
      </div>:<div className="space-y-5 min-w-[900px]">
        <div className="relative" style={{height:count*rowH+30,width:2*colW+10}}>
          {rounds.slice(0,2).map((r,i)=><div key={r.name} className="absolute font-semibold text-xs" style={{left:i*colW+8,top:0,width:cardW,textAlign:'center'}}>{r.name}</div>)}
          <div className="absolute top-8 left-0">
            {drawLines(getNodes(rounds.slice(0,2)),rounds.slice(0,2))}
            {getNodes(rounds.slice(0,2)).map(renderCard)}
          </div>
        </div>
        {[
          {title:'Ramo vincenti',names:['Semifinali vincenti']},
          {title:'Ramo perdenti (Losers)',names:['Losers — primo turno','Losers — incroci']},
          {title:'Finali',names:['Finali incrociate','Finale','3° / 4° posto']}
        ].map(group=><section key={group.title} className="border-t border-neutral-700 pt-4">
          <div className="font-bold mb-3" style={{color}}>{group.title}</div>
          <div className="flex flex-wrap gap-5">{rounds.filter(r=>group.names.includes(r.name)).map(round=><div key={round.name} className="w-[240px]">
            <div className="font-semibold text-xs mb-2 text-center">{round.name}</div>
            <div className="space-y-4">{round.games.map(m=><div key={m.code} className="relative" style={{height:cardH}}>{renderCard({m,x:0,y:0,col:0})}</div>)}</div>
          </div>)}</div>
        </section>)}
      </div>}
    </div>
    {type==='PDE'&&<p className="text-xs text-neutral-400">Le perdenti P1–P4 passano alle categorie successive. Il ramo Losers riceve soltanto le perdenti R1–R4.</p>}
  </div>

}
