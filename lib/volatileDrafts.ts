'use client'
// Transient autosave state only. Never restore an old device draft over Supabase.
const pending = new Map<string,string>()
export const volatileDrafts = {
 getItem(key:string){return pending.get(key)??null},
 setItem(key:string,value:string){pending.set(key,value)},
 removeItem(key:string){pending.delete(key)}
}
export function hasUnsavedChanges(){
 for(const value of pending.values()){
  try{const v=JSON.parse(value);if(v==null||v===false||(Array.isArray(v)&&!v.length))continue}catch{}
  return true
 }
 return false
}
export function legacyDraftKeys(){
 const keys:string[]=[]
 try{for(let i=0;i<localStorage.length;i++){
 const k=localStorage.key(i)||''
 if(/^mattabel:risultati:pending:|^mattabel:gironi:pending:|^mattabel:offline:(brackets|creation|payments):pending:/.test(k))keys.push(k)
 }}catch{}
 return keys
}
export function discardLegacyDrafts(){for(const key of legacyDraftKeys())try{localStorage.removeItem(key)}catch{}}
