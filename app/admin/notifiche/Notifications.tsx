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
 const [columns,setColumns]=useState<1|2|3>(2)
 const [pushMessage,setPushMessage]=useState(''),[pushResult,setPushResult]=useState('')
 const {data:push,error:pushError,mutate:refreshPush}=useSWR(tab==='push'?'/api/notifiche/push':null,fetcher,{refreshInterval:5000})
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
 const button='rounded-lg border border-neutral-600 px-3 py-2 text-sm font-medium hover:border-orange-400 disabled:opacity-40'
 const selected={backgroundColor:'#ed850e',borderColor:'#ed850e',color:'#101c2d',fontWeight:700}
 const statusOptions=[{v:'present',l:'Presente',color:'#15803d'},{v:'absent',l:'Assente',color:'#b91c1c'},{v:'pending',l:'Da confermare',color:'#fbbf24'}]
 const contactedStyle={backgroundColor:'#15803d',borderColor:'#15803d',color:'#fff'}
 const countContacted=new Set(rows.flatMap(members).filter(p=>checked(p.id)).map(p=>p.id)).size
 const countPresent=rows.filter(r=>status(r.id)==='present').length
 const countAbsent=rows.filter(r=>status(r.id)==='absent').length
 const filteredRows=rows.filter(r=>filter==='all'||(filter==='uncontacted'?!members(r).some(p=>checked(p.id)):status(r.id)===filter))
 const wa=(id:string)=><button className={button+' !px-2 !py-1 !text-xs w-[76px] text-green-400 shrink-0'} disabled={!phone(id)||!message.trim()} onClick={()=>whatsapp(id)}>WhatsApp</button>
 return <div className="space-y-3 px-1 py-2 sm:px-3"><h1 className="text-xl font-semibold text-center">Notifiche</h1>
 <div className="flex flex-wrap justify-center gap-2">{[['push','Notifiche push'],['contacts','Contatti atleti'],['confirm','Conferme torneo']].map(([id,label])=><button key={id} className={button} style={tab===id?selected:undefined} aria-pressed={tab===id} onClick={()=>{setTab(id);setFilter('all')}}>{label}</button>)}</div>
 {(error||loadError)&&<p role="alert" className="text-red-400">{error||loadError?.message}</p>}
 {tab==='push'?<div className="card p-4 space-y-3"><h2 className="font-semibold">Notifiche push</h2><p className="text-sm opacity-80">PREVIEW · Solo dispositivi iscritti a questo indirizzo di prova.</p>
 {pushError&&<p role="alert" className="text-red-400">{pushError.message}</p>}
 {!push?.enabled&&<p>Servizio push non ancora configurato.</p>}
 <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Dispositivi iscritti: <strong className="text-xl">{push?.count??'—'}</strong></p><button className={button} onClick={()=>void refreshPush()}>Aggiorna</button></div>
 <div className="rounded-lg border border-neutral-600 p-3 space-y-2 text-sm"><strong>Come collegare un dispositivo</strong><p>Apri la parte atleta sul dispositivo da autorizzare, premi Attiva notifiche e consenti le notifiche del browser. Usa sempre lo stesso indirizzo della Preview su entrambi i dispositivi.</p><div className="flex flex-wrap gap-2"><a href="/atleta/tornei" target="_blank" rel="noopener noreferrer" className={button}>Apri parte atleta</a><button className={button} onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/atleta/tornei');setPushResult('Link atleta copiato')}catch{setError('Copia il link dalla barra del browser')}}}>Copia link per il telefono</button></div><p className="opacity-75">iPhone: apri il sito in Safari, aggiungilo alla schermata Home e aprilo da lì. Il numero di dispositivi si aggiorna automaticamente.</p></div>
 <label className="block">Titolo: <strong>Mattabel</strong></label>
 <textarea className="input w-full min-h-[120px]" maxLength={500} value={pushMessage} onChange={e=>setPushMessage(e.target.value)} placeholder="Scrivi una comunicazione…"/>
 <div className="flex flex-wrap justify-between items-center gap-2"><span>{pushMessage.length}/500</span><button className={button} style={selected} disabled={busy||!push?.enabled||!push.count||!pushMessage.trim()} onClick={()=>void broadcast()}>Invia notifica</button></div>
 {pushResult&&<p role="status">{pushResult}</p>}
 <h3 className="font-semibold pt-3">Storico invii</h3>
 {(push?.history||[]).map((h:any)=><div key={h.id} className="border-b border-neutral-700 py-2"><p>{h.message}</p><p className="text-sm opacity-70">{new Date(h.created_at).toLocaleString('it-IT')} · Accettate: {h.sent} · Non riuscite: {h.failed}</p></div>)}
 {!push?.history?.length&&<p className="text-sm opacity-70">Nessun invio registrato.</p>}</div>:<><div className="card p-3 space-y-1"><label className="text-sm font-semibold" htmlFor="wa-message">Messaggio WhatsApp</label><textarea id="wa-message" className="input w-full min-h-[64px]" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Scrivi il messaggio da inviare…"/><p className="text-sm opacity-70">Il messaggio non viene salvato. Conferma l'invio direttamente su WhatsApp.</p></div>
 {tab==='contacts'?<div className="card p-4 space-y-3"><div className="flex flex-wrap gap-2"><input className="input flex-1" placeholder="Cerca atleta" value={query} onChange={e=>setQuery(e.target.value)}/><select className="input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tutti</option><option value="with">Con numero</option><option value="without">Senza numero</option></select><button className={button} onClick={()=>setReveal(!reveal)}>{reveal?'Nascondi numeri':'Mostra numeri'}</button></div>
 {players.filter(p=>(p.last_name+' '+p.first_name).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||(filter==='with'?!!phone(p.id):!phone(p.id)))).map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-700 py-2"><strong className="flex-1">{p.last_name} {p.first_name}</strong><span>{phone(p.id)?reveal?phone(p.id):'•••• '+phone(p.id).slice(-3):'Senza numero'}</span><button disabled={busy} className={button} onClick={()=>{const n=prompt('Numero con prefisso internazionale (vuoto per rimuovere)',phone(p.id));if(n!==null)void save({kind:'contact',player_id:p.id,phone:n.replace(/[\s()-]/g,'')})}}>Modifica</button>{wa(p.id)}</div>)}</div>:<div className="card p-3 space-y-3">
 <div className="flex flex-wrap items-center gap-2"><select aria-label="Torneo" className="input flex-1 min-w-[200px]" value={tid} onChange={e=>setTid(e.target.value)}><option value="">Seleziona torneo</option>{(tournaments?.items||[]).map((t:any)=><option key={t.id} value={t.id}>{t.name} {t.event_date||''}</option>)}</select>
 <div className="flex gap-1" aria-label="Numero colonne">{([1,2,3] as const).map(n=><button key={n} type="button" className={button} style={columns===n?selected:undefined} aria-pressed={columns===n} onClick={()=>setColumns(n)}>{n} {n===1?'colonna':'colonne'}</button>)}</div></div>
 {regsError&&<p role="alert">Errore caricamento iscritti</p>}
 {tid&&<><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[{l:'Contattati',n:countContacted,c:'#60a5fa'},{l:'Presenti',n:countPresent,c:'#4ade80'},{l:'Assenti',n:countAbsent,c:'#f87171'},{l:'Da confermare',n:rows.length-countPresent-countAbsent,c:'#fbbf24'}].map(s=><div key={s.l} className="rounded-lg border border-neutral-600 px-3 py-2 flex items-center justify-between gap-2"><span>{s.l}</span><strong className="text-lg" style={{color:s.c}}>{s.n}</strong></div>)}</div>
 <div className="flex flex-wrap gap-1 items-center">{[['all','Tutte'],['uncontacted','Da contattare'],['pending','Da confermare'],['present','Presenti'],['absent','Assenti']].map(([v,l])=><button type="button" key={v} className={button+' !py-1'} style={filter===v?selected:undefined} aria-pressed={filter===v} onClick={()=>setFilter(v)}>{l}</button>)}<span className="text-xs opacity-70 ml-auto">{filteredRows.length} / {rows.length} coppie</span></div>
 <div className={'grid grid-cols-1 gap-3 items-stretch '+(columns===3?'md:grid-cols-2 xl:grid-cols-3':columns===2?'md:grid-cols-2':'')}>{filteredRows.map(r=><div key={r.id} className="rounded-xl border-2 px-3 py-2 flex flex-col gap-2 min-w-0 shadow-md" style={{borderColor:status(r.id)==='present'?'#15803d':status(r.id)==='absent'?'#b91c1c':'#66839c',backgroundColor:'rgba(100,150,190,.07)'}}>
 <div className="space-y-1 flex-1">{members(r).map((p,j)=><div key={p.id} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-1.5 text-sm"><span className="opacity-60 text-xs">{String.fromCharCode(65+j)}</span><strong className="break-words min-w-0 leading-tight">{p.last_name} {p.first_name}</strong><div className="flex items-center justify-end gap-1 shrink-0"><button type="button" className={button+' !px-2 !py-1 !text-xs w-[94px] shrink-0'} style={checked(p.id)?contactedStyle:undefined} aria-pressed={checked(p.id)} disabled={busy||!data} onClick={()=>void save({kind:'check',player_id:p.id,tournament_id:tid,contacted:!checked(p.id)})}>{checked(p.id)?'✓':'□'} Contattato</button>{wa(p.id)}</div></div>)}
 {!members(r).length&&<strong>{r.label}</strong>}{members(r).length===1&&<span className="text-xs opacity-70 block py-1">Partner non assegnato</span>}</div>
 <div className="flex flex-wrap gap-1 items-center rounded-lg border border-neutral-500 px-2 py-1.5" style={{backgroundColor:'rgba(0,0,0,.13)'}}><span className="text-xs font-bold mr-1">Coppia:</span>{statusOptions.map(s=><button type="button" key={s.v} disabled={busy||!data} aria-pressed={status(r.id)===s.v} className={button+' !px-2 !py-1'} style={status(r.id)===s.v?{backgroundColor:s.color,borderColor:s.color,color:s.v==='pending'?'#172033':'#fff',fontWeight:700}:undefined} onClick={()=>void save({kind:'team',registration_id:r.id,tournament_id:tid,status:s.v})}>{status(r.id)===s.v?'✓ ':''}{s.l}</button>)}</div></div>)}</div>
 {!filteredRows.length&&<p className="text-sm opacity-70">{regs?'Nessuna coppia per questo filtro.':'Caricamento coppie…'}</p>}</>}
 </div>}</>}
 </div>
}
