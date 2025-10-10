'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BracketCanvas, { type Bracket as BracketType, type WinnerMap } from '../../../../../components/BracketCanvas'

/* ============== Helpers comuni ============== */

const nextPow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p }

function normalizeBracket(b: any): BracketType {
  const n = Math.max(2, Number(b?.nTeams) || 8)
  const typeRaw = String(b?.type || 'SE').toUpperCase() as BracketType['type']
  const r1 = Array.from({ length: nextPow2(n) / 2 }, (_, i) => ({
    A: b?.r1?.[i]?.A ?? '-',
    B: b?.r1?.[i]?.B ?? '-',
  }))
  const slots = Array.from({ length: nextPow2(n) }, (_, i) => b?.slots?.[i] ?? '')
  return {
    id: String(b?.id || Math.random().toString(36).slice(2, 10)),
    title: String(b?.title || 'TABELLONE 1'),
    color: String(b?.color || '#22c55e'),
    type: typeRaw,
    nTeams: n,
    source: (b?.source as BracketType['source']) || 'gironi',
    fromTableId: b?.fromTableId || undefined,
    r1,
    slots,
  }
}

// nomi “brevi”: cognomi A / B
function lastSurnames(label: string) {
  const ln = (s: string) => s.trim().replace(/\s+[A-Z]\.?$/u, '').split(/\s+/)[0] || ''
  const parts = String(label).replace(/—/g,'/').split('/').map(p=>p.trim()).filter(Boolean)
  return parts.length>=2 ? `${ln(parts[0])} / ${ln(parts[1])}` : ln(String(label))
}

/** risolutore token → nome: A1/B2, “3”, Vincente/Perdente … */
function makeSlotResolver(
  tourId?: string,
  tId?: string,
  externalResolver?: (token: string) => string | undefined,
  publicGroups?: PublicPersist | null,  // 👈 aggiunto
)
 {
  const gmStore = (() => {
    try { return tId ? JSON.parse(localStorage.getItem(`gm:${tId}`) || 'null') : null }
    catch { return null }
  })();

  const basic = (token: string): string => {
    const t = String(token || '').trim()
    if (!t || t === '-' || t === '—') return '—'
    if (t.toUpperCase() === 'BYE') return 'BYE'

    // A1, B2, ...
    // 0) PRIMA DI TUTTO: tenta con lo stato pubblico dei gironi
const ridPub = publicGroups?.assign?.[`${L}-${oneBased}`]
const labPub = ridPub ? publicGroups?.labels?.[ridPub] : undefined
if (labPub) return lastSurnames(labPub)

    const mAB = t.match(/^([A-Z])(\d{1,2})$/)
    if (mAB && tourId && tId) {
      const L = mAB[1].toUpperCase()
      const oneBased = Number(mAB[2])

      // 1) classifica gironi salvata
      try {
        const raw = localStorage.getItem(`groups_rank:${tourId}:${tId}`) || localStorage.getItem(`gironi_rank_${tourId}_${tId}`)
        if (raw) {
          const rankByGroup: Record<string,string[]> = JSON.parse(raw)
          const name = rankByGroup[L]?.[oneBased - 1]
          if (name) return lastSurnames(name)
        }
      } catch {}

      // 2) fallback: gm:<tId>
      try {
        const rid = gmStore?.assign?.[`${L}-${oneBased}`]
        const label = rid ? gmStore?.labels?.[rid] : undefined
        if (label) return lastSurnames(label)
      } catch {}
      return t
    }

    // “3”: classifica avulsa
    if (/^\d+$/.test(t) && tourId && tId) {
      try {
        const raw =
          localStorage.getItem(`classifica_avulsa:${tourId}:${tId}`) ||
          localStorage.getItem(`avulsa:${tourId}:${tId}`) ||
          localStorage.getItem(`avulsa:${tId}`)
        if (raw) {
          const arr: string[] = JSON.parse(raw)
          const idx = Math.max(1, Number(t)) - 1
          const name = arr[idx]
          if (name) return lastSurnames(name)
        }
      } catch {}
      return t
    }

    return t
  }

  return (token: string): string => {
    const ext = externalResolver?.(token) // “Vincente/Perdente …”
    if (ext) return basic(ext)
    return basic(token)
  }
}

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

/* ============== External “Vincente/Perdente …” ============== */
function makeExternalResolver(
  brackets: Array<{ id: string; title: string; r1?: { A: string; B: string }[] }>,
  winnersById: Record<string, Record<string, 'A' | 'B' | undefined>>
) {
  const byTitle = new Map(brackets.map(b => [b.title.toUpperCase(), b]))
  return (token: string): string | undefined => {
    if (!token) return undefined
    const t = token.trim()
    const m = t.match(/^(Perdente|Loser|Vincente|Winner)\s+(.+?)\s+([A-Za-z])(\d+)$/i)
    if (!m) return undefined

    const kind = m[1].toLowerCase()
    const titleU = m[2].toUpperCase()
    let letter = m[3].toUpperCase()
    const num = Number(m[4])

    const br = byTitle.get(titleU)
    if (!br || !Number.isFinite(num) || num < 1) return undefined
    if (letter === 'M') letter = 'R'
    if (letter !== 'R') return undefined

    const pair = br.r1?.[num - 1]
    if (!pair) return undefined

    const side = (winnersById[br.id] || {})[`R${num}`] // 'A' | 'B'
    if (!side) return undefined

    if (kind === 'vincente' || kind === 'winner') return side === 'A' ? pair.A : pair.B
    if (kind === 'perdente' || kind === 'loser') {
      const loserSide = side === 'A' ? 'B' : 'A'
      return loserSide === 'A' ? pair.A : pair.B
    }
    return undefined
  }
}

/* ============== ITA viewer (read-only) ============== */

function buildRR_Ita(n: number): Array<[number, number]> {
  const t: number[] = Array.from({ length: Math.max(2, n) }, (_, i) => i + 1)
  if (t.length % 2 === 1) t.push(0)
  const rounds = t.length - 1
  const half = t.length / 2
  const out: Array<[number, number]> = []
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = t[i], b = t[t.length - 1 - i]
      if (a !== 0 && b !== 0) out.push([a, b])
    }
    const fixed = t[0]
    const rest = t.slice(1)
    rest.unshift(rest.pop()!)
    t.splice(0, t.length, fixed, ...rest)
  }
  return out
}
// Minimo indispensabile dallo stato pubblico gironi
type PublicPersist = {
  assign?: Record<string, string>; // es. "A-1" → "ridXYZ"
  labels?: Record<string, string>; // es. "ridXYZ" → "Mario / Luca"
}

type ItaScore = { a?: number; b?: number }

function ItaViewer({
  bracket, tourId, tId, resolve, serverScores,
}: {
  bracket: BracketType
  tourId: string
  tId: string
  resolve: (token: string) => string
  serverScores?: ItaScore[]
}) {
  const n = Math.max(2, Number(bracket.nTeams) || 0)

  const teams = useMemo(() => {
    const seeded = seedFromBracket(bracket, resolve)
    const arr = seeded.slice(0, n)
    while (arr.length < n) arr.push('—')
    return arr
  }, [bracket, resolve, n])

  const pairs = useMemo(() => buildRR_Ita(n), [n])
  const scores: ItaScore[] = Array.isArray(serverScores) ? serverScores : []

  const standings = useMemo(() => {
    const S = teams.map((name, idx) => ({ idx: idx + 1, name, W: 0, PF: 0, PS: 0, QP: 0 }))
    pairs.forEach(([aIdx1, bIdx1], i) => {
      const s = scores[i] || {}
      const a = Number(s.a), b = Number(s.b)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return
      const ai = aIdx1 - 1, bi = bIdx1 - 1
      S[ai].PF += a; S[ai].PS += b
      S[bi].PF += b; S[bi].PS += a
      if (a > b) S[ai].W += 1
      else if (b > a) S[bi].W += 1
    })
    S.forEach(r => (r.QP = r.PF / Math.max(1, r.PS)))
    S.sort((A,B)=> B.W-A.W || B.QP-A.QP || B.PF-A.PF || A.name.localeCompare(B.name))
    return S
  }, [teams, pairs, scores])

  return (
    <div className="card p-0 overflow-hidden mb-4">
      <div className="h-9 px-3 flex items-center justify-between text-white" style={{ background: bracket.color }}>
        <div className="text-sm font-semibold">Girone all’italiana — {bracket.title}</div>
      </div>

      <div className="p-3 grid gap-4 md:grid-cols-2">
        {/* calendario & punteggi (read-only) */}
        <div>
          <div className="text-sm font-semibold mb-2">Calendario & punteggi</div>
          <div className="space-y-2">
            {pairs.map(([a1,b1], i) => {
              const aName = teams[a1-1] || `S${a1}`
              const bName = teams[b1-1] || `S${b1}`
              const s = scores[i] || {}
              return (
                <div key={`m-${i}`} className="grid items-center gap-2"
                     style={{ gridTemplateColumns: 'minmax(0,1fr) 52px 16px 52px minmax(0,1fr)' }}>
                  <div className="truncate pr-1 text-right" title={aName}>{aName}</div>
                  <div className="input input-sm text-center select-none">{s.a ?? ''}</div>
                  <div className="text-center opacity-60">–</div>
                  <div className="input input-sm text-center select-none">{s.b ?? ''}</div>
                  <div className="truncate pl-1 text-left" title={bName}>{bName}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* classifica */}
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
                {standings.map((r,i)=>(
                  <tr key={`st-${r.idx}-${i}`} className="border-t border-neutral-800">
                    <td className="py-1">{i+1}</td>
                    <td className="truncate">{r.name}</td>
                    <td className="text-right">{r.W}</td>
                    <td className="text-right">{r.PF}</td>
                    <td className="text-right">{r.PS}</td>
                    <td className="text-right">{(r.QP||0).toFixed(3).replace(/\.?0+$/,'')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ============== Pagina atleta: Tabellone finale (read-only) ============== */

export default function AthleteTabellonePage() {
  const params = useParams() as { tour?: string }
  const tourId = params?.tour || ''
  const q = useSearchParams()

  // 🛡️ SSR-safe: niente localStorage nel render
  const [tId, setTId] = useState<string>('')
  const [tname, setTname] = useState<string>('Tabellone finale')

  useEffect(() => {
    const qTid = q.get('tid')
    const qName = q.get('tname')

    if (qTid) {
      setTId(qTid)
      if (typeof window !== 'undefined') localStorage.setItem('selectedTournamentId', qTid)
    } else if (typeof window !== 'undefined') {
      setTId(localStorage.getItem('selectedTournamentId') || '')
    }

    if (qName) {
      const decoded = decodeURIComponent(qName)
      setTname(decoded)
      if (typeof window !== 'undefined' && (qTid || tId)) {
        localStorage.setItem(`tournamentTitle:${qTid || tId}`, decoded)
      }
    } else if (typeof window !== 'undefined') {
      const fromLS = localStorage.getItem(`tournamentTitle:${qTid || tId}`)
      if (fromLS) setTname(fromLS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // blocco visibilità: mostra il tabellone solo quando i gironi sono confermati
  const [groupsConfirmed, setGroupsConfirmed] = useState<boolean>(false)
  const [isPublic, setIsPublic] = useState<boolean>(false)
const [publicGroups, setPublicGroups] = useState<PublicPersist | null>(null)

  const [brackets, setBrackets] = useState<BracketType[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [winnersById, setWinnersById] = useState<Record<string, WinnerMap>>({})
  const [itaScoresById, setItaScoresById] = useState<Record<string, ItaScore[]>>({})

  useEffect(() => {
    let cancelled = false
    if (!tId) { setGroupsConfirmed(false); return }
    ;(async () => {
      try {
        const r = await fetch(`/api/groups/state?tournament_id=${encodeURIComponent(tId)}`, {
          headers: { 'x-role': 'admin' }, cache: 'no-store'
        })
        const js = await r.json()
        if (cancelled) return
        const st = js?.state || {}
        setGroupsConfirmed(!!st.groupsConfirmed)
      } catch {
        if (!cancelled) setGroupsConfirmed(false)
      }
    })()
    return () => { cancelled = true }
  }, [tId])

  useEffect(() => {
    let cancelled = false
    if (!tId) { setBrackets([]); setActiveId(null); setWinnersById({}); setItaScoresById({}); setIsPublic(false); return }

    ;(async () => {
      try {
        const r = await fetch(`/api/brackets/state?tournament_id=${encodeURIComponent(tId)}`, {
          headers: { 'x-role': 'admin' },
          cache: 'no-store',
        })
        const js = await r.json()
        const raw = js?.state

        const items   = Array.isArray(raw) ? raw : (raw?.items || [])
        const winners = Array.isArray(raw) ? {}   : (raw?.winnersById   || {})
        const ita     = Array.isArray(raw) ? {}   : (raw?.itaScoresById || {})

        const normalized = items.map(normalizeBracket)

        if (cancelled) return
        setBrackets(normalized)
        setActiveId(normalized[0]?.id ?? null)
        setWinnersById(winners)
        setItaScoresById(ita)
        setIsPublic(Boolean(js?.is_public))
      } catch {
        if (cancelled) return
        setBrackets([]); setActiveId(null); setWinnersById({}); setItaScoresById({}); setIsPublic(false)
      }
    })()

    return () => { cancelled = true }
  }, [tId])
useEffect(() => {
  let cancelled = false
  if (!tId) { setPublicGroups(null); return }
  ;(async () => {
    try {
      const r = await fetch(`/api/groups/public/state?tournament_id=${encodeURIComponent(tId)}`, { cache: 'no-store' })
      const js = await r.json()
      if (!cancelled) setPublicGroups(js?.state ?? null)
    } catch {
      if (!cancelled) setPublicGroups(null)
    }
  })()
  return () => { cancelled = true }
}, [tId])

  // resolver per Vincente/Perdente e nomi
  const external = useMemo(() => makeExternalResolver(brackets, winnersById), [brackets, winnersById])
 const resolve  = useMemo(() => makeSlotResolver(tourId, tId, external, publicGroups), [tourId, tId, external, publicGroups])


  const active = useMemo(
    () => brackets.find((b) => b.id === activeId) || null,
    [activeId, brackets]
  )
const resolvedActive = useMemo(() => {
  if (!active) return null
  return {
    ...active,
    r1: (active.r1 || []).map(m => ({
      A: resolve(m.A),
      B: resolve(m.B),
    })),
    slots: (active.slots || []).map(s => resolve(s)),
  }
}, [active, resolve])

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1400px] py-6 space-y-6">
        {/* header */}
        <div className="flex items-center gap-2">
          <Link className="btn btn-ghost btn-sm" href="/atleta/tornei">← Tornei attivi</Link>
          <Link className="btn btn-ghost btn-sm" href="/atleta/classifica">Classifica generale</Link>
          <div className="mx-auto text-2xl md:text-3xl font-semibold text-center">{tname || 'Tabellone finale'}</div>
        </div>

        {!tId ? (
          <div className="card p-6 text-sm text-neutral-400">
            Seleziona una tappa dalla pagina <Link className="link" href="/atleta/tornei">Tornei attivi</Link>.
          </div>
        ) : !groupsConfirmed && !isPublic ? (
          <div className="card p-6 text-sm text-neutral-400">
            Il tabellone non è ancora visibile. Sarà mostrato quando gli organizzatori confermano i risultati dei gironi o lo rendono pubblico.
          </div>
        ) : !brackets.length ? (
          <div className="card p-6 text-sm text-neutral-400">Nessun tabellone disponibile per questa tappa.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            {/* tabs dei tabelloni */}
            <div className="p-3 flex flex-wrap gap-2 border-b border-neutral-800">
              {brackets.map((b, i) => (
                <button
                  key={b.id}
                  className={`btn ${b.id === activeId ? '' : 'opacity-80'}`}
                  onClick={() => setActiveId(b.id)}
                  title={b.title}
                  style={b.id === activeId ? { outline: `2px solid ${b.color}`, outlineOffset: 2 } : {}}
                >
                  {b.title}
                  <span className="ml-2 text-[10px] opacity-60">L{i + 1}</span>
                  {i === 0 && <span className="ml-1">👑</span>}
                </button>
              ))}
            </div>

            {/* contenuto */}
            <div className="p-4">
         {resolvedActive && (
  String(resolvedActive.type).toUpperCase() === 'ITA' ? (
    <ItaViewer
      bracket={resolvedActive}
      tourId={tourId}
      tId={tId}
      resolve={resolve}
      serverScores={itaScoresById[resolvedActive.id]}
    />
  ) : (
    <BracketCanvas
      bracket={resolvedActive}
      interactive={false}
      confirmOnPick={false}
      winners={winnersById[resolvedActive.id] || {}}
      onWinnersChange={() => {}}
      tourId={tourId}
      tId={tId}
      externalResolver={external}
    />
  )
)}
