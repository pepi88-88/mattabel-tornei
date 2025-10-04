// app/api/groups/public/state/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// evita prerender dell'endpoint
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const tid = new URL(req.url).searchParams.get('tournament_id')?.trim()
  if (!tid) return NextResponse.json({ error: 'Missing tournament_id' }, { status: 400 })

  const { data, error } = await sb
    .from('group_states')
    .select('state, is_public')
    .eq('tournament_id', tid)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)   return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!data.is_public) {
    return NextResponse.json({ error: 'Not public' }, { status: 403 })
  }

  return NextResponse.json({ state: data.state, is_public: true })
}
