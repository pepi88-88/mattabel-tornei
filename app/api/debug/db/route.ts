import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const r = await db.query('select now() as ts')
    return NextResponse.json({ ok: true, ts: r.rows[0].ts })
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
