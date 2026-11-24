import {NextRequest,NextResponse} from 'next/server'
import {isSuperAdmin} from '../../../../lib/superadmin-session'
import {supabaseAdmin} from '@/lib/supabaseServer'
export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
type Item={player_id:string;phone:string}
export async function POST(req:NextRequest){
 if(!isSuperAdmin()||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Non autorizzato'},403)
 const b=await req.json().catch(()=>null)
 if(!Array.isArray(b?.items)||!b.items.length||b.items.length>100||!b.items.every((v:any)=>v&&typeof v.player_id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v.player_id)&&typeof v.phone==='string'&&/^\+[1-9]\d{6,14}$/.test(v.phone)))return reply({error:'Importazione non valida'},400)
 const items:Item[]=b.items
 if(new Set(items.map(i=>i.player_id)).size!==items.length||new Set(items.map(i=>i.phone)).size!==items.length)return reply({error:'Atleti o numeri duplicati nella selezione'},400)
 const s=supabaseAdmin()
 const {data:players,error:playerError}=await s.from('players').select('id').in('id',items.map(i=>i.player_id))
 if(playerError)return reply({error:'Verifica atleti non riuscita'},503)
 const ids=new Set((players||[]).map(p=>String(p.id)))
 if(items.some(i=>!ids.has(i.player_id)))return reply({error:'Uno degli atleti non esiste più: ricarica la rubrica'},409)
 // Insert missing rows only; a number already stored is never overwritten.
 const {data:inserted,error:insertError}=await s.from('preview_notification_contacts').upsert(items,{onConflict:'player_id',ignoreDuplicates:true}).select('player_id')
 if(insertError)return reply({error:'Importazione non riuscita'},500)
 const saved=new Set((inserted||[]).map(p=>String(p.player_id)))
 const failed:string[]=[]
 const skipped:string[]=[]
 // Manual deletion stores an empty string. Fill such rows only while still empty.
 for(const item of items){
  if(saved.has(item.player_id))continue
  const {data,error}=await s.from('preview_notification_contacts').update({phone:item.phone}).eq('player_id',item.player_id).eq('phone','').select('player_id')
  if(error)failed.push(item.player_id)
  else if(data?.length)saved.add(item.player_id)
  else skipped.push(item.player_id)
 }
 return reply({saved:[...saved],skipped,failed})
}
