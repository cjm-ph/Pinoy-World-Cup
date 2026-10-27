// Official IFrame API commands only. One match, no persistence or provider requests.
export function createShortsAlternator(clock={}) {
 const now=clock.now||(()=>performance.now()),later=clock.setTimeout||globalThis.setTimeout,clearLater=clock.clearTimeout||globalThis.clearTimeout;
 const every=clock.setInterval||globalThis.setInterval,clearEvery=clock.clearInterval||globalThis.clearInterval;
 const slots=new Map();let phase='waiting',active=null,epoch=0,watch=null,gap=null,stopAt=0,waitAt=0,loadAt=0,played=false,last=null;
 const state=e=>{try{return e.player?.getPlayerState();}catch{return undefined;}};
 const stopped=e=>[0,2].includes(state(e));
 const pair=()=>slots.size===2&&slots.has(0)&&slots.has(1);
 const clear=()=>{if(watch!==null)clearEvery(watch);if(gap!==null)clearLater(gap);watch=gap=null;};
 const halt=message=>{epoch++;clear();phase='manual';for(const e of slots.values())e.onAlternationStopped?.(message);};
 const valid=e=>!e.cancelled&&slots.get(e.alternatingSide)===e;
 const reset=()=>{epoch++;clear();phase='waiting';active=null;played=false;last=null;for(const e of slots.values())e.alternatingReady=false;};
 const available=e=>e&&valid(e)&&e.alternatingReady&&!e.alternatingFailed;
 const resume=e=>{if(!pair()||!available(e)||state(e)!==1||state(slots.get(1-e.alternatingSide))===1)return;
  epoch++;clear();active=e.alternatingSide;played=true;last=null;phase='playing';watch=every(tick,100);
 };
 const start=index=>{
  if(!pair()||!['waiting','gap'].includes(phase))return;
  const e=slots.get(index),other=slots.get(1-index);
  const initial=phase==='waiting';
  if(!available(e)){if(!initial)halt('Next video is still preparing. Use Play when ready.');return;}
  if(initial&&now()-waitAt>=15000){halt('Automatic playback unavailable. Use Play.');return;}
  // Only the current turn needs API readiness. The other iframe may still initialize.
  if(state(other)===1){halt('Automatic alternation stopped. Use Play.');return;}
  active=index;played=false;last=null;loadAt=now();phase='loading';
  try{e.applySound?.();e.player.loadVideoById({videoId:e.alternatingRange.videoId,startSeconds:e.alternatingRange.startSeconds,...(e.alternatingRange.endSeconds===null?{}:{endSeconds:e.alternatingRange.endSeconds})});
   if(phase!=='manual'){e.player.playVideo?.();}}
  catch{halt('Automatic playback unavailable. Use Play.');}
 };
 const confirm=()=>{
  if(phase!=='stopping')return false;
  const old=slots.get(active);if(!old||!stopped(old))return false;
  const next=1-active;if(!available(slots.get(next))){halt('Next video is still preparing. Use Play when ready.');return true;}
  phase='gap';const token=epoch;
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
  if(pair()&&phase==='waiting'){if(now()-waitAt>=15000){halt('Automatic playback unavailable. Use Play.');return;}start(0);return;}
  if(!pair()||!['loading','playing','stopping','gap'].includes(phase))return;
  const e=slots.get(active);if(!e||!valid(e)){halt('Automatic alternation stopped. Use Play.');return;}
  const s=state(e);
  if(phase==='stopping'){if(confirm())return;if(now()-stopAt>=3000)halt('Playback stop could not be confirmed. Use Play.');return;}
  if(phase==='gap')return;
  if(phase==='loading'&&now()-loadAt>=15000){halt('Automatic playback unavailable. Use Play.');return;}
  if(s===2&&phase==='playing'){halt('Automatic alternation stopped. Use Play.');return;}
  if(s===0&&played){finish();return;}
  if(phase==='loading'&&s===1){played=true;phase='playing';}
  if(phase==='playing'&&s===1){let t;try{t=e.player.getCurrentTime();}catch{return;}if(!Number.isFinite(t))return;
   const wall=now();if(last&&(t<last.t-0.5||t-last.t>(wall-last.wall)/1000+1.5)){halt('Automatic alternation stopped. Use Play.');return;}
   last={t,wall};if(e.alternatingRange.endSeconds!==null&&t>=e.alternatingRange.endSeconds)finish();
  }
 };
 return {
  isPair:pair,
  attach(index,e,range){if(index!==0&&index!==1)return;if(slots.has(index)&&slots.get(index)!==e)reset();e.alternatingSide=index;e.alternatingRange=range;e.alternatingReady=false;slots.set(index,e);if(pair()){for(const member of slots.values())member.alternatingManaged=true;if(phase==='waiting'&&watch===null){waitAt=now();watch=every(tick,100);start(0);}}},
  ready(e,{manual=false}={}){if(!valid(e))return;e.alternatingReady=true;if(manual){epoch++;clear();phase='manual';e.alternatingFailed=false;resume(e);}else if(pair()&&phase==='waiting')start(0);},
  event(e,s){if(!valid(e)||!pair())return;if(phase==='manual'&&s===1){e.alternatingFailed=false;resume(e);return;}if(phase==='manual'||phase==='waiting'){
    if(valid(e)&&pair()&&phase==='waiting'&&s===1)halt('Automatic alternation stopped. Use Play.');return;}
   if(s===1){if(e.alternatingSide!==active||phase==='gap'){halt('Automatic alternation stopped. Use Play.');return;}if(phase==='loading'||phase==='playing'){played=true;e.alternatingPlayed=true;phase='playing';}}
   else if(s===3&&e.alternatingSide===active){last=null;}
   else if(s===2){if(e.alternatingSide===active&&phase==='stopping')confirm();else if(e.alternatingSide===active&&phase==='playing')halt('Automatic alternation stopped. Use Play.');}
   else if(s===0&&e.alternatingSide===active&&played&&['playing','loading'].includes(phase))finish();
  },
  manual(){if(pair())halt('Automatic alternation stopped. Use Play.');},
  blocked(e,message='Automatic playback blocked. Use Play.'){if(e){if(!valid(e))return;e.alternatingFailed=true;}if(pair()&&(!e||e.alternatingSide===active||(phase==='waiting'&&e.alternatingSide===0)))halt(message);},
  detach(e){if(slots.get(e.alternatingSide)!==e)return;slots.delete(e.alternatingSide);reset();},
  dispose(){clear();epoch++;phase='manual';slots.clear();}
 };
}
