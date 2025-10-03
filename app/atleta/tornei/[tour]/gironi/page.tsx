'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

/* === palette / util === */
const LETTERS = 'ABCDEFGHIJKLMNOP'.split('')
const COLORS: Record<string, string> = {
  A:'#2563EB', B:'#EF4444', C:'#F59E0B', D:'#8B5CF6',
  E:'#10B981', F:'#FB923C', G:'#06B6D4', H:'#8B5CF6',
  I:'#22C55E', J:'#F97316', K:'#0EA5E9', L:'#EAB308',
  M:'#84CC16', N:'#F43F5E', O:'#14B8A6', P:'#64748B',
}
const colorFor = (L: string) => COLORS[L] ?? '#334155'
const chunk = <T,>(a:T[], n:number) => { const o:T[][]=[]; for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n)); return o }

/* === tipi === */
type Meta   = { capacity: number; format: 'pool'|'ita' }
type Score  = { a?: string|number; b?: string|number }
type Persist = {
  groupsCount: number
  meta:   Record<string, Meta>
  assign: Record<string, string>
  times:  Record<string, string[]>
  gField: Record<string, string>
  scores: Record<string, Score[]>
  labels: Record<string, string>
}
type PublicState = { is_public: boolean; state?: Persist | null }

/* === RR helpers === */
function rr(n: number){
  const t = Array.from({length:n},(_,i)=>i+1)
  if (t.length < 2) return [] as Array<[number,number]>
  if (t.length % 2 === 1) t.push(0)
  const rounds = t.length-1, half=t.length/2, out:Array<[number,number]>= []
  for(let r=0;r<rounds;r++){
    for(let i=0;i<half;i++){ const a=t[i], b=t[t.length-1-i]; if(a&&b) out.push([a,b]) }
    const f=t[0], rest=t.slice(1); rest.unshift(rest.pop()!); t.splice(0,t.length,f,...rest)
  }
  return out
}
function scheduleRows(L:string, data: Persist){
  const m = data?.meta?.[L] ?? {capacity:0, format:'pool' as const}
  const cap = m.capacity ?? 0
  if (cap < 2) return [] as {t1:string,t2:string}[]
  if (m.format === 'pool' && cap === 4){
    const p = { r1:[[1,4],[2,3]] as Array<[number,number]> }
    return [
      { t1: labelBySlot(data,L,p.r1[0][0]), t2: labelBySlot(data,L,p.r1[0][1]) },
      { t1: labelBySlot(data,L,p.r1[1][0]), t2: labelBySlot(data,L,p.r1[1][1]) },
      { t1: 'Vincente G1', t2: 'Vincente G2' },
      { t1: 'Perdente G1', t2: 'Perdente G2' },
    ]
  }
  return rr(Math.min(cap,6)).map(([a,b])=>({t1:labelBySlot(data,L,a), t2:labelBySlot(data,L,b)}))
}
function labelBySlot(data: Persist, L:string, slot:number){
  const rid = data?.assign?.[`${L}-${slot}`]
  return rid ? (data?.labels?.[rid] ?? `Slot ${slot}`) : `Slot ${slot}`
}

export default function AthleteGironiPage(){
  const params = useSearchParams()
  const tId   = params.get('tid') || (typeof window!=='undefined' ? localStorage.getItem('selectedTournamentId') : '') || ''

  // Titolo SOLO cosmetico (OK usare localStorage)
  const [title, setTitle] = React.useState<string>('')
  React.useEffect(() => {
    if (!tId) { setTitle(''); return }
    const tn = params.get('tname')
    if (tn) { setTitle(decodeURIComponent(tn)); return }
    const fromTourPage = (typeof window!=='undefined') ? localStorage.getItem(`tournamentTitle:${tId}`) : ''
    setTitle(fromTourPage || '')
  }, [tId, params])

  // Stato pubblico dal SERVER (nessun fallback su localStorage)
  const [pub, setPub] = React.useState<PublicState>({ is_public:false, state:null })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string>('')

  React.useEffect(()=> {
    let alive = true
    if (!tId) { setPub({is_public:false, state:null}); return }
    setLoading(true); setError('')
    fetch(`/api/groups/public/state?tournament_id=${encodeURIComponent(tId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((js:PublicState) => { if (alive) setPub({ is_public: !!js?.is_public, state: js?.state ?? null }) })
      .catch(()=> { if (alive) setError('Errore caricamento dati') })
      .finally(()=> { if (alive) setLoading(false) })
    return ()=> { alive=false }
  }, [tId])

  if (!tId) return <div className="p-6 max-w-[1400px] mx-auto">Tappa non valida.</div>

  const data = pub.state || null
  const letters = React.useMemo(()=> LETTERS.slice(0, Math.max(1, data?.groupsCount || 0)), [data?.groupsCount])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="text-2xl md:text-3xl font-semibold text-center mb-4">{title || 'Gironi'}</div>

      {loading ? (
        <div className="card p-4 text-sm text-neutral-400">Carico…</div>
      ) : error ? (
        <div className="card p-4 text-sm text-red-400">{error}</div>
      ) : !pub.is_public ? (
        <div className="card p-4 text-sm">I gironi non sono ancora visibili. Verranno mostrati quando gli organizzatori li renderanno pubblici.</div>
      ) : !data ? (
        <div className="card p-4 text-sm text-neutral-400">Nessun dato disponibile.</div>
      ) : (
        <div className="space-y-6">
          {/* Griglie gironi */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {letters.map(L=>{
              const m = data.meta?.[L] ?? {capacity:0, format:'pool' as const}
              const cap = m.capacity ?? 0
              return (
                <div key={L} className="card p-0 overflow-hidden">
                  <div className="px-3 py-2 text-white" style={{background:colorFor(L)}}>
                    <div className="flex items-center gap-3">
                      <div className="text-base font-extrabold tracking-wide">GIRONE {L}</div>
                      <div className="text-xs opacity-90"># {cap}</div>
                      <div className="text-xs opacity-90 uppercase">{m.format}</div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {cap<1 ? (
                      <div className="text-xs text-neutral-500">Nessuna squadra.</div>
                    ) : Array.from({length:cap},(_,k)=>k+1).map(slot=>(
                      <div key={`${L}-${slot}`} className="flex items-center gap-2">
                        <div className="w-5 text-xs text-neutral-500">{slot}.</div>
                        <div className="input w-full bg-neutral-900/60">{labelBySlot(data,L,slot)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Partite */}
          <div className="space-y-4">
            {chunk(letters, 2).map((pair,i)=>(
              <div key={i} className="grid gap-4" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
                {pair.map(L=>{
                  const rows = scheduleRows(L, data)
                  return (
                    <div key={L} className="card p-0 overflow-hidden">
                      <div className="h-9 px-3 flex items-center justify-between text-white" style={{background:colorFor(L)}}>
                        <div className="text-sm font-semibold">Partite {L}</div>
                        <div className="text-xs opacity-90">Campo {data.gField?.[L] ?? '—'}</div>
                      </div>
                      <div className="p-3 space-y-2">
                        {rows.length===0 ? (
                          <div className="text-xs text-neutral-500">Nessuna partita.</div>
                        ) : rows.map((r,idx)=>(
                          <div key={idx} className="grid items-center"
                               style={{gridTemplateColumns:'72px minmax(0,1fr) 44px 16px 44px minmax(0,1fr)', columnGap:'.35rem'}}>
                            <div className="input h-8 pl-1 pr-0 text-sm tabular-nums">{(data.times?.[L]?.[idx] ?? '') || '—'}</div>
                            <div className="min-w-0 truncate whitespace-nowrap text-sm text-right">{r.t1}</div>
                            <div className="input h-8 w-12 px-1 text-sm text-center tabular-nums">{data.scores?.[L]?.[idx]?.a ?? ''}</div>
                            <div className="w-6 text-center text-[13px] text-neutral-400">vs</div>
                            <div className="input h-8 w-12 px-1 text-sm text-center tabular-nums">{data.scores?.[L]?.[idx]?.b ?? ''}</div>
                            <div className="min-w-0 truncate whitespace-nowrap text-sm pl-1">{r.t2}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
