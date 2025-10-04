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

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const tour = (body?.tour || '').trim()
    const gender = (body?.gender || '').trim()
    const data = body?.data ?? null

    if (!tour || (gender !== 'M' && gender !== 'F')) {
      return NextResponse.json({ error: 'Invalid tour/gender' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const { error } = await sb.from(TABLE).insert({ tour, gender, data })

    if (error) {
      console.error('[PUT snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
