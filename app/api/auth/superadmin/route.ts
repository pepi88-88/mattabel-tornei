import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../lib/superadmin-session'
export const dynamic = 'force-dynamic'
export function GET() { return NextResponse.json({ allowed: isSuperAdmin() }, { headers: { 'Cache-Control': 'private, no-store' } }) }
