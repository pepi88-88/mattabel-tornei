import {NextRequest,NextResponse} from 'next/server'
import {supabaseAdmin} from '@/lib/supabaseServer'
import {pushConfig,allowedEndpoint} from '@/lib/preview-webpush'
import {createHash} from 'node:crypto'
export const dynamic='force-dynamic'
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})
export function GET(){const c=pushConfig();return json({enabled:c.enabled,publicKey:c.enabled?c.publicKey:null})}
export async function POST(req:NextRequest){
 if(!pushConfig().enabled)return json({error:'Push non disponibile'},503)
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Origine non valida'},403)
 const b=await req.json().catch(()=>null)
 if(!b||typeof b.endpoint!=='string'||b.endpoint.length>2048||!allowedEndpoint(b.endpoint)||typeof b.keys?.auth!=='string'||typeof b.keys?.p256dh!=='string'||!/^[-_a-zA-Z0-9]{22}$/.test(b.keys.auth)||!/^[-_a-zA-Z0-9]{87}$/.test(b.keys.p256dh))return json({error:'Iscrizione non valida'},400)
 const hash=createHash('sha256').update(b.endpoint+'|'+b.keys.auth).digest('hex')
 const s=supabaseAdmin()
 const result=b.action==='remove'?await s.from('preview_push_subscriptions').delete().eq('id',hash):b.action==='add'?await s.from('preview_push_subscriptions').upsert({id:hash,endpoint:b.endpoint,p256dh:b.keys.p256dh,auth:b.keys.auth,origin:req.nextUrl.origin}):null
 return result&&!result.error?json({ok:true}):json({error:'Iscrizione non salvata'},503)
}
