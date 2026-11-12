import { NextRequest, NextResponse } from 'next/server'
import { getStaffRole } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

// Edit the existing team and registration. Never delete/recreate or change order_index.
export async function PATCH(req: NextRequest) {
  if (!getStaffRole(req)) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const regId = String(body?.id || '').trim()
  const tournamentId = String(body?.tournament_id || '').trim()
  const aId = String(body?.a?.id || '').trim()
  const format = Number(body?.team_format ?? 2)
  const teamName = String(body?.team_name || '').trim()
  if (!regId || !tournamentId || !aId || ![2,3,4].includes(format))
    return NextResponse.json({ error: 'Dati della squadra non validi' }, { status: 400 })
  if (format > 2 && !teamName)
    return NextResponse.json({ error: 'Nome squadra obbligatorio per 3x3 e 4x4' }, { status: 400 })

  const parseSlot = (slot: any) => {
    if (slot?.mode === 'looking' || slot?.mode === 'cdc') return { id: null, status: slot.mode as 'looking'|'cdc' }
    const id = String(slot?.existingId || '').trim()
    return { id: id || null, status: 'paired' as const }
  }
  const b = parseSlot(body?.b)
  const c = format >= 3 ? parseSlot(body?.c) : { id: null, status: null }
  const d = format === 4 ? parseSlot(body?.d) : { id: null, status: null }
  if ((b.status === 'paired' && !b.id) ||
      (format >= 3 && c.status === 'paired' && !c.id) ||
      (format === 4 && d.status === 'paired' && !d.id))
    return NextResponse.json({ error: 'Seleziona i giocatori richiesti' }, { status: 400 })

  const ids = [aId, b.id, c.id, d.id].filter(Boolean) as string[]
  if (new Set(ids).size !== ids.length)
    return NextResponse.json({ error: 'Lo stesso giocatore compare più volte nella squadra' }, { status: 409 })

  const s = supabaseAdmin()
  const { data: reg, error: regError } = await s.from('registrations')
    .select('id, tournament_id, team_id, partner_status, c_player_id, d_player_id, c_status, d_status, team_name, team_format, paid_a, paid_b, paid_c, paid_d')
    .eq('id', regId).eq('tournament_id', tournamentId).maybeSingle()
  if (regError) return NextResponse.json({ error: regError.message }, { status: 500 })
  if (!reg?.team_id) return NextResponse.json({ error: 'Iscrizione non trovata' }, { status: 404 })

  const { data: oldTeam, error: teamError } = await s.from('teams')
    .select('id, player_a, player_b').eq('id', reg.team_id).maybeSingle()
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 500 })
  if (!oldTeam) return NextResponse.json({ error: 'Coppia originale non trovata' }, { status: 404 })

  // Check the entire tournament, including C/D, except this registration.
  const { data: otherRegs, error: othersError } = await s.from('registrations')
    .select('id, team_id, c_player_id, d_player_id')
    .eq('tournament_id', tournamentId).neq('id', regId)
  if (othersError) return NextResponse.json({ error: othersError.message }, { status: 500 })
  const otherTeamIds = Array.from(new Set((otherRegs ?? []).map(r => r.team_id).filter(Boolean))) as string[]
  let otherTeams: { id: string; player_a: string | null; player_b: string | null }[] = []
  if (otherTeamIds.length) {
    const { data, error } = await s.from('teams').select('id, player_a, player_b').in('id', otherTeamIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    otherTeams = data ?? []
  }
  const used = new Set<string>()
  for (const t of otherTeams) for (const p of [t.player_a,t.player_b]) if(p) used.add(p)
  for (const r of otherRegs ?? []) for (const p of [r.c_player_id,r.d_player_id]) if(p) used.add(p)
  if (ids.some(id => used.has(id)))
    return NextResponse.json({ error: 'Un giocatore è già iscritto in un’altra squadra della tappa' }, { status: 409 })

  const { data: players, error: playersError } = await s.from('players')
    .select('id, first_name, last_name').in('id', ids)
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })
  if ((players ?? []).length !== ids.length)
    return NextResponse.json({ error: 'Uno dei giocatori selezionati non esiste' }, { status: 400 })

  const names = new Map((players ?? []).map(p => [p.id, `${p.last_name} ${p.first_name}`.trim()]))
  const bLabel = b.id ? names.get(b.id) : b.status === 'looking' ? 'IN CERCA' : 'CDC'
  const label = format === 2
    ? `${names.get(aId)} — ${bLabel}`
    : `${teamName} — ${[aId,b.id,c.id,d.id].filter(Boolean).map(id => names.get(id as string)).join(', ')}`

  // The payment flags belong to specific players, so clear only changed slots.
  const registrationChanges = {
    partner_status: b.status,
    team_format: format,
    team_name: format === 2 ? null : teamName,
    c_player_id: c.id,
    d_player_id: d.id,
    c_status: c.status,
    d_status: d.status,
    label,
    paid_a: oldTeam.player_a === aId ? reg.paid_a : false,
    paid_b: oldTeam.player_b === b.id && reg.partner_status === b.status ? reg.paid_b : false,
    paid_c: reg.c_player_id === c.id && reg.c_status === c.status ? reg.paid_c : false,
    paid_d: reg.d_player_id === d.id && reg.d_status === d.status ? reg.paid_d : false,
  }

  // Team and registration are different tables; restore team if step two fails.
  const { error: updateTeamError } = await s.from('teams')
    .update({ player_a: aId, player_b: b.id }).eq('id', oldTeam.id)
  if (updateTeamError) return NextResponse.json({ error: updateTeamError.message }, { status: 500 })
  const { error: updateRegError } = await s.from('registrations')
    .update(registrationChanges).eq('id', reg.id).eq('tournament_id', tournamentId)
  if (updateRegError) {
    const { error: restoreError } = await s.from('teams')
      .update({ player_a: oldTeam.player_a, player_b: oldTeam.player_b }).eq('id', oldTeam.id)
    return NextResponse.json({
      error: restoreError
        ? 'Aggiornamento parziale: contattare lo staff prima di riprovare.'
        : updateRegError.message,
    }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: reg.id })
}
