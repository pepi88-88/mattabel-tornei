import Image from 'next/image'

/**
 * Shared entrance-logo mapping. Seasonal artwork can be registered here once
 * approved; selection will later be driven by a server-side admin setting.
 * Keeping this list explicit avoids a different logo on each visitor's device.
 */
export const entranceLogoOptions = {
  standard: '/logo-mattabel.png',
} as const

export type EntranceLogoKey = keyof typeof entranceLogoOptions
export const defaultEntranceLogo: EntranceLogoKey = 'standard'

export default function MattabelAccessLogo({
  size = 'home',
  active = defaultEntranceLogo,
}: {
  size?: 'home' | 'staff'
  active?: EntranceLogoKey
}) {
  return (
    <div className={'mt-access-logo'+(size==='staff'?' mt-access-login-logo':'')}>
      <Image
        src={entranceLogoOptions[active]}
        width={size==='staff'?210:245}
        height={size==='staff'?210:245}
        alt="Logo circolare Mattabel Beach Volley con tartaruga"
        priority
      />
    </div>
  )
}
