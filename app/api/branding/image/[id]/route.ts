import { NextResponse } from 'next/server'
import { BUCKET, logoPath, isLogoId } from '../../../../../lib/branding'
import { supabaseAdmin } from '../../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, {params}: {params:{id:string}}) {
  if (!isLogoId(params.id)) return new Response('Not found',{status:404})
  try {
    const s = supabaseAdmin()
    const {data,error} = await s.storage.from(BUCKET).download(logoPath(params.id))
    if (error || !data) {
      if (params.id === 'ufficiale') return NextResponse.redirect(new URL('/logo-mattabel.png',_req.url))
      return new Response('Not found',{status:404})
    }
    return new Response(await data.arrayBuffer(), {
      headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=30, must-revalidate','X-Content-Type-Options':'nosniff'}
    })
  } catch {
    if (params.id === 'ufficiale') return NextResponse.redirect(new URL('/logo-mattabel.png',_req.url))
    return new Response('Not found',{status:404})
  }
}
