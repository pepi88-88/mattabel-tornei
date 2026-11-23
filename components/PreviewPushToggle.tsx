'use client'
import {useEffect,useState} from 'react'
function keyBytes(value:string){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function saveSubscription(sub:PushSubscription,action:string){const r=await fetch('/api/public/preview-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...sub.toJSON(),action})});if(!r.ok)throw new Error('Salvataggio non riuscito')}
export default function PreviewPushToggle(){
 const [key,setKey]=useState(''),[active,setActive]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dismissed,setDismissed]=useState(true)
 useEffect(()=>{fetch('/api/public/preview-push',{cache:'no-store'}).then(r=>r.json()).then(async c=>{
 if(!c.enabled)return
 setKey(c.publicKey);setDismissed(localStorage.getItem('preview-push-dismissed')==='1')
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return
 const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription()
 setActive(!!sub&&Notification.permission==='granted');setReady(true)
 }).catch(()=>{})},[])
 async function toggle(){setBusy(true);setError('');try{if(!active&&await Notification.requestPermission()!=='granted')throw new Error('Autorizza le notifiche nelle impostazioni del browser.');const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription()
 if(active&&sub){await saveSubscription(sub,'remove');await sub.unsubscribe();setActive(false);localStorage.setItem('preview-push-dismissed','1');setDismissed(true)}
 else{sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});await saveSubscription(sub,'add');setActive(true);setDismissed(true)}
 }catch(e){setError(e instanceof Error?e.message:'Notifiche non disponibili')}finally{setBusy(false)}}
 if(!key)return null
 return <div className="card p-3 mx-2 my-2 flex flex-wrap items-center gap-2 text-sm">
 <span className="flex-1">{active?'Notifiche attive':!dismissed?'Vuoi ricevere le notifiche Mattabel?':'Notifiche disattivate'}</span>
 {ready?<button type="button" disabled={busy} className="rounded-lg border border-orange-500 px-3 py-2" onClick={()=>void toggle()}>{active?'Disattiva':'Attiva notifiche'}</button>:<span>Su iPhone aggiungi il sito alla schermata Home; usa un browser compatibile.</span>}
 {!active&&!dismissed&&<button type="button" className="rounded-lg border border-neutral-600 px-3 py-2" onClick={()=>{localStorage.setItem('preview-push-dismissed','1');setDismissed(true)}}>Non ora</button>}
 {error&&<p role="alert" className="w-full text-red-400">{error}</p>}
 </div>
}
