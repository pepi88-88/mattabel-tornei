// app/api/lb2/snapshots/tours/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('lb2_snapshots')
      .select('tour')
      .order('tour', { ascending: true })

    if (error) {
      console.error('[lb2 tours GET] supabase error', error)
      return NextResponse.json({ tours: [] }, { status: 200 })
    }

    const tours = Array.from(new Set((data || []).map(r => String(r.tour || '').trim()).filter(Boolean)))
    return NextResponse.json({ tours }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ tours: [] }, { status: 200 })
  }
}
