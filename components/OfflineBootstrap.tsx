'use client'
import {useEffect} from 'react'

// Registra il Service Worker per la navigazione offline. Gli aggiornamenti
// sono proposti separatamente da AppUpdateNotice: nessun reload automatico.
export default function OfflineBootstrap(){
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return
  navigator.serviceWorker.register('/mattabel-offline-sw.js',{scope:'/'}).catch(()=>{})
 },[])
 return null
}
