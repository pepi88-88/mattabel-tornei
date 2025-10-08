// middleware.ts (o .js)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// 401 con WWW-Authenticate (fa apparire il prompt basic auth)
function unauthorized(realm = 'Restricted Area') {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"` },
  })
}

// Basic Auth compatibile con Edge Runtime (usa atob)
function checkBasicAuth(req: NextRequest, user?: string, pass?: string) {
  if (!user || !pass) return false
  const h = req.headers.get('authorization') || ''
  if (!h.toLowerCase().startsWith('basic ')) return false
  const base64 = h.slice(6).trim()
  // atob è disponibile in runtime edge
  try {
    const decoded = atob(base64)
    const i = decoded.indexOf(':')
    const u = decoded.slice(0, i)
    const p = decoded.slice(i + 1)
    return u === user && p === pass
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // regole rotte
  const isAdminPage = pathname.startsWith('/admin')
  const isCoachPage = pathname.startsWith('/coach')
  const isApi = pathname.startsWith('/api')

  // ✅ WHITELIST API "pubbliche" (GET-only) usate dalle pagine atleta
  const PUBLIC_API_PREFIXES = [
    '/api/leaderboard',   // classifiche, legende, ecc.
    '/api/tournaments',   // lista/Dettaglio tornei
    '/api/groups',        // gironi/tabelloni
    '/api/brackets',      // bracket/eliminatorie
    '/api/atleta',        // eventuali endpoint dedicati atleti
  ]

  const isWhitelistedGet =
    req.method === 'GET' &&
    PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))

  // 🔓 Consideriamo pubbliche anche:
  // - /api/auth (login)
  // - /api/public/* (se in futuro ne crei)
  // - qualunque cosa con /public/ nel path
  const isApiPublic =
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/public') ||
    pathname.includes('/public/') ||
    isWhitelistedGet

  // Se non è /admin, /coach o /api protette → passa
  if (!isAdminPage && !isCoachPage && !(isApi && !isApiPublic)) {
    return NextResponse.next()
  }

  // 1) ADMIN o API protette: richiedi cookie o basic admin
  if (isAdminPage || (isApi && !isApiPublic)) {
    const cookieOk = req.cookies.get('admin_session')?.value === '1'
    const basicOk = checkBasicAuth(req, process.env.ADMIN_USER, process.env.ADMIN_PASS)
    if (cookieOk || basicOk) return NextResponse.next()

    if (isApi && !isApiPublic) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const u = req.nextUrl.clone()
    u.pathname = '/login-staff'
    return NextResponse.redirect(u)
  }

  // 2) COACH: basic auth dedicata
  if (isCoachPage) {
    const coachOk = checkBasicAuth(req, process.env.COACH_USER, process.env.COACH_PASS)
    if (coachOk) return NextResponse.next()
    return unauthorized('Coach Area')
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/coach/:path*', '/api/:path*'],
}
