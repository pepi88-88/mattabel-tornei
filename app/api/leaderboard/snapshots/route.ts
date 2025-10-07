// app/api/leaderboard/snapshots/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const TABLE = 'leaderboard_snapshots'
const VIEW  = 'leaderboard_snapshots_latest' // usa la VIEW solo in GET

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
    // Leggi SEMPRE l'ultima riga dalla VIEW
    const { data: row, error } = await sb
      .from(VIEW)
      .select('data, updated_at, created_at')
      .eq('tour', tour)
      .eq('gender', gender)
      .maybeSingle()

    if (error) {
      console.error('[GET snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { data: row?.data ?? null },
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
    const snapshotData = body?.data ?? {} // <-- rinominato per evitare conflitti

    if (!tour || !gender) {
      return NextResponse.json(
        { error: 'Missing tour/gender' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const sb = getSupabaseAdmin()
    const payload = {
      tour,
      gender,
      data: snapshotData,
      updated_at: new Date().toISOString(),
    }

    // In PUT si scrive nella TABELLA, non nella view
    const { data: saved, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: 'tour,gender' })
      .select('tour, gender, updated_at')
      .single()

    if (error) {
      console.error('[PUT snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { ok: true, saved },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[PUT snapshots] unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
