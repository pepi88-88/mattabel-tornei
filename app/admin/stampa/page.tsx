'use client'
import { useEffect, useMemo, useState } from 'react'
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
 useEffect(()=>{if(!tourId&&tours.length)setTourId(tours[0].id)},[tours,tourId])
 useEffect(()=>{setTId(old=>tappe.some((t:any)=>t.id===old)?old:(tappe[0]?.id||''))},[tappeData,tourId])
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
 const downloadPNG=()=>{
  if(!state)return
  const width=1500,pad=38,gap=16,cell=(width-pad*2-gap*(cols-1))/cols
  const groupsRows=Math.ceil(letters.length/cols),groupHeight=50+Math.max(4,...letters.map(L=>state.meta?.[L]?.capacity||0))*29
  const calendarRows=Math.ceil(letters.length/2),calW=(width-pad*2-gap)/2
  const calHeights=Array.from({length:calendarRows},(_,i)=>Math.max(...letters.slice(i*2,i*2+2).map(L=>55+matches(L).length*32),55))
  const height=155+groupsRows*(groupHeight+gap)+80+calHeights.reduce((a,b)=>a+b+gap,0)+45
  const c=document.createElement('canvas');c.width=width;c.height=height
  const ctx=c.getContext('2d');if(!ctx)return
  ctx.fillStyle='#0b101a';ctx.fillRect(0,0,width,height)
  ctx.textAlign='center';ctx.fillStyle='#f59e0b';ctx.font='bold 22px Arial';ctx.fillText(tour?.name||'MATTABEL',width/2,45)
  ctx.fillStyle='#ffffff';ctx.font='bold 34px Arial';ctx.fillText(chosen?.name||'GIRONI',width/2,88)
  ctx.font='bold 24px Arial';ctx.fillText('GIRONI',width/2,138)
  let y=155
  letters.forEach((L,i)=>{const x=pad+(i%cols)*(cell+gap),top=y+Math.floor(i/cols)*(groupHeight+gap);ctx.fillStyle='#1c2533';ctx.fillRect(x,top,cell,groupHeight);ctx.fillStyle=COLORS[i];ctx.fillRect(x,top,cell,40);ctx.textAlign='left';ctx.fillStyle='white';ctx.font='bold 19px Arial';ctx.fillText('GIRONE '+L,x+15,top+27);ctx.font='18px Arial';for(let k=1;k<=(state.meta?.[L]?.capacity||0);k++)ctx.fillText(textFit(ctx,k+'.  '+label(L,k),cell-28),x+14,top+40+k*29)})
  y+=groupsRows*(groupHeight+gap)+42;ctx.textAlign='center';ctx.fillStyle='white';ctx.font='bold 24px Arial';ctx.fillText('CALENDARIO PARTITE',width/2,y);y+=20
  for(let row=0;row<calendarRows;row++){const h=calHeights[row];letters.slice(row*2,row*2+2).forEach((L,i)=>{const x=pad+i*(calW+gap),top=y+15;ctx.fillStyle='#1c2533';ctx.fillRect(x,top,calW,h);ctx.fillStyle=COLORS[LETTERS.indexOf(L)];ctx.fillRect(x,top,calW,40);ctx.textAlign='left';ctx.fillStyle='white';ctx.font='bold 19px Arial';ctx.fillText('PARTITE '+L,x+14,top+27);matches(L).forEach((m,j)=>{const yy=top+67+j*32;ctx.font='16px Arial';ctx.fillStyle='#fbbf24';ctx.fillText((state.times?.[L]?.[m.idx]||'--:--')+'   C.'+(court(L,m.idx)||'—'),x+12,yy);ctx.fillStyle='#ffffff';ctx.font='15px Arial';ctx.fillText(textFit(ctx,m.a+'  vs  '+m.b,calW-175),x+175,yy)})});y+=h+gap}
  const a=document.createElement('a');a.download='gironi-'+(chosen?.name||'tappa').replace(/[^a-z0-9-]/gi,'-')+'.png';a.href=c.toDataURL('image/png');a.click()
 }
 return <div className="p-4 space-y-5">
  <div className="card p-4 flex flex-wrap items-end gap-3 print:hidden">
   <label className="text-sm">Tour<select className="input block mt-1" value={tourId} onChange={e=>{setTourId(e.target.value);setTId('')}}>{tours.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="text-sm">Tappa<select className="input block mt-1" value={tId} onChange={e=>setTId(e.target.value)}>{tappe.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <button className="btn" disabled={!state} onClick={downloadPNG}>Scarica immagine PNG</button>
   <button className="btn" disabled={!state} onClick={()=>window.print()}>Stampa / PDF</button>
  </div>
  {error&&<div className="text-red-400">{error}</div>}
  {!state&&!error&&<div className="text-neutral-400">Caricamento gironi...</div>}
  {state&&<div id="stampa-gironi" className="bg-[#0b101a] text-white p-5 rounded-lg space-y-7">
   <div className="text-center"><div className="text-amber-400 font-bold tracking-widest">{tour?.name||'MATTABEL'}</div><h1 className="text-2xl font-bold">{chosen?.name||'GIRONI'}</h1></div>
   <section><h2 className="text-center font-bold text-lg mb-3">GIRONI</h2><div className="grid gap-3" style={{gridTemplateColumns:'repeat('+cols+',minmax(0,1fr))'}}>{letters.map((L,i)=><div key={L} className="bg-[#1c2533] rounded overflow-hidden"><div className="px-3 py-2 font-bold" style={{background:COLORS[i]}}>GIRONE {L}</div><div className="p-3 space-y-1">{Array.from({length:state.meta?.[L]?.capacity||0},(_,j)=><div key={j} className="text-xs truncate">{j+1}. {label(L,j+1)}</div>)}</div></div>)}</div></section>
   <section><h2 className="text-center font-bold text-lg mb-3">CALENDARIO PARTITE</h2><div className="grid grid-cols-2 gap-3">{letters.map((L,i)=><div key={L} className="bg-[#1c2533] rounded overflow-hidden"><div className="px-3 py-2 font-bold" style={{background:COLORS[i]}}>PARTITE {L}</div><div className="p-2 space-y-2">{matches(L).map(m=><div key={m.idx} className="grid gap-2 items-center text-xs" style={{gridTemplateColumns:'43px 32px minmax(0,1fr)'}}><span className="font-semibold tabular-nums">{state.times?.[L]?.[m.idx]||'--:--'}</span><span className="text-amber-300">C.{court(L,m.idx)||'—'}</span><span className="truncate text-right">{m.a} <span className="text-neutral-400">vs</span> {m.b}</span></div>)}</div></div>)}</div></section>
  </div>}
  <style jsx global>{`@media print{body{background:#0b101a!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}body *{visibility:hidden}#stampa-gironi,#stampa-gironi *{visibility:visible}#stampa-gironi{position:absolute;left:0;top:0;width:100%;break-inside:avoid}}`}</style>
 </div>
}
