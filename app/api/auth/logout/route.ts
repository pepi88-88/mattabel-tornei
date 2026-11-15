import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const response=NextResponse.redirect(new URL('/login-staff',req.url),{status:303})
  for(const name of ['admin_session','staff_role','admin_session_v2','coach_session','admin_session_preview']){
    response.cookies.set(name,'',{path:'/',httpOnly:true,sameSite:'lax',maxAge:0})
  }
  return response
}
