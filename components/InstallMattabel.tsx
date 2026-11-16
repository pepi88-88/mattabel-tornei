'use client'

import {useEffect,useState} from 'react'

type InstallPrompt=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>}
type Target='android'|'apple'|null

export default function InstallMattabel(){
  const [target,setTarget]=useState<Target>(null)
  const [deferred,setDeferred]=useState<InstallPrompt|null>(null)
  const [installed,setInstalled]=useState(false)
  const [message,setMessage]=useState('')
  const [platform,setPlatform]=useState<'ios'|'android'|'other'>('other')

  useEffect(()=>{
    const ua=navigator.userAgent||''
    setPlatform(/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
      ? 'ios' : /Android/i.test(ua)?'android':'other')
    const standalone=window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & {standalone?:boolean}).standalone===true
    setInstalled(standalone)
    const before=(event:Event)=>{event.preventDefault();setDeferred(event as InstallPrompt)}
    const done=()=>{setInstalled(true);setDeferred(null);setTarget(null)}
    window.addEventListener('beforeinstallprompt',before)
    window.addEventListener('appinstalled',done)
    return ()=>{
      window.removeEventListener('beforeinstallprompt',before)
      window.removeEventListener('appinstalled',done)
    }
  },[])

  async function installAndroid(){
    setTarget('android')
    setMessage('')
    if(deferred){
      try{
        await deferred.prompt()
        const result=await deferred.userChoice
        if(result.outcome==='accepted'){
          setMessage('Installazione richiesta. Segui le indicazioni del dispositivo.')
          setDeferred(null)
        }else setMessage('Installazione annullata. Puoi riprovare dal menu di Chrome.')
      }catch{setMessage('Apri il menu di Chrome e scegli “Installa app” o “Aggiungi a schermata Home”.')}
    }
  }

  return <div className="mt-install-area">
    <p className="mt-install-heading">Mattabel Tornei sul tuo telefono</p>
    <div className="mt-install-buttons">
      <button type="button" className="mt-install-btn mt-install-android" onClick={installAndroid}>
        <span aria-hidden="true">◉</span> Installa su Android
      </button>
      <button type="button" className="mt-install-btn mt-install-apple" onClick={()=>{setTarget('apple');setMessage('')}}>
        <span aria-hidden="true">●</span> Installa su iPhone / iPad
      </button>
    </div>
    <p className="mt-install-note">Gratis · Nessun APK · Nessun App Store</p>
    <p className="mt-install-note mt-install-help">Per segnalazioni o problemi, rivolgersi a Gino. 🏐</p>
    {installed && <p className="mt-install-note">Mattabel Tornei è già aperta come app.</p>}
    {target && <div className="mt-install-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setTarget(null)}}>
      <section className="mt-install-modal" role="dialog" aria-modal="true" aria-labelledby="mt-install-title">
        <button type="button" aria-label="Chiudi le istruzioni" className="mt-install-close" onClick={()=>setTarget(null)}>×</button>
        <h2 id="mt-install-title">{target==='android'?'Mattabel Tornei su Android':'Mattabel Tornei su iPhone / iPad'}</h2>
        {target==='android'?<>
          <p>Installa la Web App per aprire Mattabel direttamente dalla schermata iniziale.</p>
          <ol>
            <li>Apri <strong>mattabel-tornei.vercel.app</strong> con <strong>Chrome</strong> su Android.</li>
            <li>Tocca il menu <strong>⋮</strong> in alto a destra.</li>
            <li>Scegli <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.</li>
            <li>Conferma: troverai l’icona <strong>Mattabel Tornei</strong> sulla Home.</li>
          </ol>
          {message&&<p className="mt-install-message" role="status">{message}</p>}
          {platform==='other'&&<p className="mt-install-tip">Se sei al computer, apri il sito dal telefono per procedere all'installazione su Android.</p>}
        </>:<>
          <p>Su Apple non serve scaricare un'app dallo Store: si aggiunge alla schermata Home da Safari.</p>
          <ol>
            <li>Apri <strong>mattabel-tornei.vercel.app</strong> in <strong>Safari</strong> su iPhone o iPad.</li>
            <li>Tocca <strong>Condividi</strong> (quadrato con la freccia verso l'alto).</li>
            <li>Scorri e premi <strong>Aggiungi alla schermata Home</strong>.</li>
            <li>Lascia il nome <strong>Mattabel Tornei</strong>, poi premi <strong>Aggiungi</strong>.</li>
          </ol>
          {platform==='android'&&<p className="mt-install-tip">Questi passaggi vanno eseguiti da un iPhone o iPad.</p>}
        </>}
        <button type="button" className="mt-install-done" onClick={()=>setTarget(null)}>Ho capito</button>
      </section>
    </div>}
  </div>
}
