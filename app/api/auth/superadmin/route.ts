import { NextResponse } from 'next/server'
import { isSuperAdmin, createSuperSession, SUPER_COOKIE, SUPER_SESSION_TTL } from '../../../../lib/superadmin-session'
export const dynamic = 'force-dynamic'
export function GET() {
 const allowed=isSuperAdmin()
 const res=NextResponse.json({allowed},{headers:{'Cache-Control':'private, no-store'}})
 if(allowed){
  const opts={httpOnly:true,secure:process.env.NODE_ENV==='production',path:'/',maxAge:SUPER_SESSION_TTL}
  res.cookies.set(SUPER_COOKIE,createSuperSession(),{...opts,sameSite:'strict'})
  res.cookies.set('admin_session','1',{...opts,sameSite:'lax'})
  res.cookies.set('staff_role','admin',{...opts,sameSite:'lax'})
 }
 return res
}
