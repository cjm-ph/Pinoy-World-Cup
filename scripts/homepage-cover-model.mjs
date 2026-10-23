// Homepage-only state. Never reorders candidates used by the game engine.
export function createCoverPicker(random=Math.random) {
 const cache=new Map();
 return row=>{
  const key=row.tournament_id;
  if(cache.has(key))return cache.get(key);
  const candidates=[...new Map((row.candidates||[]).filter(p=>typeof p.participant_id==='string').map(p=>[p.participant_id,p])).values()];
  const compare=(a,b)=>a.participant_id<b.participant_id?-1:a.participant_id>b.participant_id?1:0;
  candidates.sort((a,b)=>(Number(b.titles)||0)-(Number(a.titles)||0)||compare(a,b));
  const pool=Number(row.completed)>=10?candidates.slice(0,4):candidates;
  const selected=[];
  while(pool.length&&selected.length<2){const index=Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)));selected.push({...pool.splice(index,1)[0]});}
  const pair=Object.freeze(selected.map(Object.freeze));cache.set(key,pair);return pair;
 };
}
export function publicImageUrl(asset) {
 return /^asset_[0-9a-f-]{36}$/.test(asset||'')?'/media?asset='+encodeURIComponent(asset):null;
}
