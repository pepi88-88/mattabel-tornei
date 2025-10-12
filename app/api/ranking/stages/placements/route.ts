import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PUT(req: Request) {
  const b = await req.json()
  const stage_id = String(b?.stage_id||'')
  const entries: Array<{player_id:string; position:number}> = Array.isArray(b?.entries) ? b.entries : []
  if (!stage_id) return NextResponse.json({ ok:false, error:'stage_id required' }, { status:400 })

  // 1) leggi stage + edition
  const { data: stg, error: e1 } = await supabaseAdmin
    .from('rank_stage')
    .select('id, edition_id, total_teams, multiplier, edition:rank_edition(tour_id, gender)')
    .eq('id', stage_id)
    .maybeSingle()
  if (e1 || !stg) return NextResponse.json({ ok:false, error:e1?.message || 'stage not found' }, { status:404 })

  const total_teams = Number(stg.total_teams || 0)
  const multiplier = Number(stg.multiplier || 1)
  const ed = Array.isArray((stg as any).edition) ? (stg as any).edition[0] : (stg as any).edition
  const tour_id = (ed?.tour_id as string) || ''
  const gender = ((ed?.gender as string) || 'M').toUpperCase()

  // 2) legenda punteggi per quel (tour, gender, total_teams)
  const { data: legend, error: e2 } = await supabaseAdmin
    .from('rank_legend')
    .select('position, points')
    .eq('tour_id', tour_id)
    .eq('gender', gender)
    .eq('total_teams', total_teams)
    .order('position', { ascending: true })
  if (e2) return NextResponse.json({ ok:false, error:e2.message }, { status:500 })
  const ptsMap = new Map<number, number>(legend.map(r => [Number(r.position), Number(r.points)]))

  // 3) prepara righe con la POSIZIONE RICHIESTA
  const upserts = entries.map(({ player_id, position }) => {
    const base = Number(ptsMap.get(position) || 0)
    const pts = base * multiplier
    return {
      stage_id,
      position,            // <— posizione scelta dall’utente
      player_id,
      base_points: base,
      multiplier,
      points_awarded: pts,
    }
  })

  // 4) “transazione povera”: cancella e reinserisci
  const { error: delErr } = await supabaseAdmin
    .from('rank_stage_result')
    .delete()
    .eq('stage_id', stage_id)
  if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 })

  if (upserts.length) {
    // se hai UNIQUE(stage_id, position) e ci sono doppioni, qui fallisce: fa fede lo schema
    const { error: insErr } = await supabaseAdmin
      .from('rank_stage_result')
      .upsert(upserts, { onConflict: 'stage_id,position' })
    if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, count: upserts.length })
}
