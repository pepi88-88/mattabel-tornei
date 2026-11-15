import { NextRequest, NextResponse } from 'next/server'
import { isLogoId, logoPath, readBranding, saveBranding, ensureBrandingBucket, type LogoId, LOGO_IDS, BUCKET } from '../../../../lib/branding'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!requireAdmin(req) || req.cookies.get('staff_role')?.value !== 'admin') {
    return NextResponse.json({ error: 'Solo l’amministratore può caricare i loghi.' }, { status: 403 })
  }
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({error:'File non leggibili'}, {status:400})
  const files = form.getAll('logos').filter((f):f is File => f instanceof File)
  if (!files.length || files.length > 9) {
    return NextResponse.json({error:'Seleziona da 1 a 9 PNG'}, {status:400})
  }
  const uploaded: LogoId[] = []
  try {
    const s = await ensureBrandingBucket()
    // Every file name must match a known, explicitly approved logo variant.
    for (const file of files) {
      const id = file.name.replace(/\.png$/i,'').toLowerCase()
      if (!isLogoId(id) || !/\.png$/i.test(file.name)) {
        return NextResponse.json({error:'Nome file non riconosciuto: '+file.name+'. Usa ufficiale.png, befana.png, ...'}, {status:400})
      }
      if (file.size < 500 || file.size > 6 * 1024 * 1024 || (file.type && file.type !== 'image/png')) {
        return NextResponse.json({error:'PNG non valido o troppo grande: '+file.name}, {status:400})
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      // Check signature, not only MIME/filename, to reject arbitrary content.
      if (bytes.length < 24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        return NextResponse.json({error:'Il file non è un PNG: '+file.name}, {status:400})
      }
      const {error} = await s.storage.from(BUCKET).upload(logoPath(id),bytes,{
        upsert:true,contentType:'image/png',cacheControl:'0',
      })
      if (error) throw new Error(file.name+': '+error.message)
      uploaded.push(id)
    }
    const previous = await readBranding()
    const merged = LOGO_IDS.filter(id=>previous.uploaded.includes(id)||uploaded.includes(id))
    const next = await saveBranding({ ...previous, uploaded: [...merged] })
    return NextResponse.json({ok:true,uploaded,settings:next})
  } catch(e:any) {
    return NextResponse.json({error:String(e?.message||'Caricamento fallito'),uploaded}, {status:500})
  }
}
