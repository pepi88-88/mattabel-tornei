import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** GET ?tour_id=...&gender=M|F  -> lista edizioni attive */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tour_id = searchParams.get('tour_id') || ''
  const gender = (searchParams.get('gender') || 'M').toUpperCase()
  if (!tour_id) return NextResponse.json({ ok:false, error:'tour_id required' }, { status:400 })

  const { data, error } = await supabaseAdmin
    .from('rank_edition')
    .select('id, tour_id, gender, name, is_archived, created_at, updated_at')
    .eq('tour_id', tour_id)
    .eq('gender', gender)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true, items: data })
}

/** POST {tour_id, gender, name} -> crea edizione */
export async function POST(req: Request) {
  const b = await req.json()
  const tour_id = String(b?.tour_id||'')
  const gender = String(b?.gender||'M').toUpperCase()
  const name = String(b?.name||'')
  if (!tour_id || !name) return NextResponse.json({ ok:false, error:'tour_id & name required' }, { status:400 })

  const { data, error } = await supabaseAdmin
    .from('rank_edition')
    .insert({ tour_id, gender, name })
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true, id: data?.id })
}

/** PUT {edition_id, name} -> rinomina */
export async function PUT(req: Request) {
  const b = await req.json()
  const edition_id = String(b?.edition_id||'')
  const name = String(b?.name||'')
  if (!edition_id || !name) return NextResponse.json({ ok:false, error:'edition_id & name required' }, { status:400 })

  const { error } = await supabaseAdmin
    .from('rank_edition')
    .update({ name })
    .eq('id', edition_id)

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true })
}

/** DELETE {edition_id} -> archivia (soft delete) */
export async function DELETE(req: Request) {
  const b = await req.json()
  const edition_id = String(b?.edition_id||'')
  if (!edition_id) return NextResponse.json({ ok:false, error:'edition_id required' }, { status:400 })

  const { error } = await supabaseAdmin
    .from('rank_edition')
    .update({ is_archived: true })
    .eq('id', edition_id)

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  return NextResponse.json({ ok:true })
}
