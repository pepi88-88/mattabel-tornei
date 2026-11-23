import {NextRequest,NextResponse} from 'next/server'
import {isSuperAdmin} from '../../../../lib/superadmin-session'
import {pushConfig,sendPush} from '../../../../lib/preview-webpush'
import {supabaseAdmin} from '@/lib/supabaseServer'
export const dynamic='force-dynamic'
export const maxDuration=60
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(req:NextRequest){
 if(!isSuperAdmin())return json({error:'Non autorizzato'},403)
 if(!pushConfig().enabled)return json({enabled:false,count:0,history:[]})
 const s=supabaseAdmin(),origin=req.nextUrl.origin
 const [subs,history]=await Promise.all([s.from('preview_push_subscriptions').select('id',{count:'exact',head:true}).eq('origin',origin),s.from('preview_push_history').select('id,message,sent,failed,created_at').eq('origin',origin).order('created_at',{ascending:false}).limit(30)])
 if(subs.error||history.error)return json({error:'Archivio push non configurato'},503)
 return json({enabled:true,count:subs.count||0,history:history.data||[]})
}
export async function POST(req:NextRequest){
 if(!isSuperAdmin()||req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Non autorizzato'},403)
 if(!pushConfig().enabled)return json({error:'Push non configurato'},503)
 const b=await req.json().catch(()=>null),message=typeof b?.message==='string'?b.message.trim():''
 if(!message||message.length>500||b.confirm!==true)return json({error:'Messaggio o conferma non validi'},400)
 const s=supabaseAdmin(),origin=req.nextUrl.origin
 const {data,error}=await s.from('preview_push_subscriptions').select('id,endpoint,p256dh,auth').eq('origin',origin).limit(101)
 if(error)return json({error:'Archivio push non disponibile'},503)
 let sent=0,failed=0
 const all=data||[]
 if(all.length>100)return json({error:'Limite di sicurezza Preview: massimo 100 dispositivi per invio'},409)
 for(let i=0;i<all.length;i+=20)await Promise.all(all.slice(i,i+20).map(async sub=>{try{const code=await sendPush(sub,message);if(code>=200&&code<300)sent++;else{failed++;if(code===404||code===410)await s.from('preview_push_subscriptions').delete().eq('id',sub.id).eq('origin',origin)}}catch{failed++}}))
 const saved=await s.from('preview_push_history').insert({origin,message,sent,failed})
 return json({ok:true,sent,failed,historySaved:!saved.error})
}
