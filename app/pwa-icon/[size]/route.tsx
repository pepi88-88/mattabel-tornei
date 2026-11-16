import {ImageResponse} from 'next/og'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(_request:Request,{params}:{params:{size:string}}){
  const size=Number(params.size)
  if(size!==192 && size!==512)return new Response('Not found',{status:404})
  const logo=await readFile(join(process.cwd(),'public','logo-mattabel.png'))
  const source='data:image/png;base64,'+logo.toString('base64')
  return new ImageResponse(
    <div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center',
      backgroundColor:'#0b213b',borderRadius:Math.round(size*.18)}}>
      <img src={source} alt="" width={Math.round(size*.89)} height={Math.round(size*.89)}
        style={{objectFit:'contain'}}/>
    </div>,
    {width:size,height:size}
  )
}
