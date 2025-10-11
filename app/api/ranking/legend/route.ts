import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** GET ?tour_id=...&gender=M&total_teams=8 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tour_id = searchParams.get('tour_id') || ''
  const gender = (searchParams.get('gender') || 'M').toUpperCase()
  const total_teams = Number(searchParams.get('total_teams') || 0)
  if (!tour_id || !total_teams) return NextResponse.json({ ok:false, error:'tour_id & total_teams required' }, { status:400 })

  const { data, error } = await supabaseAdmin
    .from('rank_legend')
    .select('position, points')
    .eq('tour_id', tour_id)
    .eq('gender', gender)
    .eq('total_teams', total_teams)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true, items: data })
}

/** PUT {tour_id, gender, total_teams, table: number[]} -> riscrive la tabella */
export async function PUT(req: Request) {
  const b = await req.json()
  const tour_id = String(b?.tour_id||'')
  const gender = String(b?.gender||'M').toUpperCase()
  const total_teams = Number(b?.total_teams||0)
  const table: number[] = Array.isArray(b?.table) ? b.table : []
  if (!tour_id || !total_teams || !table.length) return NextResponse.json({ ok:false, error:'tour_id, total_teams, table[] required' }, { status:400 })

  // sovrascrive: cancella e inserisce
  const { error: delErr } = await supabaseAdmin
    .from('rank_legend')
    .delete()
    .eq('tour_id', tour_id)
    .eq('gender', gender)
    .eq('total_teams', total_teams)
  if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 })

  const rows = table.map((pts, i) => ({ tour_id, gender, total_teams, position: i+1, points: Number(pts||0) }))
  const { error: insErr } = await supabaseAdmin.from('rank_legend').insert(rows)
  if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 })

  return NextResponse.json({ ok:true, count: rows.length })
}
