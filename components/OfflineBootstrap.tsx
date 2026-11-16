'use client'
import {useEffect} from 'react'

// Il Service Worker serve soltanto a riaprire le pagine già preparate
// senza rete. Non aggiunge ancora installazione/app/webmanifest.
export default function OfflineBootstrap(){
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return
  navigator.serviceWorker.register('/mattabel-offline-sw.js',{scope:'/'}).catch(()=>{})
 },[])
 return null
}
