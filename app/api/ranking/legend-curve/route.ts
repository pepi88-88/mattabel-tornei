// app/api/ranking/legend-curve/route.ts
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
const BUCKETS: (keyof ScoreCfgSet)[] = ['S','M','L','XL']

export async function GET() {
  const sb = supabaseAdmin
  const { data, error } = await sb
    .from('rank_legend_curve')
    .select('bucket, base, min_last, curve_percent')

  if (error) {
    return NextResponse.json({ settings: DEFAULT_SET, error: error.message }, { status: 200 })
  }

  const out: ScoreCfgSet = { ...DEFAULT_SET }
  for (const row of (data ?? [])) {
    const k = row.bucket as keyof ScoreCfgSet
    if (!BUCKETS.includes(k)) continue
    out[k] = {
      base: Number(row.base ?? DEFAULT_SET[k].base),
      minLast: Number(row.min_last ?? DEFAULT_SET[k].minLast),
      curvePercent: Number(row.curve_percent ?? DEFAULT_SET[k].curvePercent),
    }
  }
  return NextResponse.json({ settings: out })
}

export async function PUT(req: Request) {
  const body = await req.json().catch(()=>null)
  const admin_key = String(body?.admin_key || '')
  const settings  = body?.settings as ScoreCfgSet | null

  if (!process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ ok:false, error:'ADMIN_SUPER_KEY non configurata' }, { status: 500 })
  }
  if (admin_key !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ ok:false, error:'Chiave amministratore non valida' }, { status: 401 })
  }
  if (!settings) {
    return NextResponse.json({ ok:false, error:'settings mancante' }, { status: 400 })
  }

  const rows = BUCKETS.map(k => ({
    bucket: k,
    base: Number(settings[k]?.base ?? DEFAULT_SET[k].base),
    min_last: Number(settings[k]?.minLast ?? DEFAULT_SET[k].minLast),
    curve_percent: Number(settings[k]?.curvePercent ?? DEFAULT_SET[k].curvePercent),
  }))

  const sb = supabaseAdmin
  const { error } = await sb
    .from('rank_legend_curve')
    .upsert(rows, { onConflict: 'bucket' }) // assicurati che rank_legend_curve.bucket sia UNIQUE
  if (error) {
    return NextResponse.json({ ok:false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok:true })
}
