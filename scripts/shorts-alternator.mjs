// Official IFrame API commands only. One match, no persistence or provider requests.
export function createShortsAlternator(clock={}) {
 const now=clock.now||(()=>performance.now()),later=clock.setTimeout||globalThis.setTimeout,clearLater=clock.clearTimeout||globalThis.clearTimeout;
 const every=clock.setInterval||globalThis.setInterval,clearEvery=clock.clearInterval||globalThis.clearInterval;
 const slots=new Map();let phase='waiting',active=null,epoch=0,watch=null,gap=null,stopAt=0,played=false,last=null;
 const state=e=>{try{return e.player?.getPlayerState();}catch{return undefined;}};
 const stopped=e=>[0,2].includes(state(e));
 const pair=()=>slots.size===2&&slots.has(0)&&slots.has(1);
 const clear=()=>{if(watch!==null)clearEvery(watch);if(gap!==null)clearLater(gap);watch=gap=null;};
 const halt=message=>{epoch++;clear();phase='manual';for(const e of slots.values())e.onAlternationStopped?.(message);};
 const valid=e=>!e.cancelled&&slots.get(e.alternatingSide)===e;
 const reset=()=>{epoch++;clear();phase='waiting';active=null;played=false;last=null;for(const e of slots.values())e.alternatingReady=false;};
 const start=index=>{
  if(!pair()||!['waiting','gap'].includes(phase))return;
  const e=slots.get(index),other=slots.get(1-index);
  if(!valid(e)||!valid(other)||!e.alternatingReady||!other.alternatingReady)return;
  if(![-1,0,2,5].includes(state(other))||![-1,0,2,5].includes(state(e))){halt('Automatic alternation stopped. Use Play.');return;}
  active=index;played=false;last=null;phase='loading';
  try{e.player.mute();e.player.loadVideoById({videoId:e.alternatingRange.videoId,startSeconds:e.alternatingRange.startSeconds,...(e.alternatingRange.endSeconds===null?{}:{endSeconds:e.alternatingRange.endSeconds})});}
  catch{halt('Automatic playback unavailable. Use Play.');}
 };
 const confirm=()=>{
  const old=slots.get(active);if(!old||!stopped(old))return false;
  phase='gap';const token=epoch,next=1-active;
  gap=later(()=>{gap=null;if(token!==epoch||phase!=='gap'||!pair())return;
   if(!valid(old)||!stopped(old)){halt('Automatic alternation stopped. Use Play.');return;}start(next);
  },1000);return true;
 };
 const finish=()=>{
  if(!['playing','loading'].includes(phase)||!played)return;
  phase='stopping';stopAt=now();const e=slots.get(active);
  if(!stopped(e))try{e.player.pauseVideo();}catch{}
  // getPlayerState is rechecked; issuing pauseVideo is NOT stop confirmation.
  if(phase==='stopping')confirm();
 };
 const tick=()=>{
  if(!pair()||!['loading','playing','stopping','gap'].includes(phase))return;
  if([...slots.values()].some(e=>!valid(e))){halt('Automatic alternation stopped. Use Play.');return;}
  const e=slots.get(active),s=state(e);
  if(phase==='stopping'){if(confirm())return;if(now()-stopAt>=3000)halt('Playback stop could not be confirmed. Use Play.');return;}
  if(phase==='gap'){if([...slots.values()].some(e=>[1,3].includes(state(e))))halt('Automatic alternation stopped. Use Play.');return;}
  if(s===2){halt('Automatic alternation stopped. Use Play.');return;}
  if(s===0&&played){finish();return;}
  if(phase==='playing'&&s===1){let t;try{t=e.player.getCurrentTime();}catch{return;}if(!Number.isFinite(t))return;
   const wall=now();if(last&&(t<last.t-0.5||t-last.t>(wall-last.wall)/1000+1.5)){halt('Automatic alternation stopped. Use Play.');return;}
   last={t,wall};if(e.alternatingRange.endSeconds!==null&&t>=e.alternatingRange.endSeconds)finish();
  }
 };
 return {
  isPair:pair,
  attach(index,e,range){if(index!==0&&index!==1)return;if(slots.has(index)&&slots.get(index)!==e)reset();e.alternatingSide=index;e.alternatingRange=range;e.alternatingReady=false;slots.set(index,e);if(pair())for(const member of slots.values())member.alternatingManaged=true;},
  ready(e){if(!valid(e))return;e.alternatingReady=true;if(pair()&&phase==='waiting'&&[...slots.values()].every(e=>e.alternatingReady)){watch=every(tick,100);start(0);}},
  event(e,s){if(!valid(e)||!pair()||phase==='manual'||phase==='waiting'){
    if(valid(e)&&pair()&&phase==='waiting'&&s===1)halt('Automatic alternation stopped. Use Play.');return;}
   if(s===1){if(e.alternatingSide!==active||phase==='gap'){halt('Automatic alternation stopped. Use Play.');return;}if(phase==='loading'||phase==='playing'){played=true;phase='playing';}}
   else if(s===2){if(e.alternatingSide===active&&phase==='stopping')confirm();else if(e.alternatingSide===active&&['loading','playing'].includes(phase))halt('Automatic alternation stopped. Use Play.');}
   else if(s===0&&e.alternatingSide===active&&played&&['playing','loading'].includes(phase))finish();
   else if(s===3&&e.alternatingSide!==active)halt('Automatic alternation stopped. Use Play.');
  },
  manual(){if(pair())halt('Automatic alternation stopped. Use Play.');},
  blocked(){if(pair())halt('Automatic playback blocked. Use Play.');},
  detach(e){if(slots.get(e.alternatingSide)!==e)return;slots.delete(e.alternatingSide);reset();},
  dispose(){clear();epoch++;phase='manual';slots.clear();}
 };
}
