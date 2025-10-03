'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Helper: leggi ruolo dal localStorage
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

// Definisci qui il menu e i ruoli ammessi per ciascuna voce
type Item = { href: string; label: string; roles: Array<'admin'|'coach'> }
const ITEMS: Item[] = [
{ href: '/admin/tour',              label: 'Gestione Tour/Tappa',                 roles: ['admin'] },
{ href: '/admin/giocatori',         label: 'Crea giocatore',            roles: ['admin', 'coach'] },
{ href: '/admin/iscrizioni',        label: 'Iscrizioni',           roles: ['admin', 'coach'] },
  { href: '/admin/pagamenti',         label: 'Pagamenti',            roles: ['admin', 'coach'] },          // solo admin (se vuoi aprirla al coach, aggiungi 'coach')
 { href: '/admin/gironi',            label: 'Crea Gironi',               roles: ['admin', 'coach'] },
 { href: '/admin/crea-tabellone', label: 'Creazione Tabellone', roles: ['admin'] },
 { href: '/admin/risultati',         label: 'Risultati Girone/Tabellone',            roles: ['admin', 'coach'] },
 { href: '/admin/classifica',        label: 'Classifica',           roles: ['admin', 'coach'] },
  { href: '/admin/stampa',            label: 'Stampa',               roles: ['admin'] },
   { href: '/admin/gestione',   label: 'Gestione torneo Test',      roles: ['admin'] },
]

export default function AdminNav() {
// ← disattiva la sidebar ovunque cancella solo returnnull
  return null

  const role = useRole()
  const pathname = usePathname()

  // finché non leggo il ruolo, evito flash del menu
  if (!role) return null

  // atleta: nessun menu staff
  if (role === 'athlete') return null

  const visible = ITEMS.filter(it => it.roles.includes(role))

  return (
    <aside className="w-40 shrink-0 p-2 border-r border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Staff</div>
      <nav className="flex flex-col gap-2">
        {visible.map(it => {
          const active = pathname?.startsWith(it.href)
          const cls = [
            'btn w-full justify-start btn-ghost btn-sm',
            active ? 'bg-neutral-800/60 ring-1 ring-neutral-700' : ''
          ].join(' ')
          return (
            <Link key={it.href} href={it.href} className={cls} aria-current={active ? 'page' : undefined}>
              {it.label}
            </Link>
          )
        })}
      </nav>

      {/* opzionale: pulsante uscita ruolo */}
      <div className="mt-4">
        <button
          className="btn btn-ghost btn-xs w-full text-neutral-400"
          onClick={() => { localStorage.removeItem('role'); location.href='/' }}
          title="Esci allo schermo iniziale"
        >
          Esci
        </button>
      </div>
    </aside>
  )
}



 
 