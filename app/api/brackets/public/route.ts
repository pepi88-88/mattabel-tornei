import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(req: NextRequest) {
  const s = supabaseAdmin()
  const sp = new URL(req.url).searchParams
  const tournament_id = sp.get('tournament_id') || ''
  if (!tournament_id) return NextResponse.json({ error: 'Missing tournament_id' }, { status: 400 })

  const { data, error } = await s
    .from('bracket_states')
    .select('state, is_public')
    .eq('tournament_id', tournament_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.is_public) {
    // non pubblico → dillo chiaramente lato atleta
    return NextResponse.json({ is_public: false })
  }
  return NextResponse.json({ is_public: true, state: data.state || {} })
}
