import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const f = await req.formData()
  const user = String(f.get('user') || '')
  const pass = String(f.get('pass') || '')

  let role: 'admin' | 'coach' | null = null
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
    role = 'admin'
  } else if (user === process.env.COACH_USER && pass === process.env.COACH_PASS) {
    role = 'coach'
  }

  if (!role) {
    return NextResponse.json({ ok: false, error: 'Credenziali non valide' }, { status: 401 })
  }

  // opzionale: cookie di sessione (utile se in futuro userai un middleware)
  const res = NextResponse.json({ ok: true, role })
  res.cookies.set(`${role}_session`, '1', { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
}
