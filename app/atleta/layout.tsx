'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandLogo from '../../components/BrandLogo'
import PreviewPushToggle from '../../components/PreviewPushToggle'
import ThemeSwitcher from '../../components/ThemeSwitcher'
import NavigationIcon, { type NavigationIconName } from '../../components/NavigationIcon'

const ORANGE = 'rgb(240,125,0)'

function NavBtn({ href, label, icon }:{ href:string; label:string; icon:NavigationIconName }) {
  const pathname = usePathname()
  const active = pathname?.startsWith(href)
  return (
    <Link
      href={href}
      className={[
        'inline-flex items-center justify-center',
        'h-11 px-4 rounded-md my-2 mt-athlete-nav-link',
        'min-w-[180px] md:min-w-[160px] sm:min-w-[140px] xs:min-w-[120px]',
        'bg-[--brand-navy] border border-neutral-700',
        'text-[15px] font-medium hover:border-neutral-500 transition-colors',
      ].join(' ')}
      style={active ? { borderColor: ORANGE } : undefined}
    >
      <span className="mt-nav-icon"><NavigationIcon name={icon} /></span><span className="truncate">{label}</span>
    </Link>
  )
}

function ExitBtn(){
  return (
    <button
      className="mt-athlete-exit inline-flex items-center justify-center h-11 px-4 rounded-md my-2
                 min-w-[180px] md:min-w-[160px] sm:min-w-[140px] xs:min-w-[120px]
                 bg-transparent border border-neutral-700 hover:border-neutral-500"
      onClick={()=>{ localStorage.removeItem('role'); location.href='/' }}
      title="Esci"
    >
      <span className="mt-nav-icon"><NavigationIcon name="logout" /></span>Esci
    </button>
  )
}

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-athlete-shell min-h-screen flex flex-col">
      {/* Header sticky identico allo staff */}
      <header
        className="athlete-topbar sticky top-0 z-40 bg-neutral-950/95 backdrop-blur header-shadow"
        style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}
      >
        <div className="athlete-topline container-admin mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mt-athlete-brand"><BrandLogo width={62} height={62} className="mt-header-brand-img" alt="Logo Mattabel" /></div>
          <nav aria-label="Navigazione atleta" className="athlete-navigation flex flex-wrap gap-2">
            <NavBtn href="/atleta/tornei" label="Tornei attivi" icon="tour" />
            <NavBtn href="/atleta/classifica" label="Classifica generale" icon="ranking" />
            <ExitBtn />
          </nav>
          <ThemeSwitcher area="atleta" />
        </div>
        <div className="brand-strip" />
      </header>

      {/* Logo sotto (non-sticky) */}
      <div className="athlete-logo-below container-admin mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center py-4">
          <BrandLogo width={96} height={96} className="mt-athlete-secondary-logo" alt="Logo Mattabel" />
        </div>
      </div>

      {/* Contenuto */}
      <main className="mt-athlete-main flex-1 container-admin mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <PreviewPushToggle />
        {children}
      </main>
    </div>
  )
}
