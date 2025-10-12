import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin' // ← è un client, NON chiamarlo

// GET: restituisce le impostazioni uniche (S/M/L/XL)
export async function GET() {
  const sb = supabaseAdmin
  const { data, error } = await sb
    .from('rank_legend_curve')
    .select('bucket, base, min_last, curve_percent')

  if (error) {
    return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  const settings: any = { S:null, M:null, L:null, XL:null }
  for (const r of (data || [])) {
    settings[r.bucket] = {
      base: Number(r.base || 0),
      minLast: Number(r.min_last || 0),
      curvePercent: Number(r.curve_percent || 100),
    }
  }
  return NextResponse.json({ ok:true, settings })
}

// PUT: salva impostazioni (protetto da ADMIN_SUPER_KEY) e rigenera rank_legend
export async function PUT(req: Request) {
  const body = await req.json().catch(()=> ({}))
  const adminKey = String(body?.admin_key || '')
  const settings = body?.settings || null
  const from = Number(body?.totalsFrom ?? 2)
  const to   = Number(body?.totalsTo   ?? 64)

  if (!adminKey || adminKey !== process.env.ADMIN_SUPER_KEY) {
    return NextResponse.json({ ok:false, error: 'Unauthorized' }, { status:401 })
  }
  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ ok:false, error:'Invalid settings' }, { status:400 })
  }

  const sb = supabaseAdmin

  // 1) upsert delle 4 righe S/M/L/XL
  const rows = (['S','M','L','XL'] as const).map(bucket => ({
    bucket,
    base: Number(settings[bucket]?.base ?? 100),
    min_last: Number(settings[bucket]?.minLast ?? 10),
    curve_percent: Number(settings[bucket]?.curvePercent ?? 100),
  }))
  {
    const { error } = await sb.from('rank_legend_curve').upsert(rows, { onConflict: 'bucket' })
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  // 2) rigenera rank_legend (unica per tutti)
  {
    const { error } = await sb.from('rank_legend').delete().gte('total_teams', 2).lte('total_teams', 512)
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  const pickBucket = (n:number)=> n<=8?'S':n<=16?'M':n<=32?'L':'XL'
  const calcPoints = (pos:number, total:number) => {
    const cfg = rows.find(r => r.bucket === pickBucket(total))!
    if (total <= 1) return Math.round(cfg.base)
    const alpha = Math.max(0.01, (cfg.curve_percent || 100)/100)
    const t = (total - pos) / (total - 1)
    const raw = Number(cfg.min_last) + (Number(cfg.base) - Number(cfg.min_last)) * Math.pow(t, alpha)
    return Math.round(raw)
  }

  const legendRows: { total_teams:number; position:number; points:number }[] = []
  const maxTot = Math.max(2, Math.min(512, to))
  for (let tot = Math.max(2, from); tot <= maxTot; tot++) {
    for (let pos = 1; pos <= tot; pos++) {
      legendRows.push({ total_teams: tot, position: pos, points: calcPoints(pos, tot) })
    }
  }

  {
    const { error } = await sb.from('rank_legend').insert(legendRows)
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 })
  }

  return NextResponse.json({ ok:true, regenerated: legendRows.length })
}
