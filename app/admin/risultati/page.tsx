'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import BracketCanvas, {
  type WinnerMap,
  type Bracket as BracketType,
} from '../../../components/BracketCanvas'
import PreliminaryBracket from '../../../components/PreliminaryBracket'
import BracketRankings from '../../../components/BracketRankings'
import { parseItaPositionToken, resolveItaPosition } from '../../../lib/itaSources'
import {
  colorForLetter as colorFor,
  GROUP_LETTERS as LETTERS_STR,
} from '@/lib/groupColors'

// ------------------------------------------------------------
// Round robin helper (per gironi + eventuale tab ITA)
// ------------------------------------------------------------
type ItaRowScore = { a: string; b: string }

function rrPairs(n: number) {
  const t = Array.from({ length: n }, (_, i) => i + 1)
  if (t.length < 2) return [] as Array<[number, number]>
  if (t.length % 2 === 1) t.push(0)
  const rounds = t.length - 1, half = t.length / 2, out: Array<[number, number]> = []
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = t[i], b = t[t.length - 1 - i]
      if (a !== 0 && b !== 0) out.push([a, b])
    }
    const fixed = t[0], rest = t.slice(1); rest.unshift(rest.pop()!); t.splice(0, t.length, fixed, ...rest)
  }
  return out
}
type Meta = { capacity: number; format: 'pool' | 'ita'; bestOf?: 1 | 3 }
function normalizeMeta(
  meta: Record<string, { capacity: number; format?: 'pool' | 'ita' }> | undefined
): Record<string, Meta> {
  const out: Record<string, Meta> = {}
  for (const [k, v] of Object.entries(meta || {})) {
   out[k] = {
  capacity: Number(v?.capacity ?? 0),
  format: v?.format === 'ita' ? 'ita' : 'pool',
  bestOf: (Number((v as any)?.bestOf) === 3 ? 3 : 1) as 1 | 3,
}
  }
  return out
}
// ------------------------------------------------------------
// Helper nomi brevi (cognomi) + risolutore token→nome
// ------------------------------------------------------------
function shortSurname(full: string) {
  // es.: "DELLA COSTANZA M." -> ["DELLA","COSTANZA"]
  const s = String(full || '').trim().replace(/\s+[A-Z]\.?$/u, '')
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''

  // particelle in MAIUSCOLO per confronto; l’output mantiene il casing originale
  const PARTICLES = new Set([
    'DE','DEL','DEI','DEGLI','DEGLI','DELLA','DELL','DELL’','DELL\'','DELLA','DELLE','DELLO',
    'DI','D’','D\'','DA','DAL','DALLA','DALL\'','DALL’',
    'LA','LE','LO',
    'VAN','VON','VANDER','DER',
  ])

  // prendi almeno l’ultima parola; poi risali all’indietro finché trovi particelle
  let start = parts.length - 1
  while (start - 1 >= 0) {
    const prevRaw = parts[start - 1]
    const prevU = prevRaw.toUpperCase()
    if (PARTICLES.has(prevU)) {
      start -= 1
    } else {
      break
    }
  }

  // ricompone dal primo elemento “di cognome” fino alla fine
  return parts.slice(start).join(' ')
}


function lastSurnames(label: string) {
  const s = String(label || '').trim()
  if (!s) return ''

  // ✅ Se NON c'è separatore (2x2 usa "/" o "—"), allora è un nome squadra → non toccare
  if (!s.includes('—') && !s.includes('/')) return s

  // altrimenti applica la logica cognomi
  const parts = s.replace(/—/g, '/').split('/').map(p => p.trim()).filter(Boolean)
  if (parts.length >= 2) return `${shortSurname(parts[0])} / ${shortSurname(parts[1])}`
  return shortSurname(s)
}



function makeSlotResolver(
  tourId?: string,
  tId?: string,
  externalResolver?: (token: string) => string | undefined
) {
  const basic = (token: string): string => {
    if (!token) return '—'
    if (token === '-' || token === '—') return '—'
    if (token.toUpperCase() === 'BYE') return 'BYE'

    // A1, B2 ... -> nomi dalla classifica gironi salvata
    const mAB = token.match(/^([A-Z])(\d{1,2})$/)
    if (mAB && tourId && tId) {
      try {
        const raw = localStorage.getItem(`groups_rank:${tourId}:${tId}`)
        const rankByGroup: Record<string,string[]> = raw ? JSON.parse(raw) : {}
        const L = mAB[1].toUpperCase()
        const pos = Math.max(1, Number(mAB[2])) - 1
        const name = rankByGroup[L]?.[pos]
        if (name) return lastSurnames(name)
      } catch {}
      return token
    }

    // “3” (classifica avulsa)
    if (/^\d+$/.test(token) && tourId && tId) {
      try {
        const raw =
          localStorage.getItem(`classifica_avulsa:${tourId}:${tId}`) ||
          localStorage.getItem(`avulsa:${tourId}:${tId}`)
        const arr: string[] = raw ? JSON.parse(raw) : []
        const idx = Math.max(1, Number(token)) - 1
        const name = arr[idx]
        if (name) return lastSurnames(name)
      } catch {}
      return token
    }

    return token
  }


  // wrapper: prima chiedi all’external (Perdente/Vincente …), poi normalizza
 return (token: string): string => {
    const ext = externalResolver?.(token)
    if (ext) return basic(ext)
    return basic(token)
  }
}

// piccoli alias utile quando non serve l’external
const resolveSlotBasic = (token: string, tourId?: string, tId?: string) =>
  makeSlotResolver(tourId, tId, undefined)(String(token || '').trim())
/** Carica stato gironi "live" da Supabase (stesso endpoint di /admin/gironi) */
async function loadGroupsStateFromSupabase(tId: string): Promise<{
  groupsCount: number
  meta: Record<string, { capacity: number; format?: 'pool' | 'ita' }>
  assign: Record<string, string>
  labels: Record<string, string>
  times: Record<string, string[]>
  scores: Record<string, { a: string; b: string }[]>
  gField: Record<string, string>
  matchFields: Record<string, string[]>
  matchOrder: Record<string, number[]>
  groupsConfirmed: boolean
}> {
  if (!tId) {
    return {
      groupsCount: 0,
      meta: {},
      assign: {},
      labels: {},
      times: {},
      scores: {},
      gField: {}, matchFields: {}, matchOrder: {},
      groupsConfirmed: false,
    }
  }
  try {
    const r = await fetch(
      `/api/groups/state?tournament_id=${encodeURIComponent(tId)}`,
      { headers: { 'x-role': 'admin' }, cache: 'no-store' }
    )
    if (!r.ok) throw new Error('GET risultati fallito')
    const j = await r.json()
    const st = (j?.state || j || {}) as any
    return {
      groupsCount:
        Number(st?.groupsCount || Object.keys(st?.meta || {}).length || 0),
      meta: st?.meta || {},
      assign: st?.assign || {},
      labels: st?.labels || {},
      times: st?.times || {},
      scores: st?.scores || {},
      gField: st?.gField || {}, matchFields: st?.matchFields || {}, matchOrder: st?.matchOrder || {},
      groupsConfirmed: !!st?.groupsConfirmed,
    }
  } catch (error) {
    throw error
  }
}


// ------------------------------------------------------------
// Tabellina ITA “neutra” (se mai ti serve)
// ------------------------------------------------------------
function ItaRRTable({
  bracket,
  tourId,
  tId,
}: {
  bracket: { id: string; title: string; color: string; nTeams: number; slots: string[] }
  tourId: string
  tId: string
}) {
  const keyBase = `ita:${tourId}:${tId}:${bracket.id}`
  const [times, setTimes] = useState<string[]>([])
  const [scores, setScores] = useState<ItaRowScore[]>([])

  useEffect(() => {
    try { setTimes(JSON.parse(localStorage.getItem(`${keyBase}:times`) || '[]')) } catch { setTimes([]) }
    try { setScores(JSON.parse(localStorage.getItem(`${keyBase}:scores`) || '[]')) } catch { setScores([]) }
  }, [keyBase])

  useEffect(() => { try { localStorage.setItem(`${keyBase}:times`, JSON.stringify(times)) } catch {} }, [keyBase, times])
  useEffect(() => { try { localStorage.setItem(`${keyBase}:scores`, JSON.stringify(scores)) } catch {} }, [keyBase, scores])

  const labels = useMemo(
    () => (bracket.slots || []).slice(0, bracket.nTeams).map(s => resolveSlotBasic(s, tourId, tId)),
    [bracket.slots, bracket.nTeams, tourId, tId]
  )
  const matches = useMemo(() => rrPairs(bracket.nTeams), [bracket.nTeams])

  const setTime = (i: number, v: string) => setTimes(prev => { const a=[...prev]; a[i]=v; return a })
  const setScore = (i: number, side: 'a'|'b', raw: string) => {
    const a = [...scores]; const row = a[i] ?? { a:'', b:'' }
    row[side] = raw.replace(/\D/g,'').slice(0,2); a[i] = row; setScores(a)
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-9 px-3 flex items-center justify-between text-white" style={{ background: bracket.color }}>
        <div className="text-sm font-semibold">Girone all’italiana — {bracket.title}</div>
      </div>
      <div className="p-3 space-y-2">
        {matches.map(([a,b], idx) => (
          <div key={`match-${a}-${b}-${idx}`} className="grid items-center"
               style={{ gridTemplateColumns: '74px 40px minmax(0,1fr) 44px 16px 44px minmax(0,1fr)', columnGap: '.35rem' }}>
            <input type="time" className="input h-8 pl-1 pr-0 text-sm text-white w-[78px]"
                   value={times[idx] ?? ''} onChange={e => setTime(idx, e.target.value)}/>
            <div className="min-w-0 truncate text-xs text-right pr-0.5">{labels[a-1] || `S${a}`}</div>
            <input className="input h-8 w-[44px] px-1 text-sm text-center" maxLength={2}
                   defaultValue={scores[idx]?.a ?? ''} onBlur={e => setScore(idx,'a',e.currentTarget.value)}/>
            <div className="w-4 text-center text-xs text-neutral-400">vs</div>
            <input className="input h-8 w-12 px-1 text-sm text-center" maxLength={2}
                   defaultValue={scores[idx]?.b ?? ''} onBlur={e => setScore(idx,'b',e.currentTarget.value)}/>
            <div className="min-w-0 truncate text-xs pl-1">{labels[b-1] || `S${b}`}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
/** Round-robin per ITA: restituisce la lista di match come coppie [a,b] (1-based). */
/** Round-robin per ITA (gestisce anche n dispari con BYE=0) */
function buildRR_Ita(n: number): Array<[number, number]> {
  const t: number[] = Array.from({ length: Math.max(2, n) }, (_, i) => i + 1)
  if (t.length % 2 === 1) t.push(0) // aggiungi BYE
  const rounds = t.length - 1
  const half = t.length / 2
  const out: Array<[number, number]> = []

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = t[i], b = t[t.length - 1 - i]
      if (a !== 0 && b !== 0) out.push([a, b]) // ignora BYE
    }
    const fixed = t[0]
    const rest = t.slice(1)
    rest.unshift(rest.pop()!)
    t.splice(0, t.length, fixed, ...rest)
  }
  return out
}


type ItaScore = { a?: number; b?: number }

function ItaEditor({
  bracket,
  tourId,
  tId,
  resolve,
  serverScores,
  onServerScoresChange,
}: {
  bracket: BracketType
  tourId?: string
  tId?: string
  resolve: (token: string) => string
  serverScores?: ItaScore[]                      // <- NEW: punteggi dal server
  onServerScoresChange?: (rows: ItaScore[]) => void // <- NEW: callback per salvare su server
}) {

  const n = Math.max(2, Number(bracket.nTeams) || 0)
  const keyScores = `ita:${tourId || '_'}:${tId || '_'}:${bracket.id}:scores`

  /** nomi squadra (risolti) */
  const teams = useMemo(() => {
    const seeded = seedFromBracket(bracket, resolve)
    const arr = seeded.slice(0, n)
    while (arr.length < n) arr.push('—')
    return arr
  }, [bracket, resolve, n])

  /** calendario lineare (lista match) */
  const pairs = useMemo(() => buildRR_Ita(n), [n])

 /** punteggi persistenti per match (preferisci server, fallback LS) */
const [scores, setScores] = useState<ItaScore[]>(() => {
  if (serverScores && Array.isArray(serverScores)) return serverScores
  try {
    const raw = localStorage.getItem(keyScores)
    const arr: ItaScore[] = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
})

// se cambiano i dati server, riallinea
useEffect(() => {
  if (
    serverScores &&
    Array.isArray(serverScores) &&
    JSON.stringify(serverScores) !== JSON.stringify(scores)
  ) {
    setScores(serverScores)
  }
}, [serverScores])

  // allinea lunghezza punteggi al numero di partite
  useEffect(() => {
    if (scores.length !== pairs.length) {
      setScores((prev) => {
        const out = prev.slice()
        out.length = pairs.length
        return out
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs.length])

  // persistenza: preferisci server (callback), fallback LS
const [readyScores, setReadyScores] = useState(false)

useEffect(() => {
  if (serverScores && Array.isArray(serverScores)) {
    setScores(serverScores)
  }
  setReadyScores(true)
}, [serverScores, bracket.id])


useEffect(() => {
  if (!readyScores) return

  if (onServerScoresChange) {
    onServerScoresChange(scores)
  } else {
    try {
      localStorage.setItem(keyScores, JSON.stringify(scores))
    } catch {}
  }
}, [scores, readyScores])

  /** classifica automatica */
  const standings = useMemo(() => {
    const S = teams.map((name, idx) => ({
      idx: idx + 1,
      name,
      W: 0,
      PF: 0,
      PS: 0,
      QP: 0,
    }))
    pairs.forEach(([aIdx1, bIdx1], i) => {
      const s = scores[i] || {}
      const a = Number(s.a)
      const b = Number(s.b)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return
      const ai = aIdx1 - 1
      const bi = bIdx1 - 1
      S[ai].PF += a
      S[ai].PS += b
      S[bi].PF += b
      S[bi].PS += a
      if (a > b) S[ai].W += 1
      else if (b > a) S[bi].W += 1
    })
    S.forEach((r) => (r.QP = r.PF / Math.max(1, r.PS)))
    S.sort(
      (A, B) =>
        B.W - A.W || B.QP - A.QP || B.PF - A.PF || A.name.localeCompare(B.name)
    )
    return S
  }, [teams, pairs, scores])

  /** UI */
  const onScore = (i: number, side: 'a' | 'b', val: string) => {
    const num =
      val === '' ? undefined : Math.max(0, Math.min(999, Number(val) || 0))
    setScores((prev) => {
      const out = prev.slice()
      out[i] = { ...(out[i] || {}), [side]: num }
      return out
    })
  }

 return (
  <div className="card p-0 overflow-hidden mb-4 relative z-0">

      {/* header */}
      <div
        className="h-9 px-3 flex items-center justify-between text-white"
        style={{ background: bracket.color }}
      >
        <div className="text-sm font-semibold">
          Cronologia (girone all’italiana) — {bracket.title}
        </div>
      </div>

      <div className="p-3 grid gap-4 md:grid-cols-2">
        {/* Calendario */}
        <div>
          <div className="text-sm font-semibold mb-2">Calendario & punteggi</div>
          <div className="space-y-2">
            {pairs.map(([a1, b1], i) => {
              const aName = teams[a1 - 1] || `S${a1}`
              const bName = teams[b1 - 1] || `S${b1}`
              const s = scores[i] || {}
              return (
                <div
                  key={`match-${a1}-${b1}-${i}`}
                  className="grid items-center gap-2"
                  style={{
                    gridTemplateColumns: 'minmax(0,1fr) 52px 16px 52px minmax(0,1fr)',
                  }}
                >
                  <div className="truncate pr-1" title={aName}>
                    {aName}
                  </div>
                  <input
                    className="input input-sm text-right"
                    value={s.a ?? ''}
                    onChange={(e) => onScore(i, 'a', e.target.value)}
                    inputMode="numeric"
                  />
                  <div className="text-center opacity-60">–</div>
                  <input
                    className="input input-sm"
                    value={s.b ?? ''}
                    onChange={(e) => onScore(i, 'b', e.target.value)}
                    inputMode="numeric"
                  />
                  <div className="truncate pl-1 text-right" title={bName}>
                    {bName}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Classifica auto */}
        <div>
          <div className="text-sm font-semibold mb-2">Classifica (auto)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase opacity-70">
                <tr>
                  <th className="text-left py-1">#</th>
                  <th className="text-left">Squadra</th>
                  <th className="text-right">W</th>
                  <th className="text-right">PF</th>
                  <th className="text-right">PS</th>
                  <th className="text-right">QP</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => (
                  <tr key={`st-${r.idx}-${i}`} className="border-t border-neutral-800">
                    <td className="py-1">{i + 1}</td>
                    <td className="truncate">{r.name}</td>
                    <td className="text-right">{r.W}</td>
                    <td className="text-right">{r.PF}</td>
                    <td className="text-right">{r.PS}</td>
                    <td className="text-right">
                      {(r.QP || 0).toFixed(3).replace(/\.?0+$/, '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* pulsanti rapidi */}
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                if (confirm('Sicuro di svuotare tutti i punteggi?')) {
                  setScores(Array(pairs.length).fill({}))
                }
              }}
            >
              Svuota punteggi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ------------------------------------------------------------
// Helpers comuni (gironi, caricamenti, ecc.)
// ------------------------------------------------------------
const LETTERS = LETTERS_STR.split('')
const fetcher = (u: string) => fetch(u).then(r => r.json()).catch(() => null)

type Tour = { id: string; name: string }
type Tournament = { id: string; name: string; date?: string }
type Persist = {
  groupsCount: number
  meta: Record<string, Meta>
  assign: Record<string, string>
  times?: Record<string, string[]>
  gField?: Record<string, string>
  labels?: Record<string, string>
}
type Score = { a: string; b: string }
type ScheduleRow = {
  key: string
  a?: number
  b?: number
  labelA: string
  labelB: string
  setNo: number        // 1..bestOf
  matchIdx: number     // indice match “logico”
  scoreIdx: number     // indice riga nel vettore scores[L]
}
const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
function bothSurnames(label: string) {
  return lastSurnames(label)
}

function rr(n: number) {
  const t = Array.from({ length: n }, (_, i) => i + 1)
  if (t.length < 2) return [] as Array<[number, number]>
  if (t.length % 2 === 1) t.push(0)
  const rounds = t.length - 1, half = t.length / 2, out: Array<[number, number]> = []
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = t[i], b = t[t.length - 1 - i]
      if (a !== 0 && b !== 0) out.push([a, b])
    }
    const fixed = t[0], rest = t.slice(1); rest.unshift(rest.pop()!); t.splice(0, t.length, fixed, ...rest)
  }
  return out
}
const poolPairs = { semi1: [1,4] as [number,number], semi2: [2,3] as [number,number] }

// ---- risolvi nome da token del bracket (es. “1A”, o etichetta già nome)
function seedFromBracket(b: BracketType, resolveToken: (t: string) => string): string[] {
  const set = new Set<string>()
  for (const s of b.slots || []) {
    const name = resolveToken(String(s || '').trim())
    if (name && name !== '-' && name !== '—') set.add(name)
  }
  for (const m of b.r1 || []) {
    for (const side of ['A','B'] as const) {
      const name = resolveToken(String((m as any)[side] || '').trim())
      if (name && name !== '-' && name !== '—') set.add(name)
    }
  }
  return Array.from(set)
}

// ---- classifica manuale per tabellone (lista a sinistra + select 1..N)
function loadPlacements(tourId: string, tId: string, bId: string): string[] {
  try { return JSON.parse(localStorage.getItem(`placements:${tourId}:${tId}:${bId}`) || '[]') } catch { return [] }
}
function savePlacements(tourId: string, tId: string, bId: string, rows: string[]) {
  try { localStorage.setItem(`placements:${tourId}:${tId}:${bId}`, JSON.stringify(rows)) } catch {}
}

function PlacementsEditor({
  bracket,
  tourId,
  tId,
  resolver,   // externalResolver (perdente/vincente <tab>)
}: {
  bracket: BracketType
  tourId: string
  tId: string
  resolver: (token: string) => string | undefined
}) {
  const n = Math.max(2, Number(bracket.nTeams) || 2)

  // “risolutore completo” = gironi + avulsa + perdente/vincente
  const resolve = useMemo(
    () => makeSlotResolver(tourId, tId, resolver),
    [tourId, tId, resolver]
  )

  // classifica salvata per tabellone
  const [placements, setPlacements] = useState<string[]>(
    () => loadPlacements(tourId, tId, bracket.id) || Array(n).fill('')
  )

  // normalizza a n e salva
  useEffect(() => {
    setPlacements(prev => {
      if (prev.length === n) return prev
      const out = prev.slice(0, n)
      while (out.length < n) out.push('')
      savePlacements(tourId, tId, bracket.id, out)
      return out
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, tourId, tId, bracket.id])

  // salva ad ogni modifica
  useEffect(() => { savePlacements(tourId, tId, bracket.id, placements) },
    [placements, tourId, tId, bracket.id])

  // elenco squadre a sinistra (già NOMI)
  const teams = useMemo(() => {
    const seeded = seedFromBracket(bracket, resolve)
    const fromSaved = (placements || []).filter(Boolean)
      return Array.from(new Set([...seeded, ...fromSaved]))
  }, [bracket, resolve, placements])

  const posOf = (team: string) => {
    const i = placements.findIndex((t) => t === team)
    return i >= 0 ? i + 1 : 0
  }
  const setPos = (team: string, pos: number) => {
    const newIdx = pos - 1
    setPlacements(prev => {
      const next = [...prev]
      const oldIdx = next.findIndex(t => t === team)
      if (oldIdx !== -1) next[oldIdx] = ''
      if (newIdx >= 0 && newIdx < next.length && next[newIdx] && next[newIdx] !== team) {
        next[newIdx] = ''
      }
      if (newIdx >= 0 && newIdx < next.length) next[newIdx] = team
      savePlacements(tourId, tId, bracket.id, next)
      return next
    })
  }
  const clearAll = () => {
    const empty = Array(n).fill('') as string[]
    setPlacements(empty)
    savePlacements(tourId, tId, bracket.id, empty)
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="h-9 px-3 flex items-center justify-between text-white" style={{ background: bracket.color }}>
        <div className="text-sm font-semibold">Classifica manuale — {bracket.title}</div>
        <div><button className="btn btn-sm" onClick={clearAll}>Svuota</button></div>
      </div>

      <div className="p-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {teams.length === 0 ? (
            <div className="text-xs text-neutral-500">Aggiungi le squadre nel tabellone.</div>
          ) : teams.map((name) => {
              const cur = posOf(name)
              return (
                <div key={name} className="grid items-center"
                     style={{ gridTemplateColumns: 'minmax(0,1fr) 120px', columnGap: '.5rem' }}>
                  <div className="truncate">{name}</div>
                  <select className="input h-8 w-[110px]" value={String(cur)}
                          onChange={(e) => setPos(name, Number(e.target.value))}>
                    <option value="0">—</option>
                    {Array.from({ length: n }, (_, i) => i + 1).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )
            })}
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">Anteprima classifica</div>
          <div className="space-y-1">
            {Array.from({ length: n }, (_, i) => i + 1).map(p => (
              <div key={p} className="flex items-center gap-2">
                <div className="w-8 text-right text-neutral-400">{p}.</div>
                <div className="truncate">{placements[p - 1] || '—'}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-neutral-500">
            Salvataggio: <code>placements:{tourId}:{tId}:{bracket.id}</code>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Brackets: load/normalize + externalResolver (Perdente/Vincente)
// ------------------------------------------------------------
const nextPow2 = (n: number) => { let p=1; while (p < n) p <<= 1; return p }
function normalizeBracket(b: any): BracketType {
  const n = Math.max(2, Number(b?.nTeams) || 8)
  const r1 = Array.from({ length: b?.type === 'PSE' || b?.type === 'PDE' ? (b?.type === 'PSE' && n === 24 ? 8 : 4) : nextPow2(n) / 2 }, (_, i) => ({
    A: b?.r1?.[i]?.A ?? '-',
    B: b?.r1?.[i]?.B ?? '-',
  }))
  const slots = Array.from({ length: nextPow2(n) }, (_, i) => b?.slots?.[i] ?? '')
  return {
    id: String(b?.id || Math.random().toString(36).slice(2, 10)),
    title: String(b?.title || 'TABELLONE 1'),
    color: String(b?.color || '#22c55e'),
    type: (b?.type as BracketType['type']) || 'SE',
    nTeams: n,
    source: (b?.source as BracketType['source']) || 'gironi',
    fromTableId: b?.fromTableId || undefined,
    itaFromTable1: b?.itaFromTable1 || undefined,
    itaFromTable2: b?.itaFromTable2 || undefined,
    r1,
    prelims: b?.type === 'PSE' || b?.type === 'PDE' ? Array.from({length:b?.type === 'PSE' && n === 24 ? 8 : 4}, (_,i)=>({A:b?.prelims?.[i]?.A??'-', B:b?.prelims?.[i]?.B??'-'})) : undefined,
    slots,
  }
}

// Avulsa intelligente: i numeri sono identità delle coppie, non posizioni nel tabellone.
// Le teste di serie sul lato A rimangono fisse; si permutano soltanto gli ingressi B.
// La classifica avulsa e l'insieme delle qualificate non vengono mai alterati.
function smartAvulsaPairs(rows: {A:string;B:string}[], groupForSeed: (seed:number)=>string | undefined) {
  const original=rows.map(m=>({...m}))
  // Lato A protetto: solo gli avversari B si possono permutare automaticamente.
  const movable=original.map((m,i)=>/^\d+$/.test(m.B.trim()) ? i : -1).filter(i=>i>=0)
  const seeds=movable.map(i=>original[i].B)
  if(movable.length<2 || new Set(seeds).size!==seeds.length)return original
  const score=(arr:string[])=>{
    let collisions=0,shift=0
    movable.forEach((i,j)=>{
      const a=original[i].A,b=arr[j]
      const ga=/^\d+$/.test(a)?groupForSeed(Number(a)):undefined
      const gb=groupForSeed(Number(b))
      if(ga && gb && ga===gb)collisions++
      shift+=Math.abs(Number(b)-Number(seeds[j]))
    })
    return collisions*100000 + shift
  }
  let best=[...seeds],bestScore=score(best)
  if(seeds.length<=8){
    const used=new Set<string>(),current:string[]=[]
    const visit=()=>{
      if(current.length===seeds.length){
        const val=score(current)
        if(val<bestScore){best=[...current];bestScore=val}
        return
      }
      for(const seed of seeds){
        if(used.has(seed))continue
        used.add(seed);current.push(seed);visit();current.pop();used.delete(seed)
      }
    }
    visit()
  }else{
    let improved=true
    while(improved){
      improved=false
      for(let i=0;i<best.length;i++)for(let j=i+1;j<best.length;j++){
        const swapped=[...best];[swapped[i],swapped[j]]=[swapped[j],swapped[i]]
        const val=score(swapped)
        if(val<bestScore){best=swapped;bestScore=val;improved=true}
      }
    }
  }
  const answer=original.map(m=>({...m}))
  movable.forEach((i,j)=>{answer[i].B=best[j]})
  return answer
}

const keyBr = (tour: string, tId: string) => `brackets:${tour}:${tId}`
function loadBrackets(tour: string, tId: string): BracketType[] {
  if (!tour || !tId) return []
  try {
    const raw = localStorage.getItem(keyBr(tour, tId))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(normalizeBracket) : []
  } catch { return [] }
}

function makeExternalResolver(
  brackets: Array<{ id:string; title:string; type?:string; r1?:{A:string;B:string}[]; prelims?:{A:string;B:string}[] }>,
  winnersById: Record<string, Record<string,'A'|'B'|undefined>>,
  tourId?: string,
  tId?: string,
) {
  const byTitle = new Map(brackets.map(b => [b.title.trim().toUpperCase(), b]))
  const resolveOne = (token: string, seen: Set<string>): string | undefined => {
    const raw = String(token || '').trim()
    if (seen.has(raw)) return undefined
    seen.add(raw)
    const m = String(token || '').trim().match(/^(Perdente|Loser|Vincente|Winner)\s+(.+?)\s+([A-Za-z])?(\d+)$/i)
    if (!m) return undefined
    const br = byTitle.get(m[2].trim().toUpperCase())
    if (!br) return undefined
    let letter = String(m[3] || 'R').toUpperCase()
    if (['M','G','S','F'].includes(letter)) letter='R'
    if (letter!=='R' && letter!=='P') return undefined
    const idx = Number(m[4])-1
    if (!Number.isInteger(idx) || idx<0) return undefined
    const w = winnersById[br.id] || {}
    const preliminary = br.type==='PSE' || br.type==='PDE'
    const pair = letter==='P' ? br.prelims?.[idx] : br.r1?.[idx]
    if (!pair) return undefined
    const preliminaryPair=br.prelims?.[idx]
    const preliminarySide=w[`P${idx+1}`]
    const actualA = letter==='R' && preliminary
      ? preliminarySide === 'A' ? preliminaryPair?.A
        : preliminarySide === 'B' ? preliminaryPair?.B
        : undefined
      : pair.A
    const actualB=pair.B
    const winningSide=w[`${letter}${idx+1}`]
    if (!winningSide || !actualA || !actualB) return undefined
    const wantsLoser=/^(Perdente|Loser)$/i.test(m[1])
    const selected = (winningSide === 'A') !== wantsLoser ? actualA : actualB
    return resolveOne(selected,seen) || selected
  }
  return (token: string): string | undefined => resolveOne(token,new Set<string>())
}
function MobileGroupsCarousel({
  letters,
  tId,
  scheduleRows,
  setTime,
  setScore,
  fmtOf,
  colorFor,
  times,
  scores,
  matchFields,
  setMatchFields,
  gField,
}: {
  letters: string[]
  tId: string
  scheduleRows: (L: string) => ScheduleRow[]
  setTime: (L: string, idx: number, val: string) => void
  setScore: (L: string, idx: number, side: 'a' | 'b', val: string) => void
  fmtOf: (L: string) => string
  colorFor: (L: string) => string
  times: Record<string, string[]>
  scores: Record<string, { a: string; b: string }[]>
  matchFields: Record<string,string[]>
  setMatchFields: React.Dispatch<React.SetStateAction<Record<string,string[]>>>
  gField: Record<string,string>
}) {
  // ogni slide = 1 girone, “ingrandito”
  return (
    <div
      className="relative overflow-x-auto snap-x snap-mandatory md:hidden no-scrollbar"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex">
        {letters.map((L, idx) => {
          const color = colorFor(L)
          const rows = scheduleRows(L)
          return (
            <div
              key={`${tId}-slide-${L}-${idx}`}
              className="snap-start shrink-0 px-3"
              style={{ width: '200vw' }} // 👈 raddoppio dimensione “gruppo partite”
            >
              <div className="card p-0 overflow-hidden">
                <div className="h-10 px-3 flex items-center text-white" style={{ background: color }}>
                  <div className="text-[15px] font-semibold">Partite {L} — {fmtOf(L).toUpperCase()}</div>
                </div>

                <div className="p-3 space-y-3">
                  {rows.length === 0 ? (
                    <div className="text-sm text-neutral-500">Imposta i gironi in /admin/gironi.</div>
                  ) : (
                rows.map((r, ridx) => {
  const firstSet = r.setNo === 1
  const lastOfMatch =
    ridx === rows.length - 1 || rows[ridx + 1]?.matchIdx !== r.matchIdx

  return (
    <div
      key={`${tId}-${L}-${r.key}`}
      className={[
        'grid items-center rounded-xl bg-neutral-900/60 p-3',
        firstSet ? 'border border-neutral-800' : 'border-x border-b border-neutral-800 rounded-t-none',
      ].join(' ')}
      style={{
        gridTemplateColumns: '90px 44px minmax(0,1fr) 64px 18px 64px minmax(0,1fr)',
        columnGap: '.5rem',
        marginTop: firstSet ? 0 : -1,
      }}
    >
      {firstSet ? (
        <input
          type="time"
          className="input h-8 pl-1 pr-0 text-xs text-white w-[72px] tabular-nums"
          value={(times[L] ?? [])[r.matchIdx] ?? ''}
          onChange={(e) => setTime(L, r.matchIdx, e.target.value)}
        />
      ) : (
        <div className="w-[60px] h-8 flex items-center text-xs text-neutral-500">
          Set {r.setNo}
        </div>
      )}

      {firstSet ? <input className="input h-8 w-[40px] px-1 text-center" placeholder="C." title="Campo partita" inputMode="numeric" maxLength={2} value={matchFields[L]?.[r.matchIdx] ?? gField[L] ?? ''} onChange={e=>setMatchFields(prev=>{const arr=[...(prev[L]||[])];arr[r.matchIdx]=e.target.value.replace(/\D/g,'').slice(0,2);return {...prev,[L]:arr}})}/> : <div/>}
      <div className="min-w-0 truncate text-[15px] text-right pr-1 font-medium">
        {firstSet ? r.labelA : ''}
      </div>

      <input
        className="input h-11 w-16 px-2 text-base text-center"
        inputMode="numeric"
        value={scores[L]?.[r.scoreIdx]?.a ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 2)
          setScore(L, r.scoreIdx, 'a', v)
        }}
      />

      <div className="text-center text-[15px] opacity-60">–</div>

      <input
        className="input h-11 w-16 px-2 text-base text-center"
        inputMode="numeric"
        value={scores[L]?.[r.scoreIdx]?.b ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 2)
          setScore(L, r.scoreIdx, 'b', v)
        }}
      />

      <div className="min-w-0 truncate text-[15px] pl-1 font-medium">
        {firstSet ? r.labelB : ''}
      </div>

      {lastOfMatch && <div className="col-span-7 h-1" />}
    </div>
  )
})
                  )}
                </div>
              </div>

              {/* indicatori */}
              <div className="mt-3 mb-2 flex items-center justify-center gap-2">
                {letters.map((_, j) => (
                  <span key={`dot-${j}`} className={`h-1.5 w-6 rounded-full ${j === idx ? 'bg-white' : 'bg-neutral-700'}`} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Pagina
// ------------------------------------------------------------
export default function RisultatiGironiPage() {
  // Filtri
  const { data: toursRes } = useSWR('/api/tours', fetcher)
  const tours: Tour[] = toursRes?.items ?? []
  const [tourId, setTourId] = useState('')
  const { data: tappeRes } = useSWR(tourId ? `/api/tournaments?tour_id=${tourId}` : null, fetcher)
  const tappe: Tournament[] = tappeRes?.items ?? []
  const [tId, setTId] = useState('')
  const [view, setView] = useState<'gironi' | 'tabellone'>('gironi')
// Mostra solo le tappe non chiuse + ordina per data desc (se presente)
const parseDate = (s?: string) => (s ? new Date(s).getTime() : 0)
const tappeVisibili = useMemo(() => {
  const arr = (tappeRes?.items ?? []) as Tournament[]
  return arr.filter((t: any) => t?.status !== 'closed')
           .sort((a, b) => parseDate(b?.date) - parseDate(a?.date))
}, [tappeRes])
// Se non c'è tId, prova a selezionare la prima tappa VISIBILE
useEffect(() => {
  if (!tId && tappeVisibili.length) {
    const saved = localStorage.getItem('selectedTournamentId')
    setTId(tappeVisibili.find(t => t.id === saved)?.id || tappeVisibili[0].id)
  }
}, [tappeVisibili, tId])

// Se la tappa selezionata diventa non visibile (chiusa), resetta
useEffect(() => {
  if (!tId || !tappeRes) return
  const ok = tappeVisibili.some(t => t.id === tId)
  if (!ok) setTId('')
}, [tId, tappeVisibili])

  useEffect(() => {
  if (!tourId && tours.length) {
    const saved=localStorage.getItem('selectedTourId')
    setTourId(tours.find(t=>t.id===saved)?.id || tours[0].id)
  }
}, [tours, tourId])
  
  // Store gironi + conferma
  const [store, setStore] = useState<Persist | null>(null)
  const [times, setTimes] = useState<Record<string, string[]>>({})
  const [scores, setScores] = useState<Record<string, Score[]>>({})
  const [matchFields, setMatchFields] = useState<Record<string,string[]>>({})
  const [matchOrder, setMatchOrder] = useState<Record<string,number[]>>({})
  const [groupsConfirmed, setGroupsConfirmed] = useState(false)
  const [bracketsPublic, setBracketsPublic] = useState(false)
  const [publishingBrackets, setPublishingBrackets] = useState(false)
// controllo caricamento per evitare cross-save fra tappe
const [isLoadingState, setIsLoadingState] = useState(false)
const [loadedFor, setLoadedFor] = useState<string>('') // tId per cui lo stato è “coerente”

 useEffect(() => {
  let cancelled = false

  // appena cambia tId, svuota lo stato locale per evitare che il vecchio finisca nel nuovo
  setIsLoadingState(true)
  setLoadedFor('')
  setTimes({})
  setScores({})
  setMatchFields({})
  setMatchOrder({})

  if (!tId) {
    setStore(null)
    setGroupsConfirmed(false)
    setIsLoadingState(false)
    return
  }

  ;(async () => {
    try {
    const gm = await loadGroupsStateFromSupabase(tId)
    if (cancelled) return
    setStore({
  groupsCount: gm.groupsCount,
  meta: normalizeMeta(gm.meta),   // <-- qui la fix
  assign: gm.assign,
  labels: gm.labels,
  times: gm.times,
})
    const fields = gm.matchFields || {}
    lastResultsSnapshot.current = JSON.stringify({ times: gm.times, scores: gm.scores, matchFields: fields })
    let restoredTimes = gm.times
    let restoredScores = gm.scores
    let restoredFields = fields
    try {
      const pending = localStorage.getItem('mattabel:risultati:pending:' + tId)
      if (pending) {
        const parsed = JSON.parse(pending)
        if (parsed?.times && parsed?.scores) {
          if (JSON.stringify({ times: parsed.times, scores: parsed.scores, matchFields: parsed.matchFields ?? {} }) === lastResultsSnapshot.current) {
            localStorage.removeItem('mattabel:risultati:pending:' + tId)
          } else if (window.confirm('Esistono risultati non sincronizzati. Vuoi recuperarli?')) {
            restoredTimes = parsed.times
            restoredScores = parsed.scores
            restoredFields = parsed.matchFields ?? fields
          }
        }
      }
    } catch {}
    setTimes(restoredTimes)
    setScores(restoredScores)
    setMatchFields(restoredFields)
    setMatchOrder(gm.matchOrder || {})
    setGroupsConfirmed(gm.groupsConfirmed)

    // stato coerente ora è riferito a QUESTO tId
    setLoadedFor(tId)
    setIsLoadingState(false)
    } catch {
      if (!cancelled) {
        setResultsSaveError('Caricamento fallito: dati non modificati. Ricarica la pagina.')
        setIsLoadingState(false)
      }
    }
  })()

  return () => {
    cancelled = true
  }
}, [tId])


 const toggleBracketsPublic = async () => {
  if (!tId || !tourId || publishingBrackets || bracketsLoadKey !== tourId + ':' + tId || !!bracketsLoadError) return
  const next = !bracketsPublic
  if (next && !brackets.length) {
    window.alert('Crea prima almeno un tabellone nella pagina Creazione Tabellone.')
    return
  }
  const message = next
    ? 'Pubblicare i tabelloni agli atleti? Potranno visualizzare anche gli aggiornamenti successivi.'
    : 'Nascondere i tabelloni agli atleti? Le partite e i risultati rimarranno salvati e visibili allo staff.'
  if (!window.confirm(message)) return
  setPublishingBrackets(true)
  try {
    const res = await fetch('/api/brackets/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
      body: JSON.stringify({ tournament_id: tId, is_public: next }),
    })
    const js = await res.json().catch(() => ({}))
    if (!res.ok || js?.ok !== true || js?.is_public !== next) {
      throw new Error(js?.error || 'Impossibile aggiornare la visibilità dei tabelloni')
    }
    setBracketsPublic(next)
  } catch (err: any) {
    window.alert(err?.message || 'Errore di pubblicazione: stato invariato')
  } finally {
    setPublishingBrackets(false)
  }
}


  // Helpers Gironi
  const letters = useMemo(() => LETTERS.slice(0, Math.max(1, store?.groupsCount ?? 0)), [store?.groupsCount])
  const capOf = (L: string) => store?.meta?.[L]?.capacity ?? 0
  const fmtOf = (L: string) => (store?.meta?.[L]?.format ?? 'pool').toLowerCase()
 // 👇 SOSTITUISCI interamente questa funzione
const labelBySlot = (L: string, slot: number) => {
  const rid = store?.assign?.[`${L}-${slot}`] ?? ''
  const raw = rid ? store?.labels?.[rid] ?? '' : ''

  // usa solo il nome reale salvato nello stato
  if (raw) return raw

  // se manca davvero, mostra Slot X ma NON usare la classifica live
  return `Slot ${slot}`
}


 function setTime(L: string, idx: number, val: string) {
  const arr = [...(times[L] ?? [])]
  arr[idx] = val
  setTimes((t) => ({ ...t, [L]: arr }))
  // niente localStorage: il persist lo fa l'auto-save verso Supabase
}

  function setScore(L: string, idx: number, side: 'a' | 'b', val: string) {
    const arr = [...(scores[L] ?? [])]; const row = arr[idx] ?? { a:'', b:'' }
    row[side] = val; arr[idx] = row; setScores(s => ({ ...s, [L]: arr }))
  }
function bestOfOf(L: string): 1 | 3 {
  const b = (store?.meta?.[L]?.bestOf ?? 1) as any
  return Number(b) === 3 ? 3 : 1
}
function setsToWin(bestOf: 1 | 3) {
  return bestOf === 3 ? 2 : 1
}

function matchWinnerFromScores(L: string, matchIdx: number): { winner?: 'A'|'B' } {
  const bestOf = bestOfOf(L)
  const need = setsToWin(bestOf)
  const sc = scores[L] ?? []
  let wa = 0, wb = 0

  for (let s = 0; s < bestOf; s++) {
    const row = sc[matchIdx * bestOf + s]
    const a = Number(row?.a), b = Number(row?.b)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a === b) continue // pareggi non li contiamo (in beach non dovrebbe succedere)
    if (a > b) wa++
    else wb++
  }

  if (wa >= need) return { winner: 'A' }
  if (wb >= need) return { winner: 'B' }
  return {}
}

function matchPointsSum(L: string, matchIdx: number): { aPF: number; aPS: number; bPF: number; bPS: number } {
  const bestOf = bestOfOf(L)
  const sc = scores[L] ?? []
  let aPF = 0, aPS = 0, bPF = 0, bPS = 0

  for (let s = 0; s < bestOf; s++) {
    const row = sc[matchIdx * bestOf + s]
    const a = Number(row?.a), b = Number(row?.b)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    aPF += a; aPS += b
    bPF += b; bPS += a
  }
  return { aPF, aPS, bPF, bPS }
}
function scheduleRows(L: string): ScheduleRow[] {
  const cap = capOf(L)
  const fmt = fmtOf(L)
  const bestOf = bestOfOf(L)

  if (cap < 2) return []

  const explodeMatch = (
    base: { key: string; a?: number; b?: number; labelA: string; labelB: string },
    matchIdx: number
  ): ScheduleRow[] => {
    return Array.from({ length: bestOf }, (_, si) => ({
      ...base,
      key: `${base.key}-S${si + 1}`,      // 👈 IMPORTANT: key unica per set
      setNo: si + 1,
      matchIdx,
      scoreIdx: matchIdx * bestOf + si,
    }))
  }

  // POOL 4 (semi + finali)
  if (fmt === 'pool' && cap === 4) {
    const s1 = poolPairs.semi1
    const s2 = poolPairs.semi2

    const m0 = { key: 'S1', a: s1[0], b: s1[1], labelA: labelBySlot(L, s1[0]), labelB: labelBySlot(L, s1[1]) }
    const m1 = { key: 'S2', a: s2[0], b: s2[1], labelA: labelBySlot(L, s2[0]), labelB: labelBySlot(L, s2[1]) }

    const w0 = matchWinnerFromScores(L, 0).winner
    const w1 = matchWinnerFromScores(L, 1).winner

    const wSlot0 = w0 ? (w0 === 'A' ? s1[0] : s1[1]) : undefined
    const lSlot0 = w0 ? (w0 === 'A' ? s1[1] : s1[0]) : undefined
    const wSlot1 = w1 ? (w1 === 'A' ? s2[0] : s2[1]) : undefined
    const lSlot1 = w1 ? (w1 === 'A' ? s2[1] : s2[0]) : undefined

    const m2 = { key: 'F12', a: wSlot0, b: wSlot1, labelA: wSlot0 ? labelBySlot(L, wSlot0) : 'Vincente G1', labelB: wSlot1 ? labelBySlot(L, wSlot1) : 'Vincente G2' }
    const m3 = { key: 'F34', a: lSlot0, b: lSlot1, labelA: lSlot0 ? labelBySlot(L, lSlot0) : 'Perdente G1', labelB: lSlot1 ? labelBySlot(L, lSlot1) : 'Perdente G2' }

    const rows = [
      ...explodeMatch(m0, 0),
      ...explodeMatch(m1, 1),
      ...explodeMatch(m2, 2),
      ...explodeMatch(m3, 3),
    ]
    const order = matchOrder[L] || []
    const rank = (i:number) => { const p=order.indexOf(i); return p<0?order.length+i:p }
    return rows.sort((a,b)=>rank(a.matchIdx)-rank(b.matchIdx)||a.setNo-b.setNo)
  }

  // Round-robin classico
  const baseMatches = rr(cap).map(([a, b], i) => ({
    key: `R${i + 1}`,
    a,
    b,
    labelA: labelBySlot(L, a),
    labelB: labelBySlot(L, b),
  }))

  const out: ScheduleRow[] = []
  baseMatches.forEach((m, matchIdx) => out.push(...explodeMatch(m, matchIdx)))
  const order = matchOrder[L] || []
  const rank = (i: number) => { const p = order.indexOf(i); return p < 0 ? order.length + i : p }
  return out.sort((a,b) => rank(a.matchIdx)-rank(b.matchIdx) || a.setNo-b.setNo)
}

 
// Un girone è incompleto se esiste almeno una partita ancora senza vincitore.
const missingGroupMatches = letters.map((letter) => {
  const matchIndexes = Array.from(new Set(scheduleRows(letter).map(row => row.matchIdx)))
  const count = matchIndexes.filter(index => {
    const winner = matchWinnerFromScores(letter, index).winner
    const requiredSets = bestOfOf(letter) === 3 ? 2 : 1
    const recorded = Array.from({ length: bestOfOf(letter) }, (_, set) => {
      const row = scores[letter]?.[index * bestOfOf(letter) + set]
      return row && String(row.a ?? '').trim() !== '' &&
        String(row.b ?? '').trim() !== '' &&
        Number.isFinite(Number(row.a)) && Number.isFinite(Number(row.b)) &&
        Number(row.a) !== Number(row.b)
    }).filter(Boolean).length
    return !winner || recorded < requiredSets
  }).length
  return { letter, count }
}).filter(group => group.count > 0)

// Risultati: aggiornamento parziale. Non riscrivere mai gruppi, assegnazioni o conferme.
const lastResultsSnapshot = useRef<string>('')
const [resultsSaveError, setResultsSaveError] = useState('')
const resultsDraftKey = (id: string) => 'mattabel:risultati:pending:' + id
useEffect(() => {
  if (!tId || isLoadingState || loadedFor !== tId) return
  const snapshot = JSON.stringify({ times, scores, matchFields })
  if (snapshot === lastResultsSnapshot.current) return
  const id = tId
  try {
    localStorage.setItem(resultsDraftKey(id), JSON.stringify({ times, scores, matchFields, savedAt: Date.now() }))
  } catch {
    setResultsSaveError('Impossibile conservare i risultati nel browser.')
  }
  let cancelled = false
  const timer = setTimeout(async () => {
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        if (cancelled) return
        const read = await fetch(`/api/groups/state?tournament_id=${encodeURIComponent(id)}`, {
          headers: { 'x-role': 'admin' }, cache: 'no-store'
        })
        if (!read.ok) throw new Error('Lettura fallita')
        const current = await read.json()
        if (!current.updated_at) throw new Error('Versione mancante')
        const res = await fetch('/api/groups/state', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
          body: JSON.stringify({ tournament_id: id, base_updated_at: current.updated_at,
            changes: { times: { ...(current.state?.times || {}), ...times },
                       scores: { ...(current.state?.scores || {}), ...scores },
                        matchFields: { ...(current.state?.matchFields || {}), ...matchFields } } })
        })
        if (res.status === 409) continue
        if (!res.ok) throw new Error('Salvataggio fallito')
        if (!cancelled) {
          lastResultsSnapshot.current = snapshot
          try {
            const pending = localStorage.getItem(resultsDraftKey(id))
            if (pending) {
              const parsed = JSON.parse(pending)
              if (JSON.stringify({ times: parsed.times, scores: parsed.scores, matchFields: parsed.matchFields ?? {} }) === snapshot) {
                localStorage.removeItem(resultsDraftKey(id))
              }
            }
          } catch {}
          setResultsSaveError('')
        }
        return
      }
      throw new Error('Conflitto salvataggi')
    } catch {
      if (!cancelled) setResultsSaveError('Risultati conservati nel browser, non ancora sincronizzati.')
    }
  }, 450)
  return () => { cancelled = true; clearTimeout(timer) }
}, [tId, times, scores, matchFields, isLoadingState, loadedFor])

  // ---------- Classifica + avulsa: salvataggi ----------
  type TeamStat = {
  slot: number
  label: string
  W: number
  PF: number
  PS: number
  QP: number
  SW: number   // set vinti
  SL: number   // set persi
  QS: number   // quoziente set = SW/SL
  finish?: number
}

 

 function computeStatsFor(L: string): TeamStat[] {
  const cap = capOf(L)
  const fmt = (store?.meta?.[L]?.format ?? 'pool').toLowerCase() as 'pool' | 'ita'

  const init: Record<number, TeamStat> = {}
  for (let s = 1; s <= cap; s++) {
    init[s] = { slot: s, label: labelBySlot(L, s), W: 0, PF: 0, PS: 0, QP: 0, SW: 0, SL: 0, QS: 0 }
  }

  const rows = scheduleRows(L)

  const apply = (slotA?: number, slotB?: number, matchIdx?: number) => {
    if (!slotA || !slotB) return
    const mi = matchIdx ?? 0

    // punti PF/PS (somma set)
    const pts = matchPointsSum(L, mi)
    init[slotA].PF += pts.aPF; init[slotA].PS += pts.aPS
    init[slotB].PF += pts.bPF; init[slotB].PS += pts.bPS

    // set vinti/persi (serve per QS)
    const bestOf = bestOfOf(L)
    const sc = scores[L] ?? []
    for (let s = 0; s < bestOf; s++) {
      const row = sc[mi * bestOf + s]
      const a = Number(row?.a), b = Number(row?.b)
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue
      if (a === b) continue
      if (a > b) { init[slotA].SW += 1; init[slotB].SL += 1 }
      else       { init[slotB].SW += 1; init[slotA].SL += 1 }
    }

    // vittoria match
    const win = matchWinnerFromScores(L, mi).winner
    if (win === 'A') init[slotA].W += 1
    else if (win === 'B') init[slotB].W += 1
  }

  // conta una volta sola per match (setNo 1)
  rows.forEach((r) => {
    if (r?.setNo !== 1) return
    apply(r.a, r.b, r.matchIdx)
  })

  for (const s of Object.values(init)) {
    s.QP = s.PF / Math.max(1, s.PS)
    s.QS = s.SW / Math.max(1, s.SL)
  }

  // ✅ QUI: funzioni disponibili per TUTTI i formati (non solo pool)
  const headToHeadWinner = (slotX: number, slotY: number): number | undefined => {
    const rr = scheduleRows(L)
    for (const r of rr) {
      if (r.setNo !== 1) continue
      const a = r.a, b = r.b
      if (!a || !b) continue
      const ok = (a === slotX && b === slotY) || (a === slotY && b === slotX)
      if (!ok) continue

      const w = matchWinnerFromScores(L, r.matchIdx).winner
      if (!w) return undefined
      return w === 'A' ? a : b
    }
    return undefined
  }

  const miniStatsAmong = (slots: number[]) => {
    const setSlots = new Set(slots)
    const tmp: Record<number, { W: number; SW: number; SL: number; PF: number; PS: number; QS: number; QP: number }> = {}
    for (const s of slots) tmp[s] = { W: 0, SW: 0, SL: 0, PF: 0, PS: 0, QS: 0, QP: 0 }

    const rr = scheduleRows(L)
    const bestOf = bestOfOf(L)
    const sc = scores[L] ?? []

    for (const r of rr) {
      if (r.setNo !== 1) continue
      const a = r.a, b = r.b
      if (!a || !b) continue
      if (!setSlots.has(a) || !setSlots.has(b)) continue

      for (let si = 0; si < bestOf; si++) {
        const row = sc[r.matchIdx * bestOf + si]
        const va = Number(row?.a), vb = Number(row?.b)
        if (!Number.isFinite(va) || !Number.isFinite(vb)) continue

        tmp[a].PF += va; tmp[a].PS += vb
        tmp[b].PF += vb; tmp[b].PS += va

        if (va === vb) continue
        if (va > vb) { tmp[a].SW += 1; tmp[b].SL += 1 }
        else         { tmp[b].SW += 1; tmp[a].SL += 1 }
      }

      const w = matchWinnerFromScores(L, r.matchIdx).winner
      if (w === 'A') tmp[a].W += 1
      else if (w === 'B') tmp[b].W += 1
    }

    for (const s of slots) {
      tmp[s].QS = tmp[s].SW / Math.max(1, tmp[s].SL)
      tmp[s].QP = tmp[s].PF / Math.max(1, tmp[s].PS)
    }
    return tmp
  }

  // POOL 4: classifica determinata da semifinali+finali
  if (fmt === 'pool' && cap === 4) {
    const s1 = poolPairs.semi1
    const s2 = poolPairs.semi2

    const w1 = matchWinnerFromScores(L, 0).winner
    const w2 = matchWinnerFromScores(L, 1).winner

    const wSlot1 = w1 ? (w1 === 'A' ? s1[0] : s1[1]) : undefined
    const lSlot1 = w1 ? (w1 === 'A' ? s1[1] : s1[0]) : undefined
    const wSlot2 = w2 ? (w2 === 'A' ? s2[0] : s2[1]) : undefined
    const lSlot2 = w2 ? (w2 === 'A' ? s2[1] : s2[0]) : undefined

    const wf = matchWinnerFromScores(L, 2).winner
    if (wSlot1 && wSlot2 && wf) {
      const first = wf === 'A' ? wSlot1 : wSlot2
      const second = wf === 'A' ? wSlot2 : wSlot1
      init[first].finish = 1
      init[second].finish = 2
    }

    const wl = matchWinnerFromScores(L, 3).winner
    if (lSlot1 && lSlot2 && wl) {
      const third = wl === 'A' ? lSlot1 : lSlot2
      const fourth = wl === 'A' ? lSlot2 : lSlot1
      init[third].finish = 3
      init[fourth].finish = 4
    }

    const arr = Object.values(init)
    arr.sort((x, y) => {
      const fx = x.finish ?? 999, fy = y.finish ?? 999
      if (fx !== fy) return fx - fy
      if (y.W !== x.W) return y.W - x.W
      if (y.QP !== x.QP) return y.QP - x.QP
      if (y.PF !== x.PF) return y.PF - x.PF
      return x.slot - y.slot
    })
    return arr
  }

  // ROUND ROBIN: vittorie -> scontro diretto -> QS -> QP -> PF -> fallback
  const arr = Object.values(init)
  arr.sort((A, B) => {
    if (B.W !== A.W) return B.W - A.W

    const tiedSlots = Object.values(init).filter(x => x.W === A.W).map(x => x.slot)

    // scontro diretto se sono in 2
    if (tiedSlots.length === 2) {
      const w = headToHeadWinner(A.slot, B.slot)
      if (w === A.slot) return -1
      if (w === B.slot) return 1
    } else if (tiedSlots.length >= 3) {
      const ms = miniStatsAmong(tiedSlots)
      const a = ms[A.slot], b = ms[B.slot]
      if (a && b) {
        if (b.W !== a.W) return b.W - a.W
        if (b.QS !== a.QS) return b.QS - a.QS
        if (b.QP !== a.QP) return b.QP - a.QP
        if (b.PF !== a.PF) return b.PF - a.PF
      }
    }

    if (B.QS !== A.QS) return B.QS - A.QS
    if (B.QP !== A.QP) return B.QP - A.QP
    if (B.PF !== A.PF) return B.PF - A.PF

    // ✅ fallback “regola” (niente sorteggio): ordine slot (1,2,3,4...)
    return A.slot - B.slot
  })
  return arr
}

  // Evidenzia solo le coppie che hanno concluso tutte le proprie partite.
  // Per un best-of-3 bastano due set vinti: il terzo può restare vuoto.
  function matchIsCompleted(L: string, matchIdx: number): boolean {
    const bestOf = bestOfOf(L)
    const need = setsToWin(bestOf)
    const rows = scores[L] ?? []
    let wonA = 0
    let wonB = 0
    for (let si = 0; si < bestOf; si++) {
      if (wonA >= need || wonB >= need) return true
      const row = rows[matchIdx * bestOf + si]
      const rawA = String(row?.a ?? '').trim()
      const rawB = String(row?.b ?? '').trim()
      if (!rawA || !rawB) return false
      const a = Number(rawA), b = Number(rawB)
      if (!Number.isFinite(a) || !Number.isFinite(b) || a === b || a < 0 || b < 0) return false
      if (a > b) wonA++
      else wonB++
    }
    return wonA >= need || wonB >= need
  }

  function matchProgressFor(L: string): Record<number, { played: number; total: number }> {
    const rows = scheduleRows(L).filter(r => r.setNo === 1)
    const cap = capOf(L)
    const isPoolFour = fmtOf(L) === 'pool' && cap === 4
    const progress: Record<number, { played: number; total: number }> = {}
    for (let slot = 1; slot <= cap; slot++) {
      const matches = rows.filter(r => r.a === slot || r.b === slot)
      const played = matches.filter(r => r.a && r.b && matchIsCompleted(L, r.matchIdx)).length
      progress[slot] = { played, total: isPoolFour ? 2 : matches.length }
    }
    return progress
  }

  type AvulsaRow = { letter:string; pos:number; label:string; W:number; PF:number; PS:number; QP:number; completed:boolean; played:number; total:number }
  const avulsa: AvulsaRow[] = useMemo(() => {
    if (!store) return []
    const out: AvulsaRow[] = []
    for (const L of letters) {
      const progress = matchProgressFor(L)
      computeStatsFor(L).forEach((s,i) => out.push({
        letter:L, pos:i+1, label:s.label, W:s.W, PF:s.PF, PS:s.PS, QP:s.QP,
        completed:progress[s.slot].total > 0 && progress[s.slot].played === progress[s.slot].total,
        played:progress[s.slot].played, total:progress[s.slot].total
      }))
    }
    out.sort((a,b) => (a.pos-b.pos) || (b.W-a.W) || (b.QP-a.QP) || a.letter.localeCompare(b.letter))
    return out
  }, [store, letters, scores])
      useEffect(() => {
  if (!tourId || !tId || !store) return

  // 1) groups_rank:{tour}:{tappa}  -> { A:[...], B:[...], ... }
  const rankByGroup: Record<string, string[]> = {}
  for (const L of letters) {
    rankByGroup[L] = computeStatsFor(L).map(r => r.label)
  }

  // 2) classifica_avulsa:{tour}:{tappa} -> [ ...labels in ordine ]
  const avulsaArr = avulsa.map(r => r.label)

  try {
    localStorage.setItem(`groups_rank:${tourId}:${tId}`, JSON.stringify(rankByGroup))
    localStorage.setItem(`classifica_avulsa:${tourId}:${tId}`, JSON.stringify(avulsaArr))
    // se in qualche punto leggi ancora "avulsa:" mettiamo anche quello
    localStorage.setItem(`avulsa:${tourId}:${tId}`, JSON.stringify(avulsaArr))
  } catch {}
}, [tourId, tId, store, letters, scores, avulsa])


  // -------- Tabelloni + winners ----------
  const [courtsByBracket, setCourtsByBracket] = useState<Record<string, Record<string, string>>>({})
  const [bracketScoresById, setBracketScoresById] = useState<Record<string, Record<string, {A:number|null;B:number|null}>>>({})
  const [bracketsLoadKey, setBracketsLoadKey] = useState('')
  const [bracketsLoadError, setBracketsLoadError] = useState('')
  const bracketsBaselineRef = useRef('')
  const bracketsRequestRef = useRef(0)
  const [brackets, setBrackets] = useState<BracketType[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [smartDraft, setSmartDraft] = useState<{bracketId:string; rows:{A:string;B:string}[]; prelims?:{A:string;B:string}[]} | null>(null)
  const [smartShowNumbers, setSmartShowNumbers] = useState(false)
  const [smartPanelOpen, setSmartPanelOpen] = useState(false)
  const [smartEdit, setSmartEdit] = useState(false)
  const [smartPicked, setSmartPicked] = useState<number | null>(null)
  const [smartSaving, setSmartSaving] = useState(false)
  const [smartMessage, setSmartMessage] = useState('')
  
  const [winnersById, setWinnersById] = useState<Record<string, WinnerMap>>({})
const [itaScoresById, setItaScoresById] = useState<Record<string, ItaScore[]>>({})

      function nameFromGroupRank(letter: string, pos: number): string | undefined {
  const L = String(letter || '').toUpperCase()
  if (!/^[A-Z]$/.test(L) || !Number.isFinite(pos) || pos < 1) return
  // usa la classifica del girone calcolata in pagina (computeStatsFor)
  const row = computeStatsFor(L)[pos - 1]
  if (!row?.label) return
  // compat con il resto dell'UI: cognomi brevi
  return lastSurnames(row.label)
}

// Resolver completo: Winner/Loser -> A1/B2 (anche "1A", con spazi, minuscole) -> Avulsa(1..N) -> Fallback
const resolveToken = useMemo(() => {
  const winLose = makeExternalResolver(brackets, winnersById, tourId, tId)
  const slotBase = makeSlotResolver(tourId, tId, winLose)

  const avulsaNames: string[] = avulsa.map(r => r.label)

  const parseGroupToken = (raw: string): { letter: string; pos: number } | null => {
    const s = String(raw || '').trim().toUpperCase()
    let m = s.match(/^([A-Z])\s*(\d{1,2})$/) // A1 / A 1
    if (m) return { letter: m[1], pos: Number(m[2]) }
    m = s.match(/^(\d{1,2})\s*([A-Z])$/)     // 1A / 1 A
    if (m) return { letter: m[2], pos: Number(m[1]) }
    return null
  }

  const resolveGroupOrAvulsaNow = (maybe: string): string | undefined => {
    if (!maybe) return undefined
    // prova girone live
    const gp = parseGroupToken(maybe)
    if (gp) {
      const nm = nameFromGroupRank(gp.letter, gp.pos) // usa computeStatsFor live
      if (nm) return nm
    }
    // prova avulsa live
    if (/^\d+$/.test(maybe)) {
      const idx = Math.max(1, Number(maybe)) - 1
      const nm = avulsaNames[idx]
      if (nm) return lastSurnames(nm)
    }
    return undefined
  }

  return (raw: string): string => {
    const token = String(raw || '').trim()
    if (!token) return '—'

    // 1) numero avulsa diretto
    if (/^\d+$/.test(token)) {
      const nm = resolveGroupOrAvulsaNow(token)
      if (nm) return nm
    }

    // 2) A1/B2/1A ecc diretto
    const gp = parseGroupToken(token)
    if (gp) {
      const nm = nameFromGroupRank(gp.letter, gp.pos)
      if (nm) return nm
    }

    // 3) fallback standard (Winner/Loser -> A1) + post-risoluzione ULTERIORE
    const itaRef=parseItaPositionToken(token)
    if(itaRef) return lastSurnames(resolveItaPosition(token,brackets,itaScoresById,raw=>{
      const name=resolveGroupOrAvulsaNow(raw)
      return name || slotBase(raw)
    }) || token)
    const out = slotBase(token) // può restituire A1/B2 ecc (o già un nome)
    const nm = resolveGroupOrAvulsaNow(out)
    return nm ?? out
  }
}, [brackets, winnersById, tourId, tId, avulsa, itaScoresById])

 useEffect(() => {
  const request = ++bracketsRequestRef.current
  const controller = new AbortController()
  const key = tourId && tId ? tourId + ':' + tId : ''
  setBracketsLoadKey('')
  setBracketsLoadError('')
  bracketsBaselineRef.current = ''
  setBrackets([])
  setActiveId(null)
  setWinnersById({})
  setItaScoresById({})
  setCourtsByBracket({})
  setBracketScoresById({})
  setBracketsPublic(false)
  if (!key) return () => controller.abort()
  ;(async () => {
    try {
      const response = await fetch(`/api/brackets/state?tournament_id=${encodeURIComponent(tId)}`, {
        headers: { 'x-role': 'admin' }, cache: 'no-store', signal: controller.signal
      })
      if (!response.ok) throw new Error('Caricamento tabelloni fallito')
      const json = await response.json()
      if (controller.signal.aborted || request !== bracketsRequestRef.current) return
      const raw = json?.state
      const items = Array.isArray(raw) ? raw : (raw?.items || [])
      if (!Array.isArray(items)) throw new Error('Formato tabelloni non valido')
      const normalized = items.map(normalizeBracket)
      const winners = Array.isArray(raw) ? {} : (raw?.winnersById || {})
      const ita = Array.isArray(raw) ? {} : (raw?.itaScoresById || {})
      const courts = Array.isArray(raw) ? {} : (raw?.courtsByBracket || {})
      const bracketScores = Array.isArray(raw) ? {} : (raw?.bracketScoresById || {})
      bracketsBaselineRef.current = JSON.stringify({ winners, ita, courts, bracketScores })
      setBrackets(normalized)
      setActiveId(normalized[0]?.id ?? null)
      setWinnersById(winners)
      setItaScoresById(ita)
      setCourtsByBracket(courts)
      setBracketScoresById(bracketScores)
      setBracketsPublic(Boolean(json?.is_public))
      setBracketsLoadKey(key)
    } catch {
      if (!controller.signal.aborted && request === bracketsRequestRef.current)
        setBracketsLoadError('Caricamento tabelloni fallito. Ricarica la pagina; nessun dato sovrascritto.')
    }
  })()
  return () => { controller.abort(); bracketsRequestRef.current++ }
}, [tourId, tId])

// Il caricamento non deve mai attivare un salvataggio automatico.
useEffect(() => {
  const key = tourId && tId ? tourId + ':' + tId : ''
  if (!key || bracketsLoadKey !== key || bracketsLoadError) return
  const snapshot = JSON.stringify({ winners: winnersById, ita: itaScoresById, courts: courtsByBracket, bracketScores: bracketScoresById })
  if (snapshot === bracketsBaselineRef.current) return
  const request = bracketsRequestRef.current
  let cancelled = false
  const id = tId
  const timer = setTimeout(async () => {
    try {
      const response = await fetch(`/api/brackets/state?tournament_id=${encodeURIComponent(id)}`, {
        headers: { 'x-role': 'admin' }, cache: 'no-store'
      })
      if (!response.ok) throw new Error('Lettura fallita')
      const json = await response.json()
      if (cancelled || request !== bracketsRequestRef.current) return
      const previous = json?.state
      const items = Array.isArray(previous) ? previous : (previous?.items || [])
      const next = {
        ...(Array.isArray(previous) ? {} : (previous || {})),
        items,
        winnersById: { ...(Array.isArray(previous) ? {} : previous?.winnersById || {}), ...winnersById },
        itaScoresById: { ...(Array.isArray(previous) ? {} : previous?.itaScoresById || {}), ...itaScoresById },
        courtsByBracket: { ...(Array.isArray(previous) ? {} : previous?.courtsByBracket || {}), ...courtsByBracket },
        bracketScoresById: { ...(Array.isArray(previous) ? {} : previous?.bracketScoresById || {}), ...bracketScoresById },
      }
      // Map court changes from the result editor onto the same Regia match keys.
      // Preserve live/queued status and sequence already selected in Regia.
      const regiaItems = { ...((Array.isArray(previous) ? {} : previous?.regia?.items) || {}) } as Record<string, any>
      brackets.filter(b => b.type === 'PSE' || b.type === 'PDE').forEach(b => {
        Object.entries(courtsByBracket[b.id] || {}).forEach(([code, value]) => {
          const key = `bracket:${b.id}:${code}`
          const old = regiaItems[key] || {}
          const n = Number(value)
          regiaItems[key] = { ...old, court: String(value).trim() !== '' && Number.isInteger(n) && n > 0 ? n : null }
        })
      })
      next.regia = { ...(Array.isArray(previous) ? {} : previous?.regia || {}), items: regiaItems }
      if (cancelled || request !== bracketsRequestRef.current) return
      const saved = await fetch('/api/brackets/state', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-role': 'admin' },
        body: JSON.stringify({ tournament_id: id, state: next }),
      })
      if (!saved.ok) throw new Error('Salvataggio fallito')
      if (!cancelled && request === bracketsRequestRef.current) bracketsBaselineRef.current = snapshot
    } catch {
      if (!cancelled && request === bracketsRequestRef.current)
        setBracketsLoadError('Salvataggio risultati tabellone non riuscito. Ricarica prima di continuare.')
    }
  }, 450)
  return () => { cancelled = true; clearTimeout(timer) }
}, [tourId, tId, bracketsLoadKey, bracketsLoadError, winnersById, itaScoresById, courtsByBracket, bracketScoresById])

  const active = useMemo(() => brackets.find(b => b.id === activeId) || null, [activeId, brackets])

  const avulsaGroupForSeed = (seed:number) => avulsa[seed-1]?.letter
  const isPreliminarySmart=active?.type==='PSE' || active?.type==='PDE'
  const smartRows=smartDraft?.bracketId===activeId ? smartDraft.rows : (active?.r1 || [])
  const smartPrelims=smartDraft?.bracketId===activeId ? (smartDraft.prelims || []) : (active?.prelims || [])
  const smartSupported=!!active && ['SE','DE','PSE','PDE'].includes(active.type) &&
    (active.source==='avulsa' || active.source==='avulsa-intelligente')
  const smartLocked=!!active && (
    Object.values(winnersById[active.id] || {}).some(Boolean) ||
    Object.values(bracketScoresById[active.id] || {}).some(v=>v?.A!=null || v?.B!=null)
  )
  // Le R dei PSE/PDE hanno un ingresso A dinamico (vincitrice P): non è un posto spostabile.
  // Non mostrare etichette residue di altri tornei nel pannello touch.
  // Solo i numeri che esistono nella classifica avulsa corrente sono squadre.
  const validAvulsaToken=(token:string) =>
    /^\d+$/.test(String(token||'').trim()) && !!avulsa[Number(token)-1]?.label
  const cleanAvulsaToken=(token:string) =>
    validAvulsaToken(token) ? token : '-'
  const cleanAvulsaRows=(rows:{A:string;B:string}[]) =>
    rows.map(m=>({A:cleanAvulsaToken(m.A),B:cleanAvulsaToken(m.B)}))
  const smartSlots: Array<{section:'prelims'|'r1';index:number;side:'A'|'B';token:string;match:string}> =
    isPreliminarySmart
      ? [...smartPrelims.flatMap((m,i)=>[
          {section:'prelims' as const,index:i,side:'A' as const,token:cleanAvulsaToken(m.A),match:`P${i+1}`},
          {section:'prelims' as const,index:i,side:'B' as const,token:cleanAvulsaToken(m.B),match:`P${i+1}`}
        ]),...smartRows.map((m,i)=>({
          section:'r1' as const,index:i,side:'B' as const,token:cleanAvulsaToken(m.B),match:`R${i+1}`
        }))]
      : smartRows.flatMap((m,i)=>[
          {section:'r1' as const,index:i,side:'A' as const,token:cleanAvulsaToken(m.A),match:`M${i+1}`},
          {section:'r1' as const,index:i,side:'B' as const,token:cleanAvulsaToken(m.B),match:`M${i+1}`}
        ])
  // Le rivincite sono verificate tra coppie dello stesso girone. Per PSE/PDE
  // il primo turno disputato e' il preliminare P; per SE/DE e' R1/M.
  const smartRematches=(isPreliminarySmart?smartPrelims:smartRows).flatMap((m,i)=>{
    const ga=/^\d+$/.test(m.A) ? avulsaGroupForSeed(Number(m.A)) : undefined
    const gb=/^\d+$/.test(m.B) ? avulsaGroupForSeed(Number(m.B)) : undefined
    if(!ga || !gb || ga!==gb)return []
    return [{match:isPreliminarySmart?`P${i+1}`:`M${i+1}`,
      a:m.A,b:m.B,group:ga}]
  })
  const smartWarnings=smartRematches.length
  const smartSwap=(index:number)=>{
    if(!active || smartLocked)return
    if(smartPicked===null){setSmartPicked(index);return}
    if(smartPicked===index){setSmartPicked(null);return}
    const first=smartSlots[smartPicked],second=smartSlots[index]
    if(!first || !second ||
      (!validAvulsaToken(first.token) && !validAvulsaToken(second.token))){
      setSmartMessage('Seleziona almeno una coppia con posizione avulsa valida.')
      setSmartPicked(null);return
    }
    const rows=cleanAvulsaRows(smartRows),prelims=cleanAvulsaRows(smartPrelims)
    const data={r1:rows,prelims}
    data[first.section][first.index][first.side]=second.token
    data[second.section][second.index][second.side]=first.token
    setSmartDraft({bracketId:active.id,rows,prelims})
    setSmartPicked(null);setSmartMessage('')
  }
  const smartPropose=()=>{
    if(!active || smartLocked)return
    const rows=cleanAvulsaRows(smartRows),prelims=cleanAvulsaRows(smartPrelims)
    const proposal=isPreliminarySmart ? smartAvulsaPairs(prelims,avulsaGroupForSeed) : smartAvulsaPairs(rows,avulsaGroupForSeed)
    setSmartDraft({bracketId:active.id,rows:isPreliminarySmart?rows:proposal,prelims:isPreliminarySmart?proposal:prelims})
    setSmartEdit(true);setSmartPicked(null);setSmartMessage('')
  }
  const smartSave=async()=>{
    if(!active || !smartDraft || smartDraft.bracketId!==active.id || smartLocked || smartSaving)return
    const id=active.id,rows=smartDraft.rows.map(m=>({...m}))
    const prelims=smartDraft.prelims?.map(m=>({...m}))
    setSmartSaving(true);setSmartMessage('')
    try{
      const response=await fetch(`/api/brackets/state?tournament_id=${encodeURIComponent(tId)}`,{
        headers:{'x-role':'admin'},cache:'no-store'
      })
      if(!response.ok)throw new Error('Impossibile rileggere il tabellone')
      const json=await response.json(),previous=json?.state
      const items=Array.isArray(previous)?previous:previous?.items
      if(!Array.isArray(items))throw new Error('Dati tabellone non validi')
      const current=items.find((b:any)=>b.id===id)
      if(!current || JSON.stringify(current.r1)!==JSON.stringify(active.r1) ||
         (isPreliminarySmart && JSON.stringify(current.prelims)!==JSON.stringify(active.prelims)))
        throw new Error('Il tabellone è cambiato su un altro dispositivo: ricarica prima di salvare')
      if(Object.values((Array.isArray(previous)?{}:previous?.winnersById?.[id])||{}).some(Boolean) ||
        Object.values((Array.isArray(previous)?{}:previous?.bracketScoresById?.[id])||{}).some((v:any)=>v?.A!=null||v?.B!=null))
        throw new Error('Il tabellone contiene già risultati')
      const nextItems=items.map((b:any)=>b.id===id?{...b,r1:rows,...(isPreliminarySmart?{prelims}:{} )}:b)
      const next=Array.isArray(previous)?{items:nextItems}:{...previous,items:nextItems}
      const saved=await fetch('/api/brackets/state',{
        method:'PUT',headers:{'Content-Type':'application/json','x-role':'admin'},
        body:JSON.stringify({tournament_id:tId,state:next})
      })
      if(!saved.ok)throw new Error('Salvataggio non riuscito')
      setBrackets(prev=>prev.map(b=>b.id===id?{...b,r1:rows,...(isPreliminarySmart?{prelims}:{} )}:b))
      setSmartDraft(null);setSmartEdit(false);setSmartPicked(null)
      setSmartMessage('Accoppiamenti salvati.')
    }catch(e:any){setSmartMessage(e?.message||'Salvataggio non riuscito')}
    finally{setSmartSaving(false)}
  }

// Bracket "per display": per SE/DE risolvo A1/B2/avulsa(1..N) -> cognomi
const activeForDisplay = useMemo(() => {
  if (!active) return null

  // solo SE/DE hanno il problema (ITA usa già ItaEditor con resolve)
  if (String(active.type).toUpperCase() === 'SE' || String(active.type).toUpperCase() === 'DE') {
    const mapSlot = (s: string) => {
      const token=String(s || '').trim()
      const avulsaSource=active.source==='avulsa' || active.source==='avulsa-intelligente'
      if (!token || token==='-' || token==='—') return '—'
      if(token.toUpperCase()==='BYE')return 'BYE'
      // Nelle provenienze avulsa soltanto un numero identifica una coppia.
      // Una vecchia etichetta letterale (es. dal torneo precedente) non deve
      // riapparire come partecipante a un ingresso lasciato vuoto.
      if(avulsaSource && !/^\d+$/.test(token))return '—'
      const name=resolveToken(token)
      if(avulsaSource && /^\d+$/.test(token) && !avulsa[Number(token)-1]?.label)return '—'
      return smartShowNumbers && avulsaSource && /^\d+$/.test(token)
        ? `#${token} · ${name}` : name
    }
    return {
      ...active,
      // r1: risolvo A e B
      r1: (smartDraft?.bracketId===active.id ? smartDraft.rows : active.r1 || []).map(m => ({ A: mapSlot(m.A), B: mapSlot(m.B) })),
      // slots lineari (per gli schemi che li mostrano)
      slots: (active.slots || []).map(mapSlot),
    } as BracketType
  }
  return active
}, [active, resolveToken, smartShowNumbers, smartDraft, avulsa])

  // ------------------------------------------------------------
// UI
// ------------------------------------------------------------
return (
  <div className="mt-results-page relative z-0 p-2 sm:p-3 xl:p-6 space-y-6 xl:space-y-8 pointer-events-auto min-w-0">
    <h1 className="mt-results-title">Risultati Girone/Tabellone</h1>
   
    {resultsSaveError && <div role="alert" className="rounded border border-amber-500 p-3 text-amber-300">{resultsSaveError}</div>}
    {/* Header filtri */}
    <div className="mt-results-controls flex flex-wrap items-end gap-3">
      <div className="flex flex-col">
        <div className="text-xs text-neutral-400 mb-1">Tour</div>
        <select
          className="input w-56"
          value={tourId}
          onChange={(e) => {
            setTourId(e.target.value)
            setTId('')
          }}
        >
          {tours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <div className="text-xs text-neutral-400 mb-1">Tappa</div>
        <select
  className="input w-64"
  value={tId}
  onChange={(e) => {localStorage.setItem('selectedTournamentId',e.target.value);setTId(e.target.value)}}
>
  {tappeVisibili.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name}{t.date ? ` — ${new Date(t.date).toLocaleDateString()}` : ''}
    </option>
  ))}
</select>

      </div>

      <div className="mt-results-actions flex items-end gap-2">
        <div className="mt-results-view-switch inline-flex rounded-xl overflow-hidden border border-neutral-700">
          <button
            aria-pressed={view === "gironi"}
            className={`mt-results-view-btn px-3 py-2 text-sm ${
              view === 'gironi'
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-900 text-neutral-300'
            }`}
            onClick={() => setView('gironi')}
          >
            Gironi
          </button>
          <button
            aria-pressed={view === "tabellone"}
            className={`mt-results-view-btn px-3 py-2 text-sm ${
              view === 'tabellone'
                ? 'bg-neutral-800 text-white'
                : 'bg-neutral-900 text-neutral-300'
            }`}
            onClick={() => setView('tabellone')}
          >
            Tabellone
          </button>
        </div>

        <button
          type="button"
          className={`mt-results-publish px-3 py-2 text-sm rounded-lg ${bracketsPublic ? 'mt-results-published' : 'mt-results-hidden'}`}
          onClick={toggleBracketsPublic}
          disabled={!tId || publishingBrackets || bracketsLoadKey !== tourId + ':' + tId || !!bracketsLoadError}
          aria-pressed={bracketsPublic}
          title={bracketsPublic ? 'Clicca per nascondere i tabelloni agli atleti' : 'Clicca per pubblicare i tabelloni agli atleti'}
        >
          {publishingBrackets ? 'Aggiornamento…' : bracketsPublic ? 'Tabelloni ONLINE · Nascondi' : 'Tabelloni NON pubblici · Pubblica'}
        </button>
      </div>
    </div>

    {/* Contenuto */}
   {!tId ? (
  <div className="card p-6 text-sm text-neutral-400">
    {tappeVisibili.length > 0
      ? <>Seleziona <b>Tour</b> e <b>Tappa</b>.</>
      : <>Nessuna tappa disponibile (tutte chiuse).</>}
  </div>
) : view === 'tabellone' ? (

      <div className="card p-0 overflow-hidden">
        {bracketsLoadError ? (<div role="alert" className="p-6 text-amber-400">{bracketsLoadError}</div>) : bracketsLoadKey !== (tourId + ':' + tId) ? (<div className="p-6 text-neutral-400">Caricamento tabelloni...</div>) : !brackets.length ? (
          <div className="p-6 text-sm text-neutral-400">
            Nessun tabellone trovato. Crea tabelloni in <b>/admin/creazione tabellone</b>.
          </div>
        ) : (
          <>
            {/* Tabs tabelloni */}
            <div className="p-3 flex flex-wrap gap-2 border-b border-neutral-800">
              {brackets.map((b, i) => (
                <button
                  key={b.id}
                  className={`btn ${b.id === activeId ? '' : 'opacity-80'}`}
                  onClick={() => {setActiveId(b.id);setSmartDraft(null);setSmartPicked(null);setSmartEdit(false);setSmartPanelOpen(false);setSmartMessage('')}}
                  title={b.title}
                  style={
                    b.id === activeId
                      ? { outline: `2px solid ${b.color}`, outlineOffset: 2 }
                      : {}
                  }
                >
                  {b.title}
                  <span className="ml-2 text-[10px] opacity-60">L{i + 1}</span>
                  {i === 0 && <span className="ml-1">👑</span>}
                </button>
              ))}
            </div>

            {/* Canvas / Editor */}
            {active ? (
  <div className="p-4">
    {smartSupported && <div className="mb-4 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
      <button type="button" aria-expanded={smartPanelOpen}
        onClick={()=>{setSmartPanelOpen(v=>!v);setSmartPicked(null)}}
        className="w-full flex flex-wrap items-center justify-between gap-2 text-left rounded-lg px-2 py-2 hover:bg-neutral-800/60"
        title={smartPanelOpen?'Chiudi dettagli avulsa':'Apri dettagli avulsa'}>
        <span className="font-semibold text-sm">Avulsa intelligente</span>
        <span className={`text-sm ${smartWarnings?'text-amber-400':'text-emerald-400'}`}>
          {smartWarnings} {smartWarnings===1?'rivincita':'rivincite'} al primo turno
          <span className="ml-3 text-neutral-400" aria-hidden="true">{smartPanelOpen?'▴':'▾'}</span>
        </span>
      </button>
      {smartPanelOpen && <div className="space-y-3 px-2 pb-2 pt-3 border-t border-neutral-800">
        <div className="text-xs text-neutral-400">La classifica non cambia: il numero avulsa segue sempre la coppia.</div>
        {smartRematches.length>0 ?
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 space-y-2">
            <div className="text-sm font-semibold text-amber-300">Incontri che ripetono una sfida del girone</div>
            {smartRematches.map(rematch=><div key={rematch.match} className="text-sm text-neutral-200">
              <span className="font-semibold text-amber-300">{rematch.match} · Girone {rematch.group}:</span>{' '}
              <span>#{rematch.a} {resolveToken(rematch.a)} vs #{rematch.b} {resolveToken(rematch.b)}</span>
            </div>)}
          </div>
          : <div className="text-sm text-emerald-400">Nessuna rivincita rilevata nel primo turno.</div>}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={smartShowNumbers} onChange={e=>setSmartShowNumbers(e.target.checked)}/> Mostra numeri avulsa</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={smartEdit} disabled={smartLocked} onChange={e=>{setSmartEdit(e.target.checked);setSmartPicked(null)}}/> Sposta squadre (tablet)</label>
        <button type="button" className="btn" disabled={smartLocked||smartSaving||!!smartDraft} onClick={()=>{
          if(!active)return
          smartPropose()
        }}>Proponi anti-rivincite</button>
      </div>
      {smartLocked && <div className="text-sm text-amber-400">Spostamenti bloccati: sono già stati inseriti risultati.</div>}
      {(smartEdit||smartDraft?.bracketId===active.id) && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(isPreliminarySmart ? [
          ...smartPrelims.map((_,i)=>({match:`P${i+1}`,index:i,section:'prelims' as const})),
          ...smartRows.map((_,i)=>({match:`R${i+1}`,index:i,section:'r1' as const}))
        ] : smartRows.map((_,i)=>({match:`M${i+1}`,index:i,section:'r1' as const}))).map(row=><div key={row.match} className="rounded-lg border border-neutral-700 p-2">
          <div className="text-xs text-neutral-400 mb-1">Incontro {row.match}</div>
          {smartSlots.map((entry,index)=>({entry,index})).filter(({entry})=>entry.match===row.match).map(({entry,index})=>{
            const token=entry.token,seed=Number(token),valid=validAvulsaToken(token)
            return <button key={entry.side} type="button" disabled={!smartEdit||smartLocked}
              onClick={()=>smartSwap(index)}
              className={`w-full text-left rounded-lg p-3 my-1 min-h-[54px] border ${smartPicked===index?'border-amber-400 bg-amber-900/30':'border-neutral-700 bg-neutral-800'}`}>
              {valid ? <>
                <strong>#{token} · </strong>{resolveToken(token)}
                {avulsaGroupForSeed(seed)?` · Girone ${avulsaGroupForSeed(seed)}`:''}
              </> : <span className="text-neutral-500">— {smartEdit?'(posto libero)':''}</span>}
            </button>
          })}
          {isPreliminarySmart && row.section==='r1' && <div className="text-xs text-neutral-500 mt-1">Altra coppia: vincitrice del preliminare {row.match.replace('R','P')}</div>}
        </div>)}
      </div>}
      {smartEdit && !smartLocked && <p className="text-xs text-neutral-400">Tocca una coppia e poi un'altra per scambiarle; puoi anche spostarla in un posto libero. Gli scambi restano in anteprima fino al salvataggio.</p>}
      {smartDraft?.bracketId===active.id && <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" disabled={smartSaving||smartLocked} onClick={smartSave}>{smartSaving?'Salvataggio...':'Conferma e salva'}</button>
        <button type="button" className="btn" disabled={smartSaving} onClick={()=>{setSmartDraft(null);setSmartPicked(null);setSmartEdit(false);setSmartMessage('Modifiche annullate')}}>Annulla</button>
      </div>}
      {smartMessage && <div role="status" className="text-sm text-amber-300">{smartMessage}</div>}
      </div>}
    </div>}
    <div className="mt-results-bracket-visual">
      {missingGroupMatches.length > 0 && (
        <div className="mt-results-incomplete" role="status">
          <strong>MANCANO DEI RISULTATI</strong>
          <span>{missingGroupMatches.map(group => `Girone ${group.letter}: ${group.count} ${group.count === 1 ? 'partita' : 'partite'}`).join(' · ')}</span>
        </div>
      )}
    {active.type === 'ITA' ? (
      <ItaEditor
        bracket={active}
        tourId={tourId}
        tId={tId}
        resolve={resolveToken}
        serverScores={itaScoresById[active.id] || []}
        onServerScoresChange={(rows) =>
          setItaScoresById((prev) => ({ ...prev, [active.id]: rows }))
        }
      />
    ) : (active.type === 'PSE' || active.type === 'PDE') ? (
      <PreliminaryBracket
        title={active.title} color={active.color} type={active.type} nTeams={active.nTeams}
        prelims={smartDraft?.bracketId===active.id ? smartPrelims : active.prelims} r1={smartRows} resolve={(token)=>{
          const raw=String(token||'').trim()
          const avulsaSource=active.source==='avulsa'||active.source==='avulsa-intelligente'
          if(!raw || raw==='-' || raw==='—')return '—'
          if(avulsaSource && !/^\d+$/.test(raw))return '—'
          if(avulsaSource && /^\d+$/.test(raw) && !avulsa[Number(raw)-1]?.label)return '—'
          const name=resolveToken(raw)
          return smartShowNumbers && avulsaSource && /^\d+$/.test(raw) ? `#${raw} · ${name}` : name
        }}
        editable
        winners={winnersById[active.id] || {}}
        onWinner={(code,side) => setWinnersById(prev => ({
          ...prev, [active.id]: {...(prev[active.id] || {}), [code]:side}
        }))}
        courts={courtsByBracket[active.id] || {}}
        onCourtChange={(code,court) => setCourtsByBracket(prev => ({
          ...prev,[active.id]:{...(prev[active.id] || {}),[code]:court}
        }))}
        scores={bracketScoresById[active.id] || {}}
        onScoreChange={(code,side,value) => setBracketScoresById(prev => ({
          ...prev,[active.id]:{
            ...(prev[active.id] || {}),
            [code]:{A:prev[active.id]?.[code]?.A ?? null,B:prev[active.id]?.[code]?.B ?? null,[side]:value}
          }
        }))}
      />
    ) : (
      <BracketCanvas
        bracket={activeForDisplay || active}  // 👈 usa la versione con nomi
        interactive
        confirmOnPick
        winners={winnersById[active.id] || {}}
        courts={courtsByBracket[active.id] || {}}
        onCourtChange={(code, court) => setCourtsByBracket(prev => ({
          ...prev, [active.id]: { ...(prev[active.id] || {}), [code]: court }
        }))}
        onWinnersChange={(w) =>
          setWinnersById((prev) => ({ ...prev, [active.id]: w }))
        }
        tourId={tourId}
        tId={tId}
        externalResolver={resolveToken}       // ok tenerlo per Winner/Loser
      />
    )}
    <BracketRankings
      key={tourId + ':' + tId}
      brackets={brackets}
      winnersById={winnersById}
      tourId={tourId}
      tId={tId}
      resolveToken={resolveToken}
    />
    </div>
  </div>
) : null}

          </>
        )}
      </div>
    ) : (
      <>
        {/* ——— GIRONI: partite + classifiche + avulsa ——— */}

     {/* Partite */}

<MobileGroupsCarousel
  letters={letters}
  tId={tId}
  scheduleRows={scheduleRows}
  setTime={setTime}
  setScore={setScore}
  fmtOf={fmtOf}
  colorFor={colorFor}
  times={times}
  scores={scores}
  matchFields={matchFields}
  setMatchFields={setMatchFields}
  gField={store?.gField || {}}
/>

{/* DESKTOP/TABLET: layout originale a griglia (immutato) */}
<div className="hidden md:block space-y-4">
  {chunk(letters, 2).map((pair, idx) => (
    <div
      key={idx}
      className="grid grid-cols-1 xl:grid-cols-2 gap-4"
    >
      {pair.map((L) => {
        const color = colorFor(L), rows = scheduleRows(L)
        return (
          <div key={`${tId}-${L}`} className="card p-0 overflow-hidden">
            <div className="h-9 px-3 flex items-center text-white" style={{ background: color }}>
              <div className="text-sm font-semibold">Partite {L} — {fmtOf(L).toUpperCase()}</div>
            </div>
            <div className="p-3 space-y-2">
              {rows.length === 0 ? (
                <div className="text-xs text-neutral-500">Imposta i gironi in /admin/gironi.</div>
              ) : (
           rows.map((r, ridx) => {
  const firstSet = r.setNo === 1
  const lastOfMatch =
    ridx === rows.length - 1 || rows[ridx + 1]?.matchIdx !== r.matchIdx

  return (
    <div
      key={`${tId}-${L}-${r.key}`}
      className={[
        'grid items-center',
        firstSet ? 'pt-1' : '',
        lastOfMatch ? 'pb-2 border-b border-neutral-800' : '',
      ].join(' ')}
      style={{
        gridTemplateColumns: '62px 40px minmax(0,1fr) 44px 16px 44px minmax(0,1fr)',
        columnGap: '.35rem',
      }}
    >
      {firstSet ? (
        <input
          type="text"
          inputMode="numeric"
          placeholder="hh:mm"
          maxLength={5}
          className="input h-8 px-1 text-xs text-white w-[60px] tabular-nums"
          value={(times[L] ?? [])[r.matchIdx] ?? ''}
          onChange={(e) => setTime(L, r.matchIdx, e.target.value)}
        />
      ) : (
        <div className="w-[92px] h-8 flex items-center text-xs text-neutral-500">
          Set {r.setNo}
        </div>
      )}

      {firstSet ? <input className="input h-8 w-[38px] px-1 text-xs text-center" inputMode="numeric" maxLength={2} placeholder="C." title="Campo partita" value={matchFields[L]?.[r.matchIdx] ?? store?.gField?.[L] ?? ''} onChange={e => setMatchFields(prev => { const arr=[...(prev[L]||[])]; arr[r.matchIdx]=e.target.value.replace(/\D/g,'').slice(0,2); return {...prev,[L]:arr} })}/> : <div/>}
      <div className="min-w-0 truncate text-sm text-right pr-0.5">
        {firstSet ? r.labelA : ''}
      </div>

      <input
        className="input h-8 w-12 px-1 text-sm text-center"
        inputMode="numeric"
        value={scores[L]?.[r.scoreIdx]?.a ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 2)
          setScore(L, r.scoreIdx, 'a', v)
        }}
      />

      <div className="w-6 text-center text-[13px] text-neutral-400">
        {firstSet ? 'vs' : '–'}
      </div>

      <input
        className="input h-8 w-12 px-1 text-sm text-center"
        inputMode="numeric"
        value={scores[L]?.[r.scoreIdx]?.b ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value.replace(/\D/g, '').slice(0, 2)
          setScore(L, r.scoreIdx, 'b', v)
        }}
      />

      <div className="min-w-0 truncate text-sm pl-1">
        {firstSet ? r.labelB : ''}
      </div>
    </div>
  )
})
              )}
            </div>
          </div>
        )
      })}
    </div>
  ))}
</div>

        {/* Classifiche per girone */}
        <div className="space-y-6">
          {chunk(letters, 4).map((row, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {row.map((L) => {
                const color = colorFor(L),
                  stats = computeStatsFor(L)
                return (
                  <div key={L} className="card p-0 overflow-hidden">
                    <div
                      className="px-3 py-2 font-semibold text-white"
                      style={{ background: color }}
                    >
                      Classifica {L}
                    </div>
                    <div className="p-3">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-neutral-400">
                          <tr>
                            <th className="text-left">Team</th>
                            <th className="text-right">W</th>
                            <th className="text-right">PF</th>
                            <th className="text-right">PS</th>
                            <th className="text-right">QP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.map((s, idx2) => (
                            <tr key={idx2} className="border-t border-neutral-800">
                              <td className="py-1 pr-2 truncate">{s.label}</td>
                              <td className="text-right">{s.W}</td>
                              <td className="text-right">{s.PF}</td>
                              <td className="text-right">{s.PS}</td>
                              <td className="text-right">{(s.QP || 0).toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 text-[11px] text-neutral-500">
                        W=Vittorie · PF=Punti Fatti · PS=Punti Subiti · QP=PF/PS
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Avulsa */}
        <div className="card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-lg font-semibold">Classifica Avulsa</div>
            <span className="text-xs text-emerald-400">● Verde = tutte le partite concluse</span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="text-left" title="Posizione generale nella classifica avulsa">Avulsa</th>
                <th className="text-left">Gir</th>
                <th className="text-left">Team</th>
                <th className="text-right">Partite</th>
                <th className="text-right">W</th>
                <th className="text-right">PF</th>
                <th className="text-right">PS</th>
                <th className="text-right">QP</th>
              </tr>
            </thead>
            <tbody>
              {avulsa.map((r, i) => (
                <tr key={i} className={`border-t border-neutral-800 ${r.completed ? 'bg-emerald-950/50 text-emerald-200' : ''}`} title={r.completed ? 'Tutte le partite della coppia sono concluse' : 'Partite ancora da completare'}>
                  <td className="py-1 font-semibold tabular-nums">{i + 1}</td>
                  <td>{r.letter}</td>
                  <td className="truncate">{r.label}</td>
                  <td className="text-right tabular-nums">{r.played}/{r.total}</td>
                  <td className="text-right">{r.W}</td>
                  <td className="text-right">{r.PF}</td>
                  <td className="text-right">{r.PS}</td>
                  <td className="text-right">{(r.QP || 0).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
)
}
