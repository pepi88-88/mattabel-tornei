import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }

const DEFAULT_SET: ScoreCfgSet = {
  S:{ base:100, minLast:10, curvePercent:100 },
  M:{ base:100, minLast:10, curvePercent:100 },
  L:{ base:100, minLast:10, curvePercent:100 },
  XL:{ base:100, minLast:10, curvePercent:100 },
}

export async function GET() {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('rank_legend_curve')
    .select('bucket, base, min_last, curve_percent')
  if (error) return NextResponse.json({ settings: DEFAULT_SET, error: error.message }, { status: 200 })

  const map: any = { ...DEFAULT_SET }
  ;(data||[]).forEach(r => {
    const k = String(r.bucket) as keyof ScoreCfgSet
    if (k === 'S' || k === 'M' || k === 'L' || k === 'XL') {
      map[k] = {
        base: Number(r.base),
        minLast: Number(r.min_last),
        curvePercent: Number(r.curve_percent),
      }
    }
  })
  return NextResponse.json({ settings: map })
}

export async function PUT(req: Request) {
  const body = await req.json().catch(()=> ({}))
  const adminKey = String(body?.admin_key || '')
  if (!adminKey || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ ok:false, error:'ADMIN_SUPER_KEY non valida' }, { status: 403 })
  }

  const settings = body?.settings as ScoreCfgSet | null
  if (!settings) return NextResponse.json({ ok:false, error:'settings mancanti' }, { status:400 })

  const rows = (['S','M','L','XL'] as (keyof ScoreCfgSet)[]).map(k => ({
    bucket: k,
    base: settings[k].base,
    min_last: settings[k].minLast,
    curve_percent: settings[k].curvePercent,
  }))

  const sb = supabaseAdmin()
  const { error } = await sb.from('rank_legend_curve').upsert(rows, { onConflict:'bucket' })
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })

  return NextResponse.json({ ok:true })
}
