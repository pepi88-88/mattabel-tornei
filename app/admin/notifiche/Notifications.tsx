'use client'
import {useState} from 'react'
import useSWR from 'swr'
const fetcher=async(url:string)=>{const r=await fetch(url,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Errore');return j}
type Player={id:string;first_name:string;last_name:string}
type Registration={id:string;label:string;players:Record<string,Player|null>}
export default function Notifications(){
 const [tab,setTab]=useState('push'),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[tid,setTid]=useState(''),[reveal,setReveal]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const {data,error:loadError,mutate}=useSWR('/api/notifiche',fetcher,{refreshInterval:15000})
 const {data:tournaments}=useSWR('/api/tournaments',fetcher)
 const {data:regs,error:regsError}=useSWR(tid?'/api/registrations/by-tournament?tournament_id='+encodeURIComponent(tid):null,fetcher)
 const [pushMessage,setPushMessage]=useState(''),[pushResult,setPushResult]=useState('')
 const {data:push,error:pushError,mutate:refreshPush}=useSWR(tab==='push'?'/api/notifiche/push':null,fetcher)
 async function broadcast(){
  if(!pushMessage.trim()||!push?.enabled||!push.count||!confirm('Inviare questa notifica a '+push.count+' dispositivi di prova?'))return
  setBusy(true);setError('');setPushResult('')
  try{const r=await fetch('/api/notifiche/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:pushMessage,confirm:true})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Invio non riuscito');setPushResult('Accettate dal servizio push: '+j.sent+' · Non riuscite: '+j.failed+(j.historySaved?'':' · Storico non salvato'));setPushMessage('');await refreshPush()}catch(e){setError(e instanceof Error?e.message:'Errore invio')}finally{setBusy(false)}
 }
 const players:Player[]=data?.players||[]
 const phone=(id:string):string=>data?.contacts?.find((c:any)=>c.player_id===id)?.phone||''
 const checked=(id:string):boolean=>!!data?.checks?.find((c:any)=>c.player_id===id&&c.tournament_id===tid)?.contacted
 const status=(id:string):string=>data?.teams?.find((c:any)=>c.registration_id===id&&c.tournament_id===tid)?.status||'pending'
 const members=(r:Registration):Player[]=>Object.values(r.players||{}).filter((p):p is Player=>!!p?.id)
 const rows:Registration[]=regs?.items||[]
 async function save(payload:object){setError('');setBusy(true);try{const r=await fetch('/api/notifiche',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.error);await mutate()}catch(e){setError(e instanceof Error?e.message:'Errore')}finally{setBusy(false)}}
 function whatsapp(id:string){let n=phone(id).replace(/\D/g,'');if(n.length===10&&n.startsWith('3'))n='39'+n;if(!n)return;window.open('https://wa.me/'+n+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer')}
 const button='rounded-lg border border-neutral-600 px-3 py-2 hover:border-orange-400 disabled:opacity-40'
 const wa=(id:string)=><button className={button+' text-green-400'} disabled={!phone(id)||!message.trim()} onClick={()=>whatsapp(id)}>WhatsApp</button>
 return <div className="space-y-4 p-2 sm:p-4 xl:p-6"><h1 className="text-xl font-semibold text-center">Notifiche</h1>
 <div className="flex flex-wrap justify-center gap-2">{[['push','Notifiche push'],['contacts','Contatti atleti'],['confirm','Conferme torneo']].map(([id,label])=><button key={id} className={button+(tab===id?' border-orange-500 font-bold':'')} onClick={()=>{setTab(id);setFilter('all')}}>{label}</button>)}</div>
 {(error||loadError)&&<p role="alert" className="text-red-400">{error||loadError?.message}</p>}
 {tab==='push'?<div className="card p-4 space-y-3"><h2 className="font-semibold">Notifiche push</h2><p className="text-sm opacity-80">PREVIEW · Solo dispositivi iscritti a questo indirizzo di prova.</p>
 {pushError&&<p role="alert" className="text-red-400">{pushError.message}</p>}
 {!push?.enabled&&<p>Servizio push non ancora configurato.</p>}
 <p>Dispositivi iscritti: <strong>{push?.count??'—'}</strong></p>
 <label className="block">Titolo: <strong>Mattabel</strong></label>
 <textarea className="input w-full min-h-[120px]" maxLength={500} value={pushMessage} onChange={e=>setPushMessage(e.target.value)} placeholder="Scrivi una comunicazione…"/>
 <div className="flex flex-wrap justify-between items-center gap-2"><span>{pushMessage.length}/500</span><button className={button+' border-orange-500 font-bold'} disabled={busy||!push?.enabled||!push.count||!pushMessage.trim()} onClick={()=>void broadcast()}>Invia notifica</button></div>
 {pushResult&&<p role="status">{pushResult}</p>}
 <h3 className="font-semibold pt-3">Storico invii</h3>
 {(push?.history||[]).map((h:any)=><div key={h.id} className="border-b border-neutral-700 py-2"><p>{h.message}</p><p className="text-sm opacity-70">{new Date(h.created_at).toLocaleString('it-IT')} · Accettate: {h.sent} · Non riuscite: {h.failed}</p></div>)}
 {!push?.history?.length&&<p className="text-sm opacity-70">Nessun invio registrato.</p>}</div>:<><div className="card p-4 space-y-2"><label htmlFor="wa-message">Messaggio WhatsApp</label><textarea id="wa-message" className="input w-full min-h-[100px]" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Scrivi il messaggio da inviare…"/><p className="text-sm opacity-70">Il messaggio non viene salvato. Conferma l'invio direttamente su WhatsApp.</p></div>
 {tab==='contacts'?<div className="card p-4 space-y-3"><div className="flex flex-wrap gap-2"><input className="input flex-1" placeholder="Cerca atleta" value={query} onChange={e=>setQuery(e.target.value)}/><select className="input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tutti</option><option value="with">Con numero</option><option value="without">Senza numero</option></select><button className={button} onClick={()=>setReveal(!reveal)}>{reveal?'Nascondi numeri':'Mostra numeri'}</button></div>
 {players.filter(p=>(p.last_name+' '+p.first_name).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||(filter==='with'?!!phone(p.id):!phone(p.id)))).map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-700 py-2"><strong className="flex-1">{p.last_name} {p.first_name}</strong><span>{phone(p.id)?reveal?phone(p.id):'•••• '+phone(p.id).slice(-3):'Senza numero'}</span><button disabled={busy} className={button} onClick={()=>{const n=prompt('Numero con prefisso internazionale (vuoto per rimuovere)',phone(p.id));if(n!==null)void save({kind:'contact',player_id:p.id,phone:n.replace(/[\s()-]/g,'')})}}>Modifica</button>{wa(p.id)}</div>)}</div>:<div className="card p-4 space-y-3"><select className="input w-full" value={tid} onChange={e=>setTid(e.target.value)}><option value="">Seleziona torneo</option>{(tournaments?.items||[]).map((t:any)=><option key={t.id} value={t.id}>{t.name} {t.event_date||''}</option>)}</select>
 {regsError&&<p role="alert">Errore caricamento iscritti</p>}
 <div className="flex flex-wrap gap-4 text-sm"><span>Contattati: {new Set(rows.flatMap(members).filter(p=>checked(p.id)).map(p=>p.id)).size}</span><span>Confermate: {rows.filter(r=>status(r.id)==='present').length}</span><span>Da confermare: {rows.filter(r=>status(r.id)==='pending').length}</span></div>
 <select className="input" value={filter} onChange={e=>setFilter(e.target.value)}>{[['all','Tutte'],['uncontacted','Da contattare'],['pending','Da confermare'],['present','Presenti'],['absent','Assenti']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
 {rows.filter(r=>filter==='all'||(filter==='uncontacted'?!members(r).some(p=>checked(p.id)):status(r.id)===filter)).map(r=><div key={r.id} className="border border-neutral-700 rounded-lg p-3 space-y-2"><strong>{r.label}</strong>{members(r).map(p=><div key={p.id} className="flex flex-wrap items-center gap-2"><span className="flex-1">{p.last_name} {p.first_name}</span><label className="flex items-center gap-2"><input type="checkbox" checked={checked(p.id)} disabled={busy} onChange={e=>void save({kind:'check',player_id:p.id,tournament_id:tid,contacted:e.target.checked})}/>Contattato</label>{wa(p.id)}</div>)}<div className="flex flex-wrap gap-2">{[['present','Presente'],['absent','Assente'],['pending','Da confermare']].map(([v,l])=><button key={v} disabled={busy} className={button+(status(r.id)===v?' border-orange-500 font-bold':'')} onClick={()=>void save({kind:'team',registration_id:r.id,tournament_id:tid,status:v})}>{l}</button>)}</div></div>)}</div>}</>}
 </div>
}
