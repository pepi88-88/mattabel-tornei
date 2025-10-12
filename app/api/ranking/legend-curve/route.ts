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

const pickBucket = (n:number): keyof ScoreCfgSet => (n<=8?'S':n<=16?'M':n<=32?'L':'XL')

/** GET: restituisce impostazioni globali S/M/L/XL */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('rank_legend_curve')
    .select('bucket, base, min_last, curve_percent')

  if (error) {
    // se la tabella non esiste o è vuota, torna i default
    return NextResponse.json({ settings: DEFAULT_SET })
  }

  const set: ScoreCfgSet = { ...DEFAULT_SET }
  for (const r of data || []) {
    const k = String(r.bucket).toUpperCase() as keyof ScoreCfgSet
    if (set[k]) {
      set[k] = {
        base: Number(r.base) || 0,
        minLast: Number(r.min_last) || 0,
        curvePercent: Number(r.curve_percent) || 100,
      }
    }
  }
  return NextResponse.json({ settings: set })
}

/** PUT: salva impostazioni e rigenera rank_legend (2..64 squadre) */
export async function PUT(req: Request) {
  const body = await req.json().catch(()=> ({}))
  const settings = (body?.settings || {}) as Partial<ScoreCfgSet>
  const totalsFrom = Math.max(2, Number(body?.totalsFrom ?? 2))
  const totalsTo   = Math.min(128, Math.max(totalsFrom, Number(body?.totalsTo ?? 64)))

  // normalizza con default
  const set: ScoreCfgSet = {
    S: { ...(settings.S || DEFAULT_SET.S) },
    M: { ...(settings.M || DEFAULT_SET.M) },
    L: { ...(settings.L || DEFAULT_SET.L) },
    XL:{ ...(settings.XL|| DEFAULT_SET.XL) },
  }

  // 1) upsert rank_legend_curve
  const curveRows = (['S','M','L','XL'] as (keyof ScoreCfgSet)[]).map(k => ({
    bucket: k,
    base: set[k].base,
    min_last: set[k].minLast,
    curve_percent: set[k].curvePercent,
  }))

  const { error: upErr } = await supabaseAdmin
    .from('rank_legend_curve')
    .upsert(curveRows, { onConflict: 'bucket' })

  if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 })

  // 2) rigenera tabella rank_legend (posizioni “base”, senza moltiplicatore)
  //    schema atteso: total_teams int, position int, points int
  //    (se hai colonne tour_id/gender, rimuovi i filtri dove indicato)
  const rows:any[] = []
  for (let total = totalsFrom; total <= totalsTo; total++) {
    const cfg = set[pickBucket(total)]
    const alpha = Math.max(0.01, cfg.curvePercent/100)
    for (let pos=1; pos<=total; pos++) {
      const t = (total - pos) / (total - 1 || 1)
      const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
      const points = Math.round(raw)
      rows.push({
        total_teams: total,
        position: pos,
        points,
      })
    }
  }

  // pulizia per range (facciamo REPLACE del range rigenerato)
  const { error: delErr } = await supabaseAdmin
    .from('rank_legend')
    .delete()
    .gte('total_teams', totalsFrom)
    .lte('total_teams', totalsTo)

  if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 })

  // inserisci rigenerati
  if (rows.length) {
    const { error: insErr } = await supabaseAdmin.from('rank_legend').insert(rows)
    if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, regenerated: { from: totalsFrom, to: totalsTo } })
}
