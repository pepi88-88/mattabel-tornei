/** Avulsa ITA: positions in a named ITA bracket, not a second avulsa ranking.
 * Token stores the source bracket ID and its placement so standings remain live.
 */
export type ItaSourceBracket = {
  id: string
  title: string
  type: string
  nTeams: number
  slots?: string[]
}
export type ItaSourceScore = { a?: number | null; b?: number | null }
const PREFIX = 'ITA@'
export const itaPositionToken = (id: string, position: number) => `${PREFIX}${id}@${position}`
export function parseItaPositionToken(token: string): { id: string; position: number } | null {
  const match = String(token || '').trim().match(/^ITA@([^@]+)@(\d+)$/)
  if (!match) return null
  const position = Number(match[2])
  return Number.isSafeInteger(position) && position >= 1 ? { id: match[1], position } : null
}
export function itaPositionLabel(token: string, brackets: ItaSourceBracket[]): string {
  const pos = parseItaPositionToken(token)
  if (!pos) return token
  const from = brackets.find(b => b.id === pos.id && b.type === 'ITA')
  return `${pos.position}ª ${from?.title || 'ITA non trovato'}`
}
/** Same circle-method match ordering used by ItaEditor; BYE rounds are skipped. */
export function itaRoundRobinPairs(n: number): Array<[number, number]> {
  const t = Array.from({ length: Math.max(2, n) }, (_, i) => i + 1)
  if (t.length % 2) t.push(0)
  const out: Array<[number, number]> = []
  for (let r = 0; r < t.length - 1; r++) {
    for (let i = 0; i < t.length / 2; i++) {
      const a = t[i], b = t[t.length - 1 - i]
      if (a && b) out.push([a, b])
    }
    const fixed = t[0], rest = t.slice(1)
    rest.unshift(rest.pop()!)
    t.splice(0, t.length, fixed, ...rest)
  }
  return out
}
/** ITA source is final only when every scheduled match has two recorded scores.
 * An empty input must not count as 0-0, and all participant slots must be set.
 */
export function isItaStandingsComplete(
  bracket: ItaSourceBracket,
  scores: ItaSourceScore[] | undefined,
): boolean {
  if (bracket.type !== 'ITA') return false
  const n = Math.max(2, Number(bracket.nTeams) || 2)
  const slots = (bracket.slots || []).slice(0, n)
  if (slots.length !== n || slots.some(raw => {
    const value = String(raw || '').trim()
    return !value || value === '-' || value === '—' || value.toUpperCase() === 'BYE'
  })) return false
  const pairs = itaRoundRobinPairs(n)
  return pairs.length > 0 && pairs.every((_, i) => {
    const row = scores?.[i]
    if (!row || row.a === null || row.a === undefined ||
        row.b === null || row.b === undefined) return false
    // Some older saves use string values: '' is NOT a played score.
    const a = String(row.a).trim(), b = String(row.b).trim()
    return a !== '' && b !== '' && Number.isFinite(Number(a)) &&
      Number.isFinite(Number(b)) && Number(a) >= 0 && Number(b) >= 0
  })
}
/** Match ItaEditor ordering: wins, points ratio, points scored, name.
 * Never modifies results or standings stored elsewhere.
 */
export function rankedItaTeams(
  bracket: ItaSourceBracket,
  scores: ItaSourceScore[] | undefined,
  resolveBase: (token: string) => string,
): string[] {
  const n = Math.max(2, Number(bracket.nTeams) || 2)
  const rows = Array.from({ length: n }, (_, idx) => {
    const raw = String(bracket.slots?.[idx] || '').trim()
    const name = raw && raw !== '-' && raw !== '—' && raw.toUpperCase() !== 'BYE'
      ? resolveBase(raw) : ''
    return { idx: idx + 1, name, W: 0, PF: 0, PS: 0, QP: 0 }
  })
  itaRoundRobinPairs(n).forEach(([a, b], i) => {
    const score = scores?.[i]
    if (score?.a == null || score?.b == null) return
    const x = Number(score.a), y = Number(score.b)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    const A = rows[a - 1], B = rows[b - 1]
    A.PF += x; A.PS += y; B.PF += y; B.PS += x
    if (x > y) A.W++
    else if (y > x) B.W++
  })
  rows.forEach(row => { row.QP = row.PF / Math.max(1, row.PS) })
  rows.sort((a,b) =>
    b.W - a.W || b.QP - a.QP || b.PF - a.PF || a.name.localeCompare(b.name) || a.idx - b.idx
  )
  return rows.map(row => row.name)
}
export function resolveItaPosition(
  token: string,
  brackets: ItaSourceBracket[],
  scoresById: Record<string, ItaSourceScore[]>,
  resolveBase: (token: string) => string,
): string | undefined {
  const ref = parseItaPositionToken(token)
  if (!ref) return undefined
  const source = brackets.find(b => b.id === ref.id && b.type === 'ITA')
  if (!source || ref.position > source.nTeams) return '—'
  // No premature qualifiers: each referenced ITA unblocks independently.
  if (!isItaStandingsComplete(source, scoresById[source.id])) return '—'
  const name = rankedItaTeams(source, scoresById[source.id], resolveBase)[ref.position - 1]
  return name && name !== '—' ? name : '—'
}
