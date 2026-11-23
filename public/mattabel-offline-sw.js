/* Mattabel offline navigation shell. Private API responses are never
   cached. New Service Workers activate only after explicit user approval. */
const VERSION='mattabel-offline-pages-3'
const PAGES=['/admin/risultati','/admin/pagamenti','/admin/gironi','/admin/crea-tabellone','/admin/offline']
self.addEventListener('install',()=>{
 // Non sostituire un Service Worker attivo mentre lo Staff lavora offline.
 // Alla prima installazione (nessun worker attivo) l'attivazione è automatica.
})
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 // Salvaguarda pagine e asset che lo Staff ha preparato per lavorare offline.
 // Un aggiornamento dell'app non deve cancellare la preparazione esistente.
 const keys=await caches.keys()
 const oldKeys=keys.filter(k=>k.startsWith('mattabel-offline-pages-')&&k!==VERSION)
 const cache=await caches.open(VERSION)
 let migrationOk=true
 for(const key of oldKeys){
   try{
     const old=await caches.open(key)
     for(const req of await old.keys()){
       if(await cache.match(req))continue
       const saved=await old.match(req)
       if(saved)await cache.put(req,saved)
     }
   }catch{migrationOk=false}
 }
 if(migrationOk)await Promise.all(oldKeys.map(key=>caches.delete(key)))
 await self.clients.claim()
})()))
const isPage = url=>PAGES.some(p=>url.pathname===p)
self.addEventListener('fetch',event=>{
 const req=event.request
 if(req.method!=='GET')return
 const url=new URL(req.url)
 if(url.origin!==self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/notifiche'))return
 if(req.mode==='navigate'){
   event.respondWith((async()=>{
     const cache=await caches.open(VERSION)
     try{
       const res=await fetch(req)
       // Non archiviare pagine di login ottenute dopo una scadenza della sessione.
       if(res.ok && !res.redirected && new URL(res.url).pathname===url.pathname)
         await cache.put(url.pathname,res.clone())
       return res
     }catch{
       return (await cache.match(url.pathname)) || (await cache.match('/admin/offline')) || Response.error()
     }
   })())
   return
 }
 if(url.pathname.startsWith('/_next/static/')){
   event.respondWith((async()=>{
     const cache=await caches.open(VERSION)
     const hit=await cache.match(req)
     if(hit)return hit
     const res=await fetch(req)
     if(res.ok)cache.put(req,res.clone())
     return res
   })())
 }
})
self.addEventListener('message',event=>{
 if(event.data?.type==='MATTABEL_ACTIVATE_UPDATE'){
   self.skipWaiting()
   return
 }
 if(event.data?.type!=='MATTABEL_PREPARE_OFFLINE')return
 const port=event.ports?.[0]
 event.waitUntil((async()=>{
   try{
     const cache=await caches.open(VERSION)
     for(const path of PAGES){
       const res=await fetch(path,{credentials:'same-origin',cache:'no-store'})
       if(!res.ok || res.redirected || new URL(res.url).pathname!==path)
         throw new Error('Impossibile memorizzare '+path+' (accesso Staff richiesto)')
       const page=res.clone()
       await cache.put(path,res)
       // Memorizziamo anche gli script e i CSS referenziati nell'HTML,
       // altrimenti le pagine preparate non diventano interattive offline.
       const html=await page.text()
       const assets=[...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&'))
       for(const asset of new Set(assets)){
         const assetRes=await fetch(asset,{cache:'reload'})
         if(assetRes.ok)await cache.put(asset,assetRes)
       }
     }
     port?.postMessage({ok:true})
   }catch(err){port?.postMessage({ok:false,error:String(err)})}
 })())
})

self.addEventListener('push',event=>{
 let data={}
 try{data=event.data?.json()||{}}catch{}
 event.waitUntil(self.registration.showNotification('Mattabel',{body:String(data.body||'Nuova comunicazione Mattabel'),icon:'/pwa-icon/192',badge:'/pwa-icon/192'}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 event.waitUntil((async()=>{
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true})
 for(const client of windows){if(new URL(client.url).pathname.startsWith('/atleta'))return client.focus()}
 return self.clients.openWindow('/atleta/tornei')
 })())
})
