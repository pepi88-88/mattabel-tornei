// app/api/leaderboard/snapshots/tours/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = getSupabaseAdmin() // <-- crea il client QUI
    const { data, error } = await sb
      .from('leaderboard_snapshots')
      .select('tour')
      .order('tour', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tours = Array.from(new Set((data ?? []).map(r => r.tour).filter(Boolean)))
    return NextResponse.json({ tours })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
