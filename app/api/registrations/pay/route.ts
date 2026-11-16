// app/api/registrations/pay/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function PATCH(req: Request) {
  try {
    const b = await req.json()
    const id = String(b?.id || '').trim()
    if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400 })

    const updates: any = {}
    if (typeof b.paid_a === 'boolean') updates.paid_a = b.paid_a
    if (typeof b.paid_b === 'boolean') updates.paid_b = b.paid_b
    if (typeof b.paid_c === 'boolean') updates.paid_c = b.paid_c
    if (typeof b.paid_d === 'boolean') updates.paid_d = b.paid_d

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    const s = supabaseAdmin()
    // Valore atteso opzionale per la sincronizzazione offline: evita che
    // un tablet vecchio sostituisca un pagamento registrato da altro Staff.
    const expected = b?.expected
    if (expected && typeof expected === 'object') {
      const side = Object.keys(updates)[0]
      if (Object.keys(updates).length !== 1 || typeof expected[side] !== 'boolean') {
        return NextResponse.json({ error: 'Versione pagamento non valida' }, { status: 400 })
      }
      const {data, error} = await s.from('registrations').update(updates)
        .eq('id', id).eq(side, expected[side])
        .select('id').maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error:'Pagamento modificato su altro dispositivo', conflict:true }, { status:409 })
      return NextResponse.json({ok:true})
    }
    const { error } = await s.from('registrations').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Errore' }, { status: 500 })
  }
}
