'use client'

import useSWR from 'swr'
import { useEffect, useMemo, useState } from 'react'

const fetcher = (u: string) => fetch(u).then(r => r.json())

export default function PagamentiPage() {
  // TOUR
  const { data: tours } = useSWR('/api/tours', fetcher)
  const [tourId, setTourId] = useState('')

  useEffect(() => {
    const s = localStorage.getItem('selectedTourId')
    if (s) setTourId(s)
  }, [])

  function onPickTour(id: string) {
    setTourId(id)
    localStorage.setItem('selectedTourId', id)
    setTId('')
  }

  // TAPPE (raw)
  const { data: taps } = useSWR(
    tourId ? `/api/tournaments?tour_id=${tourId}` : null,
    fetcher
  )
  const [tId, setTId] = useState('')

  useEffect(() => {
    const s = localStorage.getItem('selectedTournamentId')
    if (s) setTId(s)
  }, [])

  // elenco tappe visibili (no chiuse) + ordine per data desc
  const parseDate = (s?: string | null) => (s ? new Date(s).getTime() : 0)
  const tappeVisibili = useMemo(() => {
    const arr = (taps?.items ?? []) as any[]
    return arr
      .filter(tp => tp?.status !== 'closed')
      .sort((a, b) => parseDate(b?.event_date) - parseDate(a?.event_date))
  }, [taps])

  // se non c'è tId, seleziona la prima visibile
  useEffect(() => {
    if (!tId && tappeVisibili.length) {
      setTId(tappeVisibili[0].id)
    }
  }, [tappeVisibili, tId])

  // se la tappa salvata non è più visibile → reset
  useEffect(() => {
    if (!tId) return
    const stillVisible = tappeVisibili.some(t => t.id === tId)
    if (!stillVisible) {
      setTId('')
      const saved = localStorage.getItem('selectedTournamentId')
      if (saved === tId) localStorage.removeItem('selectedTournamentId')
    }
  }, [tId, tappeVisibili])

  function onPickTappa(id: string) {
    setTId(id)
    localStorage.setItem('selectedTournamentId', id)
  }

  // LISTA pagamenti
  const { data, mutate } = useSWR(
    tId ? `/api/registrations/for-payments?tournament_id=${tId}` : null,
    fetcher
  )
  const items = data?.items ?? []

  // SOLO pagamenti: escludi waiting list in base a max_teams
  const maxTeamsRaw = tId
    ? tappeVisibili.find((t: any) => t.id === tId)?.max_teams
    : undefined
  const maxTeams = Number.isFinite(+maxTeamsRaw)
    ? Math.max(0, +maxTeamsRaw)
    : 0

  const payableItems =
    maxTeams > 0 ? items.slice(0, Math.min(maxTeams, items.length)) : items

  // totali (su tutte le squadre "payable")
  const stats = useMemo(() => {
    let a = 0,
      b = 0,
      both = 0
    for (const r of payableItems) {
      if (r.paid_a) a++
      if (r.paid_b) b++
      if (r.paid_a && r.paid_b) both++
    }
    return { a, b, both, teams: payableItems.length }
  }, [payableItems])

  // 🔍 ricerca
  const [search, setSearch] = useState('')

  const normalize = (s: string) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  // 1) filtro per ricerca su A o B
  const visibleFiltered = useMemo(() => {
    const q = normalize(search)
    if (!q) return payableItems
    return payableItems.filter((r: any) => {
      const a = normalize(r.a)
      const b = normalize(r.b)
      return a.includes(q) || b.includes(q)
    })
  }, [payableItems, search])

  // 2) ordina: prima squadre NON complete, poi quelle complete (pagato A+B) in fondo
  const visibleSorted = useMemo(() => {
    return visibleFiltered
      .map((r: any, idx: number) => ({ r, idx }))
      .sort((x, y) => {
        const doneX = x.r.paid_a && x.r.paid_b ? 1 : 0
        const doneY = y.r.paid_a && y.r.paid_b ? 1 : 0
        if (doneX !== doneY) return doneX - doneY // incomplete prima, complete dopo
        return x.idx - y.idx // mantieni ordine originale dentro ai gruppi
      })
      .map(x => x.r)
  }, [visibleFiltered])

  // toggle con conferma quando togli una spunta
  async function togglePaid(id: string, side: 'A' | 'B', value: boolean) {
    const reg = items.find((r: any) => r.id === id)

    // se sto togliendo la spunta → chiedi conferma
    if (!value) {
      const name = reg ? `${reg.a} — ${reg.b}` : ''
      const label = side === 'A' ? 'Pagato A' : 'Pagato B'
      const msg = name
        ? `Vuoi davvero togliere la spunta "${label}" per ${name}?`
        : `Vuoi davvero togliere la spunta "${label}"?`

      const ok = confirm(msg)
      if (!ok) {
        mutate(data, false)
        return
      }
    }

    const body: any = { id }
    if (side === 'A') body.paid_a = value
    else body.paid_b = value

    const prev = data
    // update ottimistico
    mutate(
      {
        items: items.map((r: any) =>
          r.id === id
            ? {
                ...r,
                paid_a: side === 'A' ? value : r.paid_a,
                paid_b: side === 'B' ? value : r.paid_b,
              }
            : r
        ),
      },
      false
    )

    const res = await fetch('/api/registrations/pay', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      mutate(prev, false)
      const js = await res.json().catch(() => ({}))
      alert(js?.error || 'Errore aggiornamento pagamento')
    } else {
      mutate()
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* intestazione: tour, tappa, ricerca, stats */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tour</span>
          <select
            className="input"
            value={tourId}
            onChange={e => onPickTour(e.target.value)}
          >
            {tours?.items?.map((tr: any) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
                {tr.season_start && tr.season_end
                  ? ` (${tr.season_start}/${tr.season_end})`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Tappa</span>
          <select
            className="input"
            value={tId}
            onChange={e => onPickTappa(e.target.value)}
          >
            {tappeVisibili.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.event_date ? `${t.event_date} — ` : ''}
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex flex-col gap-1">
          <span className="text-sm text-neutral-400">Cerca</span>
          <input
            className="input w-56"
            placeholder="Nome giocatore…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="text-sm text-neutral-400">
          Squadre: {stats.teams} · Pagate A: {stats.a} · Pagate B: {stats.b} ·
          Squadre pagate: {stats.both}
        </div>
      </div>

      {/* elenco pagamenti */}
      <div className="card p-4">
        {!tId ? (
          <div className="text-neutral-400">Seleziona una tappa visibile.</div>
        ) : payableItems.length === 0 ? (
          items.length > 0 ? (
            <div className="text-neutral-400">
              Solo lista d’attesa per questa tappa. Nessuno da pagare.
            </div>
          ) : (
            <div className="text-neutral-400">
              Nessuna iscrizione per questa tappa.
            </div>
          )
        ) : visibleSorted.length === 0 ? (
          <div className="text-neutral-400">
            Nessun risultato per la ricerca corrente.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {visibleSorted.map((r: any, i: number) => {
              const isComplete = !!r.paid_a && !!r.paid_b
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 rounded-lg border border-neutral-800 px-3 py-2 ${
                    isComplete ? 'bg-neutral-900/70 opacity-75' : ''
                  }`}
                >
                  {/* numero progressivo */}
                  <span className="text-xs text-neutral-400 w-8 shrink-0">
                    #{i + 1}
                  </span>

                  {/* nomi + checkbox allineate */}
                  <div className="flex items-center gap-2 min-w-0">
                    <label className="flex items-center gap-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={!!r.paid_a}
                        onChange={e =>
                          togglePaid(r.id, 'A', e.target.checked)
                        }
                      />
                      <span className="text-sm truncate" title={r.a}>
                        {r.a}
                      </span>
                    </label>

                    <span className="text-neutral-500">—</span>

                    <label className="flex items-center gap-1 min-w-0">
                      <span className="text-sm truncate" title={r.b}>
                        {r.b}
                      </span>
                      <input
                        type="checkbox"
                        checked={!!r.paid_b}
                        onChange={e =>
                          togglePaid(r.id, 'B', e.target.checked)
                        }
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
