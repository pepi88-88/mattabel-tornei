'use client'
import {useMemo,useState} from 'react'
import {parseVcf,matchContacts,type Athlete,type BookContact} from '../../../lib/contact-import'
type Contact={player_id:string;phone:string}
const button='rounded-lg border border-neutral-600 px-3 py-2 text-sm font-medium hover:border-orange-400 disabled:opacity-40'
export default function ContactImport({players,existing,onSaved}:{players:Athlete[];existing:Contact[];onSaved:()=>Promise<unknown>}){
 const [open,setOpen]=useState(false),[book,setBook]=useState<BookContact[]>([]),[filename,setFilename]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(''),[selected,setSelected]=useState<Record<string,string>>({}),[filter,setFilter]=useState('all'),[page,setPage]=useState(0)
 const matches=useMemo(()=>matchContacts(book,players,existing),[book,players,existing])
 const available=matches.filter(m=>m.candidates.some(c=>!c.blocked))
 const exact=available.filter(m=>m.exact)
 const review=available.filter(m=>!m.exact)
 const chosen=available.flatMap(m=>{const c=m.candidates.find(c=>c.key===selected[m.player.id]&&!c.blocked);return c?[{player_id:m.player.id,phone:c.phone}]:[]})
 const duplicated=new Set(chosen.map(c=>c.phone)).size!==chosen.length
 const visible=filter==='exact'?exact:filter==='review'?review:filter==='missing'?matches.filter(m=>!m.candidates.some(c=>!c.blocked)):available
 const clear=()=>{setBook([]);setFilename('');setSelected({});setError('');setResult('');setPage(0);setFilter('all')}
 async function load(file:File){
  clear()
  if(file.size>25*1024*1024){setError('File troppo grande (massimo 25 MB). Esporta una lista più piccola.');return}
  setBusy(true)
  try{const parsed=parseVcf(await file.text());if(!parsed.length)throw new Error('Nessun contatto con nome e numero valido trovato nel file VCF.');setBook(parsed);setFilename(file.name)}
  catch(e){setError(e instanceof Error?e.message:'File non leggibile')}
  finally{setBusy(false)}
 }
 function choose(id:string,key:string){setSelected(old=>{const next={...old};if(key)next[id]=key;else delete next[id];return next})}
 async function commit(){
  if(busy||duplicated||!chosen.length||!confirm('Salvare '+chosen.length+' numeri selezionati su Mattabel? I numeri già presenti non verranno sostituiti.'))return
  setBusy(true);setError('');setResult('')
  let saved=0,skipped=0,failed=0;const completed=new Set<string>()
  try{
   for(let i=0;i<chosen.length;i+=100){
    const items=chosen.slice(i,i+100)
    const r=await fetch('/api/notifiche/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})})
    const j=await r.json()
    if(!r.ok)throw new Error(j.error||'Importazione non riuscita')
    saved+=j.saved.length;skipped+=j.skipped.length;failed+=j.failed.length
    for(const id of [...j.saved,...j.skipped])completed.add(id)
   }
  }catch(e){setError((e instanceof Error?e.message:'Errore importazione')+'. Verifica il riepilogo e riprova soltanto i numeri mancanti.')}
  finally{
   setSelected(old=>Object.fromEntries(Object.entries(old).filter(([id])=>!completed.has(id))))
   setResult('Salvati: '+saved+' · Già presenti, ignorati: '+skipped+' · Errori: '+failed)
   try{await onSaved()}catch{setError('Importazione conclusa, ma non è stato possibile aggiornare la lista. Ricarica la pagina.')}
   setBusy(false)
  }
 }
 if(!open)return <button type="button" className={button+' border-orange-500'} onClick={()=>setOpen(true)}>Importa rubrica <span className="ml-1 text-xs text-orange-400">· Versione da testare</span></button>
 return <section className="rounded-xl border border-orange-500 p-3 space-y-3 min-w-0">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Importa rubrica</h3><p className="text-xs text-orange-400">Versione da testare · Facoltativa</p></div><button className={button} disabled={busy} onClick={()=>{clear();setOpen(false)}}>Chiudi</button></div>
  <p className="text-sm">Esporta i contatti del telefono in formato VCF e scegli il file. Il confronto avviene qui, nel browser. Solo i numeri che confermi saranno inviati a Mattabel. Nessun atleta nuovo e nessuna sostituzione dei numeri già salvati.</p>
  <label className="block text-sm font-semibold" htmlFor="mattabel-vcf">File rubrica (.vcf)</label>
  <input id="mattabel-vcf" type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" disabled={busy} className="block w-full max-w-full text-sm" onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.target.value=''}}/>
  {error&&<p role="alert" className="text-red-400 text-sm break-words">{error}</p>}
  {result&&<p role="status" className="text-green-400 text-sm">{result}</p>}
  {filename&&<>
   <p className="text-xs break-all opacity-80">{filename} · {book.length} contatti leggibili con telefono</p>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[{v:'exact',l:'Esatti',n:exact.length,c:'#4ade80'},{v:'review',l:'Da verificare',n:review.length,c:'#fbbf24'},{v:'missing',l:'Non associabili',n:matches.length-available.length,c:'#94a3b8'},{v:'all',l:'Con numero salvato',n:players.length-matches.length,c:'#60a5fa'}].map(s=><div key={s.v} className="border border-neutral-600 rounded-lg p-2"><p>{s.l}</p><strong style={{color:s.c}} className="text-lg">{s.n}</strong></div>)}</div>
   <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||!exact.length} onClick={()=>{setSelected(old=>({...old,...Object.fromEntries(exact.map(m=>[m.player.id,m.candidates[0].key]))}))}}>Seleziona tutti gli esatti</button><button className={button} disabled={busy} onClick={()=>setSelected({})}>Deseleziona tutti</button><button className={button} disabled={busy} onClick={clear}>Scarta rubrica</button></div>
   <p className="text-xs opacity-80">Verde non significa identità garantita: controlla i nomi e i numeri. I casi dubbi non sono selezionati automaticamente. Numeri già associati ad altri atleti sono bloccati.</p>
   <div className="flex flex-wrap gap-1">{[['all','Tutte le proposte'],['exact','Esatti'],['review','Da verificare'],['missing','Non associabili']].map(([v,l])=><button type="button" key={v} className={button} style={filter===v?{borderColor:'#ed850e',backgroundColor:'rgba(237,133,14,.15)'}:undefined} onClick={()=>{setFilter(v);setPage(0)}}>{l}</button>)}</div>
   <div className="space-y-2">{visible.slice(page*40,page*40+40).map(m=><div key={m.player.id} className="border rounded-lg border-neutral-600 p-2 space-y-2">
    <div className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words">{m.player.last_name} {m.player.first_name}</strong><span className="text-xs shrink-0" style={{color:m.exact?'#4ade80':m.candidates.some(c=>!c.blocked)?'#fbbf24':'#94a3b8'}}>{m.exact?'Esatto':m.candidates.some(c=>!c.blocked)?'Da verificare':'Non associabile'}</span></div>
    {m.candidates.map(c=><label key={c.key} className="flex items-start gap-2 text-sm min-w-0"><input type="radio" name={'import-'+m.player.id} disabled={busy||c.blocked} checked={selected[m.player.id]===c.key} onChange={()=>choose(m.player.id,c.key)}/><span className="min-w-0 break-words">{c.name} · <span className="font-mono">{c.phone}</span>{c.blocked?' · Già associato':''}</span></label>)}
    {selected[m.player.id]&&<button className={button+' !py-1'} disabled={busy} onClick={()=>choose(m.player.id,'')}>Deseleziona</button>}
    {!m.candidates.length&&<p className="text-xs opacity-70">Nessuna corrispondenza trovata.</p>}
   </div>)}</div>
   {!visible.length&&<p className="text-sm opacity-70">Nessun atleta in questo filtro.</p>}
   {visible.length>40&&<div className="flex flex-wrap items-center gap-2"><button className={button} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Indietro</button><span className="text-xs">Pagina {page+1}/{Math.ceil(visible.length/40)}</span><button className={button} disabled={(page+1)*40>=visible.length} onClick={()=>setPage(p=>p+1)}>Avanti</button></div>}
   {duplicated&&<p role="alert" className="text-yellow-400 text-sm">Lo stesso numero è selezionato per più atleti. Deseleziona una delle associazioni prima di salvare.</p>}
   <div className="flex flex-wrap items-center gap-2 border-t border-neutral-600 pt-3"><strong>{chosen.length} numeri selezionati</strong><button className={button+' border-orange-500'} style={{backgroundColor:'#ed850e',color:'#101c2d'}} disabled={busy||!chosen.length||duplicated} onClick={()=>void commit()}>{busy?'Operazione in corso…':'Conferma importazione'}</button></div>
  </>}
 </section>
}
