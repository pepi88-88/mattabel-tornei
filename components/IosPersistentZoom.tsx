'use client'

import {useEffect} from 'react'
import {usePathname} from 'next/navigation'

const KEY='mattabel:ios:page-zoom'
const MIN=0.7
const MAX=1.6
const EXCLUDED='.mt-athlete-ranking-scroll, .mt-athlete-zoom-panel, .mt-bracket-board-viewport, .mt-rankings-dialog, .mt-rankings-floating-dialog'
const clamp=(value:number)=>Math.max(MIN,Math.min(MAX,Math.round(value*100)/100))

/** Persistent pinch for ordinary content on installed iOS Web Apps.
 *  Never zoom the document root or fixed header: at fractional zoom levels
 *  iOS rasterizes the header and makes it blurry. The landing/login pages
 *  and dedicated bracket/ranking zooms are excluded.
 */
export default function IosPersistentZoom(){
  const pathname=usePathname()
  useEffect(()=>{
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)
      ||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      ||Boolean((navigator as Navigator & {standalone?:boolean}).standalone)
    if(!ios||!standalone)return
    // Welcome and Staff login must never inherit the Staff content zoom.
    if(!pathname?.startsWith('/admin')&&!pathname?.startsWith('/atleta'))return

    const content=document.getElementById('mattabel-main-content')
    if(!content)return
    let zoom=1
    try{
      const saved=Number(localStorage.getItem(KEY))
      if(Number.isFinite(saved)&&saved>0)zoom=clamp(saved)
    }catch{}
    const apply=(value:number)=>{
      zoom=clamp(value)
      content.style.zoom=String(zoom)
      // Keep the content's visible width equal to the device width at any zoom.
      content.style.width=`${100/zoom}%`
      content.style.maxWidth='none'
    }
    apply(zoom)
    let start:{distance:number;zoom:number}|null=null
    let ownGesture=false
    let wasZooming=false
    const distance=(touches:TouchList)=>Math.hypot(
      touches[0].clientX-touches[1].clientX,
      touches[0].clientY-touches[1].clientY
    )
    const isExcluded=(target:EventTarget|null)=>
      target instanceof Element&&Boolean(target.closest(EXCLUDED))
    const isContent=(target:EventTarget|null)=>
      target instanceof Node&&content.contains(target)
    const save=()=>{try{localStorage.setItem(KEY,String(zoom))}catch{}}
    const begin=(event:TouchEvent)=>{
      if(event.touches.length!==2)return
      ownGesture=isContent(event.target)&&!isExcluded(event.target)
      if(!ownGesture){start=null;return}
      const dist=distance(event.touches)
      if(dist>0)start={distance:dist,zoom}
    }
    const move=(event:TouchEvent)=>{
      if(event.touches.length!==2||!ownGesture)return
      if(!start){
        const dist=distance(event.touches)
        if(dist>0)start={distance:dist,zoom}
        return
      }
      if(event.cancelable)event.preventDefault()
      const ratio=distance(event.touches)/start.distance
      if(Number.isFinite(ratio)){
        apply(start.zoom*ratio)
        wasZooming=true
      }
    }
    const end=(event:TouchEvent)=>{
      if(event.touches.length>=2)return
      if(wasZooming)save()
      start=null
      ownGesture=false
      wasZooming=false
    }
    const gesture=(event:Event)=>{
      if(!isContent(event.target)||isExcluded(event.target))return
      if(event.cancelable)event.preventDefault()
    }
    document.addEventListener('touchstart',begin,{passive:true,capture:true})
    document.addEventListener('touchmove',move,{passive:false,capture:true})
    document.addEventListener('touchend',end,{passive:true,capture:true})
    document.addEventListener('touchcancel',end,{passive:true,capture:true})
    document.addEventListener('gesturestart',gesture,{passive:false,capture:true})
    document.addEventListener('gesturechange',gesture,{passive:false,capture:true})
    return()=>{
      save()
      content.style.zoom=''
      content.style.width=''
      content.style.maxWidth=''
      document.removeEventListener('touchstart',begin,true)
      document.removeEventListener('touchmove',move,true)
      document.removeEventListener('touchend',end,true)
      document.removeEventListener('touchcancel',end,true)
      document.removeEventListener('gesturestart',gesture,true)
      document.removeEventListener('gesturechange',gesture,true)
    }
  },[pathname])
  return null
}
