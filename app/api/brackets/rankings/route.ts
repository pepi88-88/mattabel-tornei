import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

// Save manually adjusted event standings separately inside the existing bracket JSON.
// Never change category order, match data, winners or public visibility.
export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse('Unauthorized', { status: 401 })
  const body = await req.json().catch(() => null)
  const tournament_id = String(body?.tournament_id || '').trim()
  const rankingOverrides = body?.rankingOverrides
  if (!tournament_id || !rankingOverrides || typeof rankingOverrides !== 'object' ||
      Array.isArray(rankingOverrides) || JSON.stringify(rankingOverrides).length > 80000)
    return NextResponse.json({ error: 'Classifica non valida' }, { status: 400 })

  for (const [bracketId, players] of Object.entries(rankingOverrides)) {
    if (!bracketId || bracketId.length > 200 || !players || Array.isArray(players) || typeof players !== 'object')
      return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    for (const [team, values] of Object.entries(players as Record<string,any>)) {
      if (!team || team.length > 300 || !values || typeof values !== 'object' || Array.isArray(values))
        return NextResponse.json({ error: 'Squadra non valida' }, { status: 400 })
      for (const key of ['local','total'] as const) {
        const number = (values as any)[key]
        if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 1024))
          return NextResponse.json({ error: 'Posizione non valida' }, { status: 400 })
      }
    }
  }
  const s = supabaseAdmin()
  const { data: current, error } = await s.from('bracket_states')
    .select('state, updated_at').eq('tournament_id', tournament_id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Tabelloni non trovati' }, { status: 404 })
  const previous = Array.isArray(current.state) ? { items: current.state } : (current.state || {})
  const knownIds = new Set((previous.items || []).map((item: any) => String(item.id)))
  if (Object.keys(rankingOverrides).some(id => !knownIds.has(id))) {
    return NextResponse.json({ error: 'Tabellone non trovato, ricarica la pagina' }, { status: 409 })
  }
  const updated_at = new Date(Date.now() + 1).toISOString()
  const { data, error: updateError } = await s.from('bracket_states')
    .update({ state: { ...previous, rankingOverrides }, updated_at })
    .eq('tournament_id', tournament_id)
    .eq('updated_at', current.updated_at)
    .select('updated_at').maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Dati modificati da un altro operatore: riprova il salvataggio' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
