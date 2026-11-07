import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse('Unauthorized', { status: 401 })
  const s = supabaseAdmin()
  const sp = new URL(req.url).searchParams
  const tournament_id = sp.get('tournament_id') || ''
  if (!tournament_id) return NextResponse.json({ error: 'Missing tournament_id' }, { status: 400 })

  const { data, error } = await s
  .from('group_states')
  .select('state, is_public, updated_at')
  .eq('tournament_id', tournament_id)
  .maybeSingle()


  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ state: data?.state || {}, updated_at: data?.updated_at || null })
}

export async function PUT(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse('Unauthorized', { status: 401 })
  const s = supabaseAdmin()

  const body = await req.json().catch(() => null) as { tournament_id?: string; state?: any }
  const tournament_id = String(body?.tournament_id || '').trim()
  const state = body?.state ?? {}
  if (!tournament_id) {
    return NextResponse.json({ error: 'Missing tournament_id' }, { status: 400 })
  }

  // 👇 prende il flag dalla UI admin (state.isPublic)
  const is_public = Boolean(state?.isPublic)

  const { error } = await s
    .from('group_states')
    .upsert(
      { tournament_id, state, is_public, updated_at: new Date().toISOString() },
      { onConflict: 'tournament_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}



// Aggiornamento parziale con controllo di concorrenza: non sostituisce l'intero JSON.
export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse('Unauthorized', { status: 401 })
  const body = await req.json().catch(() => null) as {
    tournament_id?: string; changes?: Record<string, any>; base_updated_at?: string | null
  } | null
  const tournament_id = String(body?.tournament_id || '').trim()
  const changes = body?.changes
  if (!tournament_id || !changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return NextResponse.json({ error: 'Invalid patch' }, { status: 400 })
  }
  const allowed = new Set(['groupsCount','meta','assign','labels','gField','times','scores','isPublic','groupsConfirmed','regia'])
  if (Object.keys(changes).some(k => !allowed.has(k))) {
    return NextResponse.json({ error: 'Unknown state field' }, { status: 400 })
  }
  const s = supabaseAdmin()
  // Richiede una versione letta dal client: nessuna scrittura basata su dati non caricati.
  if (!body?.base_updated_at) {
    return NextResponse.json({ error: 'Missing state version' }, { status: 428 })
  }
  const { data: current, error: readError } = await s.from('group_states')
    .select('state, updated_at').eq('tournament_id', tournament_id).maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!current || current.updated_at !== body.base_updated_at) {
    return NextResponse.json({ error: 'State changed on server', state: current?.state ?? null,
      updated_at: current?.updated_at ?? null }, { status: 409 })
  }
  const previous = (current.state || {}) as Record<string, any>
  const next = { ...previous, ...changes }
  // Protezione strutturale: non cancellare accidentalmente una configurazione esistente.
  if (previous.groupsCount > 0 && (!Number.isInteger(Number(next.groupsCount)) || Number(next.groupsCount) < 1)) {
    return NextResponse.json({ error: 'Invalid groupsCount' }, { status: 400 })
  }
  const updated_at = new Date(Date.now() + 1).toISOString()
  const { data, error } = await s.from('group_states')
    .update({ state: next, is_public: Boolean(next.isPublic), updated_at })
    .eq('tournament_id', tournament_id).eq('updated_at', current.updated_at)
    .select('updated_at').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Concurrent save' }, { status: 409 })
  return NextResponse.json({ ok: true, updated_at: data.updated_at })
}
