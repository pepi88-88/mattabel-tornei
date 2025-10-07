// app/api/leaderboard/snapshots/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const TABLE = 'leaderboard_snapshots'

/** GET /api/leaderboard/snapshots?tour=...&gender=M|F */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour = (searchParams.get('tour') || '').trim()
    const gender = (searchParams.get('gender') || '').trim()

    if (!tour || !gender) {
      return NextResponse.json(
        { data: null },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const sb = getSupabaseAdmin()
    // prendi SEMPRE la versione più recente
   const { data, error } = await sb
  .from(TABLE)
  .select('data, updated_at, created_at')
  .eq('tour', tour)
  .eq('gender', gender)
  .maybeSingle()
    if (error) {
      console.error('[GET snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { data: data?.data ?? null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[GET snapshots] unexpected', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

/** PUT /api/leaderboard/snapshots  body: { tour, gender, data } */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const tour = String(body?.tour || '').trim()
    const gender = String(body?.gender || '').trim()
    const data = body?.data ?? {}

    if (!tour || !gender) {
      return NextResponse.json(
        { error: 'Missing tour/gender' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

  const sb = getSupabaseAdmin()
const { data, error } = await sb
  .from('leaderboard_snapshots_latest') // <-- VIEW
  .select('data, updated_at, created_at')
  .eq('tour', tour)
  .eq('gender', gender)
  .maybeSingle()

    if (error) {
      console.error('[PUT snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

  return NextResponse.json(
  {
    data: data?.data ?? null,
    meta: {
      updated_at: data?.updated_at ?? null,
      created_at: data?.created_at ?? null,
    },
  },
  { headers: { 'Cache-Control': 'no-store' } }
)

  } catch (e: any) {
    console.error('[PUT snapshots] unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
