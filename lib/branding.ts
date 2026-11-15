import { supabaseAdmin } from '@/lib/supabaseServer'

export const LOGO_IDS = ['ufficiale','befana','carnevale','pasqua','master','estate','superspritz','halloween','natale'] as const
export type LogoId = typeof LOGO_IDS[number]
export const BUCKET = 'mattabel-branding'
export const SETTINGS_PATH = 'site/logo-selection.json'
export const isLogoId = (id: unknown): id is LogoId => typeof id === 'string' && (LOGO_IDS as readonly string[]).includes(id)
export const logoPath = (id: LogoId) => 'logos/' + id + '.png'
export type BrandingSettings = { active: LogoId; uploaded: LogoId[]; updatedAt?: string }
export const DEFAULT_BRANDING: BrandingSettings = { active: 'ufficiale', uploaded: [] }

export async function readBranding(): Promise<BrandingSettings> {
  const s = supabaseAdmin()
  const { data, error } = await s.storage.from(BUCKET).download(SETTINGS_PATH)
  if (error || !data) return DEFAULT_BRANDING
  try {
    const json = JSON.parse(await data.text())
    return {
      active: isLogoId(json.active) ? json.active : 'ufficiale',
      uploaded: Array.isArray(json.uploaded) ? json.uploaded.filter(isLogoId) : [],
      updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : undefined,
    }
  } catch { return DEFAULT_BRANDING }
}

export async function ensureBrandingBucket() {
  const s = supabaseAdmin()
  const { data } = await s.storage.getBucket(BUCKET)
  if (!data) {
    const { error } = await s.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 6 * 1024 * 1024, allowedMimeTypes: ['image/png'] })
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message)
  }
  return s
}

export async function saveBranding(state: BrandingSettings) {
  const s = await ensureBrandingBucket()
  const doc = { ...state, updatedAt: new Date().toISOString() }
  const { error } = await s.storage.from(BUCKET).upload(
    SETTINGS_PATH, Buffer.from(JSON.stringify(doc)), { upsert: true, contentType: 'application/json', cacheControl: '0' }
  )
  if (error) throw new Error(error.message)
  return doc
}
