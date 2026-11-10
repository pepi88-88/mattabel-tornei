// app/atleta/classifica/ClassificaInner.tsx
'use client'

import * as React from 'react'
import useSWR from 'swr'

type Gender  = 'M' | 'F'
type Edition = { id: string; name: string }
type Player  = { player_id: string; display_name: string }
type Stage   = { id: string; name: string; day: number; month: number; multiplier: number; total_teams: number }

/** Legenda (curva) unica globale */
type ScoreCfg = { base:number; minLast:number; curvePercent:number }
type ScoreCfgSet = { S:ScoreCfg; M:ScoreCfg; L:ScoreCfg; XL:ScoreCfg }

// fetch helper
const fetcher = (u: string) => fetch(u, { cache:'no-store' }).then(r => r.json()).catch(()=>null)

// curve default (fallback UI)
const DEFAULT_SET: ScoreCfgSet = {
  S:{ base:100, minLast:10, curvePercent:100 },
  M:{ base:100, minLast:10, curvePercent:100 },
  L:{ base:100, minLast:10, curvePercent:100 },
  XL:{ base:100, minLast:10, curvePercent:100 },
}

const pickBucket = (n:number): keyof ScoreCfgSet => (n<=8?'S':n<=16?'M':n<=32?'L':'XL')
const pointsOfBucket = (pos:number, total:number, mult:number, set:ScoreCfgSet) => {
  const cfg = set[pickBucket(total)]
  if (!pos || pos<1 || total<1) return 0
  if (total<=1) return Math.round(cfg.base * mult)
  const alpha = Math.max(0.01, cfg.curvePercent/100)
  const t = (total - pos) / (total - 1)
  const raw = cfg.minLast + (cfg.base - cfg.minLast) * Math.pow(t, alpha)
  return Math.round(raw * mult)
}

// NB: il backend usa tour_id fisso "GLOBAL"
const TOUR_ID = 'GLOBAL'
function rowPremiumClass(rank: number) {
  if (rank === 1) {
    return [
      'bg-[linear-gradient(90deg,rgba(255,145,0,0.38)_0%,rgba(255,145,0,0.20)_22%,rgba(255,145,0,0.08)_55%,rgba(0,0,0,0)_100%)]',
      'border-t border-orange-400/60',
      'shadow-[inset_0_1px_0_rgba(255,190,92,0.35)]',
    ].join(' ')
  }

  if (rank >= 2 && rank <= 8) {
    return [
      'bg-[linear-gradient(90deg,rgba(0,122,255,0.30)_0%,rgba(0,122,255,0.16)_24%,rgba(0,122,255,0.06)_55%,rgba(0,0,0,0)_100%)]',
      'border-t border-sky-500/30',
      'shadow-[inset_0_1px_0_rgba(125,190,255,0.10)]',
    ].join(' ')
  }

  return 'border-t border-neutral-800'
}

function totalCellClass(rank: number) {
  if (rank === 1) return 'text-orange-300'
  if (rank >= 2 && rank <= 8) return 'text-sky-300'
  return 'text-white'
}

function rankBadgeClass(rank: number) {
  if (rank === 1) {
    return 'bg-orange-500/20 text-orange-200 border border-orange-400/40'
  }
  if (rank >= 2 && rank <= 8) {
    return 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
  }
  return 'bg-neutral-800 text-neutral-200 border border-neutral-700'
}
/** Gas stagionale: rapporto fra punti conquistati e massimo possibile
 * nelle sole tappe disputate. Il moltiplicatore e la legenda sono già
 * inclusi nei puntiOfBucket, quindi la percentuale è equa tra le tappe.
 */
function GasThermometer({ percentage }: { percentage: number | null }) {
  const value = percentage == null ? 0 : Math.min(100, Math.max(0, percentage))
  const color = value < 20 ? '#701313' :
                value < 40 ? '#a11b22' :
                value < 60 ? '#cc2830' :
                value < 80 ? '#ef4444' : '#ff7373'
  return (
    <div className="inline-flex items-center gap-2 min-w-[145px]"
      title={percentage == null ? 'Nessuna tappa disputata' : `Gas: ${percentage}% del massimo ottenibile nelle tappe disputate`}>
      <div className="relative flex-1 h-3 rounded-full border border-red-950 bg-neutral-800/90 min-w-[90px]" aria-hidden="true">
        <span className="absolute inset-y-[1px] left-[1px] rounded-full transition-[width] duration-300"
          style={{ width: `calc((100% - 2px) * ${value / 100})`, backgroundColor: color }} />
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/3 rounded-full w-4 h-4 border border-red-900/80 shadow-[0_0_0_2px_rgba(15,15,15,0.9)]"
          style={{ backgroundColor: color }} />
      </div>
      <span className="w-11 text-right text-xs font-bold tabular-nums text-red-200">
        {percentage == null ? '—' : `${percentage}%`}
      </span>
    </div>
  )
}

export default function ClassificaInner() {
  const [showStageColumns, setShowStageColumns] = React.useState(false)
  // Zoom specifico della classifica, non del sito: resta invariato
  // quando si sollevano le dita e al successivo accesso dal telefono.
  const [mobileZoom, setMobileZoom] = React.useState(0.65)
  const rankingTouchRef = React.useRef<HTMLDivElement>(null)
  const pinchStartRef = React.useRef<{distance:number; zoom:number} | null>(null)
  const clampZoom = React.useCallback((n:number)=>Math.min(1.5, Math.max(0.35, Math.round(n*100)/100)),[])

  React.useEffect(()=>{
    try {
      const saved=Number(localStorage.getItem('ath:rankingZoom'))
      if (saved && Number.isFinite(saved)) setMobileZoom(clampZoom(saved))
    } catch {}
  },[clampZoom])
  React.useEffect(()=>{
    try { localStorage.setItem('ath:rankingZoom', String(mobileZoom)) } catch {}
  },[mobileZoom])
  React.useEffect(()=>{
    const el=rankingTouchRef.current
    if (!el) return
    const distance=(touches:TouchList)=>Math.hypot(
      touches[0].clientX-touches[1].clientX,
      touches[0].clientY-touches[1].clientY
    )
    const start=(event:TouchEvent)=>{
      if(event.touches.length===2) pinchStartRef.current={distance:distance(event.touches), zoom:mobileZoom}
    }
    const move=(event:TouchEvent)=>{
      const start=pinchStartRef.current
      if(!start || event.touches.length!==2 || start.distance<=0) return
      event.preventDefault()
      setMobileZoom(clampZoom(start.zoom*distance(event.touches)/start.distance))
    }
    const end=(event:TouchEvent)=>{
      if(event.touches.length<2) pinchStartRef.current=null
    }
    el.addEventListener('touchstart',start,{passive:true})
    el.addEventListener('touchmove',move,{passive:false})
    el.addEventListener('touchend',end)
    el.addEventListener('touchcancel',end)
    return ()=>{
      el.removeEventListener('touchstart',start)
      el.removeEventListener('touchmove',move)
      el.removeEventListener('touchend',end)
      el.removeEventListener('touchcancel',end)
    }
  },[mobileZoom,clampZoom])
  const [gender, setGender] = React.useState<Gender>(() =>
    ((typeof window !== 'undefined' && (localStorage.getItem('ath:lastGender') as Gender|null)) || 'M')
  )
  React.useEffect(()=>{ if (typeof window!=='undefined') localStorage.setItem('ath:lastGender', gender) },[gender])

  // --- Legenda (curva unica) ---
  const { data: legendRes } = useSWR('/api/ranking/legend-curve', fetcher, { revalidateOnFocus:false })
  const legendSet: ScoreCfgSet = legendRes?.settings ?? DEFAULT_SET

  // --- Edizioni per GENERE ---
  const { data: edRes } = useSWR(
    `/api/ranking/editions?tour_id=${encodeURIComponent(TOUR_ID)}&gender=${gender}`,
    fetcher, { revalidateOnFocus:false }
  )
  const editions: Edition[] = edRes?.items ?? []

  const [editionId, setEditionId] = React.useState('')

  // ogni volta che cambiano GENERE o LISTA edizioni => punta alla PRIMA
  React.useEffect(()=>{
    if (editions.length) {
      setEditionId(editions[0].id)
    } else {
      setEditionId('')
    }
  }, [gender, editions.map(e=>e.id).join(',')])

  // --- Dati dell’edizione selezionata ---
  const { data: plRes } = useSWR(
    editionId ? `/api/ranking/players?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const players: Player[] = plRes?.items ?? []

  const { data: stRes } = useSWR(
    editionId ? `/api/ranking/stages?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )
  const stages: Stage[] = stRes?.items ?? []

  // risultati salvati (posizioni per (stage,player))
  const { data: resRes } = useSWR(
    editionId ? `/api/ranking/stages/results?edition_id=${editionId}` : null, fetcher, { revalidateOnFocus:false }
  )

  // mappa veloce: stageId -> (playerId -> posizione)
  const placementsByStage = React.useMemo(()=>{
    const m: Record<string, Record<string, number>> = {}
    const items: Array<{stage_id:string; player_id:string; position:number}> = resRes?.items || []
    for (const it of items) {
      if (!m[it.stage_id]) m[it.stage_id] = {}
      m[it.stage_id][it.player_id] = Number(it.position)
    }
    return m
  }, [resRes?.items ? JSON.stringify(resRes.items) : ''])

  // --- calcolo totale per player in base alla curva e alle tappe ---
  const pointsForPlayer = React.useCallback((pid: string) => {
    let sum = 0
    for (const st of stages) {
      const pos = placementsByStage[st.id]?.[pid] ?? 0
      if (pos>0) {
        sum += pointsOfBucket(
          pos,
          Number(st.total_teams || 0),
          Number(st.multiplier || 1),
          legendSet
        )
      }
    }
    return sum
  }, [stages, placementsByStage, legendSet])

  // Gas = punti accumulati / punti massimi delle tappe realmente disputate.
  // Non penalizziamo chi non ha partecipato alle altre tappe.
  const gasForPlayer = React.useCallback((pid: string) => {
    let participated = 0
    let possible = 0
    let earned = 0
    for (const st of stages) {
      const pos = placementsByStage[st.id]?.[pid] ?? 0
      const total = Number(st.total_teams || 0)
      if (!Number.isFinite(pos) || pos < 1 || total < 1 || pos > total) continue
      const mult = Number(st.multiplier || 1)
      participated++
      earned += pointsOfBucket(pos, total, mult, legendSet)
      possible += pointsOfBucket(1, total, mult, legendSet)
    }
    return {
      stagesPlayed: participated,
      gas: possible > 0 ? Math.round(Math.min(100, Math.max(0, earned / possible * 100))) : null,
    }
  }, [stages, placementsByStage, legendSet])

  // ordinamento: totale desc, miglior piazzamento asc, nome asc
  const rows = React.useMemo(()=>{
    const bestPlacementOf = (pid:string) => {
      let best = Infinity
      for (const st of stages) {
        const p = placementsByStage[st.id]?.[pid]
        if (p && p < best) best = p
      }
      return best
    }

    const out = players.map(p => ({
      player_id: p.player_id,
      name: p.display_name,
      total: pointsForPlayer(p.player_id),
      best: bestPlacementOf(p.player_id),
      ...gasForPlayer(p.player_id)
    }))
    out.sort((a,b)=>{
      const t = b.total - a.total
      if (t) return t
      if (a.best !== b.best) return a.best - b.best
      return a.name.localeCompare(b.name, 'it')
    })
    return out
  }, [players, stages, placementsByStage, pointsForPlayer, gasForPlayer])

  

  // ------------------------ RENDER ------------------------
  return (
    <div className="px-3 py-5 sm:p-6">
      <div className={`mx-auto w-full space-y-5 ${showStageColumns ? 'max-w-[1400px]' : 'max-w-[900px]'}`}>
      {/* Filtri e classifica condividono lo stesso contenitore centrato. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl overflow-hidden border border-neutral-700">
          <button
            className={`px-3 py-2 text-sm ${gender==='M'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`}
            onClick={()=>setGender('M')}
          >
            Maschile
          </button>
          <button
            className={`px-3 py-2 text-sm ${gender==='F'?'bg-neutral-800 text-white':'bg-neutral-900 text-neutral-300'}`}
            onClick={()=>setGender('F')}
          >
            Femminile
          </button>
        </div>
        <select className="input w-full sm:w-80 max-w-full" value={editionId} onChange={e=>setEditionId(e.target.value)}>
          {editions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

           {/* Card classifica */}
      <div className="card p-0 overflow-hidden w-full">
        <div className="px-4 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-950/60">
          <div className="text-base font-semibold tracking-wide">Classifica</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="sm:hidden flex items-center gap-1" aria-label="Zoom classifica">
              <button type="button" className="btn btn-xs" aria-label="Riduci zoom della classifica"
                onClick={()=>setMobileZoom(v=>clampZoom(v-0.1))}>−</button>
              <span className="min-w-[45px] text-center text-xs tabular-nums text-neutral-300">{Math.round(mobileZoom*100)}%</span>
              <button type="button" className="btn btn-xs" aria-label="Aumenta zoom della classifica"
                onClick={()=>setMobileZoom(v=>clampZoom(v+0.1))}>+</button>
            </div>
          <button type="button" className="btn btn-sm btn-outline"
            onClick={() => setShowStageColumns(value => !value)}
            aria-expanded={showStageColumns}>
            {showStageColumns ? 'Nascondi punti delle tappe' : 'Mostra punti delle tappe'}
          </button>
          </div>
        </div>

        {/* Una sola tabella, con gli stessi allineamenti su PC e cellulare.
            Sul telefono si può pizzicare per cambiare zoom, senza ritorno automatico. */}
        <div ref={rankingTouchRef} className="p-2 sm:p-4 overflow-x-auto">
          <div className="ranking-mobile-zoom" style={{'--ranking-zoom':mobileZoom} as React.CSSProperties}>
          <table className="w-full text-sm">
           <thead className="text-xs uppercase">
              <tr>
                <th className="text-left w-12">#</th>
                <th className="text-left">Giocatore</th>
                <th className="text-right w-28 pr-4">Totale</th>

                {!showStageColumns && <>
                  <th className="text-center w-20">Tappe</th>
                  <th className="text-center w-[190px] min-w-[190px]">Gas</th>
                </>}
                {showStageColumns && stages.map((st, idx)=>(
                 <th key={st.id} className={`min-w-[120px] align-bottom border-l border-neutral-800`}>
                    <div className="flex flex-col items-center gap-1 py-1">
                      <div className="font-medium">{st.name}</div>
                      <div className="text-xs text-neutral-400">
                        {String(st.day).padStart(2,'0')}/{String(st.month).padStart(2,'0')}
                      </div>
                      <div className="text-[11px] text-neutral-500">x{Number(st.multiplier).toFixed(2)} · {st.total_teams} sq</div>
                    </div>
                  </th>
                ))}
              </tr>
              {showStageColumns && stages.length>0 && (
                <tr className="text-neutral-400">
                  <th /><th /><th />
                  {stages.map(st=>(
                    <th key={st.id} className="py-1 border-l border-neutral-800">
                      <div className="grid grid-cols-2 w-24 mx-auto">
                        <span className="text-left">POS</span>
                        <span className="text-right">PTS</span>
                      </div>
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            <tbody>
             {rows.map((r, i)=>(
  <tr key={r.player_id} className={rowPremiumClass(i + 1)}>
    <td className="py-2">
      <span
        className={`inline-flex min-w-[28px] h-7 items-center justify-center rounded-md text-sm font-semibold tabular-nums ${rankBadgeClass(i + 1)}`}
      >
        {i + 1}
      </span>
    </td>

    <td className="py-2 whitespace-nowrap max-w-[240px] truncate font-medium" title={r.name}>
      {r.name}
    </td>

    <td className={`py-2 text-right font-extrabold pr-4 tabular-nums ${totalCellClass(i + 1)}`}>
      {new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(r.total)}
    </td>

                  {!showStageColumns && <>
                    <td className="py-2 text-center tabular-nums">{r.stagesPlayed}</td>
                    <td className="py-2 px-3"><div className="flex justify-center"><GasThermometer percentage={r.gas} /></div></td>
                  </>}
                  {showStageColumns && stages.map((st, idx2)=>{
                    const pos = placementsByStage[st.id]?.[r.player_id] ?? 0
                    const pts = pos ? pointsOfBucket(pos, Number(st.total_teams||0), Number(st.multiplier||1), legendSet) : 0
                    return (
                     <td
  key={`${st.id}-${r.player_id}`}
  className={`py-2 ${idx2 > 0 ? 'border-l border-neutral-800/80' : ''}`}
>
  <div className="grid grid-cols-2 items-center w-24 mx-auto">
    <div className="w-12 tabular-nums text-left text-neutral-200">{pos || '—'}</div>
    <div className="w-12 tabular-nums text-right text-neutral-100">{pts ? pts : '—'}</div>
  </div>
</td>
                    )
                  })}
                </tr>
              ))}

              {rows.length===0 && (
                <tr>
                  <td colSpan={3 + (showStageColumns ? stages.length : 2)} className="py-4 text-center text-neutral-500">
                    Nessun dato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

      </div>
      </div>
    </div>
  )
}
