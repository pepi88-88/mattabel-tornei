'use client'
import {useEffect,useState} from 'react'
function keyBytes(value:string){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function saveSubscription(sub:PushSubscription,action:string){const r=await fetch('/api/public/preview-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sub.toJSON(),action})});if(!r.ok)throw new Error('Salvataggio non riuscito');return r.json()}
export default function PreviewPushToggle(){
 const [ios,setIos]=useState(false),[standalone,setStandalone]=useState(false),[guide,setGuide]=useState(false)
 const [key,setKey]=useState(''),[active,setActive]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dismissed,setDismissed]=useState(true)
 useEffect(()=>{const apple=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const installed=window.matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator & {standalone?:boolean}).standalone;setIos(apple);setStandalone(installed);setGuide(apple&&!installed);fetch('/api/public/preview-push',{cache:'no-store'}).then(r=>r.json()).then(async c=>{
 if(!c.enabled)return
 setKey(c.publicKey);setDismissed(localStorage.getItem('preview-push-dismissed')==='1')
 if(apple&&!installed)return
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return
 const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription()
 if(sub&&Notification.permission==='granted'){const saved=await saveSubscription(sub,'status');setActive(saved.active===true)};setReady(true)
 }).catch(()=>{setReady('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);setError('Impossibile verificare le notifiche. Riprova.')})},[])
 async function toggle(){setBusy(true);setError('');try{if(!active&&await Notification.requestPermission()!=='granted')throw new Error('Autorizza le notifiche nelle impostazioni del browser.');const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription()
 if(active&&sub){await saveSubscription(sub,'remove');await sub.unsubscribe();setActive(false);localStorage.setItem('preview-push-dismissed','1');setDismissed(true)}
 else{sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});await saveSubscription(sub,'add');setActive(true);setDismissed(true)}
 }catch(e){setError(e instanceof Error?e.message:'Notifiche non disponibili')}finally{setBusy(false)}}
 if(!key)return null
 return <div className="card p-3 mx-2 my-2 flex flex-wrap items-center gap-2 text-sm">
 <span className="flex-1 font-semibold">{active?'Notifiche attive':!dismissed?'Vuoi ricevere le notifiche Mattabel?':'Notifiche disattivate'}</span>
 {ios&&!standalone?<button type="button" className="rounded-lg px-3 py-2 font-bold" style={{backgroundColor:'#ed850e',color:'#101c2d'}} aria-expanded={guide} onClick={()=>setGuide(!guide)}>{guide?'Nascondi guida':'Installa su iPhone'}</button>:ready?<button type="button" disabled={busy} className="rounded-lg px-3 py-2 font-bold disabled:opacity-50" style={{backgroundColor:active?'#15803d':'#ed850e',color:active?'white':'#101c2d'}} onClick={()=>void toggle()}>{busy?'Attendi…':active?'Disattiva':'Attiva notifiche'}</button>:<span className="text-xs">Notifiche non disponibili oppure in preparazione. Verifica che il browser sia aggiornato.</span>}
 {ios&&!standalone&&guide&&<div className="w-full rounded-lg border border-neutral-500 p-3 space-y-2"><strong>Ricevi notifiche anche a sito chiuso</strong><p>Apri questa pagina in Safari e segui questi passaggi:</p><ol className="list-decimal pl-5 space-y-1"><li>Premi Condividi (quadrato con freccia verso l’alto).</li><li>Scorri e scegli Aggiungi alla schermata Home.</li><li>Se presente, attiva Apri come app web, poi premi Aggiungi.</li><li>Apri Mattabel dalla nuova icona e premi Attiva notifiche.</li></ol><p className="text-xs opacity-80">È necessario iOS 16.4 o successivo. Non serve l’App Store.</p></div>}
 {!active&&!dismissed&&!(ios&&!standalone)&&<button type="button" className="rounded-lg border border-neutral-600 px-3 py-2" onClick={()=>{localStorage.setItem('preview-push-dismissed','1');setDismissed(true)}}>Non ora</button>}
 {error&&<p role="alert" className="w-full text-red-400">{error}</p>}
 </div>
}
