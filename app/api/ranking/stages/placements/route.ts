import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PUT(req: Request) {
  const b = await req.json().catch(()=> ({}))
  const stage_id = String(b?.stage_id||'')
  const items: Array<{ player_id:string; position:number }> = Array.isArray(b?.items) ? b.items : []

  if (!stage_id) {
    return NextResponse.json({ ok:false, error:'stage_id required' }, { status:400 })
  }

  const sb = supabaseAdmin

  // 1) stage + parametri
  const { data: stg, error: e1 } = await sb
    .from('rank_stage')
    .select('id, total_teams, multiplier')
    .eq('id', stage_id)
    .maybeSingle()
  if (e1 || !stg) return NextResponse.json({ ok:false, error: e1?.message || 'stage not found' }, { status:404 })

  const total_teams = Number(stg.total_teams || 0)
  const multiplier  = Number(stg.multiplier  || 1)

  // sanitize/filtra input
  const cleaned = items
    .map(x => ({ player_id: String(x.player_id), position: Number(x.position) }))
    .filter(x => x.player_id && Number.isFinite(x.position) && x.position >= 1 && x.position <= total_teams)

  // 2) carica legenda per total_teams (UNICA)
  const { data: legend, error: e2 } = await sb
    .from('rank_legend')
    .select('position, points')
    .eq('total_teams', total_teams)
    .order('position', { ascending: true })
  if (e2) return NextResponse.json({ ok:false, error:e2.message }, { status:500 })

  const baseByPos = new Map<number, number>(legend.map(r => [Number(r.position), Number(r.points)]))

  // 3) costruisci upserts (chiave: stage_id + player_id → CONSENTE posizioni uguali per player diversi)
  const upserts = cleaned.map(it => {
    const base = Number(baseByPos.get(it.position) || 0)
    return {
      stage_id,
      player_id: it.player_id,
      position: it.position,
      base_points: base,
      multiplier,
      points_awarded: base * multiplier,
    }
  })

  // 4) elimina SOLO chi non è più presente (non cancellare tutti!)
  if (cleaned.length > 0) {
    const ids = cleaned.map(x => x.player_id)
    const { error: delErr } = await sb
      .from('rank_stage_result')
      .delete()
      .eq('stage_id', stage_id)
      .not('player_id', 'in', `(${ids.map(id=> `'${id}'`).join(',')})`)
    if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 })
  } else {
    // se nessuno ha una posizione valida: non cancelliamo nulla (evita reset involontari)
  }

  // 5) upsert su (stage_id, player_id)
  if (upserts.length) {
    const { error: insErr } = await sb
      .from('rank_stage_result')
      .upsert(upserts, { onConflict: 'stage_id,player_id' })
    if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, count: upserts.length })
}
