// src/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

// Preferisci env “server-only”; se mancano, fai fallback alle public (per build locali)
const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url) {
  throw new Error('SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) non è definita')
}
if (!serviceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY) non è definita')
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
})
