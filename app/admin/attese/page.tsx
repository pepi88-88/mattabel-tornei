'use client'

import * as React from 'react'

type Match = { id:number; phase:string; a:string; b:string|null; ta:number; tb:number }
const seed:Match[] = [
  {id:1,phase:'Girone A',a:'Rossi / Bianchi',b:'Verdi / Neri',ta:48,tb:12},
  {id:2,phase:'Quarti Gold',a:'Marini / Conti',b:null,ta:36,tb:0},
  {id:3,phase:'Girone B',a:'Galli / Ferri',b:'Costa / Riva',ta:22,tb:17},
  {id:4,phase:'Semifinale Silver',a:'Moretti / Ricci',b:'Leoni / Fabbri',ta:8,tb:0},
]
const fmt=(m:number)=>m>=60?`${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`:`${m} min`
const tone=(m:number)=>m>45?'text-red-400':m>30?'text-orange-400':m>15?'text-yellow-400':'text-green-400'
export default function AtteseDemo(){
 const [matches,setMatches]=React.useState<Match[]>(seed)
 const [elapsed,setElapsed]=React.useState(0)
 const [tour,setTour]=React.useState('demo')
 const [highlight,setHighlight]=React.useState<number|null>(null)
 const rows=matches.map(m=>({...m,wa:m.ta+elapsed,wb:m.b?m.tb+elapsed:0})).sort((a,b)=>Math.max(b.wa,b.wb)-Math.max(a.wa,a.wb))
 const people=rows.flatMap(m=>[{name:m.a,wait:m.wa,id:m.id},...(m.b?[{name:m.b,wait:m.wb,id:m.id}]:[])]).sort((a,b)=>b.wait-a.wait)
 const reset=()=>{setMatches(seed);setElapsed(0);setHighlight(null)}
 return <div className="space-y-5">
   <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Attese — anteprima</h1><p className="text-neutral-400 text-sm">Solo simulazione: nessun risultato reale viene letto o modificato.</p></div><span className="rounded-full bg-amber-900/50 px-3 py-1 text-amber-200 text-sm">DEMO</span></div>
   <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 space-y-3">
    <label className="block text-sm">Torneo di prova <select className="block mt-1 bg-neutral-800 border border-neutral-600 rounded p-2 w-full max-w-sm" value={tour} onChange={e=>{setTour(e.target.value);reset()}}><option value="demo">Tour di prova · Maschile</option><option value="next">Tour successivo · Vuoto</option></select></label>
    <div className="flex flex-wrap items-center gap-2"><strong>Tempo simulato: {fmt(elapsed)}</strong>{[15,30,60].map(n=><button key={n} className="rounded bg-blue-800 px-3 py-2 hover:bg-blue-700" onClick={()=>setElapsed(v=>v+n)}>+{n} min</button>)}<button className="rounded border border-neutral-600 px-3 py-2" onClick={reset}>Ripristina</button></div>
   </div>
   {tour==='next'?<p className="p-6 text-neutral-400">Nessuna partita nel torneo selezionato.</p>:<div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3">
    <section className="space-y-3 min-w-0"><h2 className="font-semibold">Sfide da giocare ({rows.length})</h2>{rows.map((m,i)=><article key={m.id} className={`rounded-xl border p-3 space-y-2 ${highlight===m.id?'border-orange-400 bg-neutral-800':'border-neutral-700 bg-neutral-900'}`}>
      <div className="text-xs text-neutral-400">{i+1}. {m.phase}</div>
      <div className="text-sm font-semibold break-words">{m.a}</div><div className={`font-bold ${tone(m.wa)}`}>{fmt(m.wa)}</div>
      <div className="text-xs text-neutral-500">VS</div><div className="text-sm font-semibold break-words">{m.b||'— Da definire'}</div><div className={`font-bold ${m.b?tone(m.wb):'text-neutral-500'}`}>{m.b?fmt(m.wb):'—'}</div>
      {m.b?<button className="rounded bg-neutral-700 hover:bg-neutral-600 px-3 py-2 text-sm w-full" onClick={()=>{setMatches(v=>v.filter(x=>x.id!==m.id));setHighlight(null)}}>Concludi sfida (demo)</button>:<button className="rounded bg-neutral-700 hover:bg-neutral-600 px-3 py-2 text-sm w-full" onClick={()=>setMatches(v=>v.map(x=>x.id===m.id?{...x,b:'Nuova / Coppia',tb:-elapsed}:x))}>Definisci avversario</button>}
    </article>)}{!rows.length&&<p className="text-neutral-400">Nessuna sfida rimasta.</p>}</section>
    <section className="space-y-2 min-w-0"><h2 className="font-semibold">Coppie ({people.length})</h2>{people.map((p,i)=><button key={p.name+p.id} onClick={()=>setHighlight(p.id)} className={`w-full rounded-lg text-left p-2 border ${highlight===p.id?'border-orange-400':'border-neutral-700'} bg-neutral-900`}><div className="text-xs text-neutral-400">#{i+1}</div><div className="text-sm break-words">{p.name}</div><div className={`font-bold ${tone(p.wait)}`}>{fmt(p.wait)}</div></button>)}</section>
   </div>}
   <p className="text-xs text-neutral-500">I pulsanti e i tempi di questa anteprima sono simulati. La versione definitiva dovrà leggere i risultati dal server, mantenere i timer persistenti e gestire eliminazioni e ripescaggi.</p>
 </div>
}
