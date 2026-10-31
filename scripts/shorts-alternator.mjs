// Official IFrame API commands only. One match, no persistence or provider requests.
export function createShortsAlternator(clock={}) {
 const now=clock.now||(()=>performance.now()),later=clock.setTimeout||globalThis.setTimeout,clearLater=clock.clearTimeout||globalThis.clearTimeout;
 const every=clock.setInterval||globalThis.setInterval,clearEvery=clock.clearInterval||globalThis.clearInterval;
 const diagnostic=getShortsDiagnostics(),observed=new WeakMap();
 const trace=(event,side,extra={})=>{if(!diagnostic)return;diagnostic.record(event,side,{phase,active:active===0?'LEFT':active===1?'RIGHT':'NONE',leftReady:!!slots.get(0)?.alternatingReady,rightReady:!!slots.get(1)?.alternatingReady,leftFailed:!!slots.get(0)?.alternatingFailed,rightFailed:!!slots.get(1)?.alternatingFailed,leftState:state(slots.get(0)||{}),rightState:state(slots.get(1)||{}),...extra});};
 const slots=new Map();let phase='waiting',active=null,epoch=0,watch=null,gap=null,stopAt=0,waitAt=0,loadAt=0,played=false,last=null;
 const state=e=>{try{return e.player?.getPlayerState();}catch{return undefined;}};
 const stopped=e=>[0,2].includes(state(e));
 const pair=()=>slots.size===2&&slots.has(0)&&slots.has(1);
 const clear=()=>{if(watch!==null)clearEvery(watch);if(gap!==null){trace('GAP_CANCEL',active);clearLater(gap);}watch=gap=null;};
 const halt=message=>{trace('HALT',active,{reason:message.startsWith('Next video')?'NOT_READY':message.startsWith('Playback stop')?'STOP_TIMEOUT':message.startsWith('Video unavailable')?'PROVIDER_ERROR':message.startsWith('Automatic playback blocked')?'AUTOPLAY_BLOCKED':'MANUAL_FALLBACK'});epoch++;clear();phase='manual';for(const e of slots.values())e.onAlternationStopped?.(message);};
 const valid=e=>!e.cancelled&&slots.get(e.alternatingSide)===e;
 const reset=()=>{trace('MATCH_RESET',active);epoch++;clear();phase='waiting';active=null;played=false;last=null;for(const e of slots.values())e.alternatingReady=false;};
 const available=e=>e&&valid(e)&&e.alternatingReady&&!e.alternatingFailed;
 const recovered=()=>{for(const e of slots.values())if(!e.alternatingFailed)e.onAlternationResumed?.();};
 const resume=e=>{trace('RESUME_TRY',e.alternatingSide);if(!pair()||!available(e)||state(e)!==1)return;if(state(slots.get(1-e.alternatingSide))===1){try{trace('REQUEST_PAUSE',e.alternatingSide);e.player.pauseVideo();}catch{}return;}
  epoch++;clear();active=e.alternatingSide;played=true;last=null;phase='playing';trace('RESUME_ACTIVE',active);recovered();watch=every(tick,100);
 };
 const start=index=>{
  if(!pair()||!['waiting','gap'].includes(phase))return;
  const e=slots.get(index),other=slots.get(1-index);
  const initial=phase==='waiting';
  if(!available(e)){trace('WAIT_READY',index);if(!initial)halt('Next video is still preparing. Use Play when ready.');return;}
  if(initial&&now()-waitAt>=15000){halt('Automatic playback unavailable. Use Play.');return;}
  // Only the current turn needs API readiness. The other iframe may still initialize.
  if(state(other)===1){halt('Automatic alternation stopped. Use Play.');return;}
  active=index;played=false;last=null;loadAt=now();phase='loading';
  try{e.applySound?.();trace('REQUEST_LOAD',index);e.player.loadVideoById({videoId:e.alternatingRange.videoId,startSeconds:e.alternatingRange.startSeconds,...(e.alternatingRange.endSeconds===null?{}:{endSeconds:e.alternatingRange.endSeconds})});
   if(phase!=='manual'&&state(e)!==1){trace('REQUEST_PLAY',index);e.player.playVideo?.();}}
  catch{halt('Automatic playback unavailable. Use Play.');}
 };
 const confirm=()=>{
  if(phase!=='stopping')return false;
  const old=slots.get(active);if(!old||!stopped(old))return false;
  trace('STOP_CONFIRMED',active);const next=1-active;if(!available(slots.get(next))){halt('Next video is still preparing. Use Play when ready.');return true;}
  phase='gap';trace('GAP_SCHEDULE',active,{delayMs:1000});const token=epoch;
  gap=later(()=>{trace('GAP_FIRE',active);gap=null;if(token!==epoch||phase!=='gap'||!pair())return;
   if(!valid(old)||!stopped(old)){halt('Automatic alternation stopped. Use Play.');return;}start(next);
  },1000);return true;
 };
 const finish=()=>{
  if(!['playing','loading'].includes(phase)||!played)return;
  trace('FINISH',active);phase='stopping';stopAt=now();const e=slots.get(active);
  if(!stopped(e))try{trace('REQUEST_PAUSE',active);e.player.pauseVideo();}catch{}
  // getPlayerState is rechecked; issuing pauseVideo is NOT stop confirmation.
  if(phase==='stopping')confirm();
 };
 const tick=()=>{
  if(pair()&&phase==='waiting'){if(now()-waitAt>=15000){halt('Automatic playback unavailable. Use Play.');return;}start(0);return;}
  if(!pair()||!['loading','playing','stopping','gap'].includes(phase))return;
  const e=slots.get(active);if(!e||!valid(e)){halt('Automatic alternation stopped. Use Play.');return;}
  const s=state(e);if(diagnostic&&observed.get(e)!==s){observed.set(e,s);trace('OBSERVED_STATE',active,{state:s});}
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
  attach(index,e,range){trace('ATTACH',index);if(index!==0&&index!==1)return;if(slots.has(index)&&slots.get(index)!==e)reset();e.alternatingSide=index;e.alternatingRange=range;e.alternatingReady=false;slots.set(index,e);if(pair()){for(const member of slots.values())member.alternatingManaged=true;if(phase==='waiting'&&watch===null){waitAt=now();watch=every(tick,100);start(0);}}},
  ready(e,{manual=false}={}){if(!valid(e))return;e.alternatingReady=true;trace('ALT_READY',e.alternatingSide,{manual});if(manual){epoch++;clear();phase='manual';e.alternatingFailed=false;resume(e);}else if(pair()&&phase==='waiting')start(0);},
  event(e,s){trace('ALT_STATE',e.alternatingSide,{state:s});if(!valid(e)||!pair())return;if(phase==='manual'&&s===1){e.alternatingFailed=false;resume(e);return;}if(phase==='manual'||phase==='waiting'){
    if(valid(e)&&pair()&&phase==='waiting'&&s===1)halt('Automatic alternation stopped. Use Play.');return;}
   if(s===1){if(e.alternatingSide!==active||phase==='gap'){halt('Automatic alternation stopped. Use Play.');try{trace('REQUEST_PAUSE',e.alternatingSide);e.player.pauseVideo();}catch{}return;}if(phase==='loading'||phase==='playing'){played=true;e.alternatingPlayed=true;phase='playing';recovered();}}
   else if(s===3&&e.alternatingSide===active){last=null;}
   else if(s===2){if(e.alternatingSide===active&&phase==='stopping')confirm();else if(e.alternatingSide===active&&phase==='playing')halt('Automatic alternation stopped. Use Play.');}
   else if(s===0&&e.alternatingSide===active&&played&&['playing','loading'].includes(phase))finish();
  },
  manual(){if(pair())halt('Automatic alternation stopped. Use Play.');},
  autoplayBlocked(e){trace('AUTOPLAY_DECISION',e.alternatingSide);if(!valid(e)||!pair()||e.alternatingSide!==active)return false;if(state(e)===1&&state(slots.get(1-active))!==1){e.alternatingFailed=false;if(phase==='manual')resume(e);recovered();return false;}if(['loading','playing'].includes(phase)){this.blocked(e);return true;}return e.alternatingFailed===true;},
  blocked(e,message='Automatic playback blocked. Use Play.'){trace('BLOCK',e?.alternatingSide);if(e){if(!valid(e))return;e.alternatingFailed=true;}if(pair()&&(!e||e.alternatingSide===active||(phase==='waiting'&&e.alternatingSide===0)))halt(message);},
  detach(e){trace('DETACH',e.alternatingSide);if(slots.get(e.alternatingSide)!==e)return;slots.delete(e.alternatingSide);reset();},
  dispose(){trace('DISPOSE',active);clear();epoch++;phase='manual';slots.clear();}
 };
}

// Temporary opt-in Staging diagnostics. No persistence, network calls or content identifiers.
export function shortsDiagnosticsEnabled(location){
 try{return location?.protocol==='https:'&&location.hostname==='pinoy-worldcup-staging.onrender.com'&&new URLSearchParams(location.search).get('shortsDebug')==='1';}catch{return false;}
}
const traceEvents=new Set('ATTACH ALT_READY ALT_STATE OBSERVED_STATE PLAYER_READY PLAYER_STATE AUTOPLAY_EVENT AUTOPLAY_DECISION BLOCK HALT WAIT_READY REQUEST_LOAD REQUEST_PLAY REQUEST_PAUSE STOP_CONFIRMED GAP_SCHEDULE GAP_FIRE GAP_CANCEL FINISH RESUME_TRY RESUME_ACTIVE MATCH_RESET DISPOSE DETACH SOUND_CHANGED SOUND_APPLY SELECT EXIT PROVIDER_ERROR SIZE_CHECK START_CLICK ADMISSION_START ADMISSION_SUCCESS ADMISSION_FAILURE START_CANCELLED ENGINE_START PLAYER_CREATE_BEGIN IFRAME_OBSERVED'.split(' '));
const traceEnums={phase:['waiting','loading','playing','stopping','gap','manual'],active:['LEFT','RIGHT','NONE'],reason:['NOT_READY','STOP_TIMEOUT','PROVIDER_ERROR','AUTOPLAY_BLOCKED','MANUAL_FALLBACK'],activationSupport:['supported','unsupported','unavailable'],documentPolicyApi:['permissionsPolicy','featurePolicy','unsupported','unavailable'],documentAutoplay:['allowed','denied','unsupported','unavailable'],iframeAutoplay:['absent','bare','wildcard','none','src','origin_list','unrecognized','unavailable'],iframePolicyAutoplay:['allowed','denied','unsupported','unavailable'],responsePolicyHeader:['not_inspected']};
const traceNumbers=new Set(['state','leftState','rightState','delayMs','width','height','admissionElapsedMs']);
const traceBooleans=new Set(['leftReady','rightReady','leftFailed','rightFailed','manual','soundOn','muted','apiReady','cancelled','trusted','activationActive','activationHasBeenActive','iframePresent']);
export function createShortsTrace({now=()=>performance.now(),viewport=()=>({width:0,height:0}),context=()=>({})}={}){
 const began=now(),rows=[];let seq=0,dropped=0,waitKey='';
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000000;
 return {record(event,side,data={}){try{if(!traceEvents.has(event))return;const safe={};for(const [k,v]of Object.entries({...data,...context()})){if(traceBooleans.has(k)&&typeof v==='boolean')safe[k]=v;else if(traceNumbers.has(k)&&finite(v))safe[k]=v;else if(traceEnums[k]?.includes(v))safe[k]=v;}
  if(typeof safe.state==='number')safe.stateName=({'-1':'UNSTARTED',0:'ENDED',1:'PLAYING',2:'PAUSED',3:'BUFFERING',5:'CUED'})[safe.state]||'UNKNOWN';
  const label=side===0?'LEFT':side===1?'RIGHT':'MATCH',key=JSON.stringify([label,safe]);if(event==='WAIT_READY'&&key===waitKey)return;if(event==='WAIT_READY')waitKey=key;
  rows.push({seq:++seq,ms:Math.max(0,Math.round(now()-began)),event,side:label,...safe});if(rows.length>600){rows.shift();dropped++;}
 }catch{}},snapshot(){const v=viewport();return {version:1,limit:600,dropped,viewport:{width:finite(v.width)?v.width:0,height:finite(v.height)?v.height:0},events:rows.map(r=>({...r}))};},clear(){rows.length=0;dropped=0;waitKey='';}};
}
let stagingShortsTrace;
export function getShortsDiagnostics(){
 if(!shortsDiagnosticsEnabled(globalThis.location))return null;if(stagingShortsTrace)return stagingShortsTrace;
 try{
  const doc=globalThis.document;if(!doc?.body)return null;const trace=createShortsTrace({viewport:()=>({width:innerWidth,height:innerHeight}),context:()=>readShortsActivation(globalThis)});
  const style=doc.createElement('style');style.textContent='body:has(#play:not(.hide)) .shorts-debug-open{display:none!important}.shorts-debug-open{position:fixed;right:8px;bottom:8px;z-index:2147483646;padding:10px;background:#142044;color:white;border:1px solid white;border-radius:6px}.shorts-debug-dialog{box-sizing:border-box;width:min(94vw,640px);max-height:90dvh;overflow:auto;background:white;color:#142044;padding:16px;border:1px solid #8090aa;border-radius:10px}.shorts-debug-dialog textarea{box-sizing:border-box;width:100%;height:45dvh;font:11px monospace}.shorts-debug-dialog button{padding:10px;margin:6px 8px 0 0}';doc.head.append(style);
  const open=doc.createElement('button');open.type='button';open.className='shorts-debug-open';open.textContent='Shorts diagnostics';
  const dialog=doc.createElement('dialog');dialog.className='shorts-debug-dialog';dialog.setAttribute('aria-label','Shorts diagnostics');
  const title=doc.createElement('h2');title.textContent='Shorts diagnostics';const note=doc.createElement('p');note.textContent='Local only. Reproduce the issue, leave the battle, then copy this log. Reload without shortsDebug=1 to disable.';
  const text=doc.createElement('textarea');text.readOnly=true;text.setAttribute('aria-label','Shorts event log');const status=doc.createElement('p');status.setAttribute('role','status');
  const button=(name,fn)=>{const b=doc.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;return b;};
  const refresh=()=>{status.textContent='';text.value=JSON.stringify(trace.snapshot(),null,2);};
  open.onclick=()=>{refresh();dialog.showModal();};
  const copy=button('Copy log',async()=>{refresh();try{await navigator.clipboard.writeText(text.value);status.textContent='Copied.';}catch{text.focus();text.select();text.setSelectionRange(0,text.value.length);status.textContent='Touch and hold the selected text, then Copy.';}});
  dialog.append(title,note,text,copy,button('Refresh',refresh),button('Clear log',()=>{trace.clear();refresh();status.textContent='Local log cleared.';}),button('Close',()=>dialog.close()),status);doc.body.append(open,dialog);Object.defineProperty(globalThis,'PWCShortsDiagnostics',{configurable:true,value:Object.freeze({record(event,side,data){try{trace.record(event,side,{...readShortsDocumentPolicy(doc),...data});}catch{}}})});stagingShortsTrace=trace;return trace;
 }catch{return null;}
}

// Observation only: no attributes/permissions are set; unsupported is never treated as denial.
export function readShortsActivation(root=globalThis){try{const a=root.navigator?.userActivation;if(!a||typeof a.isActive!=='boolean')return {activationSupport:'unsupported'};return {activationSupport:'supported',activationActive:a.isActive,...(typeof a.hasBeenActive==='boolean'?{activationHasBeenActive:a.hasBeenActive}:{})};}catch{return {activationSupport:'unavailable'};}}
function autoplayPolicy(object){try{const p=object?.permissionsPolicy||object?.featurePolicy;if(!p||typeof p.allowsFeature!=='function')return 'unsupported';if(typeof p.features==='function'&&!p.features().includes('autoplay'))return 'unsupported';const value=p.allowsFeature('autoplay');return typeof value==='boolean'?(value?'allowed':'denied'):'unsupported';}catch{return 'unavailable';}}
export function readShortsDocumentPolicy(doc=globalThis.document){try{return {documentPolicyApi:doc?.permissionsPolicy?'permissionsPolicy':doc?.featurePolicy?'featurePolicy':'unsupported',documentAutoplay:autoplayPolicy(doc),responsePolicyHeader:'not_inspected'};}catch{return {documentPolicyApi:'unavailable',documentAutoplay:'unavailable',responsePolicyHeader:'not_inspected'};}}
export function readShortsIframeAutoplay(frame,doc=globalThis.document){let shape='unavailable';try{if(frame){const part=(frame.getAttribute('allow')||'').split(';').map(s=>s.trim()).find(s=>/^autoplay(?:\s|$)/i.test(s));if(!part)shape='absent';else{const tokens=part.split(/\s+/).slice(1);shape=!tokens.length?'bare':tokens.length===1&&tokens[0]==="'none'"?'none':tokens.length===1&&tokens[0]==='*'?'wildcard':tokens.length===1&&tokens[0]==="'src'"?'src':tokens.every(x=>/^https?:\/\//i.test(x))?'origin_list':'unrecognized';}}}catch{}return {...readShortsDocumentPolicy(doc),iframePresent:!!frame,iframeAutoplay:shape,iframePolicyAutoplay:frame?autoplayPolicy(frame):'unavailable'};}
