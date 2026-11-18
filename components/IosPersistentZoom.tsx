'use client'

import {useEffect} from 'react'

const KEY='mattabel:ios:page-zoom'
const MIN=0.7
const MAX=1.6
const EXCLUDED='.mt-athlete-ranking-scroll, .mt-athlete-zoom-panel, .mt-bracket-board-viewport, .mt-rankings-dialog, .mt-rankings-floating-dialog'
const clamp=(value:number)=>Math.max(MIN,Math.min(MAX,Math.round(value*100)/100))

/**
 * Apple standalone Web Apps sometimes rubber-band the native viewport pinch.
 * A persisted CSS zoom applies to the ordinary page instead; the bespoke
 * bracket/ranking zoom surfaces continue handling their own two-finger pinch.
 */
export default function IosPersistentZoom(){
  useEffect(()=>{
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)
      ||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
    const standalone=window.matchMedia('(display-mode: standalone)').matches
      ||Boolean((navigator as Navigator & {standalone?:boolean}).standalone)
    if(!ios||!standalone)return

    let zoom=1
    try{
      const saved=Number(localStorage.getItem(KEY))
      if(Number.isFinite(saved)&&saved>0)zoom=clamp(saved)
    }catch{}
    const apply=(value:number)=>{
      zoom=clamp(value)
      document.documentElement.style.zoom=String(zoom)
    }
    apply(zoom)

    let start:{distance:number;zoom:number}|null=null
    let ownGesture=false
    let wasZooming=false
    const distance=(touches:TouchList)=>Math.hypot(
      touches[0].clientX-touches[1].clientX,
      touches[0].clientY-touches[1].clientY
    )
    const excluded=(target:EventTarget|null)=>
      target instanceof Element&&Boolean(target.closest(EXCLUDED))
    const save=()=>{
      try{localStorage.setItem(KEY,String(zoom))}catch{}
    }
    const begin=(event:TouchEvent)=>{
      if(event.touches.length!==2)return
      ownGesture=!excluded(event.target)
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
    // iOS Safari also dispatches proprietary gesture events. Prevent WebKit
    // from starting a competing viewport zoom only for our ordinary pages.
    const gesture=(event:Event)=>{
      if(excluded(event.target))return
      if(event.cancelable)event.preventDefault()
    }
    // Keep current size while the app is open; never reset on touchend.
    document.addEventListener('touchstart',begin,{passive:true,capture:true})
    document.addEventListener('touchmove',move,{passive:false,capture:true})
    document.addEventListener('touchend',end,{passive:true,capture:true})
    document.addEventListener('touchcancel',end,{passive:true,capture:true})
    document.addEventListener('gesturestart',gesture,{passive:false,capture:true})
    document.addEventListener('gesturechange',gesture,{passive:false,capture:true})
    return()=>{
      save()
      document.documentElement.style.zoom=''
      document.removeEventListener('touchstart',begin,true)
      document.removeEventListener('touchmove',move,true)
      document.removeEventListener('touchend',end,true)
      document.removeEventListener('touchcancel',end,true)
      document.removeEventListener('gesturestart',gesture,true)
      document.removeEventListener('gesturechange',gesture,true)
    }
  },[])
  return null
}
