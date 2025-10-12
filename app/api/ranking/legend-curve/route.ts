import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type BucketKey = 'S' | 'M' | 'L' | 'XL'
type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = Record<BucketKey, ScoreCfg>

const DEFAULT_SET: ScoreCfgSet = {
  S:{ base:100, minLast:10, curvePercent:100 },
  M:{ base:100, minLast:10, curvePercent:100 },
  L:{ base:100, minLast:10, curvePercent:100 },
  XL:{ base:100, minLast:10, curvePercent:100 },
}

const pickBucket = (n:number): BucketKey => (n<=8?'S':n<=16?'M':n<=32?'L':'XL')
const pointsOfBucket = (pos:number, total:number, cfg:ScoreCfg) => {
  if (total <= 1) return Math.round(cfg.base)
  const alpha = Math.max(0.01, cfg.curvePercent / 100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw)
}

/** GET: restituisce la configurazione globale S/M/L/XL */
export async function GET() {
  const sb = supabaseAdmin

  const { data, error } = await sb
    .from('rank_legend_curve')
    .select('bucket, base, min_last, curve_percent')

  if (error) {
    // Se la tabella non esiste o è vuota, ritorna default
    return NextResponse.json({ settings: DEFAULT_SET }, { status: 200 })
  }

  const set: ScoreCfgSet = { ...DEFAULT_SET }
  for (const row of (data ?? [])) {
    const k = String(row.bucket).toUpperCase() as BucketKey
    if (!['S','M','L','XL'].includes(k)) continue
    set[k] = {
      base:        Number(row.base ?? DEFAULT_SET[k].base),
      minLast:     Number(row.min_last ?? DEFAULT_SET[k].minLast),
      curvePercent:Number(row.curve_percent ?? DEFAULT_SET[k].curvePercent),
    }
  }
  return NextResponse.json({ settings: set }, { status: 200 })
}

/** PUT: salva la configurazione e rigenera la tabella rank_legend (globale) */
export async function PUT(req: Request) {
  const sb = supabaseAdmin
  const body = await req.json().catch(()=>null)

  const settings = body?.settings as ScoreCfgSet | null
  const totalsFrom = Math.max(2, Number(body?.totalsFrom ?? 2))
  const totalsTo   = Math.max(totalsFrom, Number(body?.totalsTo ?? 64))

  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ ok:false, error:'Invalid settings' }, { status:400 })
  }

  const norm = (v:any, def:number) => Number.isFinite(Number(v)) ? Number(v) : def
  const set: ScoreCfgSet = {
    S:{ base:norm(settings.S?.base,100),  minLast:norm(settings.S?.minLast,10),  curvePercent:norm(settings.S?.curvePercent,100) },
    M:{ base:norm(settings.M?.base,100),  minLast:norm(settings.M?.minLast,10),  curvePercent:norm(settings.M?.curvePercent,100) },
    L:{ base:norm(settings.L?.base,100),  minLast:norm(settings.L?.minLast,10),  curvePercent:norm(settings.L?.curvePercent,100) },
    XL:{base:norm(settings.XL?.base,100), minLast:norm(settings.XL?.minLast,10), curvePercent:norm(settings.XL?.curvePercent,100) },
  }

  // 1) upsert 4 righe su rank_legend_curve
  const rows = (['S','M','L','XL'] as BucketKey[]).map(b=>({
    bucket: b,
    base: set[b].base,
    min_last: set[b].minLast,
    curve_percent: set[b].curvePercent,
  }))
  {
    const { error } = await sb.from('rank_legend_curve').upsert(rows, { onConflict: 'bucket' })
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 })
  }

  // 2) rigenera rank_legend per il range richiesto (globale: niente tour/genere)
  {
    const { error: delErr } = await sb
      .from('rank_legend')
      .delete()
      .gte('total_teams', totalsFrom)
      .lte('total_teams', totalsTo)
    if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 })
  }

  const batch: { total_teams:number; position:number; points:number }[] = []
  for (let total = totalsFrom; total <= totalsTo; total++) {
    const cfg = set[pickBucket(total)]
    for (let pos = 1; pos <= total; pos++) {
      batch.push({ total_teams: total, position: pos, points: pointsOfBucket(pos, total, cfg) })
    }
  }
  if (batch.length) {
    const { error: insErr } = await sb.from('rank_legend').insert(batch)
    if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, regenerated:{ from: totalsFrom, to: totalsTo } }, { status:200 })
}
