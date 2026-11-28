import {volatileDrafts} from './volatileDrafts'
// Shared, in-memory autosave primitives. No persistent drafts or database changes.
export class SaveConflict extends Error {
 constructor(){super('Lo stesso dato è cambiato su Supabase. Nessuna sovrascrittura effettuata.')}
}
function canonical(value:any):any{
 if(Array.isArray(value))return value.map(v=>canonical(v??null))
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]))
 return value
}
export const same=(a:any,b:any)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b))
const record=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v)
// Three-way merge: only apply edits relative to the acknowledged baseline.
// Preserve remote-only fields; overlapping incompatible edits are conflicts.
export function mergeChanges<T>(base:T,desired:T,remote:T):T{
 function merge(b:any,d:any,r:any):any{
  if(same(b,d))return r
  if(same(b,r)||same(d,r))return d
  if((record(b)||b===undefined)&&record(d)&&record(r)){
   const out:Record<string,any>={}
   for(const k of new Set([...Object.keys(b||{}),...Object.keys(d),...Object.keys(r)])){
    if(k==='__proto__'||k==='constructor'||k==='prototype')throw new SaveConflict()
    const value=merge(b?.[k],d[k],r[k])
    if(value!==undefined)out[k]=value
   }
   return out
  }
  // Score/time arrays are indexed by match; merge independently changed indices
  // only when the shape is unchanged. Structural edits with divergent lengths conflict.
  if(Array.isArray(b)&&Array.isArray(d)&&Array.isArray(r)&&b.length===d.length&&b.length===r.length){
   if(b.some((v,i)=>record(v)&&typeof v.id==='string'&&(d[i]?.id!==v.id||r[i]?.id!==v.id)))throw new SaveConflict()
   return d.map((v,i)=>merge(b[i],v,r[i]))
  }
  throw new SaveConflict()
 }
 return merge(base,desired,remote) as T
}
const queues=new Map<string,Promise<unknown>>()
// Read the acknowledged baseline INSIDE the serialized job. React cleanup must
// never cancel acknowledgement of a successful network write.
export function serializeSave<T>(key:string,job:()=>Promise<T>):Promise<T>{
 const prior=queues.get(key)||Promise.resolve()
 const next=prior.catch(()=>{}).then(job)
 queues.set(key,next)
 void next.finally(()=>{if(queues.get(key)===next)queues.delete(key)}).catch(()=>{})
 return next
}
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
export async function saveWithRetry<T>(read:()=>Promise<T>,write:(remote:T)=>Promise<Response|null>,attempts=4){
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const remote=await read()
   const result=await write(remote)
   if(!result||result.ok)return
   if(result.status!==409&&result.status!==429&&result.status<500)throw new Error('Salvataggio rifiutato ('+result.status+')')
   if(attempt===attempts-1)throw new Error('Salvataggio non riuscito ('+result.status+')')
  }catch(e){if(e instanceof SaveConflict||attempt===attempts-1)throw e}
  await pause(150*(attempt+1))
 }
}


export type SnapshotDraft={snapshot:string;baseSnapshot:string}
export function readSnapshot(key:string):SnapshotDraft|null{
 const raw=volatileDrafts.getItem(key)
 return raw?JSON.parse(raw):null
}
export function stageSnapshot(key:string,baseline:string,desired:unknown):boolean{
 const snapshot=JSON.stringify(desired),old=readSnapshot(key)
 if(!old&&baseline&&same(JSON.parse(baseline),desired))return false
 volatileDrafts.setItem(key,JSON.stringify({snapshot,baseSnapshot:old?.baseSnapshot||baseline}))
 return true
}
type RemoteState={state?:any;updated_at?:string;is_public?:boolean}
export async function readTournamentState(endpoint:string,id:string):Promise<RemoteState>{
 const response=await fetch(endpoint+'?tournament_id='+encodeURIComponent(id),{cache:'no-store',headers:{'x-role':'admin'},signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new Error('Lettura Supabase non riuscita ('+response.status+')')
 const remote=await response.json()
 if(!remote?.updated_at)throw new Error('Versione Supabase mancante')
 return remote
}
export function flushSnapshot<T>(opts:{
 key:string;resource:string;read:()=>Promise<RemoteState>;project:(remote:RemoteState)=>T;
 write:(remote:RemoteState,merged:T,base:T,desired:T)=>Promise<Response>;
 acknowledge:(snapshot:string)=>void
}):Promise<void>{
 return serializeSave(opts.resource,async()=>{
  for(;;){
   const draft=readSnapshot(opts.key)
   if(!draft)return
   if(!draft.baseSnapshot)throw new Error('Caricamento non completato')
   if(!navigator.onLine)throw new Error('Connessione assente')
   const base=JSON.parse(draft.baseSnapshot) as T,desired=JSON.parse(draft.snapshot) as T
   await saveWithRetry(opts.read,async remote=>{
    const current=opts.project(remote)
    const merged=mergeChanges(base,desired,current)
    if(same(merged,current))return null
    return opts.write(remote,merged,base,desired)
   })
   // Acknowledge even if a React effect has already been replaced.
   opts.acknowledge(draft.snapshot)
   const latest=readSnapshot(opts.key)
   if(!latest)return
   if(same(JSON.parse(latest.snapshot),desired)){
    volatileDrafts.removeItem(opts.key)
    return
   }
   volatileDrafts.setItem(opts.key,JSON.stringify({...latest,baseSnapshot:draft.snapshot}))
  }
 })
}
export const saveMessage=(e:unknown)=>e instanceof SaveConflict?e.message:'Salvataggio Supabase non riuscito. Riprova senza chiudere la pagina.'
