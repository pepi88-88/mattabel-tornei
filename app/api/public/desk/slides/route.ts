import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Score = { a?: string | number; b?: string | number }
type GroupMatch = {
  id: string; a: string; b: string; scores: Array<{a:string;b:string}>
  played: boolean; time: string; court: string
}
type Standing = {slot:number; name:string; wins:number; pf:number; ps:number; qp:number; sw:number; sl:number}
const visible = (t:any) => !t.archived &&
  !['closed','archived','finished','completed'].includes(String(t.status||'').trim().toLowerCase())

function rr(n:number): Array<[number,number]> {
  const t=Array.from({length:Math.min(24,Math.max(2,n))},(_,i)=>i+1)
  if(t.length%2)t.push(0)
  const out:Array<[number,number]>=[]
  for(let round=0;round<t.length-1;round++){
    for(let i=0;i<t.length/2;i++){
      const a=t[i],b=t[t.length-1-i]
      if(a&&b)out.push([a,b])
    }
    const rest=t.slice(1);rest.unshift(rest.pop()!);t.splice(1,t.length-1,...rest)
  }
  return out
}
function groupData(L:string,st:any) {
  const meta=st.meta?.[L]||{}
  const cap=Math.max(0,Math.min(24,Number(meta.capacity)||0))
  const bestOf=Number(meta.bestOf)===3?3:1
  const pool=meta.format==='pool'&&cap===4
  const pairs=pool?[[1,4],[2,3]]:rr(cap)
  const getName=(slot:number) => {
    const rid=st.assign?.[L+'-'+slot]
    return String((rid && st.labels?.[rid])||'Slot '+slot)
  }
  const names=Array.from({length:cap},(_,i)=>getName(i+1))
  const standings:Standing[]=names.map((name,i)=>({slot:i+1,name,wins:0,pf:0,ps:0,qp:0,sw:0,sl:0}))
  const outcomes:Array<{a:number;b:number;winner: number|null; loser:number|null}>=[]
  const scores:Score[]=st.scores?.[L]||[]
  const build=(a:number,b:number,idx:number,tag:string):GroupMatch=>{
    const sets=Array.from({length:bestOf},(_,si)=>{
      const sc=scores[idx*bestOf+si]
      return {a:sc?.a==null?'':String(sc.a),b:sc?.b==null?'':String(sc.b)}
    })
    let wa=0,wb=0
    for(const set of sets) {
      if(set.a===''||set.b==='')continue
      const pa=Number(set.a),pb=Number(set.b)
      if(!Number.isFinite(pa)||!Number.isFinite(pb)||pa===pb)continue
      if(pa>pb)wa++;else wb++
      if(a>0&&b>0){
        standings[a-1].pf+=pa;standings[a-1].ps+=pb
        standings[b-1].pf+=pb;standings[b-1].ps+=pa
        if(pa>pb){standings[a-1].sw++;standings[b-1].sl++}
        else {standings[b-1].sw++;standings[a-1].sl++}
      }
    }
    const decided=wa>bestOf/2||wb>bestOf/2
    const winner=decided?(wa>wb?a:b):null
    const loser=decided?(wa>wb?b:a):null
    if(winner&&standings[winner-1])standings[winner-1].wins++
    outcomes.push({a,b,winner,loser})
    const court=st.matchFields?.[L]?.[idx]??st.gField?.[L]??''
    return {
      id:tag,a:a>0?getName(a):tag==='F12'?'Vincente G1':'Perdente G1',
      b:b>0?getName(b):tag==='F12'?'Vincente G2':'Perdente G2',
      scores:sets,played:decided,
      time:String(st.times?.[L]?.[idx]||''),
      court:String(court||''),
    }
  }
  const matches:GroupMatch[]=[]
  if(pool) {
    for(let i=0;i<2;i++)matches.push(build(pairs[i][0],pairs[i][1],i,'G'+(i+1)))
    const first=outcomes[0],second=outcomes[1]
    matches.push(build(first?.winner||0,second?.winner||0,2,'F12'))
    matches.push(build(first?.loser||0,second?.loser||0,3,'F34'))
  } else {
    pairs.forEach(([a,b],i)=>matches.push(build(a,b,i,'P'+(i+1)))
  }
  const allPlayed=matches.length>0&&matches.every(m=>m.played)
  for(const s of standings)s.qp=s.ps>0?s.pf/s.ps:0
  standings.sort((a,b)=>{
    if(a.wins!==b.wins)return b.wins-a.wins
    if(a.sw!==b.sw || a.sl!==b.sl){
      const qa=a.sl? a.sw/a.sl : a.sw?999:0
      const qb=b.sl? b.sw/b.sl : b.sw?999:0
      if(qa!==qb)return qb-qa
    }
    if(a.qp!==b.qp)return b.qp-a.qp
    return a.slot-b.slot
  })
  if(pool&&outcomes[2]?.winner&&outcomes[2]?.loser&&outcomes[3]?.winner&&outcomes[3]?.loser) {
    const order=[outcomes[2].winner,outcomes[2].loser,outcomes[3].winner,outcomes[3].loser]
    standings.sort((a,b)=>order.indexOf(a.slot)-order.indexOf(b.slot))
  }
  return {letter:L,cap,format:meta.format||'pool',bestOf,complete:allPlayed,
    matches,standings,remaining:matches.filter(m=>!m.played).length}
}
function safeBracket(b:any,bs:any){
  return {
    id:String(b.id),title:String(b.title||'Tabellone'),
    color:String(b.color||'#f59e0b'),type:String(b.type||'SE'),
    nTeams:Number(b.nTeams)||8,source:String(b.source||'gironi'),
    r1:Array.isArray(b.r1)?b.r1:[],slots:Array.isArray(b.slots)?b.slots:[],
    prelims:Array.isArray(b.prelims)?b.prelims:[],
    winners:bs.winnersById?.[b.id]||{},
    scores:bs.bracketScoresById?.[b.id]||{},
    courts:bs.courtsByBracket?.[b.id]||{},
    itaScores:bs.itaScoresById?.[b.id]||[],
  }
}

export async function GET(){
  try{
    const sb=getSupabaseAdmin()
    const {data:tournaments,error}=await sb.from('tournaments')
      .select('*').order('event_date',{ascending:true})
    if(error)throw error
    const open=(tournaments||[]).filter(visible).slice(0,80)
    if(!open.length)return NextResponse.json({items:[],updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})
    const ids=open.map(t=>t.id)
    const [gr,br]=await Promise.all([
      sb.from('group_states').select('tournament_id,state,is_public').in('tournament_id',ids),
      sb.from('bracket_states').select('tournament_id,state,is_public').in('tournament_id',ids),
    ])
    // Missing or unpublished state never leaks private tournament data.
    const groups=new Map((gr.error?[]:gr.data||[]).map(x=>[x.tournament_id,x]))
    const brackets=new Map((br.error?[]:br.data||[]).map(x=>[x.tournament_id,x]))
    const items=open.map(t=>{
      const gd=groups.get(t.id),bd=brackets.get(t.id)
      const gs:any=gd?.state||{}, bs:any=bd?.state||{}
      const gPublic=Boolean(gd?.is_public||gs.isPublic)
      const bPublic=Boolean(bd?.is_public)
      const letters=gPublic?Object.keys(gs.meta||{})
        .filter(L=>Number(gs.meta?.[L]?.capacity)>1).sort():[]
      const groupSlides=letters.map(L=>groupData(L,gs))
      const groupsComplete=groupSlides.length>0&&groupSlides.every(g=>g.complete)
      const publishedBrackets=bPublic&&Array.isArray(bs.items)?bs.items.map((b:any)=>safeBracket(b,bs)):[]
      const displayPhase=publishedBrackets.length && (groupsComplete||!groupSlides.length)?'brackets':groupSlides.length?'groups':'waiting'
      return {
        id:String(t.id),name:String(t.name||t.title||'Torneo'),
        date:t.event_date||null,tourId:String(t.tour_id||''),
        displayPhase,
        groups:displayPhase==='groups'?groupSlides:[],
        rankings:Object.fromEntries(groupSlides.map(g=>[g.letter,g.standings.map(s=>s.name)])),
        brackets:displayPhase==='brackets'?publishedBrackets:[],
      }
    })
    return NextResponse.json({items,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store, max-age=0'}})
  }catch(e:any){
    return NextResponse.json({error:String(e?.message||e)},{status:500,headers:{'Cache-Control':'no-store'}})
  }
}
