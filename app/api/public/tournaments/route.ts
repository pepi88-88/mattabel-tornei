import { NextResponse } from 'next/server'; import { supabaseAdmin } from '@/lib/supabaseServer'
export const runtime='nodejs'
export async function GET(){ const s=supabaseAdmin(); const {data,error}=await s.from('tournaments').select('id,name,multiplier,max_teams,status').eq('status','open').order('created_at',{ascending:false}); if(error) return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({items:data}) }
