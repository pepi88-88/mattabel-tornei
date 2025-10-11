// app/api/ranking/stages/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'   // ✅ usa getSupabaseAdmin
const supabase = getSupabaseAdmin()                      // ✅ istanzia client

/** GET ?edition_id=... -> lista tappe */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const edition_id = searchParams.get('edition_id') || ''
  if (!edition_id) return NextResponse.json({ ok:false, error:'edition_id required' }, { status:400 })

  const { data, error } = await supabaseAdmin
    .from('rank_stage')
    .select('id, edition_id, name, day, month, multiplier, total_teams, created_at')
    .eq('edition_id', edition_id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true, items: data })
}

/** POST {edition_id, name, day, month, multiplier, total_teams} -> crea tappa */
export async function POST(req: Request) {
  const b = await req.json()
  const edition_id = String(b?.edition_id||'')
  const name = String(b?.name||'').trim()
  const day = Number(b?.day); const month = Number(b?.month)
  const multiplier = Number(b?.multiplier ?? 1)
  const total_teams = Number(b?.total_teams ?? 0)
  if (!edition_id || !name || !day || !month || !total_teams)
    return NextResponse.json({ ok:false, error:'missing fields' }, { status:400 })

  const { data, error } = await supabaseAdmin
    .from('rank_stage')
    .insert({ edition_id, name, day, month, multiplier, total_teams })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true, id: data?.id })
}

export async function DELETE(req: Request) {
  try {
    const b = await req.json()
    const stage_id = String(b?.stage_id || '')
    if (!stage_id) {
      return NextResponse.json({ ok:false, error:'stage_id required' }, { status:400 })
    }

    // 1) elimina piazzamenti collegati (se esiste la tabella dei placements)
    //    Adatta i nomi se diversi (es. rank_stage_placements)
    await supabase.from('rank_stage_placements').delete().eq('stage_id', stage_id)

    // 2) elimina la tappa
    const del = await supabase.from('rank_stages').delete().eq('id', stage_id)
    if (del.error) throw del.error

    return NextResponse.json({ ok:true })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status:500 })
  }
}

