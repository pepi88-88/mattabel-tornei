import {NextRequest,NextResponse} from 'next/server'
import {isSuperAdmin} from '../../../../lib/superadmin-session'
import {supabaseAdmin} from '@/lib/supabaseServer'
export const dynamic='force-dynamic'
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const table='preview_notification_preferences'
const valid=(key:string,value:unknown)=>{
 if(key==='tid')return typeof value==='string'&&/^[a-zA-Z0-9_-]{0,100}$/.test(value)
 if(key==='columns')return value===1||value===2||value===3
 if(key==='tab')return value==='push'||value==='contacts'||value==='confirm'
 if(key==='pushTemplates')return Array.isArray(value)&&value.length<=100&&value.every(t=>t&&typeof t.name==='string'&&t.name.trim().length>0&&t.name.length<=60&&typeof t.message==='string'&&t.message.trim().length>0&&t.message.length<=500)
 return false
}
async function read(){
 const {data,error}=await supabaseAdmin().from(table).select('key,value')
 return error?reply({error:'Impossibile leggere le preferenze'},503):reply(Object.fromEntries((data||[]).map(r=>[r.key,r.value])))
}
export async function GET(){
 if(!isSuperAdmin())return reply({error:'Non autorizzato'},403)
 return read()
}
export async function POST(req:NextRequest){
 if(!isSuperAdmin()||req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'Non autorizzato'},403)
 const b=await req.json().catch(()=>null)
 if(!b||!b.values||typeof b.values!=='object'||Array.isArray(b.values))return reply({error:'Dati non validi'},400)
 const entries=Object.entries(b.values)
 if(!entries.length||!entries.every(([key,value])=>valid(key,value)))return reply({error:'Preferenze non valide'},400)
 const {error}=await supabaseAdmin().from(table).upsert(entries.map(([key,value])=>({key,value,updated_at:new Date().toISOString()})),{onConflict:'key',ignoreDuplicates:b.initialize===true})
 if(error)return reply({error:'Salvataggio preferenze non riuscito'},500)
 return read()
}
