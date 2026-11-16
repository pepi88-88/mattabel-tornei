'use client'
import {useState} from 'react'
import {offlineJSON} from '../lib/offlineClient'

export default function PrepareOffline({tournamentId,tourId,statusBadge}:{tournamentId:string;tourId?:string;statusBadge?:React.ReactNode}){
 const [status,setStatus]=useState('')
 const [busy,setBusy]=useState(false)
 const prepare=async()=>{
   if(!tournamentId || busy || !navigator.onLine)return
   setBusy(true);setStatus('Preparazione offline in corso…')
   try{
     // Copia aggiornata di anagrafica, gironi, tabelloni e pagamenti.
     const urls=[
       '/api/tours',
       '/api/tournaments?tour_id='+encodeURIComponent(tourId||localStorage.getItem('selectedTourId')||''),
       '/api/groups/state?tournament_id='+encodeURIComponent(tournamentId),
       '/api/brackets/state?tournament_id='+encodeURIComponent(tournamentId),
       '/api/registrations/for-payments?tournament_id='+encodeURIComponent(tournamentId),
       '/api/registrations/by-tournament?tournament_id='+encodeURIComponent(tournamentId),
     ]
     await Promise.all(urls.map(url=>offlineJSON(url,{requireNetwork:true})))
     const registration=await navigator.serviceWorker.ready
     if(!registration.active)throw new Error('Cache delle pagine non pronta')
     await new Promise<void>((resolve,reject)=>{
       const channel=new MessageChannel()
       channel.port1.onmessage=e=>e.data?.ok?resolve():reject(new Error(e.data?.error||'Errore offline'))
       registration.active?.postMessage({type:'MATTABEL_PREPARE_OFFLINE'},[channel.port2])
     })
     localStorage.setItem('mattabel:offline:ready:'+tournamentId,new Date().toISOString())
     setStatus('Gironi, tabelloni, pagamenti e pagine preparati su questo dispositivo.')
   }catch(e:any){setStatus('Preparazione incompleta: '+String(e?.message||e))}
   finally{setBusy(false)}
 }
 return <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-800 bg-slate-900/80 p-3 text-sm">
  <button type="button" disabled={!tournamentId||busy} onClick={prepare}
   className="rounded-md bg-blue-700 px-3 py-2 font-semibold text-white disabled:opacity-40">
   {busy?'Preparazione…':'Prepara offline'}
  </button>
  <span role="status" className="min-w-0 text-sky-200">{status||'Da premere con Internet prima del torneo, sul dispositivo che userai.'}</span>
  {statusBadge&&<div className="ml-auto shrink-0">{statusBadge}</div>}
 </div>
}
