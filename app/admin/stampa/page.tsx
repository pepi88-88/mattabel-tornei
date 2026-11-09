'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
const fetcher = (url:string) => fetch(url).then(r => { if (!r.ok) throw new Error('Errore caricamento'); return r.json() })
const LETTERS = 'ABCDEFGHIJKLMNOP'.split('')
const COLORS = ['#2563eb','#ef4444','#f59e0b','#8b5cf6','#10b981','#fb923c','#06b6d4','#a855f7','#22c55e','#f97316','#0ea5e9','#eab308','#84cc16','#f43f5e','#14b8a6','#64748b']
type State = {groupsCount:number;meta:Record<string,{capacity:number;format:string}>;assign:Record<string,string>;labels:Record<string,string>;times:Record<string,string[]>;gField:Record<string,string>;matchFields:Record<string,string[]>;matchOrder:Record<string,number[]>}
type Match = {a:string;b:string;idx:number}
function rr(n:number) { const t=Array.from({length:n},(_,i)=>i+1);if(t.length<2)return [] as [number,number][];if(t.length%2)t.push(0);const out:[number,number][]=[];for(let r=0;r<t.length-1;r++){for(let i=0;i<t.length/2;i++){const a=t[i],b=t[t.length-1-i];if(a&&b)out.push([a,b])}const fixed=t[0],rest=t.slice(1);rest.unshift(rest.pop()!);t.splice(0,t.length,fixed,...rest)}return out}
function textFit(ctx:CanvasRenderingContext2D,text:string,max:number){if(ctx.measureText(text).width<=max)return text;while(text.length>1&&ctx.measureText(text+'…').width>max)text=text.slice(0,-1);return text+'…'}
export default function StampaPage(){
 const {data:toursData}=useSWR('/api/tours',fetcher)
 const tours=toursData?.items||[]
 const [tourId,setTourId]=useState('')
 const [tId,setTId]=useState('')
 const {data:tappeData}=useSWR(tourId?'/api/tournaments?tour_id='+encodeURIComponent(tourId):null,fetcher)
 const tappe=(tappeData?.items||[]).filter((t:any)=>t.status!=='closed')
 const [state,setState]=useState<State|null>(null)
 const [error,setError]=useState('')
 const [mode,setMode]=useState<'all'|'groups'|'schedule'>('all')
 useEffect(()=>{if(!tourId&&tours.length){const saved=localStorage.getItem('selectedTourId');setTourId(tours.find((t:any)=>t.id===saved)?.id||tours[0].id)}},[tours,tourId])
 useEffect(()=>{if(!tappeData)return;setTId(old=>{const saved=localStorage.getItem('selectedTournamentId');return tappe.some((t:any)=>t.id===old)?old:(tappe.find((t:any)=>t.id===saved)?.id||tappe[0]?.id||'')})},[tappeData,tourId])
 useEffect(()=>{let cancelled=false;setState(null);setError('');if(!tId)return;fetch('/api/groups/state?tournament_id='+encodeURIComponent(tId),{headers:{'x-role':'admin'},cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Impossibile leggere i gironi');return r.json()}).then(j=>{if(!cancelled)setState(j.state||null)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[tId])
 const letters=LETTERS.slice(0,Math.max(0,Math.min(16,state?.groupsCount||0)))
 const label=(L:string,n:number)=>{const id=state?.assign?.[L+'-'+n];return id?(state?.labels?.[id]||'Slot '+n):'Slot '+n}
 const matches=(L:string):Match[]=>{
  const m=state?.meta?.[L],cap=m?.capacity||0
  const pairs=m?.format==='pool'&&cap===4?[[1,4],[2,3]]:rr(Math.min(cap,6))
  const rows:Match[]=pairs.map(([a,b],idx)=>({a:label(L,a),b:label(L,b),idx}))
  if(m?.format==='pool'&&cap===4){rows.push({a:'Vincente G1',b:'Vincente G2',idx:2},{a:'Perdente G1',b:'Perdente G2',idx:3})}
  const order=state?.matchOrder?.[L]||[]
  return rows.sort((a,b)=>{const x=order.indexOf(a.idx),y=order.indexOf(b.idx);return (x<0?order.length+a.idx:x)-(y<0?order.length+b.idx:y)})
 }
 const chosen=tappe.find((t:any)=>t.id===tId)
 const tour=tours.find((t:any)=>t.id===tourId)
 const cols=letters.length<=3?Math.max(1,letters.length):letters.length===4?2:3
 const court=(L:string,idx:number)=>state?.matchFields?.[L]?.[idx]??state?.gField?.[L]??''
 const downloadPNG=(exportMode:'all'|'groups'|'schedule'=mode)=>{
  if(!state||!letters.length)return
  const showGroups=exportMode!=='schedule',showSchedule=exportMode!=='groups'
  const width=1500,pad=42,gap=20
  const groupCols=cols,groupW=(width-pad*2-gap*(groupCols-1))/groupCols
  const groupRows=Math.ceil(letters.length/groupCols)
  const maxTeams=Math.max(4,...letters.map(L=>state.meta?.[L]?.capacity||0))
  const groupH=55+maxTeams*34
  const calCols=letters.length===3?3:letters.length===1?1:2
  const calW=(width-pad*2-gap*(calCols-1))/calCols
  const calRows=Math.ceil(letters.length/calCols)
  const calHeights=Array.from({length:calRows},(_,i)=>Math.max(85,...letters.slice(i*calCols,i*calCols+calCols).map(L=>58+matches(L).length*37)))
  const groupSectionH=showGroups?48+groupRows*(groupH+gap):0
  const calSectionH=showSchedule?58+calHeights.reduce((a,b)=>a+b+gap,0):0
  const between=showGroups&&showSchedule?66:0
  const height=160+groupSectionH+between+calSectionH+38
  const c=document.createElement('canvas');c.width=width;c.height=height
  const ctx=c.getContext('2d');if(!ctx)return
  ctx.fillStyle='#0b101a';ctx.fillRect(0,0,width,height)
  const title=(t:string,y:number,size:number,color:string)=>{ctx.textAlign='center';ctx.fillStyle=color;ctx.font='bold '+size+'px Arial';ctx.fillText(t,width/2,y)}
  title(tour?.name||'MATTABEL',45,24,'#fbbf24')
  title(chosen?.name||'GIRONI',96,38,'#ffffff')
  let y=135
  if(showGroups){
   title('GIRONI',y+24,26,'#ffffff');y+=48
   letters.forEach((L,i)=>{
    const countInRow=Math.min(groupCols,letters.length-Math.floor(i/groupCols)*groupCols)
    const rowWidth=countInRow*groupW+(countInRow-1)*gap
    const x=(width-rowWidth)/2+(i%groupCols)*(groupW+gap)
    const top=y+Math.floor(i/groupCols)*(groupH+gap)
    ctx.fillStyle='#1c2533';ctx.fillRect(x,top,groupW,groupH)
    ctx.fillStyle=COLORS[i];ctx.fillRect(x,top,groupW,48)
    ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='bold 23px Arial';ctx.fillText('GIRONE '+L,x+groupW/2,top+32)
    ctx.font='bold 20px Arial'
    for(let k=1;k<=(state.meta?.[L]?.capacity||0);k++)ctx.fillText(textFit(ctx,k+'. '+label(L,k),groupW-30),x+groupW/2,top+49+k*34)
   })
   y+=groupRows*(groupH+gap)
  }
  if(showGroups&&showSchedule){
   const cy=y+22;ctx.strokeStyle='#d6a34a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(pad,cy);ctx.lineTo(width/2-60,cy);ctx.moveTo(width/2+60,cy);ctx.lineTo(width-pad,cy);ctx.stroke()
   ctx.strokeStyle='#fbbf24';ctx.lineWidth=3;ctx.beginPath();ctx.arc(width/2,cy,22,0,Math.PI*2);ctx.stroke()
   ctx.beginPath();ctx.moveTo(width/2-18,cy-11);ctx.lineTo(width/2+18,cy+11);ctx.moveTo(width/2-18,cy+11);ctx.lineTo(width/2+18,cy-11);ctx.stroke()
   y+=66
  }
  if(showSchedule){
   title('CALENDARIO PARTITE',y+26,26,'#ffffff');y+=58
   for(let row=0;row<calRows;row++){
    const h=calHeights[row],subset=letters.slice(row*calCols,row*calCols+calCols)
    const rowWidth=subset.length*calW+(subset.length-1)*gap
    subset.forEach((L,i)=>{
     const x=(width-rowWidth)/2+i*(calW+gap),top=y
     ctx.fillStyle='#1c2533';ctx.fillRect(x,top,calW,h)
     ctx.fillStyle=COLORS[LETTERS.indexOf(L)];ctx.fillRect(x,top,calW,45)
     ctx.textAlign='center';ctx.fillStyle='white';ctx.font='bold 21px Arial';ctx.fillText('PARTITE '+L,x+calW/2,top+30)
     matches(L).forEach((m,j)=>{
      const yy=top+74+j*37,infoW=115,vsW=30,teamW=(calW-infoW-vsW-36)/2
      ctx.font='bold 17px Arial';ctx.textAlign='left';ctx.fillStyle='#fbbf24'
      ctx.fillText((state.times?.[L]?.[m.idx]||'--:--')+'  C.'+(court(L,m.idx)||'—'),x+12,yy)
      ctx.fillStyle='#ffffff';ctx.font='bold 16px Arial';ctx.textAlign='right'
      ctx.fillText(textFit(ctx,m.a,teamW-8),x+infoW+teamW,yy)
      ctx.fillStyle='#fbbf24';ctx.textAlign='center';ctx.fillText('VS',x+infoW+teamW+vsW/2,yy)
      ctx.fillStyle='#ffffff';ctx.textAlign='left';ctx.fillText(textFit(ctx,m.b,teamW-8),x+infoW+teamW+vsW+5,yy)
     })
    });y+=h+gap
   }
  }
  const a=document.createElement('a')
  a.download=(exportMode==='groups'?'solo-gironi-':exportMode==='schedule'?'solo-calendari-':'gironi-e-calendari-')+(chosen?.name||'tappa').replace(/[^a-z0-9-]/gi,'-')+'.png'
  a.href=c.toDataURL('image/png');a.click()
 }
 return <div className="p-4 space-y-5">
  <div className="card p-4 flex flex-wrap items-end gap-3 print:hidden">
   <label className="text-sm">Tour<select className="input block mt-1" value={tourId} onChange={e=>{localStorage.setItem('selectedTourId',e.target.value);localStorage.removeItem('selectedTournamentId');setTourId(e.target.value);setTId('')}}>{tours.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="text-sm">Tappa<select className="input block mt-1" value={tId} onChange={e=>{localStorage.setItem('selectedTournamentId',e.target.value);setTId(e.target.value)}}>{tappe.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <div className="flex flex-wrap gap-2 items-center">
    {([['all','Completa'],['groups','Solo gironi'],['schedule','Solo calendari']] as const).map(([v,t])=><button type="button" key={v} onClick={()=>setMode(v)} className={'px-3 py-2 rounded border text-sm '+(mode===v?'bg-blue-700 border-amber-500 text-white':'bg-neutral-900 border-neutral-700 text-neutral-200')}>{t}</button>)}
   </div>
   <button className="btn" disabled={!state} onClick={()=>downloadPNG()}>Scarica PNG {mode==='all'?'completo':mode==='groups'?'solo gironi':'solo calendari'}</button>
   <button className="btn" disabled={!state} onClick={()=>window.print()}>Stampa / PDF</button>
  </div>
  {error&&<div className="text-red-400">{error}</div>}
  {!state&&!error&&<div className="text-neutral-400">Caricamento gironi...</div>}
  {state&&<div id="stampa-gironi" className="bg-[#0b101a] text-white p-5 rounded-lg space-y-7">
   <div className="text-center"><div className="text-amber-400 font-bold tracking-widest">{tour?.name||'MATTABEL'}</div><h1 className="text-2xl font-bold">{chosen?.name||'GIRONI'}</h1></div>
   {mode!=='schedule'&&<section><h2 className="text-center font-bold text-xl mb-4">GIRONI</h2><div className="grid gap-4" style={{gridTemplateColumns:'repeat('+cols+',minmax(0,1fr))'}}>{letters.map((L,i)=><div key={L} className="bg-[#1c2533] rounded overflow-hidden"><div className="px-3 py-3 font-bold text-center text-lg" style={{background:COLORS[i]}}>GIRONE {L}</div><div className="p-4 space-y-2 text-center">{Array.from({length:state.meta?.[L]?.capacity||0},(_,j)=><div key={j} className="text-sm font-semibold truncate" title={label(L,j+1)}>{j+1}. {label(L,j+1)}</div>)}</div></div>)}</div></section>}
   {mode==='all'&&<div className="flex items-center justify-center gap-4 py-2 text-amber-400"><div className="h-px bg-amber-500/50 flex-1"/><span className="text-3xl">◉</span><div className="h-px bg-amber-500/50 flex-1"/></div>}
   {mode!=='groups'&&<section><h2 className="text-center font-bold text-xl mb-4">CALENDARIO PARTITE</h2><div className="grid gap-4" style={{gridTemplateColumns:'repeat('+(letters.length===3?3:letters.length===1?1:2)+',minmax(0,1fr))'}}>{letters.map((L,i)=><div key={L} className="bg-[#1c2533] rounded overflow-hidden"><div className="px-3 py-3 font-bold text-center" style={{background:COLORS[i]}}>PARTITE {L}</div><div className="p-3 space-y-2">{matches(L).map(m=><div key={m.idx} className="grid gap-1 items-center text-xs" style={{gridTemplateColumns:'48px 34px minmax(0,1fr) 22px minmax(0,1fr)'}}><span className="font-semibold tabular-nums">{state.times?.[L]?.[m.idx]||'--:--'}</span><span className="text-amber-300">C.{court(L,m.idx)||'—'}</span><span className="truncate text-right font-semibold" title={m.a}>{m.a}</span><span className="text-amber-300 text-center font-bold">VS</span><span className="truncate font-semibold" title={m.b}>{m.b}</span></div>)}</div></div>)}</div></section>}
  </div>}
  <style jsx global>{`@media print{body{background:#0b101a!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body *{visibility:hidden}#stampa-gironi,#stampa-gironi *{visibility:visible}#stampa-gironi{position:absolute;left:0;top:0;width:100%;break-inside:avoid}}`}</style>
 </div>
}
