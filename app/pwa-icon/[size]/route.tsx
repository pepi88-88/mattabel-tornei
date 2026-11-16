import {ImageResponse} from 'next/og'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {supabaseAdmin} from '../../../lib/supabaseServer'
import {BUCKET,logoPath} from '../../../lib/branding'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(_request:Request,{params}:{params:{size:string}}){
  const size=Number(params.size)
  if(size!==192 && size!==512)return new Response('Not found',{status:404})
  // L'icona usa sempre il file ufficiale caricato nell'area Loghi.
  // Non segue il tema stagionale attivo. Il file locale serve solo da fallback.
  let logo:Uint8Array
  try{
    const {data,error}=await supabaseAdmin().storage.from(BUCKET).download(logoPath('ufficiale'))
    if(error||!data)throw new Error('Logo ufficiale non disponibile')
    logo=new Uint8Array(await data.arrayBuffer())
  }catch{
    logo=await readFile(join(process.cwd(),'public','logo-mattabel.png'))
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
