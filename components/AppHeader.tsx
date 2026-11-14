'use client'

import * as React from 'react'
import Image from 'next/image'
import ThemeSwitcher from './ThemeSwitcher'
import NavigationIcon, { type NavigationIconName } from './NavigationIcon'
import { useRouter, usePathname } from 'next/navigation'  // 👈 unico import next/navigation

const ORANGE = 'rgb(240,125,0)'

function useRole(): 'admin' | 'coach' | 'athlete' | undefined {
  const [role, setRole] = React.useState<'admin'|'coach'|'athlete'|undefined>(undefined)
  React.useEffect(() => {
    try {
      const v = localStorage.getItem('role')
      if (v === 'admin' || v === 'coach' || v === 'athlete') setRole(v)
      else setRole(undefined)
    } catch { setRole(undefined) }
  }, [])
  return role
}

type Item = { href: string; label: string; icon: NavigationIconName; roles: Array<'admin'|'coach'> | 'any' }
const NAV_ITEMS: Item[] = [
  { href: '/admin/tour', icon: 'tour',              label: 'Gestione Tour/Tappa',         roles: ['admin'] },
  { href: '/admin/giocatori', icon: 'players',         label: 'Crea giocatore',              roles: ['admin','coach'] },
  { href: '/admin/iscrizioni', icon: 'registrations',        label: 'Iscrizioni',                  roles: ['admin','coach'] },
  { href: '/admin/gironi', icon: 'groups',            label: 'Crea Gironi',                 roles: ['admin','coach'] },
  { href: '/admin/crea-tabellone', icon: 'bracket',    label: 'Creazione Tabellone',         roles: ['admin'] },
  { href: '/admin/risultati', icon: 'results',         label: 'Risultati Girone/Tabellone',  roles: ['admin','coach'] },
  { href: '/admin/classifica', icon: 'ranking',        label: 'Classifica',                  roles: ['admin','coach'] },
  { href: '/admin/tornei/test/regia', icon: 'broadcast',             label: 'Regia',                       roles: ['admin','coach'] },
  { href: '/admin/attese', icon: 'waiting',            label: 'Attese',              roles: ['admin','coach'] },
  { href: '/admin/pagamenti', icon: 'payments',         label: 'Pagamenti',                   roles: ['admin','coach'] },
  { href: '/admin/stampa', icon: 'print',            label: 'Stampa',                      roles: ['admin','coach'] },
  { href: '__exit__', icon: 'logout',                 label: 'Esci',                        roles: 'any' },
]

function NavLink({ href, label, icon, active }: { href:string; label:string; icon: NavigationIconName; active:boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        // Le pagine con salvataggi in sospeso possono completare il salvataggio
        // prima di lasciare la schermata (es. Creazione Tabellone).
        const before = new CustomEvent('mattabel:before-admin-nav', {
          cancelable: true, detail: { href },
        })
        if (window.dispatchEvent(before)) router.push(href)
      }}
      className={[
        'inline-flex items-center justify-center',
        'h-11 px-4 rounded-md my-2',
        'min-w-[180px] md:min-w-[160px] sm:min-w-[140px] xs:min-w-[120px]',
        'bg-[--brand-navy] border border-neutral-700',
        'text-[15px] font-medium hover:border-neutral-500 transition-colors',
      ].join(' ')}
      style={active ? { borderColor: ORANGE } : undefined}
    >
      <span className="mt-nav-icon"><NavigationIcon name={icon} /></span>
      <span className="truncate">{label}</span>
    </button>
  )
}


function ExitButton() {
  return (
    <button
      className="inline-flex items-center justify-center h-11 px-4 rounded-md my-2
                 min-w-[180px] md:min-w-[160px] sm:min-w-[140px] xs:min-w-[120px]
                 bg-transparent border border-neutral-700 hover:border-neutral-500"
      onClick={() => { localStorage.removeItem('role'); location.href = '/' }}
      title="Esci"
    >
      Esci
    </button>
  )
}

export default function AppHeader() {
  const role = useRole()
  const pathname = usePathname()
  const router = useRouter()
  const navigate = (href: string) => {
    if (href === '__exit__') {
      localStorage.removeItem('role')
      location.href = '/'
      return
    }
    const before = new CustomEvent('mattabel:before-admin-nav', {
      cancelable: true, detail: { href },
    })
    if (window.dispatchEvent(before)) router.push(href)
  }

  if (
    pathname === '/' ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/login-staff') ||
    pathname?.startsWith('/atleta')
  ) return null

  // Filtra voci per ruolo (se ruolo non ancora letto => mostra nulla, eviti flash)
  const visible =
    role === 'admin' || role === 'coach'
      ? NAV_ITEMS.filter(i => i.roles === 'any' || i.roles.includes(role))
      : [] // atleta o undefined: niente voci admin/coach

  return (
    <>
      {/* HEADER sticky */}
<header
  className="fixed top-0 left-0 right-0 z-[99999] isolate bg-neutral-950/95 backdrop-blur header-shadow pointer-events-auto"
  style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}
>
     <div className="admin-topline relative z-[1] container-admin mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mt-header-brand" aria-label="Beach Volley Mattabel">
            <Image src="/logo2.png" alt="Beach Volley Mattabel" width={112} height={64} className="mt-header-brand-img" priority />
          </div>

          {/* Tutto su un lato (sinistra), con wrap */}
          <nav className="admin-nav-desktop hidden xl:flex flex-wrap gap-2" aria-label="Navigazione staff">
            {visible.map(it =>
              it.href === '__exit__'
                ? <ExitButton key="__exit__" />
                : <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} active={!!pathname?.startsWith(it.href)} />
            )}
          </nav>
          <nav className="admin-nav-tablet xl:hidden flex items-center gap-2 min-w-0 h-[58px]" aria-label="Navigazione Staff tablet">
            <span className="mt-tablet-name hidden sm:inline font-bold text-sm text-orange-400 shrink-0">MATTABEL</span>
            <select aria-label="Vai a una sezione del gestionale"
              className="input h-11 flex-1 min-w-0 text-sm bg-neutral-900"
              value={visible.find(it => it.href !== '__exit__' && (pathname === it.href || pathname?.startsWith(it.href + '/')))?.href ||
                (pathname?.includes('/regia') ? '/admin/tornei/test/regia' : '')}
              onChange={event => { if(event.target.value) navigate(event.target.value) }}>
              <option value="">Seleziona pagina…</option>
              {visible.map(it => <option key={it.href} value={it.href}>{it.label}</option>)}
            </select>
            {visible.filter(it => ['/admin/risultati','/admin/tornei/test/regia','/admin/attese','/admin/pagamenti'].includes(it.href))
              .map(it => <button key={it.href} type="button" onClick={() => navigate(it.href)}
                className={`hidden md:inline-flex h-11 items-center px-3 rounded-md border text-sm whitespace-nowrap ${pathname?.startsWith(it.href) ? 'border-orange-500 bg-slate-800':'border-neutral-700 bg-[--brand-navy]'}`}>
                <span className="mt-nav-icon"><NavigationIcon name={it.icon} /></span>
                {it.label === 'Risultati Girone/Tabellone' ? 'Risultati' : it.label}
              </button>)}
          </nav>
          {(role === 'admin' || role === 'coach') && (
            <a
              href="/carosello"
              target="_blank"
              rel="noopener noreferrer"
              title="Apri il carosello sullo schermo del desk in una nuova scheda"
              className="mt-staff-carousel-shortcut inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-orange-500/60 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20"
            >
              <span aria-hidden="true">▣</span>
              <span className="hidden sm:inline">Carosello</span>
              <span aria-hidden="true">↗</span>
            </a>
          )}
          <ThemeSwitcher area="staff" />
        </div>
      <div className="brand-strip pointer-events-none" aria-hidden="true" />

      </header>
<div className="admin-header-spacer h-[80px] xl:h-[150px]" />

      {/* LOGO non-sticky sotto la riga */}
      <div className="admin-logo-below container-admin mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center py-4">
          <Image
            src="/logo2.png"
            alt="Mattabel"
            width={160}
            height={160}
            className="h-16 w-auto opacity-95"
            onError={(e) => { (e.currentTarget as any).style.display = 'none' }}
          />
        </div>
      </div>
    </>
  )
}
