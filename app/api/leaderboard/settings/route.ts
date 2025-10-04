// app/api/leaderboard/settings/route.ts
import { NextResponse } from 'next/server'
import { getsupabaseAdmin } from '@/lib/supabaseAdmin'

const TABLE = 'leaderboard_settings'

// GET /api/leaderboard/settings?tour=...&gender=M|F
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour = searchParams.get('tour') || ''
    const gender = searchParams.get('gender') || ''

    if (!tour || !gender) {
      return NextResponse.json({ error: 'Missing tour/gender' }, { status: 400 })
    }

    // magari log utile in dev
    // console.log('[GET settings] params', { tour, gender })

    const { data, error } = await getsupabaseAdmin
      .from(TABLE)
      .select('settings')
      .eq('tour', tour)
      .eq('gender', gender)
      .maybeSingle()

    if (error) {
      console.error('[GET settings] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // se non esiste, ritorna null (la UI usa DEFAULT_SET)
    return NextResponse.json({ settings: data?.settings ?? null })
  } catch (err: any) {
    console.error('[GET settings] unexpected', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

// PUT /api/leaderboard/settings  body: { tour, gender, settings }
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const tour = (body?.tour || '').trim()
    const gender = (body?.gender || '').trim()
    const settings = body?.settings ?? null

    if (!tour || (gender !== 'M' && gender !== 'F')) {
      return NextResponse.json({ error: 'Invalid tour/gender' }, { status: 400 })
    }
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
    }

    const { error } = await getsupabaseAdmin
      .from(TABLE)
      .upsert(
        { tour, gender, settings },                // << usa la colonna `settings`
        { onConflict: 'tour,gender' }              // << richiede il UNIQUE che hai creato
      )
      .select('tour')                              // forza l’esecuzione

    if (error) {
      console.error('[PUT settings] supabase error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[PUT settings] unexpected', err)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
