import {ImageResponse} from 'next/og'
import {supabaseAdmin} from '../../../lib/supabaseServer'
import {BUCKET,logoPath} from '../../../lib/branding'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(_request:Request,{params}:{params:{size:string}}){
  const size=Number(params.size)
  if(size!==192 && size!==512)return new Response('Not found',{status:404})
  // Il logo e' quello "Ufficiale" caricato dall'amministratore, NON il
  // vecchio file pubblico e NON il logo stagionale attivo.
  let logo:Uint8Array
  try {
    const {data,error}=await supabaseAdmin().storage.from(BUCKET).download(logoPath('ufficiale'))
    if(error||!data)throw new Error('Logo ufficiale non disponibile')
    logo=new Uint8Array(await data.arrayBuffer())
  } catch {
    return new Response('Logo ufficiale non disponibile', {status:503,headers:{'Cache-Control':'no-store'}})
  }
  const source='data:image/png;base64,'+Buffer.from(logo).toString('base64')
  return new ImageResponse(
    <div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',
      backgroundColor:'#0b213b',borderRadius:Math.round(size*.18)}}>
      <img src={source} alt="" width={Math.round(size*.89)} height={Math.round(size*.89)}
        style={{objectFit:'contain'}}/>
    </div>,
    {width:size,height:size}
  )
}
