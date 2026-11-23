import 'server-only'
import {createECDH,createPrivateKey,createCipheriv,hkdfSync,randomBytes,sign} from 'node:crypto'
export function pushConfig(){
 const publicKey=process.env.PREVIEW_VAPID_PUBLIC_KEY||'',privateKey=process.env.PREVIEW_VAPID_PRIVATE_KEY||''
 return {publicKey,privateKey,enabled:process.env.VERCEL_ENV==='preview'&&!!publicKey&&!!privateKey}
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
const b64=(b:Buffer)=>b.toString('base64url')
const hk=(ikm:Buffer,salt:Buffer,info:Buffer,n:number)=>Buffer.from(hkdfSync('sha256',ikm,salt,info,n))
export async function sendPush(sub:Subscription,message:string){
 const c=pushConfig()
 if(!c.enabled||!allowedEndpoint(sub.endpoint))throw new Error('Push unavailable')
 const ua=Buffer.from(sub.p256dh,'base64url'),auth=Buffer.from(sub.auth,'base64url')
 if(ua.length!==65||auth.length!==16)throw new Error('Invalid subscription')
 const ecdh=createECDH('prime256v1'),as=ecdh.generateKeys(),shared=ecdh.computeSecret(ua),salt=randomBytes(16)
 const ikm=hk(shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]),32)
 const cek=hk(ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=hk(ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12)
 const cipher=createCipheriv('aes-128-gcm',cek,nonce)
 const encrypted=Buffer.concat([cipher.update(Buffer.concat([Buffer.from(JSON.stringify({title:'Mattabel',body:message})),Buffer.from([2])])),cipher.final(),cipher.getAuthTag()])
 const rs=Buffer.alloc(4);rs.writeUInt32BE(4096)
 const body=Buffer.concat([salt,rs,Buffer.from([as.length]),as,encrypted])
 const pub=Buffer.from(c.publicKey,'base64url')
 const key=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33,65)),d:c.privateKey}})
 const token=b64(Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})))+'.'+b64(Buffer.from(JSON.stringify({aud:new URL(sub.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:process.env.PREVIEW_VAPID_SUBJECT||'https://mattabel-tornei.vercel.app'})))
 const jwt=token+'.'+b64(sign('sha256',Buffer.from(token),{key,dsaEncoding:'ieee-p1363'}))
 const r=await fetch(sub.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'vapid t='+jwt+', k='+c.publicKey,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600'},body:new Uint8Array(body)})
 return r.status
}
