import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-side only
  { auth: { persistSession: false } }
)

export async function GET() {
  const { data, error } = await supabase
    .from('lb2_tours')
    .select('slug,title')
    .order('created_at', { ascending: true })
  if (error) return new NextResponse(error.message, { status: 500 })
  return NextResponse.json({ tours: data ?? [] })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { action, slug, title, newSlug, newTitle } = body || {}

  if (action === 'create') {
    if (!slug || !title) return new NextResponse('slug/title richiesti', { status: 400 })
    const { error } = await supabase.from('lb2_tours').insert({ slug, title })
    if (error) return new NextResponse(error.message, { status: 500 })
    return new NextResponse('ok', { status: 200 })
  }

  if (action === 'rename') {
    if (!slug || !newSlug) return new NextResponse('slug/newSlug richiesti', { status: 400 })
    const { error } = await supabase
      .from('lb2_tours')
      .update({ slug: newSlug, title: newTitle ?? newSlug })
      .eq('slug', slug)
    if (error) return new NextResponse(error.message, { status: 500 })
    return new NextResponse('ok', { status: 200 })
  }

  if (action === 'delete') {
    if (!slug) return new NextResponse('slug richiesto', { status: 400 })
    const { error } = await supabase.from('lb2_tours').delete().eq('slug', slug)
    if (error) return new NextResponse(error.message, { status: 500 })
    return new NextResponse('ok', { status: 200 })
  }

  return new NextResponse('azione non valida', { status: 400 })
}
