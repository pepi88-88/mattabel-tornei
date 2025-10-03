import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{ persistSession:false }})

export async function GET() {
  try {
    const { data, error } = await sb
      .from('leaderboard_snapshots')
      .select('tour')
      .order('tour', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const tours = Array.from(new Set((data || []).map(r => r.tour).filter(Boolean)))
    return NextResponse.json({ tours })
  } catch (e:any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
