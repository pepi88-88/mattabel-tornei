import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse('Unauthorized', { status: 401 })
  const s = supabaseAdmin()
  const sp = new URL(req.url).searchParams
  const tournament_id = sp.get('tournament_id')
  if (!tournament_id) return new NextResponse('Missing tournament_id', { status: 400 })

 const { data: regs, error } = await s
  .from('registrations')
  .select('id, order_index, partner_status, paid_a, paid_b, team_id, created_at')
  .eq('tournament_id', tournament_id)
  .order('order_index', { ascending: true })      // ← PRIMO ordinamento
  .order('created_at',  { ascending: true })      // ← tie-break


  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out: Array<{ id: string; label: string; paid: boolean }> = []

  for (const r of regs ?? []) {
    // team
    const { data: team } = await s
      .from('teams')
      .select('player_a, player_b')
      .eq('id', r.team_id)
      .single()

    // player A
    const { data: a } = await s
      .from('players')
      .select('first_name,last_name')
      .eq('id', team?.player_a)
      .single()

    // player B (può essere placeholder)
    const { data: b } = await s
      .from('players')
      .select('first_name,last_name,is_placeholder')
      .eq('id', team?.player_b)
      .maybeSingle()

    const aLast = a?.last_name ?? ''
    const aFirst = a?.first_name ?? ''

    let bLabel = ''
    if (r.partner_status === 'looking') bLabel = 'IN CERCA'
    else if (r.partner_status === 'cdc') bLabel = 'CDC'
    else bLabel = `${b?.last_name ?? ''} ${b?.first_name ?? ''}`.trim()

    const label = `${aLast} ${aFirst} — ${bLabel}`.trim()

    out.push({
      id: r.id,
      label,
      paid: Boolean(r.paid_a && r.paid_b),
    })
  }

  return NextResponse.json({ items: out })
}

