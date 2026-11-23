import 'server-only'
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

export const SUPER_COOKIE = 'mattabel_pres_session'
const TTL = 8 * 60 * 60
function secret() { return process.env.SUPER_ADMIN_SESSION_SECRET || '' }
function sign(value: string) { return createHmac('sha256', secret()+'\x00'+(process.env.SUPER_ADMIN_PASS||'')).update(value).digest('hex') }
export function createSuperSession() {
  if (secret().length < 32) throw new Error('Super Admin session not configured')
  const value = String(Math.floor(Date.now()/1000)+TTL)+'.'+randomBytes(24).toString('hex')
  return value+'.'+sign(value)
}
export function isSuperAdmin() {
  if (process.env.VERCEL_ENV !== 'preview' || secret().length < 32 || !process.env.SUPER_ADMIN_PASS) return false
  const token = cookies().get(SUPER_COOKIE)?.value || ''
  const parts = token.split('.')
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false
  if (Number(parts[0]) <= Math.floor(Date.now()/1000)) return false
  return timingSafeEqual(new TextEncoder().encode(parts[2]),new TextEncoder().encode(sign(parts.slice(0,2).join('.'))))
}
