// Homepage-only state. Never reorders candidates used by the game engine.
export function createCoverPicker(random=Math.random,{source=p=>publicImageUrl(p?.image_asset_id)}={}) {
 const cache=new Map();
 const failedAssets=new Set();
 function pick(row){
  const key=row.tournament_id;
  if(cache.has(key))return cache.get(key).pair;
  const candidates=[...new Map((row.candidates||[]).filter(p=>p&&typeof p.participant_id==='string').map(p=>[p.participant_id,p])).values()];
  const compare=(a,b)=>a.participant_id<b.participant_id?-1:a.participant_id>b.participant_id?1:0;
  candidates.sort((a,b)=>(Number(b.titles)||0)-(Number(a.titles)||0)||compare(a,b));
  // Restrict to top four BEFORE excluding missing/unloadable assets; never promote #5.
  const pool=Number(row.completed)>=10?candidates.slice(0,4):candidates;
  const queue=[];
  while(pool.length){const index=Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)));queue.push(Object.freeze({...pool.splice(index,1)[0]}));}
  const selected=[];
  while(queue.length&&selected.length<2){const candidate=queue.shift();if(source(candidate)&&!failedAssets.has(source(candidate)))selected.push(candidate);}
  const pair=Object.freeze(selected);cache.set(key,{pair,queue,revision:row.revision_id});return pair;
 };
 // Only a genuine image error may replace a slot; ordinary renders never draw again.
 pick.failed=(row,id)=>{
  const state=cache.get(row.tournament_id);if(!state||state.revision!==row.revision_id)return;
  const bad=state.pair.find(p=>p?.participant_id===id);if(!bad)return;
  failedAssets.add(source(bad));
  const next=state.pair.map(p=>failedAssets.has(source(p))?null:p);
  for(let i=0;i<2;i++)if(!next[i]){
   while(state.queue.length){const candidate=state.queue.shift();if(source(candidate)&&!failedAssets.has(source(candidate))&&!next.some(p=>p?.participant_id===candidate.participant_id)){next[i]=candidate;break;}}
  }
  state.pair=Object.freeze(next);
 };
 return pick;
}
export function publicImageUrl(asset) {
 return /^asset_[0-9a-f-]{36}$/.test(asset||'')?'/media?asset='+encodeURIComponent(asset):null;
}
