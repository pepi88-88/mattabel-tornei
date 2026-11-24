import 'server-only'
import {notificationsEnabled} from './superadmin-session'
import {createECDH,createPrivateKey,createCipheriv,hkdfSync,randomBytes,sign} from 'node:crypto'
export function pushConfig(){
 const publicKey=process.env.PREVIEW_VAPID_PUBLIC_KEY||'',privateKey=process.env.PREVIEW_VAPID_PRIVATE_KEY||''
 return {publicKey,privateKey,enabled:notificationsEnabled()&&!!publicKey&&!!privateKey}
}
export function allowedEndpoint(value:string){
 try{
 const u=new URL(value)
 return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(
 ['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com','push.services.mozilla.com'].includes(u.hostname)||
 /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname)||
 /^[a-z0-9-]+\.push\.apple\.com$/.test(u.hostname))
 }catch{return false}
}
type Subscription={endpoint:string;p256dh:string;auth:string}
const bytes=(b:ArrayLike<number>)=>Uint8Array.from(b)
const utf8=(s:string)=>new TextEncoder().encode(s)
const decode=(s:string)=>bytes(Buffer.from(s,'base64url'))
const b64=(b:Uint8Array)=>Buffer.from(b).toString('base64url')
const concat=(items:Uint8Array[])=>{const out=new Uint8Array(items.reduce((n,b)=>n+b.length,0));let offset=0;for(const b of items){out.set(b,offset);offset+=b.length}return out}
const hk=(ikm:Uint8Array,salt:Uint8Array,info:Uint8Array,n:number)=>new Uint8Array(hkdfSync('sha256',ikm,salt,info,n))
export async function sendPush(sub:Subscription,message:string){
 const c=pushConfig()
 if(!c.enabled||!allowedEndpoint(sub.endpoint))throw new Error('Push unavailable')
 const ua=decode(sub.p256dh),auth=decode(sub.auth)
 if(ua.length!==65||auth.length!==16)throw new Error('Invalid subscription')
 const ecdh=createECDH('prime256v1'),as=bytes(ecdh.generateKeys()),shared=bytes(ecdh.computeSecret(ua)),salt=bytes(randomBytes(16))
 const ikm=hk(shared,auth,concat([utf8('WebPush: info\0'),ua,as]),32)
 const cek=hk(ikm,salt,utf8('Content-Encoding: aes128gcm\0'),16),nonce=hk(ikm,salt,utf8('Content-Encoding: nonce\0'),12)
 const cipher=createCipheriv('aes-128-gcm',cek,nonce)
 const encrypted=concat([bytes(cipher.update(concat([utf8(JSON.stringify({title:'Mattabel',body:message})),new Uint8Array([2])]))),bytes(cipher.final()),bytes(cipher.getAuthTag())])
 const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096)
 const body=concat([salt,rs,new Uint8Array([as.length]),as,encrypted])
 const pub=decode(c.publicKey)
 const key=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65)),d:c.privateKey}})
 const token=b64(utf8(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64(utf8(JSON.stringify({aud:new URL(sub.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:process.env.PREVIEW_VAPID_SUBJECT||'https://mattabel-tornei.vercel.app'})))
 const jwt=token+'.'+b64(bytes(sign('sha256',utf8(token),{key,dsaEncoding:'ieee-p1363'})))
 const r=await fetch(sub.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'vapid t='+jwt+', k='+c.publicKey,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600'},body:new Uint8Array(body)})
 return r.status
}
