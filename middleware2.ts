import { NextResponse } from 'next/server'
export function middleware(req){const p=req.nextUrl.pathname; const admin=p.startsWith('/admin'); const prot=p.startsWith('/api')&&!p.startsWith('/api/public')&&!p.startsWith('/api/auth'); if(admin||prot){const s=req.cookies.get('admin_session')?.value; if(s!=='1'){ if(prot) return NextResponse.json({error:'Unauthorized'},{status:401}); const u=req.nextUrl.clone(); u.pathname='/login-staff'; return NextResponse.redirect(u) }} return NextResponse.next() }
export const config={ matcher:['/admin/:path*','/api/:path*']}
