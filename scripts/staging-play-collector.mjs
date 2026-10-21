// Statistics failure must never enter the engine's control flow or image paths.
export function createPlayCollector({fetchImpl=fetch,storage=globalThis.sessionStorage,schedule=setTimeout,uuid=()=>crypto.randomUUID(),onStatus=()=>{}}={}){
 let pending=[];try{pending=JSON.parse(storage?.getItem('pwc-stats-outbox')||'[]');if(!Array.isArray(pending)||pending.length>4)pending=[];}catch{pending=[];}
 pending=pending.filter(j=>j&&typeof j.tid==='string'&&typeof j.rid==='string'&&Array.isArray(j.lineup)&&[4,8,16,32].includes(j.lineup.length)&&Array.isArray(j.events)&&j.events.length<=31&&Number.isFinite(j.at)&&typeof j.request==='string');
 let current=null,running=false,timer=null,sessionReady=false;
 const persist=()=>{try{storage?.setItem('pwc-stats-outbox',JSON.stringify(pending));}catch{}};
 async function post(path,body){if(!sessionReady){const session=await fetchImpl('/play-statistics/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!session.ok)throw Object.assign(Error('Statistics unavailable'),{permanent:[404,503].includes(session.status)});sessionReady=true;}
  const r=await fetchImpl('/play-statistics/'+path,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok){if(r.status===428)sessionReady=false;const e=Error('Statistics unavailable');e.permanent=[400,403,404,503].includes(r.status);throw e;}return r.json();}
 function later(delay=150){if(timer!==null)return;timer=schedule(()=>{timer=null;void flush();},delay);}
 async function flush(){if(running)return;running=true;try{
  for(const job of [...pending]){
   if(job.dead||Date.now()-job.at>86400000){pending=pending.filter(x=>x!==job);continue;}
   try{
    if(!job.game){const start=await post('start',{request:job.request,tid:job.tid,rid:job.rid,lineup:job.lineup});if(typeof start.game_id!=='string')throw Error('Invalid receipt');job.game=start.game_id;persist();}
    if(job.events.length){const batch=job.events.slice(0,31),receipt=await post('events',{game:job.game,events:batch});if(!Number.isInteger(receipt.sequence)||receipt.sequence<batch.at(-1).seq)throw Error('Invalid receipt');job.events=job.events.filter(e=>e.seq>receipt.sequence);job.complete=receipt.complete===true;}
    job.attempts=0;onStatus(job.complete?'Statistics recorded.':'Statistics connected.');
    if(job.complete)pending=pending.filter(x=>x!==job);
   }catch(error){job.attempts=(job.attempts||0)+1;if(error.permanent||job.attempts>=3){job.dead=true;onStatus('Statistics unavailable; this game may not be fully counted.');}else{onStatus('Statistics pending.');later(1000*2**job.attempts);}}
  }
 }finally{persist();running=false;if(pending.some(j=>!j.dead&&!j.attempts&&(!j.game||j.events.length)))later();}}
 return {start(tid,rid,lineup){if(typeof tid!=='string'||typeof rid!=='string'||![4,8,16,32].includes(lineup.length)){current=null;return;}
  current={request:uuid(),tid,rid,lineup:[...lineup],events:[],seq:0,at:Date.now()};pending=pending.filter(x=>!x.dead).slice(-3);pending.push(current);persist();later();},
  match(winner){if(!current||current.dead||current.seq>=current.lineup.length-1)return;current.events.push({seq:++current.seq,winner});persist();later();},
  flush,resume(){later();},snapshot:()=>JSON.parse(JSON.stringify(pending))};
}
