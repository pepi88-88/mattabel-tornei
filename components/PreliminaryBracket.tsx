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
  // Same card proportions as the classic SE/DE canvas.
  const cardW=256, cardH=148
  const colW=cardW+140, rowH=cardH+28
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
    const slotPair=/^P\d+$/.test(m.code) ? prelims[Number(m.code.slice(1))-1]
      : /^R\d+$/.test(m.code) ? r1[Number(m.code.slice(1))-1] : undefined
    const isPrelim=/^P\d+$/.test(m.code)
    const configSides: Array<'A'|'B'> = isPrelim ? ['A','B'] : /^R\d+$/.test(m.code) ? ['B'] : []
    const selected=winners[m.code]
    const chooseWinner=(side:'A'|'B',name:string)=>{
      if(!editable || !onWinner || !name || name==='—' || name==='-' || name==='BYE' || /^Vincente\s|^Perdente\s/i.test(name))return
      const next=selected===side?undefined:side
      const message=next ? `Confermi la vittoria di "${name}" in ${m.code}?` : `Annullare la vittoria attuale in ${m.code}?`
      if(window.confirm(message)) onWinner(m.code,next)
    }
    return <div key={m.code} className="absolute card p-3 shadow-lg"
      style={{left:node.x,top:node.y,width:cardW,height:cardH}}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] uppercase opacity-70 truncate" title={`${m.code} — ${title}`}>{m.code} — {title}</div>
        {onCourtChange || courts[m.code] ? <label className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-400">
          CAMPO {editable&&onCourtChange?<input aria-label={`Campo ${m.code}`} className="w-9 h-6 rounded border border-neutral-600 bg-neutral-900 text-center text-xs text-white"
          inputMode="numeric" value={courts[m.code]||''} onChange={e=>onCourtChange(m.code,e.target.value.replace(/\D/g,''))} placeholder="–"/>:<span>{courts[m.code]||'–'}</span>}
        </label>:null}
      </div>
      <div className="space-y-2">
        {(['A','B'] as const).map(side=>{
          const configurable=!!slotOptions&&!!onSlotChange&&configSides.includes(side)
          const original=slotPair?.[side]||'-'
          const name=side==='A'?m.A:m.B
          return configurable ? <select key={side} aria-label={`${m.code} squadra ${side}`}
            className="input w-full h-10 text-sm" value={original} onChange={e=>onSlotChange(m.code,side,e.target.value)}>
              <option value="-">—</option><option value="BYE">BYE</option>
              {slotOptions.map(op=><option value={op} key={op} disabled={!!isSlotTaken?.(op,m.code,side)}>{op}</option>)}
            </select> : <button key={side} type="button" title={name}
              disabled={!editable||!onWinner}
              onClick={()=>chooseWinner(side,name)}
              className={`w-full h-10 rounded-md px-2 text-left truncate transition
                ${editable&&onWinner?'cursor-pointer':'cursor-default'}
                ${selected===side?'bg-yellow-500/20 ring-1 ring-yellow-500':'bg-neutral-800/40 hover:bg-neutral-700/40'}`}>
              <span className="font-mono text-sm">{name||'—'}</span>
            </button>
        })}
      </div>

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
  // Keep the classic DE layout and its match codes. Only P1..P4 are
  // added in a narrower column immediately before R1..R4.
  const pdePositions: Record<string,{x:number;y:number}> = {}
  if(type==='PDE'){
    const pX=20, rX=pX+cardW+56, zX=rX+cardW+110
    const coX=zX+cardW+120, finalX=coX+cardW+120
    const top=45, step=cardH+28
    for(let i=0;i<4;i++){
      pdePositions[`P${i+1}`]={x:pX,y:top+i*step}
      pdePositions[`R${i+1}`]={x:rX,y:top+i*step}
    }
    pdePositions.Z1={x:zX,y:top+step/2}
    pdePositions.Z2={x:zX,y:top+step*2.5}
    // Direct Z -> CO entry: no intermediate Y boxes or stair-step routes.
    pdePositions.CO1={x:coX,y:pdePositions.Z1.y}
    pdePositions.CO2={x:coX,y:pdePositions.Z2.y}
    pdePositions.F={x:finalX,y:(pdePositions.CO1.y+pdePositions.CO2.y)/2}
    pdePositions.THIRD={x:finalX,y:pdePositions.F.y+cardH+48}

    const loserBase=830
    pdePositions.X1={x:rX,y:loserBase+150}
    pdePositions.X2={x:rX,y:loserBase+560}
    pdePositions.Q1={x:zX,y:loserBase-20}
    pdePositions.Q2={x:zX,y:loserBase+390}
    pdePositions.X3={x:zX,y:loserBase+150}
    pdePositions.X4={x:zX,y:loserBase+560}
    pdePositions.W1={x:coX,y:loserBase+65}
    pdePositions.W2={x:coX,y:loserBase+475}
  }
  const pdeGames=type==='PDE'
    ? new Map(rounds.flatMap(round=>round.games).map(m=>[m.code,m]))
    : new Map<string,Game>()
  const pdePassthrough: Record<string,string> = {
    Q1:(()=>{const m=pdeGames.get('Z1');return m ? (winners.Z1==='A'?m.B:winners.Z1==='B'?m.A:'Perdente Z1'):''})(),
    Q2:(()=>{const m=pdeGames.get('Z2');return m ? (winners.Z2==='A'?m.B:winners.Z2==='B'?m.A:'Perdente Z2'):''})(),
    X3:(()=>{const m=pdeGames.get('X1');return m?winner('X1',m.A,m.B):''})(),
    X4:(()=>{const m=pdeGames.get('X2');return m?winner('X2',m.A,m.B):''})(),
  }
  const pdeWidth=pdePositions.F ? pdePositions.F.x+cardW+55 : 0
  const pdeHeight=830+560+cardH+80
  const pdeSmall=(code:string)=>{
    const pos=pdePositions[code]
    if(!pos)return null
    return <div key={code} className="absolute card p-3 shadow-lg" style={{left:pos.x,top:pos.y,width:cardW,height:90}}>
      <div className="text-[11px] uppercase opacity-70 mb-2">{code}</div>
      <div className="text-sm font-mono truncate" title={pdePassthrough[code]}>{pdePassthrough[code]||'—'}</div>
    </div>
  }
  const pdeLine=(from:string,to:string)=>{
    const a=pdePositions[from],b=pdePositions[to]
    if(!a||!b)return null
    const small=['Q1','Q2','X3','X4']
    const y1=a.y+(small.includes(from)?45:cardH/2)
    const y2=b.y+(small.includes(to)?45:cardH/2)
    const start=a.x+cardW,end=b.x
    const mid=(start+end)/2
    return <path key={`${from}-${to}`}
      d={Math.abs(y1-y2)<1 ? `M ${start} ${y1} H ${end}` : `M ${start} ${y1} H ${mid} V ${y2} H ${end}`}
      stroke={color} strokeWidth={3} fill="none"/>
  }
  const pdePair=(fromA:string,fromB:string,to:string)=>{
    const a=pdePositions[fromA],b=pdePositions[fromB],t=pdePositions[to]
    if(!a||!b||!t)return null
    const ay=a.y+cardH/2,by=b.y+cardH/2,ty=t.y+cardH/2
    const x=a.x+cardW,junction=(x+t.x)/2
    return <path key={`${fromA}-${fromB}-${to}`}
      d={`M ${x} ${ay} H ${junction} M ${x} ${by} H ${junction} M ${junction} ${Math.min(ay,by)} V ${Math.max(ay,by)} M ${junction} ${ty} H ${t.x}`}
      stroke={color} strokeWidth={3} fill="none"/>
  }
  return <div className="card p-4 space-y-4">
    <h3 className="font-semibold text-sm">{type} — {count===8?'16+8':'8+4'} <span className="text-xs text-neutral-400">{editable&&onWinner?'Clic sul nome per confermare la vincitrice':''}</span></h3>
    <div className="overflow-x-auto pb-4">
      {type==='PSE'? <div className="relative" style={{width,height:mainHeight}}>
        {upper.map((r,i)=><div key={i} className="absolute text-xs font-semibold text-center" style={{left:i*colW+8,width:cardW,top:0}}>{r.name}</div>)}
        <div className="absolute" style={{top:30,left:0}}>
          {drawLines(upperNodes,upper)}
          {upperNodes.map(renderCard)}
        </div>
      </div>: <div className="relative" style={{width:pdeWidth,height:pdeHeight}}>
        <div className="absolute text-xs font-semibold tracking-widest text-neutral-400" style={{top:15,left:pdePositions.P1.x}}>PRELIMINARI</div>
        <div className="absolute text-xs font-semibold tracking-widest text-neutral-400" style={{top:15,left:pdePositions.R1.x}}>WINNERS</div>
        <div className="absolute text-xs font-semibold tracking-widest text-neutral-400" style={{top:800,left:pdePositions.X1.x}}>LOSERS</div>
        <svg className="absolute inset-0 pointer-events-none" width={pdeWidth} height={pdeHeight} aria-hidden="true">
          {Array.from({length:4},(_,i)=>pdeLine(`P${i+1}`,`R${i+1}`))}
          {pdePair('R1','R2','Z1')}
          {pdePair('R3','R4','Z2')}
          {pdeLine('Z1','CO1')}{pdeLine('Z2','CO2')}
          {pdePair('CO1','CO2','F')}
          {['X1','X2'].map((c,i)=>pdeLine(c,`X${i+3}`))}
          {pdeLine('Q1','W1')}{pdeLine('X3','W1')}
          {pdeLine('Q2','W2')}{pdeLine('X4','W2')}
        </svg>
        {Array.from(pdeGames.values()).map(m=>{
          const p=pdePositions[m.code]
          return p?renderCard({m,x:p.x,y:p.y,col:0}):null
        })}
        {['X3','X4','Q1','Q2'].map(pdeSmall)}
      </div>}
    </div>
    {type==='PDE'&&<p className="text-xs text-neutral-400">Le perdenti P1–P4 passano alle categorie successive. Il ramo Losers riceve soltanto le perdenti R1–R4.</p>}
  </div>

}
