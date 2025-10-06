import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const TABLE = 'leaderboard_snapshots'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour = (searchParams.get('tour') || '').trim()
    const gender = (searchParams.get('gender') || '').trim()
    if (!tour || !gender) {
      return NextResponse.json({ error: 'Missing tour/gender' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    // Prendi SEMPRE la riga più recente: prima per updated_at, poi fallback su created_at
    const { data, error } = await sb
      .from(TABLE)
      .select('data, updated_at, created_at')
      .eq('tour', tour)
      .eq('gender', gender)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[GET snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data?.data ?? null })
  } catch (e: any) {
    console.error('[GET snapshots] unexpected', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const tour = String(body?.tour || '').trim()
    const gender = String(body?.gender || '').trim()
    const data = body?.data ?? {}
    if (!tour || !gender) {
      return NextResponse.json({ error: 'Missing tour/gender' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    // Forziamo l’aggiornamento dell’updated_at per essere sicuri dell’ordinamento
    const payload = { tour, gender, data, updated_at: new Date().toISOString() }

    const { error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: 'tour,gender' })

    if (error) {
      console.error('[PUT snapshots] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[PUT snapshots] unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
