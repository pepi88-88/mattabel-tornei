export type BookContact={name:string;aliases:string[];phones:string[]}
export const words=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean)
export const nameKey=(s:string)=>words(s).sort().join(' ')
export function normalizePhone(value:string):string{
 let s=value.trim().replace(/^tel:/i,'')
 try{s=decodeURIComponent(s)}catch{}
 if(/[;a-z]/i.test(s))return ''
 s=s.replace(/[\s().-]/g,'')
 if(s.startsWith('00'))s='+'+s.slice(2)
 else if(/^3\d{8,9}$/.test(s))s='+39'+s
 else if(/^39[03]\d{7,10}$/.test(s))s='+'+s
 return /^\+[1-9]\d{6,14}$/.test(s)?s:''
}
function unescapeValue(s:string){return s.replace(/\\([nN,;\\])/g,(_,c)=>c==='n'||c==='N'?' ':c)}
function decodeValue(s:string,header:string){
 if(!/ENCODING=QUOTED-PRINTABLE/i.test(header))return s
 const bytes:number[]=[]
 for(let i=0;i<s.length;i++){
  if(s[i]==='='&&/^[0-9a-f]{2}$/i.test(s.slice(i+1,i+3))){bytes.push(parseInt(s.slice(i+1,i+3),16));i+=2}
  else bytes.push(...new TextEncoder().encode(s[i]))
 }
 try{return new TextDecoder(/CHARSET=ISO-8859-1/i.test(header)?'iso-8859-1':'utf-8').decode(Uint8Array.from(bytes))}catch{return s}
}
export function parseVcf(raw:string):BookContact[]{
 const lines=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')
 const unfolded:string[]=[]
 for(const line of lines){
  const previous=unfolded[unfolded.length-1]
  if(previous&&/ENCODING=QUOTED-PRINTABLE/i.test(previous.split(':',1)[0])&&previous.endsWith('=')){unfolded[unfolded.length-1]=previous.slice(0,-1)+line.replace(/^[ \t]/,'');continue}
  if(previous&&/^[ \t]/.test(line)){unfolded[unfolded.length-1]=previous+line.slice(1);continue}
  unfolded.push(line)
 }
 let card:{fn:string;n:string;phones:string[]}|null=null
 const result:BookContact[]=[]
 for(const line of unfolded){
  if(/^BEGIN:VCARD\s*$/i.test(line)){card={fn:'',n:'',phones:[]};continue}
  if(/^END:VCARD\s*$/i.test(line)){
   if(card&&(card.fn||card.n)&&card.phones.length){
    const aliases=[...new Set([card.fn,card.n].filter(Boolean))]
    result.push({name:card.fn||card.n,aliases,phones:[...new Set(card.phones)]})
   }
   card=null;continue
  }
  if(!card)continue
  const colon=line.indexOf(':');if(colon<0)continue
  const head=line.slice(0,colon),prop=head.split(';')[0].split('.').pop()?.toUpperCase()
  if(/ENCODING=(B|BASE64)(;|$)/i.test(head))continue
  const value=decodeValue(line.slice(colon+1),head)
  if(prop==='FN')card.fn=unescapeValue(value).trim()
  if(prop==='N'){
   // N: family;given;additional;prefix;suffix. Do not use titles for matching.
   const parts=value.split(/(?<!\\);/).map(unescapeValue)
   card.n=[parts[1],parts[2],parts[0]].filter(Boolean).join(' ').trim()
  }
  if(prop==='TEL'){const p=normalizePhone(unescapeValue(value));if(p)card.phones.push(p)}
 }
 return result
}
export type Athlete={id:string;first_name:string;last_name:string}
export type Candidate={key:string;name:string;phone:string;blocked:boolean}
export type Match={player:Athlete;exact:boolean;candidates:Candidate[]}
export function matchContacts(book:BookContact[],players:Athlete[],existing:{player_id:string;phone:string}[]):Match[]{
 const filled=new Set(existing.filter(x=>x.phone.trim()).map(x=>x.player_id))
 const used=new Set(existing.map(x=>normalizePhone(x.phone)).filter(Boolean))
 const names=new Map<string,number>()
 for(const p of players){const k=nameKey(p.first_name+' '+p.last_name);names.set(k,(names.get(k)||0)+1)}
 const prepared=book.map(c=>({...c,keys:new Set(c.aliases.map(nameKey)),tokens:c.aliases.map(words)}))
 const phoneOwners=new Map<string,Set<string>>()
 for(const c of prepared)for(const phone of c.phones){const owners=phoneOwners.get(phone)||new Set<string>();owners.add(nameKey(c.name));phoneOwners.set(phone,owners)}
 return players.filter(p=>!filled.has(p.id)).map(player=>{
  const key=nameKey(player.first_name+' '+player.last_name),first=words(player.first_name),last=words(player.last_name)
  const exactContacts=prepared.filter(c=>c.keys.has(key)&&first.length>0&&last.length>0)
  const similar=prepared.filter(c=>c.tokens.some(t=>last.length>0&&first.length>0&&last.every(w=>t.includes(w))&&first.some(w=>t.some(v=>w===v||(w.length>=3&&v.length>=3&&(w.startsWith(v)||v.startsWith(w)))))))
  const possible=exactContacts.length?exactContacts:similar
  const candidates:Candidate[]=[]
  const seen=new Set<string>()
  for(const c of possible)for(const phone of c.phones){
   const k=nameKey(c.name)+'|'+phone
   if(seen.has(k))continue
   seen.add(k);candidates.push({key:k,name:c.name,phone,blocked:used.has(phone)})
  }
  const exact=exactContacts.length===1&&candidates.length===1&&!candidates[0].blocked&&names.get(key)===1&&phoneOwners.get(candidates[0].phone)?.size===1
  return {player,exact,candidates}
 })
}
