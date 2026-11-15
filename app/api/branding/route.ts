import { NextRequest, NextResponse } from 'next/server'
import { readBranding, isLogoId, saveBranding } from '@/lib/branding'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await readBranding(), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ active: 'ufficiale', uploaded: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req) || req.cookies.get('staff_role')?.value !== 'admin') {
    return NextResponse.json({ error: 'Solo l’amministratore può cambiare il logo.' }, { status: 403 })
  }
  const body = await req.json().catch(()=>null)
  if (!isLogoId(body?.active)) return NextResponse.json({error:'Logo non valido'}, {status:400})
  try {
    const state = await readBranding()
    if (!state.uploaded.includes(body.active)) {
      return NextResponse.json({ error:'Prima carica il file del logo selezionato.' }, { status:400 })
    }
    return NextResponse.json(await saveBranding({ ...state, active: body.active }))
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || 'Errore salvataggio') }, {status:500})
  }
}
