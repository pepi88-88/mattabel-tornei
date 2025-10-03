'use client'

import * as React from 'react'
import useSWR from 'swr'
const { data, error } = useSWR(open ? url : null, fetcher) // non richiede testo
// in alto al file
const fetcher = (u: string) =>
  fetch(u, { headers: { 'x-role': 'admin' } }).then(r => r.json())

// manda il ruolo al server (admin/coach) leggendo dal localStorage
const fetcher = async (u: string) => {
  const role = typeof window !== 'undefined' ? (localStorage.getItem('role') || '') : ''
  const res = await fetch(u, { headers: { 'x-role': role } })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(txt || `HTTP ${res.status}`)
  }
  return res.json()
}

export type Player = {
  id: string
  first_name: string
  last_name: string
  gender?: 'M' | 'F'
}

type Props = {
  /** Controlled value (opzionale) */
  value?: Player | null
  /** Controlled change (opzionale) */
  onChange?: (p: Player | null) => void
  /** Callback legacy (opzionale) — verrà chiamata insieme a onChange */
  onSelect?: (p: Player) => void
  /** Filtra ricerca */
  gender?: 'M' | 'F' | 'all'
  /** Placeholder input */
  placeholder?: string
}

/**
 * PlayerPicker — versione compatibile:
 * - supporta sia onSelect (legacy) sia onChange/value (controlled)
 * - se nessuna callback è passata, NON va in errore
 */
export default function PlayerPicker({
  value = null,
  onChange,
  onSelect,
  gender = 'all',
  placeholder = 'Cerca cognome/nome…',
}: Props) {
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const boxRef = React.useRef<HTMLDivElement>(null)

  // chiudi dropdown quando clicchi fuori
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // debounce semplice
  const debounced = useDebounce(q, 200)
 const url = React.useMemo(() => {
  const params = new URLSearchParams()
  if (debounced.trim()) params.set('q', debounced.trim())
  params.set('limit', '20')
  if (gender && gender !== 'all') params.set('gender', gender)
  return `/api/players/list?` + params.toString()
}, [debounced, gender])


  const { data } = useSWR(open ? url : null, fetcher)

  const handleSelect = React.useCallback(
    (p: Player) => {
      // chiama entrambe le API se presenti (compatibilità)
      if (typeof onSelect === 'function') onSelect(p)
      if (typeof onChange === 'function') onChange(p)
      setQ(`${p.last_name} ${p.first_name}`)
      setOpen(false)
    },
    [onSelect, onChange]
  )

  const handleClear = React.useCallback(() => {
    setQ('')
    if (typeof onChange === 'function') onChange(null)
    setOpen(false)
  }, [onChange])

  // sync input se arriva un value esterno
  React.useEffect(() => {
    if (value) setQ(`${value.last_name} ${value.first_name}`)
    else if (!open) setQ('')
  }, [value, open])

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <input
          className="input w-full"
          placeholder={placeholder}
          value={q}
          onFocus={() => { setOpen(true) }}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        />
        {(value || q) && (
          <button className="btn" onClick={handleClear} title="Pulisci">×</button>
        )}
      </div>

      {open && q && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg max-h-64 overflow-auto">
          {data?.items?.length ? (
            data.items.map((p: Player) => (
              <div
                key={p.id}
                className="px-3 py-2 hover:bg-neutral-800 cursor-pointer"
                onMouseDown={() => handleSelect(p)}
                title="Seleziona giocatore"
              >
                {p.last_name} {p.first_name}{' '}
                {p.gender ? <span className="text-neutral-400 text-xs">({p.gender})</span> : null}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-neutral-400">Nessun risultato</div>
          )}
        </div>
      )}
    </div>
  )
}

function useDebounce<T>(val: T, delay: number) {
  const [v, setV] = React.useState(val)
  React.useEffect(() => {
    const id = setTimeout(() => setV(val), delay)
    return () => clearTimeout(id)
  }, [val, delay])
  return v
}

{open && q && (
  <div className="absolute z-20 mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg max-h-64 overflow-auto">
    {error ? (
      <div className="px-3 py-2 text-red-400 text-sm">Errore: {String(error.message || error)}</div>
    ) : data?.items?.length ? (
      data.items.map((p: Player) => (
        <div key={p.id} className="px-3 py-2 hover:bg-neutral-800 cursor-pointer"
             onMouseDown={() => handleSelect(p)}>
          {p.last_name} {p.first_name}{' '}
          {p.gender ? <span className="text-neutral-400 text-xs">({p.gender})</span> : null}
        </div>
      ))
    ) : (
      <div className="px-3 py-2 text-neutral-400">Nessun risultato</div>
    )}
  </div>
)}
