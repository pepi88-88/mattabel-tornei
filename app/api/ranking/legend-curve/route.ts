import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
const supabaseAdmin = getSupabaseAdmin()

type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }

const DEFAULT_SET: ScoreCfgSet = {
  S:{base:100,minLast:10,curvePercent:100},
  M:{base:100,minLast:10,curvePercent:100},
  L:{base:100,minLast:10,curvePercent:100},
  XL:{base:100,minLast:10,curvePercent:100},
}

const SNAP_KEY = (tour_id:string, gender:'M'|'F') => `legend_curve:${tour_id}:${gender}`

function pickBucket(total:number): keyof ScoreCfgSet {
  return total<=8 ? 'S' : total<=16 ? 'M' : total<=32 ? 'L' : 'XL'
}
function pointsOfBucket(pos:number, total:number, mult:number, set:ScoreCfgSet){
  const cfg = set[pickBucket(total)]
  if (total<=1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent/100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

/** GET ?tour_id=...&gender=M|F -> ritorna i parametri curva salvati */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tour_id = String(searchParams.get('tour_id') || '')
    const gender  = (String(searchParams.get('gender') || 'M').toUpperCase() as 'M'|'F')
    if (!tour_id) return NextResponse.json({ ok:false, error:'tour_id required' }, { status:400 })

    const { data, error } = await supabaseAdmin
      .from('lb2_snapshot')
      .select('state')
      .eq('tour_id', tour_id)
      .eq('key', SNAP_KEY(tour_id, gender))
      .maybeSingle()

    if (error) throw error
    const settings = (data?.state?.settings as ScoreCfgSet) || DEFAULT_SET
    return NextResponse.json({ ok:true, settings })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e) }, { status:500 })
  }
}

/** PUT {tour_id, gender, settings, totalsFrom?, totalsTo?}
 *  - salva i parametri curva
 *  - genera rank_legend per total_teams = totalsFrom..totalsTo (default 2..64)
 */
export async function PUT(req: Request) {
  try {
    const b = await req.json()
    const tour_id = String(b?.tour_id || '')
    const gender  = (String(b?.gender || 'M').toUpperCase() as 'M'|'F')
    const settings = (b?.settings as ScoreCfgSet) || DEFAULT_SET
    const totalsFrom = Math.max(2, Number(b?.totalsFrom ?? 2))
    const totalsTo   = Math.max(totalsFrom, Number(b?.totalsTo ?? 64))

    if (!tour_id) return NextResponse.json({ ok:false, error:'tour_id required' }, { status:400 })

    // 1) salva snapshot settings
    const up = {
      tour_id,
      key: SNAP_KEY(tour_id, gender),
      state: { settings },
      updated_at: new Date().toISOString()
    }
    const up1 = await supabaseAdmin.from('lb2_snapshot')
      .upsert(up, { onConflict:'tour_id,key' })
      .select('id')
      .maybeSingle()
    if (up1.error) throw up1.error

    // 2) rigenera tabelle in rank_legend per tutti i total_teams richiesti
    //    - cancelliamo le voci esistenti nel range e reinseriamo
    const del = await supabaseAdmin
      .from('rank_legend')
      .delete()
      .eq('tour_id', tour_id)
      .eq('gender', gender)
      .gte('total_teams', totalsFrom)
      .lte('total_teams', totalsTo)
    if (del.error) throw del.error

    const rows:any[] = []
    for (let total = totalsFrom; total <= totalsTo; total++) {
      const mult = 1 // la legenda è “per unità”, il moltiplicatore si applica per tappa
      for (let pos = 1; pos <= total; pos++) {
        rows.push({
          tour_id, gender, total_teams: total, position: pos,
          points: pointsOfBucket(pos, total, mult, settings)
        })
      }
    }
    if (rows.length) {
      const ins = await supabaseAdmin.from('rank_legend').insert(rows)
      if (ins.error) throw ins.error
    }

    return NextResponse.json({ ok:true, totalsWritten: rows.length })
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:String(e) }, { status:500 })
  }
}
