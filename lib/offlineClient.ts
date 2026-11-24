'use client'


import {volatileDrafts} from './volatileDrafts'
// Cache privata del solo browser utilizzato dallo Staff.
// Nessun dato viene pubblicato: restano disponibili gli ultimi dati scaricati.
const cacheKey = (url: string) => 'mattabel:offline:get:' + url
export async function offlineJSON(url: string, options?: {requireNetwork?:boolean}): Promise<any> {
  try {
    const response = await fetch(url, {cache:'no-store'})
    if (response.status===401 || response.status===403) throw new Error('AUTH_REQUIRED')
    if (!response.ok) throw new Error('HTTP '+response.status)
    const json = await response.json()
    
    return json
  } catch (err) {
    // 401/403 must not be treated as proof of an offline connection.
    throw err
  }
}
export function cacheOfflineJSON(url: string, data: unknown) {
  // Supabase is authoritative; no persistent API snapshot.
}
export function offlineQueueKey(type:'payments'|'brackets', id:string) {
  return 'mattabel:offline:'+type+':pending:'+id
}
export function readOfflineQueue<T>(key:string, fallback:T):T {
  try { const raw=volatileDrafts.getItem(key);return raw?JSON.parse(raw):fallback } catch {return fallback}
}
export function putOfflineQueue(key:string,data:unknown):boolean {
  try {volatileDrafts.setItem(key,JSON.stringify(data));return true}catch{return false}
}
