import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
const supabase = getSupabaseAdmin()

// ... GET/POST/PUT qui sopra ...

/** DELETE { edition_id } -> hard delete + cascade */
export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const edition_id = String(body?.edition_id || '')
    if (!edition_id) {
      return NextResponse.json({ ok:false, error:'edition_id required' }, { status:400 })
    }

    // HARD DELETE: rimuove la riga in rank_edition
    // grazie ai FK ON DELETE CASCADE si cancellano anche:
    // - rank_stage (edition_id)
    // - rank_stage_result (via stage_id)
    // - rank_player (edition_id)
    // - rank_adjustment (edition_id)
    const { error } = await supabase
      .from('rank_edition')
      .delete()
      .eq('id', edition_id)

    if (error) throw error
    return NextResponse.json({ ok:true }, { status:200 })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e?.message || e) }, { status:500 })
  }
}
