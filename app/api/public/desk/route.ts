import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RegiaMatch = {
  key: string
  court: number | null
  sequence: number | null
  status: string
  scheduledTime: string
  phase: string
  teamA: string
  teamB: string
}

const isOpen = (t: any) =>
  !t.archived && !['closed','archived','finished','completed'].includes(String(t.status || '').toLowerCase().trim())

function groupSchedule(cap: number, format: string): Array<[number,number]> {
  if (format !== 'ita' && cap === 4) return [[1,4],[2,3],[0,0],[0,0]]
  const t = Array.from({length:Math.min(24,Math.max(0,cap))},(_,i)=>i+1)
  if(t.length < 2) return []
  if(t.length % 2) t.push(0)
  const out: Array<[number,number]> = []
  for(let r=0;r<t.length-1;r++){
    for(let i=0;i<t.length/2;i++) {
      const a=t[i],b=t[t.length-1-i]
      if(a && b) out.push([a,b])
    }
    const rest=t.slice(1);rest.unshift(rest.pop()!);t.splice(1,t.length-1,...rest)
  }
  return out
}

function safeName(raw: any) {
  const name = String(raw || '').trim()
  return name && name !== '-' ? name : 'Da definire'
}
function phaseOf(code: string, title: string) {
  if (code === 'F') return 'Finale · ' + title
  if (code === 'THIRD') return '3° / 4° posto · ' + title
  if (/^P\d+$/.test(code)) return 'Preliminari · ' + title
  if (/^R\d+$/.test(code)) return 'Primo turno · ' + title
  if (/^(CO|Y|Z)\d+/.test(code)) return 'Fase finale · ' + title
  if (/^(X|Q|W)\d+/.test(code)) return 'Ripescaggio · ' + title
  return title
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const {data: all, error} = await sb.from('tournaments')
      .select('*')
      .order('event_date',{ascending:true})
    if(error) throw error
    const open = (all || []).filter(isOpen).slice(0,24)
    if(!open.length) return NextResponse.json({items:[]},{headers:{'Cache-Control':'no-store'}})
    const ids = open.map(t=>t.id)
    const [groupsResult, bracketsResult] = await Promise.all([
      sb.from('group_states').select('tournament_id,state,is_public').in('tournament_id',ids),
      sb.from('bracket_states').select('tournament_id,state,is_public').in('tournament_id',ids),
    ])
    // Match details can be unavailable without hiding the open-tournament list.
    // The public display must still let the desk operator select a tournament.
    const groups = new Map((groupsResult.error ? [] : groupsResult.data || []).map(x=>[x.tournament_id,x]))
    const brackets = new Map((bracketsResult.error ? [] : bracketsResult.data || []).map(x=>[x.tournament_id,x]))
    const items = open.map(t=>{
      const g = groups.get(t.id)
      const b = brackets.get(t.id)
      const gs: any = g?.state || {}
      const bs: any = b?.state || {}
      const showGroups = Boolean(g?.is_public || gs.isPublic)
      const showBracket = Boolean(b?.is_public)
      const matches: RegiaMatch[] = []
      if (showGroups) {
        const regia = gs.regia?.items || {}
        const groupsList = Object.keys(gs.meta || {}).sort()
        for (const L of groupsList) {
          const config = gs.meta?.[L] || {}
          const pairs = groupSchedule(Number(config.capacity || 0),String(config.format || 'pool').toLowerCase())
          pairs.forEach(([a,b],idx)=>{
            const key = 'girone:'+L+':'+idx
            const state = regia[key] || {}
            const time = String(gs.times?.[L]?.[idx] || '')
            const court = state.court ?? (gs.matchFields?.[L]?.[idx] ? Number(gs.matchFields[L][idx]) : null)
            if (!time && !court && state.status !== 'live' && state.status !== 'queued') return
            const name = (slot:number) => {
              if(!slot) return 'Vincente / Perdente'
              const rid = gs.assign?.[L+'-'+slot]
              return safeName(rid ? gs.labels?.[rid] : null)
            }
            matches.push({
              key,
              court:Number(court)>0?Number(court):null,
              sequence:state.sequence ?? null,
              status:String(state.status || 'waiting'),
              scheduledTime:time,
              phase:'Girone '+L,
              teamA:name(a),
              teamB:name(b),
            })
          })
        }
      }
      if(showBracket) {
        const regia = bs.regia?.items || {}
        const bracketList = Array.isArray(bs.items)?bs.items:[]
        for(const item of bracketList){
          const prefix = 'bracket:'+item.id+':'
          for(const [key,state] of Object.entries(regia) as [string,any][]){
            if(!key.startsWith(prefix))continue
            const code=key.slice(prefix.length)
            const scheduledTime=String(state?.scheduledTimeManual || '')
            if (!scheduledTime && !state?.court && state?.status !== 'live' && state?.status !== 'queued')continue
            let nameA = 'Da definire', nameB = 'Da definire'
            const r1=code.match(/^R(\d+)$/)
            if (r1 && item.type === 'SE') {
              const pair=item.r1?.[Number(r1[1])-1]
              if(pair) { nameA=safeName(pair.A);nameB=safeName(pair.B) }
            }
            matches.push({
              key,
              court:Number(state?.court)>0?Number(state.court):null,
              sequence:state?.sequence ?? null,
              status:String(state?.status || 'waiting'),
              scheduledTime,
              phase:phaseOf(code,String(item.title || 'Tabellone')),
              teamA:nameA,teamB:nameB,
            })
          }
        }
      }
      const active = matches.filter(m=>m.status!=='done' && m.status!=='paused')
      const ongoing = active.filter(m=>m.status==='live').sort((a,b)=>(a.court||99)-(b.court||99))
      const upcoming = active.filter(m=>m.status!=='live').sort((a,b)=>{
        const ta=/^\d{1,2}:\d{2}/.test(a.scheduledTime)?a.scheduledTime:'99:99'
        const tb=/^\d{1,2}:\d{2}/.test(b.scheduledTime)?b.scheduledTime:'99:99'
        return ta.localeCompare(tb)||(a.court??99)-(b.court??99)||(a.sequence??99)-(b.sequence??99)
      })
      return {
        id:String(t.id),name:String(t.name||t.title||'Torneo'),
        date:t.event_date || null, groupsPublic:showGroups, bracketsPublic:showBracket,
        live:ongoing.slice(0,6),next:upcoming.slice(0,12),
      }
    })
    return NextResponse.json({items,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store, max-age=0'}})
  } catch(e:any){
    return NextResponse.json({error:String(e?.message||e)},{status:500,headers:{'Cache-Control':'no-store'}})
  }
}
