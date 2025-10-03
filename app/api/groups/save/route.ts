import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'   // usa il client Postgres diretto

export async function POST(req: Request) {
  if (!requireAdmin(req as any)) return new NextResponse('Unauthorized', { status: 401 })
  const { tournament_id: tId, groups } = await req.json().catch(() => ({}))
  if (!tId || !Array.isArray(groups)) return new NextResponse('Bad request', { status: 400 })

  const client = await db.connect()
  try {
    await client.query('begin')

    // 1) pulizia vecchi gironi/assegnazioni
    await client.query(
      `delete from public.tournament_group_assignments
       where group_id in (select id from public.tournament_groups where tournament_id = $1)`,
      [tId]
    )
    await client.query(
      `delete from public.tournament_groups where tournament_id = $1`,
      [tId]
    )

    // 2) inserimento nuovi gironi + assegnazioni
    for (const g of groups) {
      const { rows: [row] } = await client.query(
        `insert into public.tournament_groups
           (tournament_id, name, order_index, format, capacity)
         values ($1,$2,$3,$4,$5)
         returning id`,
        [tId, g.name, g.order_index, g.format ?? 'pool', g.capacity ?? null]
      )
      const gid = row.id as string
      if (g.items?.length) {
        const vals:any[] = []
        const chunks:string[] = []
        let i = 1
        for (const it of g.items) {
          chunks.push(`($${i++}, $${i++}, $${i++})`)
          vals.push(gid, it.registration_id, it.slot_index)
        }
        await client.query(
          `insert into public.tournament_group_assignments
             (group_id, registration_id, slot_index)
           values ${chunks.join(',')}`,
          vals
        )
      }
    }

    await client.query('commit')
    return NextResponse.json({ ok: true })
  } catch (err:any) {
    await client.query('rollback')
    return NextResponse.json({ error: err?.message ?? 'db error' }, { status: 500 })
  } finally {
    client.release()
  }
}
