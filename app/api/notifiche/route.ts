import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../lib/superadmin-session'
import { supabaseAdmin } from '@/lib/supabaseServer'
export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const valid=(v:unknown)=>typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)
export async function GET(){
 if(!isSuperAdmin()) return reply({error:'Non autorizzato'},403)
 const s=supabaseAdmin()
 const [players,contacts,checks,teams]=await Promise.all([
 s.from('players').select('id,first_name,last_name').order('last_name').limit(10000),
 s.from('preview_notification_contacts').select('*'),
 s.from('preview_notification_checks').select('*'),
 s.from('preview_notification_teams').select('*')])
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
