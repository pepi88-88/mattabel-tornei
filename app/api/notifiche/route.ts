import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../lib/superadmin-session'
import { supabaseAdmin } from '@/lib/supabaseServer'
export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const valid=(v:unknown)=>typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)
async function allRows(query:(from:number,to:number)=>PromiseLike<{data:any[]|null;error:unknown}>){
 const rows:any[]=[]
 for(let from=0;;from+=500){
  const {data,error}=await query(from,from+499)
  if(error)return {data:null,error}
  rows.push(...(data||[]))
  if(!data||data.length<500)return {data:rows,error:null}
 }
}
export async function GET(){
 if(!isSuperAdmin()) return reply({error:'Non autorizzato'},403)
 const s=supabaseAdmin()
 const [players,contacts,checks,teams]=await Promise.all([
 allRows((a,b)=>s.from('players').select('id,first_name,last_name').order('last_name').order('id').range(a,b)),
 allRows((a,b)=>s.from('preview_notification_contacts').select('*').order('player_id').range(a,b)),
 allRows((a,b)=>s.from('preview_notification_checks').select('*').order('tournament_id').order('player_id').range(a,b)),
 allRows((a,b)=>s.from('preview_notification_teams').select('*').order('tournament_id').order('registration_id').range(a,b))])
 if([players,contacts,checks,teams].some(x=>x.error)) return reply({error:'Archivio Preview non configurato'},503)
 return reply({players:players.data,contacts:contacts.data,checks:checks.data,teams:teams.data})
}
export async function POST(req:NextRequest){
 if(!isSuperAdmin()) return reply({error:'Non autorizzato'},403)
 if(req.headers.get('origin')!==req.nextUrl.origin) return reply({error:'Origine non valida'},403)
 const b=await req.json().catch(()=>null)
 if(!b) return reply({error:'Dati non validi'},400)
 const s=supabaseAdmin()
 let result
 if(b.kind==='contact' && valid(b.player_id) && typeof b.phone==='string' && /^(\+?[0-9]{7,15})?$/.test(b.phone)){
 result=await s.from('preview_notification_contacts').upsert({player_id:b.player_id,phone:b.phone},{onConflict:'player_id'})
 }else if(b.kind==='check' && valid(b.player_id)&&valid(b.tournament_id)&&typeof b.contacted==='boolean'){
 result=await s.from('preview_notification_checks').upsert({player_id:b.player_id,tournament_id:b.tournament_id,contacted:b.contacted},{onConflict:'tournament_id,player_id'})
 }else if(b.kind==='team' && valid(b.registration_id)&&valid(b.tournament_id)&&['pending','present','absent'].includes(b.status)){
 result=await s.from('preview_notification_teams').upsert({registration_id:b.registration_id,tournament_id:b.tournament_id,status:b.status},{onConflict:'tournament_id,registration_id'})
 }else return reply({error:'Dati non validi'},400)
 return result.error?reply({error:'Salvataggio non riuscito'},500):reply({ok:true})
}
