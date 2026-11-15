'use client'
import * as React from 'react'

export const LOGO_NAMES = [
 ['ufficiale','Ufficiale'],['befana','Befana'],['carnevale','Carnevale'],
 ['pasqua','Pasqua'],['master','Master'],['estate','Estate'],
 ['superspritz','SuperSpritz'],['halloween','Halloween'],['natale','Natale'],
] as const

export default function BrandLogo({
  width=100, height=100, className='', alt='Logo Mattabel Beach Volley', style,
}:{
  width?:number;height?:number;className?:string;alt?:string;style?:React.CSSProperties
}){
  const [active,setActive]=React.useState('ufficiale')
  const [broken,setBroken]=React.useState(false)
  const [version,setVersion]=React.useState('')
  React.useEffect(()=>{
    let live=true
    const refresh=async()=>{
      try{
        const r=await fetch('/api/branding',{cache:'no-store'})
        if(!r.ok)return
        const j=await r.json()
        if(live&&typeof j.active==='string'){
          setActive(j.active);setVersion(j.updatedAt||'')
          setBroken(false)
        }
      }catch{}
    }
    refresh()
    window.addEventListener('mattabel:brand-changed',refresh)
    const timer=window.setInterval(refresh,30000)
    return()=>{live=false;clearInterval(timer);window.removeEventListener('mattabel:brand-changed',refresh)}
  },[])
  const src=broken?'/logo-mattabel.png':'/api/branding/image/'+encodeURIComponent(active)+(version?'?v='+encodeURIComponent(version):'')
  return <img src={src} alt={alt} width={width} height={height} className={className}
    style={{objectFit:'contain',...style}} onError={()=>setBroken(true)} />
}
