// app/api/leaderboard/snapshots/route.ts
import { NextResponse } from 'next/server'
import { getsupabaseAdmin } from '@/lib/supabaseAdmin'

const TABLE = 'leaderboard_snapshots'

/** GET /api/leaderboard/snapshots?tour=...&gender=M|F */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour = searchParams.get('tour') || ''
    const gender = searchParams.get('gender') || ''
    if (!tour || !gender) {
      console.error('[GET snapshots] Missing query', { tour, gender })
      return NextResponse.json({ error: 'missing query' }, { status: 400 })
    }

    console.log('[GET snapshots] params', { tour, gender })

    const { data, error } = await getsupabaseAdmin
      .from(TABLE)
      .select('data')
      .eq('tour', tour)
      .eq('gender', gender)
      .maybeSingle()

    if (error) {
      console.error('[GET snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data?.data ?? null })
  } catch (err: any) {
    console.error('[GET snapshots] fatal', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

/** PUT /api/leaderboard/snapshots  body: { tour, gender, data } */
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    // VALIDAZIONE MINIMA
    if (!body || typeof body !== 'object') {
      console.error('[PUT snapshots] Body parse failed', body)
      return NextResponse.json({ error: 'invalid body' }, { status: 400 })
    }
    const { tour, gender, data } = body
    if (!tour || !gender || !data) {
      console.error('[PUT snapshots] Missing fields', { tour, gender, hasData: !!data })
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }
    if (!['M', 'F'].includes(gender)) {
      console.error('[PUT snapshots] Bad gender', gender)
      return NextResponse.json({ error: 'bad gender' }, { status: 400 })
    }
    // Log diagnostico
    console.log('[PUT snapshots] upsert', {
      tour,
      gender,
      players: Array.isArray(data?.players) ? data.players.length : 'NO',
      tappe: Array.isArray(data?.tappe) ? data.tappe.length : 'NO',
      resultsKeys: data?.results ? Object.keys(data.results).length : 'NO',
    })

    const { error } = await getsupabaseAdmin
      .from(TABLE)
      .upsert(
        { tour, gender, data, updated_at: new Date().toISOString() },
        { onConflict: 'tour,gender' } // PK composta
      )

    if (error) {
      console.error('[PUT snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[PUT snapshots] fatal', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
