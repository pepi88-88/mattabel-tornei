// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSuperSession, SUPER_COOKIE } from '../../../../lib/superadmin-session'
import { timingSafeEqual } from 'node:crypto'

export async function POST(req: NextRequest) {
  const f = await req.formData()
  const user = String(f.get('user') || '')
  const pass = String(f.get('pass') || '')

  let role: 'admin' | 'coach' | null = null

  const expected = process.env.SUPER_ADMIN_PASS || ''
  const superLogin = user === 'Pres' && expected.length >= 12 && Buffer.byteLength(pass) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(pass), Buffer.from(expected)) && (process.env.SUPER_ADMIN_SESSION_SECRET || '').length >= 32
  if (superLogin) {
    role = 'admin'
  } else if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) {
    role = 'admin'
  } else if (user === process.env.COACH_USER && pass === process.env.COACH_PASS) {
    role = 'coach'
  }

  if (!role) {
    return NextResponse.json(
      { ok: false, error: 'Credenziali non valide' },
      { status: 401 }
    )
  }

  const res = NextResponse.json({ ok: true, role })

  // Role is stored server-side in an HttpOnly cookie, independent of
  // client-side localStorage. Branding settings are Admin-only.
  res.cookies.set('staff_role', role, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  // 🔴 COOKIE "COMUNE" CHE IL MIDDLEWARE SI ASPETTA
  res.cookies.set('admin_session', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  // (facoltativo) mantieni anche quello per ruolo, se ti serve in futuro
  res.cookies.set(`${role}_session`, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })

  if (superLogin) {
    res.cookies.set(SUPER_COOKIE, createSuperSession(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 28800 })
  } else {
    res.cookies.set(SUPER_COOKIE, '', { path: '/', maxAge: 0 })
  }
  return res
}
