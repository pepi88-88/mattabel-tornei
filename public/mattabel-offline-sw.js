/* Mattabel offline navigation shell, no install prompt or PWA manifest.
   Private API responses are NOT stored in the Service Worker cache. */
const VERSION='mattabel-offline-pages-1'
const PAGES=['/admin/risultati','/admin/pagamenti','/admin/gironi']
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const keys=await caches.keys()
 await Promise.all(keys.filter(k=>k.startsWith('mattabel-offline-pages-')&&k!==VERSION).map(k=>caches.delete(k)))
 await self.clients.claim()
})()))
const isPage = url=>PAGES.some(p=>url.pathname===p)
self.addEventListener('fetch',event=>{
 const req=event.request
 if(req.method!=='GET')return
 const url=new URL(req.url)
 if(url.origin!==self.location.origin || url.pathname.startsWith('/api/'))return
 if(req.mode==='navigate' && isPage(url)){
   event.respondWith((async()=>{
     const cache=await caches.open(VERSION)
     try{
       const res=await fetch(req)
       // Non archiviare pagine di login ottenute dopo una scadenza della sessione.
       if(res.ok && !res.redirected && new URL(res.url).pathname===url.pathname)
         await cache.put(url.pathname,res.clone())
       return res
     }catch{
       return (await cache.match(url.pathname)) || Response.error()
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
