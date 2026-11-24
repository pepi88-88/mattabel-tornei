'use client'
import {useEffect,useState} from 'react'
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
 const [prefsReady,setPrefsReady]=useState(false)
 const [pushTemplates,setPushTemplates]=useState<{name:string;message:string}[]>([])
 const [showPushPreview,setShowPushPreview]=useState(false),[showDevices,setShowDevices]=useState(false)
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem('mattabel-notifiche-prefs')||'{}');if(typeof p.tid==='string')setTid(p.tid);if([1,2,3].includes(p.columns))setColumns(p.columns);if(['push','contacts','confirm'].includes(p.tab))setTab(p.tab);const t=JSON.parse(localStorage.getItem('mattabel-notifiche-push-templates')||'[]');if(Array.isArray(t))setPushTemplates(t.filter(x=>typeof x?.name==='string'&&typeof x?.message==='string'))}catch{}finally{setPrefsReady(true)}},[])
 useEffect(()=>{if(prefsReady)try{localStorage.setItem('mattabel-notifiche-prefs',JSON.stringify({tid,columns,tab}))}catch{}},[tid,columns,tab,prefsReady])
 useEffect(()=>{if(prefsReady)try{localStorage.setItem('mattabel-notifiche-push-templates',JSON.stringify(pushTemplates))}catch{}},[pushTemplates,prefsReady])
 useEffect(()=>{if(prefsReady&&tournaments?.items&&tid&&!tournaments.items.some((t:any)=>t.id===tid))setTid('')},[prefsReady,tournaments,tid])
 const templates=[{name:'Conferma torneo',message:'Ciao {nome}! Ti chiedo conferma per il torneo {torneo} del {data}. Mi fai sapere? Grazie!'},{name:'Promemoria torneo',message:'Ciao {nome}! Ti ricordo il torneo {torneo} del {data}. Ti aspettiamo!'}]
 const selectedTournament=tournaments?.items?.find((t:any)=>t.id===tid)
 const pushTournament=selectedTournament?.name?' '+selectedTournament.name:''
 const pushDate=selectedTournament?.event_date?' del '+String(selectedTournament.event_date).slice(0,10).split('-').reverse().join('/'):''
 const quickPush=[{name:'Promemoria torneo',message:'Promemoria: vi ricordiamo il prossimo torneo Mattabel'+pushTournament+pushDate+'. Vi aspettiamo!'},{name:'Posto libero',message:'Si è appena liberato un posto per il torneo'+pushTournament+pushDate+'. Chi è interessato può contattare Mattabel!'},{name:'Posto disponibile',message:'Ci sono ancora posti disponibili per il torneo'+pushTournament+pushDate+'. Per informazioni e iscrizioni contattate Mattabel!'}]
 const [pushMessage,setPushMessage]=useState(''),[pushResult,setPushResult]=useState('')
 const {data:push,error:pushError,mutate:refreshPush}=useSWR(tab==='push'?'/api/notifiche/push':null,fetcher,{refreshInterval:5000})
 async function broadcast(){
  if(!pushMessage.trim()||!push?.enabled||!push.count)return
  setShowPushPreview(false)
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
 function whatsapp(id:string){let n=phone(id).replace(/\D/g,'');if(n.length===10&&n.startsWith('3'))n='39'+n;if(!n)return;const p=players.find(p=>p.id===id)||rows.flatMap(members).find(p=>p.id===id);const t=tournaments?.items?.find((x:any)=>x.id===tid);const date=t?.event_date?String(t.event_date).slice(0,10).split('-').reverse().join('/'):'da definire';const msg=(tab==='contacts'?'':message).replace(/\{nome\}/g,p?.first_name||'').replace(/\{torneo\}/g,t?.name||'Mattabel').replace(/\{data\}/g,date).trim();window.open('https://wa.me/'+n+(msg?'?text='+encodeURIComponent(msg):''),'_blank','noopener,noreferrer')}
 const button='rounded-lg border border-neutral-600 px-3 py-2 text-sm font-medium hover:border-orange-400 disabled:opacity-40'
 const selected={backgroundColor:'#ed850e',borderColor:'#ed850e',color:'#101c2d',fontWeight:700}
 const statusOptions=[{v:'present',l:'Presente',color:'#15803d'},{v:'absent',l:'Assente',color:'#b91c1c'},{v:'pending',l:'Da confermare',color:'#fbbf24'}]
 const contactedStyle={backgroundColor:'#fbbf24',borderColor:'#fbbf24',color:'#172033'}
 const teamStatus=(r:Registration)=>status(r.id)==='present'||status(r.id)==='absent'?status(r.id):members(r).some(p=>checked(p.id))?'pending':'untouched'
 const countContacted=rows.filter(r=>teamStatus(r)!=='untouched').length
 const countPending=rows.filter(r=>teamStatus(r)==='pending').length
 const playerColor=(r:Registration,p:Player)=>teamStatus(r)==='present'?'#4ade80':teamStatus(r)==='absent'?'#f87171':checked(p.id)?'#fbbf24':undefined
 const countPresent=rows.filter(r=>status(r.id)==='present').length
 const countAbsent=rows.filter(r=>status(r.id)==='absent').length
 const filteredRows=rows.filter(r=>filter==='all'||(filter==='uncontacted'?teamStatus(r)==='untouched':teamStatus(r)===filter))
 const columnPicker=<div className="flex gap-1" aria-label="Numero colonne">{([1,2,3] as const).map(n=><button key={n} type="button" className={button} style={columns===n?selected:undefined} aria-pressed={columns===n} onClick={()=>setColumns(n)}>{n} {n===1?'colonna':'colonne'}</button>)}</div>
 const gridClass='grid grid-cols-1 gap-3 items-stretch '+(columns===3?'md:grid-cols-2 xl:grid-cols-3':columns===2?'md:grid-cols-2':'')
 async function removeDevice(id:string){if(!confirm('Rimuovere questo dispositivo dalle notifiche?'))return;setBusy(true);setError('');try{const r=await fetch('/api/notifiche/push',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const j=await r.json();if(!r.ok)throw new Error(j.error);await refreshPush()}catch(e){setError(e instanceof Error?e.message:'Rimozione non riuscita')}finally{setBusy(false)}}
 const wa=(id:string)=><button className={button+' !px-2 !py-1 !text-xs w-[76px] text-green-400 shrink-0'} disabled={!phone(id)} onClick={()=>whatsapp(id)}>WhatsApp</button>
 return <div className="space-y-3 px-1 py-2 sm:px-3"><h1 className="text-xl font-semibold text-center">Notifiche</h1>
 <div className="flex flex-wrap justify-center gap-2">{[['push','Notifiche push'],['contacts','Contatti atleti'],['confirm','Conferme torneo']].map(([id,label])=><button key={id} className={button} style={tab===id?selected:undefined} aria-pressed={tab===id} onClick={()=>{setTab(id);setFilter('all')}}>{label}</button>)}</div>
 {(error||loadError)&&<p role="alert" className="text-red-400">{error||loadError?.message}</p>}
 {tab==='push'?<div className="card p-4 space-y-3"><h2 className="font-semibold">Notifiche push</h2><p className="text-sm opacity-80">PREVIEW · Solo dispositivi iscritti a questo indirizzo di prova.</p>
 {pushError&&<p role="alert" className="text-red-400">{pushError.message}</p>}
 {!push?.enabled&&<p>Servizio push non ancora configurato.</p>}
 <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Dispositivi iscritti: <strong className="text-xl">{push?.count??'—'}</strong></p><button className={button} onClick={()=>void refreshPush()}>Aggiorna</button></div>

 <div className="flex flex-wrap items-center gap-2"><label htmlFor="push-tournament" className="text-sm font-medium">Torneo per i modelli (facoltativo)</label><select id="push-tournament" className="input min-w-0 flex-1" value={tid} onChange={e=>{setTid(e.target.value);setShowPushPreview(false)}}><option value="">Nessun torneo specifico</option>{(tournaments?.items||[]).map((t:any)=><option key={t.id} value={t.id}>{t.name} {t.event_date||''}</option>)}</select></div>
 <label className="block">Titolo: <strong>Mattabel</strong></label>
 <textarea className="input w-full min-h-[120px]" maxLength={500} value={pushMessage} onChange={e=>{setPushMessage(e.target.value);setShowPushPreview(false)}} placeholder="Scrivi una comunicazione…"/>
 <div className="flex flex-wrap gap-1">{[...quickPush,...pushTemplates].map((t,i)=><span key={i} className="inline-flex gap-1"><button type="button" className={button+' !py-1'} onClick={()=>{setPushMessage(t.message.slice(0,500));setShowPushPreview(false)}}>{t.name}</button>{i>=quickPush.length&&<button type="button" title="Elimina modello push" aria-label={'Elimina modello '+t.name} className={button+' !px-2 !py-1'} onClick={()=>{if(confirm('Eliminare il modello push?'))setPushTemplates(old=>old.filter((_,j)=>j!==i-quickPush.length))}}>×</button>}</span>)}<button type="button" className={button+' !py-1'} disabled={!pushMessage.trim()} onClick={()=>{const name=prompt('Nome del modello push')?.trim();if(name)setPushTemplates(old=>[...old,{name:name.slice(0,60),message:pushMessage.trim()}])}}>+ Salva modello</button></div>
 <div className="flex flex-wrap justify-between items-center gap-2"><span>{pushMessage.length}/500</span><button className={button} style={selected} disabled={busy||!push?.enabled||!push.count||!pushMessage.trim()} onClick={()=>setShowPushPreview(true)}>Anteprima e invia</button></div>
 {showPushPreview&&<div className="rounded-xl border-2 border-orange-500 p-4 space-y-3"><h3 className="font-bold">Anteprima notifica</h3><div className="rounded-xl border border-neutral-500 p-3"><strong>Mattabel</strong><p className="whitespace-pre-wrap break-words">{pushMessage}</p></div><p>Invio a {push?.count||0} dispositivi iscritti.</p><div className="flex gap-2"><button className={button} onClick={()=>setShowPushPreview(false)}>Annulla</button><button className={button} style={selected} disabled={busy||!push?.count||!pushMessage.trim()} onClick={()=>void broadcast()}>Conferma invio</button></div></div>}
 <button className={button} onClick={()=>setShowDevices(!showDevices)}>{showDevices?'Nascondi dispositivi':'Gestisci dispositivi'}</button>
 {showDevices&&<div className="space-y-2">{(push?.devices||[]).map((d:any)=><div key={d.id} className="flex items-center gap-2 border rounded-lg border-neutral-600 p-2"><span className="flex-1">{d.provider} · {d.id.slice(0,8)}</span><button className={button+' text-red-400'} disabled={busy} onClick={()=>void removeDevice(d.id)}>Rimuovi</button></div>)}{!push?.devices?.length&&<p>Nessun dispositivo iscritto.</p>}</div>}
 {pushResult&&<p role="status">{pushResult}</p>}
 <h3 className="font-semibold pt-3">Storico invii</h3>
 {(push?.history||[]).map((h:any)=><div key={h.id} className="border-b border-neutral-700 py-2"><p>{h.message}</p><p className="text-sm opacity-70">{new Date(h.created_at).toLocaleString('it-IT')} · Accettate: {h.sent} · Non riuscite: {h.failed}</p></div>)}
 {!push?.history?.length&&<p className="text-sm opacity-70">Nessun invio registrato.</p>}</div>:<>{tab==='confirm'&&<div className="card p-3 space-y-1"><label className="text-sm font-semibold" htmlFor="wa-message">Messaggio WhatsApp</label><textarea id="wa-message" className="input w-full min-h-[64px]" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Scrivi il messaggio da inviare…"/><p className="text-sm opacity-70">Conferma l’invio direttamente su WhatsApp. Nome, torneo e data vengono compilati all’apertura della chat.</p>
 <div className="flex flex-wrap gap-1">{templates.map(t=><button key={t.name} type="button" className={button+' !py-1'} onClick={()=>setMessage(t.message)}>{t.name}</button>)}</div></div>}
 {tab==='contacts'?<div className="card p-4 space-y-3"><div className="flex flex-wrap gap-2"><input className="input flex-1" placeholder="Cerca atleta" value={query} onChange={e=>setQuery(e.target.value)}/><select className="input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tutti</option><option value="with">Con numero</option><option value="without">Senza numero</option></select><button className={button} onClick={()=>setReveal(!reveal)}>{reveal?'Nascondi numeri':'Mostra numeri'}</button></div>
 {columnPicker}<div className={gridClass}>{players.filter(p=>(p.last_name+' '+p.first_name).toLowerCase().includes(query.toLowerCase())&&(filter==='all'||(filter==='with'?!!phone(p.id):!phone(p.id)))).map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 border rounded-lg border-neutral-600 p-2"><strong className="flex-1 min-w-0 break-words">{p.last_name} {p.first_name}</strong><span>{phone(p.id)?reveal?phone(p.id):'•••• '+phone(p.id).slice(-3):'Senza numero'}</span><button disabled={busy} className={button} onClick={()=>{const n=prompt('Numero con prefisso internazionale (vuoto per rimuovere)',phone(p.id));if(n!==null)void save({kind:'contact',player_id:p.id,phone:n.replace(/[\s()-]/g,'')})}}>Modifica</button>{wa(p.id)}</div>)}</div></div>:<div className="card p-3 space-y-3">
 <div className="flex flex-wrap items-center gap-2"><select aria-label="Torneo" className="input flex-1 min-w-[200px]" value={tid} onChange={e=>setTid(e.target.value)}><option value="">Seleziona torneo</option>{(tournaments?.items||[]).map((t:any)=><option key={t.id} value={t.id}>{t.name} {t.event_date||''}</option>)}</select>
 {columnPicker}</div>
 {regsError&&<p role="alert">Errore caricamento iscritti</p>}
 {tid&&<><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[{l:'Da contattare',n:countContacted+'/'+rows.length,c:'#60a5fa'},{l:'Presenti',n:countPresent,c:'#4ade80'},{l:'Assenti',n:countAbsent,c:'#f87171'},{l:'Da confermare',n:countPending,c:'#fbbf24'}].map(s=><div key={s.l} className="rounded-lg border border-neutral-600 px-3 py-2 flex items-center justify-between gap-2"><span>{s.l}</span><strong className="text-lg" style={{color:s.c}}>{s.n}</strong></div>)}</div>
 <div className="flex flex-wrap gap-1 items-center">{[['all','Tutte'],['uncontacted','Da contattare'],['pending','Da confermare'],['present','Presenti'],['absent','Assenti']].map(([v,l])=><button type="button" key={v} className={button+' !py-1'} style={filter===v?selected:undefined} aria-pressed={filter===v} onClick={()=>setFilter(v)}>{l}</button>)}<span className="text-xs opacity-70 ml-auto">{filteredRows.length} / {rows.length} coppie</span></div>
 <p className="text-xs opacity-75">Da contattare: {rows.length-countContacted} coppie rimanenti · Bianco: non contattato · Giallo: in attesa · Verde: presente · Rosso: assente</p>
 <div className={gridClass}>{filteredRows.map(r=><div key={r.id} className="rounded-xl border-2 px-3 py-2 flex flex-col gap-2 min-w-0 shadow-md" style={{borderColor:status(r.id)==='present'?'#15803d':status(r.id)==='absent'?'#b91c1c':teamStatus(r)==='pending'?'#fbbf24':'#66839c',backgroundColor:'rgba(100,150,190,.07)'}}>
 <div className="space-y-1 flex-1">{members(r).map((p,j)=><div key={p.id} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-1.5 text-sm"><span className="opacity-60 text-xs">{String.fromCharCode(65+j)}</span><strong className="break-words min-w-0 leading-tight" style={{color:playerColor(r,p)}}>{p.last_name} {p.first_name}</strong><div className="flex items-center justify-end gap-1 shrink-0"><button type="button" className={button+' !px-2 !py-1 !text-xs w-[94px] shrink-0'} style={checked(p.id)?contactedStyle:undefined} aria-pressed={checked(p.id)} disabled={busy||!data} onClick={()=>void save({kind:'check',player_id:p.id,tournament_id:tid,contacted:!checked(p.id)})}>{checked(p.id)?'✓':'□'} Contattato</button>{wa(p.id)}</div></div>)}
 {!members(r).length&&<strong>{r.label}</strong>}{members(r).length===1&&<span className="text-xs opacity-70 block py-1">Partner non assegnato</span>}</div>
 <div className="flex flex-wrap gap-1 items-center rounded-lg border border-neutral-500 px-2 py-1.5" style={{backgroundColor:'rgba(0,0,0,.13)'}}><span className="text-xs font-bold mr-1">Coppia:</span>{statusOptions.map(s=><button type="button" key={s.v} disabled={busy||!data||(s.v==='pending'&&teamStatus(r)==='untouched')} aria-pressed={teamStatus(r)===s.v} className={button+' !px-2 !py-1'} style={teamStatus(r)===s.v?{backgroundColor:s.color,borderColor:s.color,color:s.v==='pending'?'#172033':'#fff',fontWeight:700}:undefined} onClick={()=>void save({kind:'team',registration_id:r.id,tournament_id:tid,status:s.v})}>{teamStatus(r)===s.v?'✓ ':''}{s.l}</button>)}</div></div>)}</div>
 {!filteredRows.length&&<p className="text-sm opacity-70">{regs?'Nessuna coppia per questo filtro.':'Caricamento coppie…'}</p>}</>}
 </div>}</>}
 </div>
}
