'use client'

import * as React from 'react'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type RegItemRaw = { id: string; label: string; paid?: boolean }
type RegItemUI  = RegItemRaw & { isWaiting: boolean }
type Tourn      = { id: string; name?: string; title?: string; max_teams?: number; event_date?: string }

export default function AthleteIscrittiPage() {
  const params = useSearchParams()

  // --------------------------
  // 1) TID sicuro (niente localStorage nel render)
  // --------------------------
  const [tid, setTid] = React.useState<string>('')

  React.useEffect(() => {
    const fromQuery = params.get('tid')
    if (fromQuery) {
      setTid(fromQuery)
      if (typeof window !== 'undefined') localStorage.setItem('selectedTournamentId', fromQuery)
      return
    }
    if (typeof window !== 'undefined') {
      const fromLS = localStorage.getItem('selectedTournamentId')
      setTid(fromLS || '')
    }
  }, [params])

  // --------------------------
  // 2) Titolo tappa
  // --------------------------
  const [title, setTitle] = React.useState<string>('')

  React.useEffect(() => {
    if (!tid) { setTitle(''); return }
    const tn = params.get('tname')
    if (tn) {
      const decoded = decodeURIComponent(tn)
      setTitle(decoded)
      if (typeof window !== 'undefined') localStorage.setItem(`gm:${tid}:title`, decoded) // opzionale cache
      return
    }
    if (typeof window !== 'undefined') {
      const fromLS = localStorage.getItem(`gm:${tid}:title`)
      if (fromLS) { setTitle(fromLS) }
    }
    // fallback: chiedo all’API
    ;(async () => {
      try {
        const r = await fetch(`/api/tournaments?id=${encodeURIComponent(tid)}`)
        const js = await r.json()
        const name =
          js?.items?.[0]?.name || js?.items?.[0]?.title ||
          js?.name || js?.title || ''
        if (name) {
          setTitle(name)
          if (typeof window !== 'undefined') localStorage.setItem(`gm:${tid}:title`, name) // opzionale cache
        }
      } catch {
        // silenzioso
      }
    })()
  }, [tid, params])

  // --------------------------
  // 3) Iscritti
  // --------------------------
  const { data: regs } = useSWR(
    tid ? `/api/registrations/by-tournament?tournament_id=${encodeURIComponent(tid)}` : null,
    fetcher
  )

 // --------------------------
// 4) Max team della tappa
// --------------------------
const [maxTeams, setMaxTeams] = React.useState<number>(0)

React.useEffect(() => {
  if (!tid) { setMaxTeams(0); return }
  ;(async () => {
    try {
      const r = await fetch(`/api/tournaments?id=${encodeURIComponent(tid)}`)
      const js = await r.json()
      const row: Tourn | undefined = Array.isArray(js?.items) ? js.items[0] : js
      const mt = Number(row?.max_teams)
      setMaxTeams(Number.isFinite(mt) ? Math.max(0, mt) : 0)
    } catch {
      setMaxTeams(0)
    }
  })()
}, [tid])


// --------------------------
// 5) Normalizzazione elenco
// --------------------------
type RegFromApi = RegItemRaw & {
  is_waiting?: boolean
  waiting?: boolean
  status?: string
  position?: number
}
const list: RegItemUI[] = React.useMemo(() => {
  const arr: RegFromApi[] = (regs?.items ?? []) as RegFromApi[]

  // se l’API degli iscritti espone un max_teams, preferiscilo (stesso perimetro del calcolo lato server)
  const apiMax = Number(regs?.max_teams ?? regs?.meta?.max_teams)
  const effectiveMax = Number.isFinite(apiMax) && apiMax > 0 ? apiMax : maxTeams

  // se l’API manda già l’ordinamento (di solito sì), sfruttiamolo; altrimenti ordina per position asc se presente
  const ordered = [...arr].sort((a, b) => {
    const pa = Number(a.position), pb = Number(b.position)
    if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb
    return 0
  })

  return ordered.map((r, idx) => {
    const flag =
      r.is_waiting ??
      r.waiting ??
      (r.status ? r.status.toLowerCase() === 'waiting' : undefined)

    // priorità al flag del server; altrimenti calcolo per indice
    const isWaiting =
      typeof flag === 'boolean'
        ? flag
        : (effectiveMax > 0 ? idx >= effectiveMax : false)

    return { ...r, isWaiting }
  })
}, [regs, maxTeams])


  // --------------------------
  // 6) Render
  // --------------------------
  if (!tid) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="card p-4 text-sm">Tappa non valida.</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Titolo */}
      <div className="text-2xl md:text-3xl font-semibold text-center">
        {title || 'Iscritti'}
      </div>

      {/* Lista iscritti - SOLO LETTURA */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Iscritti</h3>
          <div className="text-xs text-neutral-400">
            {maxTeams > 0 ? `Capienza: ${maxTeams} squadre` : 'Nessun limite impostato'}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="text-sm text-neutral-500">Nessun iscritto per questa tappa.</div>
        ) : (
          <ul className="space-y-1">
            {list.map((r, idx) => {
              const waiting = r.isWaiting
              return (
                <li
                  key={r.id}
                  className={[
                    'flex items-center justify-between py-2 px-2 rounded-lg',
                    waiting ? 'bg-amber-500/10' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 text-xs text-neutral-500 tabular-nums">
                      {String(idx + 1).padStart(2, '0')}.
                    </div>
                    <div
                      className={[
                        'truncate font-medium',
                        'text-base md:text-lg',
                        waiting ? 'text-amber-400' : 'text-white',
                      ].join(' ')}
                      title={waiting ? 'In attesa' : 'Iscritto'}
                    >
                      {r.label}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {waiting ? (
                      <span className="badge badge-warning badge-sm">in attesa</span>
                    ) : (
                      <span className="badge badge-primary badge-sm">iscritto</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
