// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

// Usa le env già presenti in .env.local
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY! // service role: solo lato server

if (!url || !key) {
  throw new Error('Supabase ENV non configurate: controlla NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
}

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
})
