// app/api/lb2/snapshots/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const TABLE = 'lb2_snapshots'          // nuova tabella
const VIEW  = 'lb2_snapshots_latest'   // view "ultima riga"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour   = (searchParams.get('tour')   || '').trim()
    const gender = (searchParams.get('gender') || '').trim()

    if (!tour || !gender) {
      return NextResponse.json(
        { data: null },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const sb = getSupabaseAdmin()
    const { data: row, error } = await sb
      .from(VIEW)
      .select('data, updated_at, created_at')
      .eq('tour', tour)
      .eq('gender', gender)
      .maybeSingle()

    if (error) {
      console.error('[lb2 GET] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { data: row?.data ?? null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[lb2 GET] unexpected', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body   = await req.json().catch(() => ({} as any))
    const tour   = String(body?.tour   || '').trim()
    const gender = String(body?.gender || '').trim()
    const data   = body?.data ?? {}

    if (!tour || !gender) {
      return NextResponse.json(
        { error: 'Missing tour/gender' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const payload = { tour, gender, data, updated_at: new Date().toISOString() }
    const sb = getSupabaseAdmin()
    const { data: saved, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: 'tour,gender' })
      .select('tour, gender, updated_at')
      .single()

    if (error) {
      console.error('[lb2 PUT] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { ok: true, saved },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('[lb2 PUT] unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
