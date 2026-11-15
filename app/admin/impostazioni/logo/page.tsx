'use client'
import * as React from 'react'
import BrandLogo, { LOGO_NAMES } from '../../../../components/BrandLogo'

type Settings={active:string;uploaded:string[];updatedAt?:string}
const keyByFile=(f:File)=>f.name.replace(/\.png$/i,'').toLowerCase()
const allowed=new Set(LOGO_NAMES.map(([id])=>id))

export default function LogoSettingsPage(){
  const [role,setRole]=React.useState('')
  const [settings,setSettings]=React.useState<Settings>({active:'ufficiale',uploaded:[]})
  const [selected,setSelected]=React.useState('ufficiale')
  const [files,setFiles]=React.useState<File[]>([])
  const [busy,setBusy]=React.useState(false)
  const [progress,setProgress]=React.useState('')
  const [error,setError]=React.useState('')
  const [message,setMessage]=React.useState('')
  const [loading,setLoading]=React.useState(true)

  const refresh=React.useCallback(async()=>{
    try{
      const r=await fetch('/api/branding',{cache:'no-store'})
      if(!r.ok)throw new Error('Impossibile caricare le impostazioni')
      const data=await r.json()
      setSettings(data);setSelected(prev=>prev==='ufficiale'?data.active:prev)
    }catch(e:any){setError(e.message)}
    finally{setLoading(false)}
  },[])
  React.useEffect(()=>{
    try{setRole(localStorage.getItem('role')||'')}catch{}
    refresh()
  },[refresh])
  const onFiles=(list:FileList|null)=>{
    if(!list)return
    const items=Array.from(list)
    const invalid=items.filter(f=>!allowed.has(keyByFile(f))||!f.name.toLowerCase().endsWith('.png'))
    setFiles(items.filter(f=>!invalid.includes(f)))
    setError(invalid.length?'Nome non riconosciuto: '+invalid.map(f=>f.name).join(', ')+'. Usa i nove nomi indicati.':'')
    setMessage('')
  }
  const upload=async()=>{
    if(!files.length)return
    setBusy(true);setError('');setMessage('')
    let count=0
    try{
      // One file per request: avoids serverless body-size limits on nine large PNGs.
      for(const f of files){
        setProgress('Caricamento '+(count+1)+'/'+files.length+': '+f.name)
        const fd=new FormData();fd.append('logos',f)
        const r=await fetch('/api/branding/upload',{method:'POST',body:fd})
        const body=await r.json().catch(()=>({}))
        if(!r.ok)throw new Error(body.error||'Errore nel caricamento di '+f.name)
        count++
      }
      setFiles([]);setProgress('')
      setMessage(count+' loghi caricati correttamente. Ora puoi scegliere quello attivo.')
      await refresh()
    }catch(e:any){setError((e.message||'Errore')+' ('+count+' file caricati)');await refresh()}
    finally{setBusy(false);setProgress('')}
  }
  const save=async()=>{
    setBusy(true);setError('');setMessage('')
    try{
      const r=await fetch('/api/branding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({active:selected})})
      const j=await r.json().catch(()=>({}))
      if(!r.ok)throw new Error(j.error||'Salvataggio non riuscito')
      setSettings(j)
      setMessage('Logo '+LOGO_NAMES.find(([id])=>id===selected)?.[1]+' attivato per tutti gli utenti.')
      window.dispatchEvent(new Event('mattabel:brand-changed'))
    }catch(e:any){setError(e.message||'Errore salvataggio')}
    finally{setBusy(false)}
  }
  if(role&&role!=='admin')return <div className="mt-logo-admin"><h1>Loghi Mattabel</h1><p>Questa impostazione è riservata all’Admin.</p></div>
  return <div className="mt-logo-admin">
    <div className="mt-logo-admin-heading"><div><p className="mt-logo-eyebrow">IMPOSTAZIONI MATTABEL</p><h1>Logo del sito</h1><p>Scegli manualmente il logo che tutti vedranno su login, Staff, Atleta e Carosello. Non cambia automaticamente con le stagioni.</p></div><BrandLogo width={96} height={96}/></div>
    {error&&<p role="alert" className="mt-logo-alert mt-logo-error">{error}</p>}
    {message&&<p role="status" className="mt-logo-alert mt-logo-success">{message}</p>}
    <div className="mt-logo-admin-section">
      <h2>1. Carica i loghi approvati</h2>
      <p>Seleziona i nove file PNG tutti insieme. I nomi devono essere: ufficiale, befana, carnevale, pasqua, master, estate, superspritz, halloween, natale (con estensione .png). Puoi sostituirli in futuro.</p>
      <div className="mt-logo-upload">
        <input type="file" id="mt-logo-files" multiple accept="image/png,.png" disabled={busy} onChange={e=>onFiles(e.target.files)}/>
        <button type="button" disabled={busy||!files.length} onClick={upload}>{busy?'Caricamento…': 'Carica '+(files.length||'')+' loghi'}</button>
      </div>
      {progress&&<p role="status">{progress}</p>}
      {!!files.length&&<p>Pronti da caricare: {files.map(f=>f.name).join(', ')}</p>}
    </div>
    <div className="mt-logo-admin-section">
      <h2>2. Scegli il logo attivo</h2>
      {loading?<p>Caricamento loghi…</p>:
      <div className="mt-logo-options">
        {LOGO_NAMES.map(([id,label])=>{
          const uploaded=settings.uploaded.includes(id)
          return <button key={id} type="button" className={'mt-logo-option'+(selected===id?' selected':'')}
            onClick={()=>setSelected(id)} aria-pressed={selected===id} disabled={busy}>
            <div className="mt-logo-thumb">{uploaded?<img src={'/api/branding/image/'+id+'?v='+encodeURIComponent(settings.updatedAt||'')} alt="" />:<span>🏐</span>}</div>
            <strong>{label}</strong>
            <small>{id===settings.active?'● Attivo':uploaded?'Caricato':'Da caricare'}</small>
          </button>
        })}
      </div>}
      <div className="mt-logo-admin-actions">
        <button type="button" disabled={busy||!settings.uploaded.includes(selected)} onClick={save}>Salva logo per tutto il sito</button>
        <button type="button" disabled={busy||!settings.uploaded.includes('ufficiale')} onClick={()=>setSelected('ufficiale')}>Seleziona Ufficiale</button>
        <span>Logo attuale: <strong>{LOGO_NAMES.find(([id])=>id===settings.active)?.[1]||'Ufficiale'}</strong></span>
      </div>
      <p className="mt-logo-footnote">Il pulsante Salva rende effettiva la selezione. Nessun risultato, girone o tabellone viene modificato.</p>
    </div>
  </div>
}
