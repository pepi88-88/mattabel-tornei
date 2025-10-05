import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic' // 👈 evita prerender statico

const TABLE = 'leaderboard_snapshots'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour = searchParams.get('tour') || ''
    const gender = searchParams.get('gender') || ''

    if (!tour || !gender) {
      return NextResponse.json({ error: 'Missing tour/gender' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const { data, error } = await sb
      .from(TABLE)
      .select('data')
      .eq('tour', tour)
      .eq('gender', gender)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[GET snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data?.data ?? null })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

// app/api/leaderboard/snapshots/route.ts (solo PUT)
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const tour   = String(body?.tour   || '').trim()
    const gender = String(body?.gender || '').trim()
    const data   = body?.data ?? {}

    if (!tour || !gender) {
      return NextResponse.json({ error: 'Missing tour/gender' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ✅ upsert su (tour, gender)
    const { error } = await sb
      .from('leaderboard_snapshots')
      .upsert({ tour, gender, data })
      .eq('tour', tour)
      .eq('gender', gender)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
