'use client'
import {useEffect,useState} from 'react'

const available=[
 {href:'/admin/gironi',label:'Gironi'},
 {href:'/admin/crea-tabellone',label:'Creazione Tabellone'},
 {href:'/admin/risultati',label:'Risultati Girone/Tabellone'},
 {href:'/admin/pagamenti',label:'Pagamenti'}
]
export default function OfflineUnavailablePage(){
 const [requested,setRequested]=useState('')
 useEffect(()=>{
  try {setRequested(sessionStorage.getItem('mattabel:offline:last-unavailable')||'')}catch{}
 },[])
 return <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-5 sm:p-8">
  <h1 className="text-2xl font-bold text-white">Questa pagina richiede Internet</h1>
  <p className="text-slate-300">
   {requested?('La sezione '+requested+' non è disponibile offline. '):''}
   La barra dei menu rimane utilizzabile: puoi tornare alle funzioni che hai preparato sul dispositivo.
  </p>
  <div className="grid gap-2 sm:grid-cols-2">
   {available.map(item=><a key={item.href} className="rounded-lg border border-sky-800 bg-slate-800 p-3 text-center font-semibold text-sky-100" href={item.href}>{item.label}</a>)}
  </div>
 </section>
}
