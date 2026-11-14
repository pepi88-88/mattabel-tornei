'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import BracketCanvas, { type Bracket as BracketType } from '../../components/BracketCanvas'
import PreliminaryBracket from '../../components/PreliminaryBracket'

type GroupMatch={id:string;a:string;b:string;scores:Array<{a:string;b:string}>;played:boolean;time:string;court:string}
type Standing={slot:number;name:string;wins:number;pf:number;ps:number;qp:number;sw:number;sl:number}
type Group={letter:string;cap:number;complete:boolean;remaining:number;matches:GroupMatch[];standings:Standing[]}
type Bracket={id:string;title:string;color:string;type:string;nTeams:number;source:string;
 r1:Array<{A:string;B:string}>;prelims:Array<{A:string;B:string}>;slots:string[];
 winners:Record<string,'A'|'B'>;scores:Record<string,{A:number|null;B:number|null}>;
 courts:Record<string,string>;itaScores:Array<{a:string|number;b:string|number}>}
type Tournament={id:string;name:string;date:string|null;tourId:string;displayPhase:string;
 groups:Group[];rankings:Record<string,string[]>;brackets:Bracket[]}
type Slide={key:string;tournament:Tournament;kind:'group'|'bracket'|'waiting';
 group?:Group;bracket?:Bracket;part?:number;pages?:number;matches?:GroupMatch[]}
const INTERVALS=[10,15,20,30,45,60]
const GROUP_COLORS:Record<string,string>={A:'#2563eb',B:'#e44458',C:'#f5a623',D:'#8b5cf6',E:'#10b981',F:'#fb923c'}
const colorFor=(l:string)=>GROUP_COLORS[l]||'#64748b'
const clock=(v:string)=>/^\d{1,2}:\d{2}/.test(v)?v.slice(0,5):'—'

function GroupDisplay({group,matches}:{group:Group;matches:GroupMatch[]}){
 return <div className="desk-stage-grid">
  <section className="desk-stage-box">
   <div className="desk-stage-box-title" style={{borderColor:colorFor(group.letter)}}>
    <h2>CLASSIFICA GIRONE {group.letter}</h2><span>{group.cap} COPPIE</span>
   </div>
   <table className="desk-ranking-table">
    <thead><tr><th>#</th><th>Squadra</th><th>V</th><th>PF</th><th>PS</th><th>QP</th></tr></thead>
    <tbody>{group.standings.map((s,i)=><tr key={s.slot}>
     <td>{i+1}</td><td>{s.name}</td><td>{s.wins}</td><td>{s.pf}</td><td>{s.ps}</td>
     <td>{s.qp?s.qp.toFixed(3):'—'}</td>
    </tr>)}</tbody>
   </table>
   <div className="desk-stage-hint">{group.complete?'Girone completato':group.remaining+' partite da completare'}</div>
  </section>
  <section className="desk-stage-box">
   <div className="desk-stage-box-title" style={{borderColor:colorFor(group.letter)}}>
    <h2>PARTITE E RISULTATI</h2><span>{matches.length} INCONTRI</span>
   </div>
   <div className="desk-score-list">{matches.map(m=><div className={'desk-score-match '+(m.played?'desk-score-played':'')} key={m.id}>
    <div className="desk-score-metadata"><span>{clock(m.time)}</span><span>{m.court?'CAMPO '+m.court:'CAMPO —'}</span></div>
    <div className="desk-score-teams">
     <span>{m.a}</span>
     <div className="desk-score-sets">
      {m.scores.map((s,i)=><span key={i}><b>{s.a!==''?s.a:'—'}</b><small>:</small><b>{s.b!==''?s.b:'—'}</b></span>)}
     </div>
     <span>{m.b}</span>
    </div>
   </div>)}</div>
  </section>
 </div>
}

function resolveToken(raw:string,rankings:Record<string,string[]>){
 const token=String(raw||'').trim()
 if(!token||token==='-')return '—'
 const m=token.match(/^([A-Z])\s*(\d{1,2})$/i)||token.match(/^(\d{1,2})\s*([A-Z])$/i)
 if(!m)return token
 const firstLetter=/^[A-Z]$/i.test(m[1])
 const letter=(firstLetter?m[1]:m[2]).toUpperCase()
 const idx=Number(firstLetter?m[2]:m[1])-1
 return rankings[letter]?.[idx]||token
}
function rr(n:number):Array<[number,number]>{
 const t=Array.from({length:n},(_,i)=>i+1)
 if(t.length%2)t.push(0)
 const out:Array<[number,number]>=[]
 for(let r=0;r<t.length-1;r++){
  for(let i=0;i<t.length/2;i++){const a=t[i],b=t[t.length-1-i];if(a&&b)out.push([a,b])}
  const rest=t.slice(1);rest.unshift(rest.pop()!);t.splice(1,t.length-1,...rest)
 }
 return out
}
function ItaDisplay({bracket,resolve}:{bracket:Bracket;resolve:(raw:string)=>string}){
 const names=bracket.slots.slice(0,bracket.nTeams).map(resolve)
 while(names.length<bracket.nTeams)names.push('—')
 return <div className="desk-ita-display"><h2>Partite all'italiana</h2>
  {rr(bracket.nTeams).map(([a,b],i)=><div className="desk-ita-row" key={i}>
   <span>{names[a-1]}</span><strong>{bracket.itaScores?.[i]?.a ?? '—'} : {bracket.itaScores?.[i]?.b ?? '—'}</strong><span>{names[b-1]}</span>
  </div>)}
 </div>
}
function BracketDisplay({bracket,tournament}:{bracket:Bracket;tournament:Tournament}){
 const outer=useRef<HTMLDivElement>(null)
 const inner=useRef<HTMLDivElement>(null)
 const [scale,setScale]=useState(0.7)
 useLayoutEffect(()=>{
  const stage=outer.current,content=inner.current
  if(!stage||!content)return
  const measure=()=>{
   const width=content.scrollWidth,height=content.scrollHeight
   const w=stage.clientWidth-8,h=stage.clientHeight-8
   if(width&&height&&w&&h)setScale(Math.max(.12,Math.min(1,w/width,h/height)))
  }
  const resize=new ResizeObserver(measure)
  resize.observe(stage);resize.observe(content);measure()
  return()=>resize.disconnect()
 },[bracket.id,tournament.id])
 const resolve=(s:string)=>resolveToken(s,tournament.rankings||{})
 const normalized={
  ...bracket,
  type:bracket.type as BracketType['type'],
  source:bracket.source as BracketType['source'],
  r1:(bracket.r1||[]).map(m=>({A:resolve(m.A),B:resolve(m.B)})),
  slots:(bracket.slots||[]).map(resolve),
 }
 const scores=Object.fromEntries(Object.entries(bracket.scores||{}).map(([code,val])=>[code,{A:val.A??NaN,B:val.B??NaN}]))
 return <div className="desk-board-stage" ref={outer}>
  <div className="desk-board-inner" ref={inner} style={{transform:'scale('+scale+')'}}>
   {bracket.type==='PSE'||bracket.type==='PDE'?
    <PreliminaryBracket title={bracket.title} color={bracket.color} type={bracket.type}
     nTeams={bracket.nTeams} prelims={bracket.prelims} r1={bracket.r1}
     resolve={resolve} winners={bracket.winners} scores={bracket.scores} courts={bracket.courts}/>:
    bracket.type==='ITA'?<ItaDisplay bracket={bracket} resolve={resolve}/>:
    <BracketCanvas bracket={normalized} winners={bracket.winners} scores={scores}
     courts={bracket.courts} interactive={false} confirmOnPick={false}/>}
  </div>
 </div>
}

export default function DeskCarousel(){
 const [items,setItems]=useState<Tournament[]>([])
 const [selectedIds,setSelectedIds]=useState<string[]>([])
 const [allTournaments,setAllTournaments]=useState(true)
 const [selectionOpen,setSelectionOpen]=useState(false)
 const [position,setPosition]=useState(0)
 const [duration,setDuration]=useState(15)
 const [paused,setPaused]=useState(false)
 const [now,setNow]=useState<Date|null>(null)
 const [error,setError]=useState('')
 const [updated,setUpdated]=useState('')
 const [refreshing,setRefreshing]=useState(false)
 const [progress,setProgress]=useState(0)

 const visible=useMemo(()=>allTournaments?items:items.filter(t=>selectedIds.includes(t.id)),
  [items,allTournaments,selectedIds])
 const slides=useMemo(()=>{
  const list:Slide[]=[]
  for(const t of visible){
   if(t.displayPhase==='groups'){
    for(const group of t.groups){
     const pages=Math.max(1,Math.ceil(group.matches.length/8))
     for(let page=0;page<pages;page++)list.push({
      key:t.id+':g:'+group.letter+':'+page,tournament:t,kind:'group',
      group,part:page+1,pages,matches:group.matches.slice(page*8,(page+1)*8),
     })
    }
   }else if(t.displayPhase==='brackets'){
    for(const bracket of t.brackets)list.push({
     key:t.id+':b:'+bracket.id,tournament:t,kind:'bracket',bracket,
    })
   }
   if(!list.some(s=>s.tournament.id===t.id))list.push({key:t.id+':waiting',tournament:t,kind:'waiting'})
  }
  return list
 },[visible])
 const active=slides[position]||null
 const saveSelection=(all:boolean,ids:string[])=>{
  setAllTournaments(all);setSelectedIds(ids);setPosition(0)
  try{localStorage.setItem('mattabel:desk:selection',JSON.stringify({all,ids}))}catch{}
 }
 const reload=useCallback(async()=>{
  try{
   const basic=await fetch('/api/tournaments?include_closed=1',{cache:'no-store'})
   if(!basic.ok)throw new Error('Elenco tornei non disponibile')
   const initial=await basic.json()
   const open=((initial.items||[]) as any[]).filter(t=>!t.archived&&
    !['closed','finished','completed','archived'].includes(String(t.status||'').toLowerCase().trim()))
   let mapped:Record<string,Tournament>={}
   let message=''
   try{
    const response=await fetch('/api/public/desk/slides',{cache:'no-store'})
    if(!response.ok)throw new Error('Risultati temporaneamente non disponibili')
    const json=await response.json()
    if(Array.isArray(json.items))mapped=Object.fromEntries(json.items.map((t:Tournament)=>[t.id,t]))
   }catch(e:any){message=e?.message||'Risultati temporaneamente non disponibili'}
   setItems(open.map(t=>mapped[String(t.id)]||{
    id:String(t.id),name:String(t.name||t.title||'Torneo'),
    date:t.event_date||null,tourId:String(t.tour_id||''),
    displayPhase:'waiting',groups:[],rankings:{},brackets:[],
   }))
   setUpdated(new Date().toISOString())
   setError(message)
  }catch(e:any){setError(e?.message||'Aggiornamento non riuscito')}
  finally{setRefreshing(false)}
 },[])
 useEffect(()=>{
  setNow(new Date())
  try{
   const interval=Number(localStorage.getItem('mattabel:desk:duration'))
   if(INTERVALS.includes(interval))setDuration(interval)
   const saved=localStorage.getItem('mattabel:desk:selection')
   if(saved){
    const data=JSON.parse(saved)
    if(typeof data.all==='boolean')setAllTournaments(data.all)
    if(Array.isArray(data.ids))setSelectedIds(data.ids.filter((x:any)=>typeof x==='string'))
   }
  }catch{}
  void reload()
  const r=window.setInterval(()=>void reload(),20000)
  const c=window.setInterval(()=>setNow(new Date()),1000)
  return()=>{window.clearInterval(r);window.clearInterval(c)}
 },[reload])
 useEffect(()=>{setPosition(p=>Math.min(p,Math.max(0,slides.length-1)))},[slides.length])
 useEffect(()=>{
  if(paused||selectionOpen||slides.length<=1){setProgress(0);return}
  const start=Date.now()
  const timer=window.setInterval(()=>{
   const elapsed=Date.now()-start
   setProgress(Math.min(100,elapsed/(duration*1000)*100))
   if(elapsed>=duration*1000){setPosition(p=>(p+1)%slides.length);setProgress(0)}
  },250)
  return()=>window.clearInterval(timer)
 },[position,duration,paused,selectionOpen,slides.length])
 const changeDuration=(n:number)=>{
  setDuration(n)
  try{localStorage.setItem('mattabel:desk:duration',String(n))}catch{}
 }
 const move=(direction:number)=>{if(slides.length)setPosition(p=>(p+direction+slides.length)%slides.length)}
 const fullscreen=()=>{
  const element=document.querySelector('.desk-screen') as HTMLElement|null
  if(document.fullscreenElement)void document.exitFullscreen()
  else void element?.requestFullscreen?.()
 }
 const date=active?.tournament.date?new Date(active.tournament.date).toLocaleDateString('it-IT',{day:'numeric',month:'long'}):''
 return <div className="desk-screen">
  <div className="desk-bg-glow" aria-hidden="true"/>
  <header className="desk-header">
   <div className="desk-brand"><Image src="/logo2.png" width={104} height={66} alt="Beach Volley Mattabel" priority/>
    <div><strong>MATTABEL</strong><span>BEACH VOLLEY • GIRONI E TABELLONI</span></div>
   </div>
   <div className="desk-clock">
    <span>{now?now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span>
    <small>{now?now.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}):''}</small>
   </div>
  </header>
  <main className="desk-content">
   {active?<>
    <div className="desk-titlebar">
     <div>
      <p className="desk-eyebrow">{active.kind==='group'?'FASE A GIRONI':active.kind==='bracket'?'TABELLONI FINALI':'TORNEO IN PREPARAZIONE'} · {date}</p>
      <h1>{active.tournament.name}</h1>
     </div>
     <div className="desk-stage-label" style={{borderColor:active.bracket?.color||colorFor(active.group?.letter||'A')}}>
      {active.kind==='group'?'GIRONE '+active.group?.letter+(active.pages&&active.pages>1?' · '+active.part+'/'+active.pages:''):
       active.kind==='bracket'?active.bracket?.title:'IN ATTESA'}
     </div>
    </div>
    {active.kind==='group'&&active.group&&<GroupDisplay key={active.key} group={active.group} matches={active.matches||[]}/>}
    {active.kind==='bracket'&&active.bracket&&<div className="desk-bracket-card" key={active.key}>
     <div className="desk-bracket-heading"><span style={{color:active.bracket.color}}>{active.bracket.title}</span>
      <span>{active.bracket.type==='ITA'?'ITALIANA':active.bracket.type==='DE'||active.bracket.type==='PDE'?'DOPPIA ELIMINAZIONE':'ELIMINAZIONE DIRETTA'}</span>
     </div>
     <BracketDisplay bracket={active.bracket} tournament={active.tournament}/>
    </div>}
    {active.kind==='waiting'&&<div className="desk-welcome">
     <h2>In attesa della pubblicazione</h2>
     <p>Gironi e tabelloni compariranno quando lo staff li renderà visibili.</p>
    </div>}
   </>:<div className="desk-welcome">
    <Image src="/logo2.png" width={180} height={120} alt="Mattabel"/>
    <h1>{items.length?'Nessun torneo selezionato':'Nessun torneo aperto'}</h1>
    <p>{items.length?'Apri Seleziona tornei per scegliere cosa mostrare.':'Il carosello partirà con i prossimi tornei.'}</p>
   </div>}
   {error&&<div className="desk-error" role="status">{error}. Il carosello mantiene i dati disponibili.</div>}
  </main>
  {selectionOpen&&<div className="desk-selection-overlay" role="dialog" aria-label="Seleziona tornei">
   <div className="desk-selection-panel">
    <div className="desk-selection-top"><h2>Tornei da mostrare</h2><button type="button" onClick={()=>setSelectionOpen(false)}>✕</button></div>
    <p>Ogni torneo mostra i propri gironi fino alla fine delle partite, poi i tabelloni pubblicati.</p>
    <label className="desk-selection-choice">
     <input type="checkbox" checked={allTournaments} onChange={e=>saveSelection(e.target.checked,selectedIds)}/>
     Mostra tutti i tornei aperti
    </label>
    <div className="desk-selection-list">
     {items.map(t=><label className="desk-selection-choice" key={t.id}>
      <input type="checkbox" checked={allTournaments||selectedIds.includes(t.id)}
       onChange={()=>{
        const next=selectedIds.includes(t.id)?selectedIds.filter(id=>id!==t.id):[...selectedIds,t.id]
        saveSelection(false,next)
       }}/>
      <span>{t.name}{t.date?' · '+new Date(t.date).toLocaleDateString('it-IT'):''}</span>
     </label>)}
     {!items.length&&<span>Nessun torneo aperto disponibile.</span>}
    </div>
    <button className="desk-selection-done" type="button" onClick={()=>setSelectionOpen(false)}>Fatto</button>
   </div>
  </div>}
  <footer className="desk-footer">
   <div className="desk-controls">
    <button type="button" onClick={()=>setSelectionOpen(v=>!v)}>Seleziona tornei</button>
    <button type="button" onClick={()=>move(-1)} disabled={slides.length<2}>‹</button>
    <button type="button" onClick={()=>setPaused(p=>!p)}>{paused?'▶':'Ⅱ'}</button>
    <button type="button" onClick={()=>move(1)} disabled={slides.length<2}>›</button>
    <label>CAMBIA OGNI<select value={duration} onChange={e=>changeDuration(Number(e.target.value))}>
     {INTERVALS.map(n=><option key={n} value={n}>{n} sec</option>)}
    </select></label>
    <button type="button" onClick={()=>{setRefreshing(true);void reload()}} disabled={refreshing} title="Aggiorna">↻</button>
    <button type="button" onClick={fullscreen} title="Schermo intero">⛶</button>
    <Link href="/atleta/tornei">Esci</Link>
   </div>
   <div className="desk-footer-right">
    <span>{slides.length?'SCHERMATA '+(position+1)+' / '+slides.length:'IN ATTESA'}</span>
    <div className="desk-dots">{slides.map((s,i)=><button type="button" key={s.key}
     className={position===i?'active':''} onClick={()=>setPosition(i)}
     title={s.tournament.name+' · '+(s.group?.letter||s.bracket?.title||'')}/>)}</div>
    {updated&&<small>AGGIORNATO {new Date(updated).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</small>}
   </div>
  </footer>
  <div className="desk-progress"><div style={{width:paused||selectionOpen?'0%':progress+'%'}}/></div>
 </div>
}
