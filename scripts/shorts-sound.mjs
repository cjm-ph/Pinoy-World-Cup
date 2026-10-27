import {checkedYoutubeSource,youtubeSource} from './candidate-media-policy.mjs';
// Presentation compatibility only. Registration still requires the original strict contract.
export function checkedYoutubePlayback(source){
 try{return checkedYoutubeSource(source);}catch(error){
  if(source.playbackMode!=='shorts'||source.originalUrl)throw error;
  const checked=youtubeSource(source.url,source.startSeconds,source.endSeconds);
  if(source.videoId&&source.videoId!==checked.videoId)throw Error('Video identity mismatch');
  return {...checked,playbackMode:'shorts'};
 }
}

export function containsShorts(items=[]){return items.some(p=>{try{return p.media?.type==='youtube'&&checkedYoutubePlayback(p.media).playbackMode==='shorts';}catch{return false;}});}
export function createShortsSound(){let enabled=true;const players=new Map(),listeners=new Set();
 const apply=player=>{if(!player||!players.has(player)||players.get(player)===enabled)return;enabled?player.unMute?.():player.mute();players.set(player,enabled);};
 const notify=()=>{for(const fn of listeners)fn(enabled);};
 return {get enabled(){return enabled;},apply,attach(player){players.set(player,undefined);apply(player);},detach(player){players.delete(player);},set(value){if(enabled===!!value)return;enabled=!!value;for(const p of players.keys())apply(p);notify();},reset(){this.set(true);},subscribe(fn){listeners.add(fn);fn(enabled);return()=>listeners.delete(fn);}};
}
export function bindShortsSoundUi(root,sound,{onStart}={}){
 if(!root.document)return {sync(){}};
 const doc=root.document,play=doc.getElementById('play'),dialog=doc.getElementById('roundSelection'),bar=play?.querySelector('.bar'),top=dialog?.querySelector('.round-topbar');let selected=null,eligible=false;
 const buttons=[];for(const host of [top,bar])if(host){const b=doc.createElement('button');b.type='button';b.className='shorts-sound-button';b.hidden=true;b.onclick=()=>sound.set(!sound.enabled);host.append(b);buttons.push(b);}
 sound.subscribe(on=>{for(const b of buttons){b.setAttribute('aria-label',on?'Mute Shorts sound':'Turn Shorts sound on');b.setAttribute('aria-pressed',String(!on));b.title=on?'Sound on':'Muted';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>'+ (on?'<path d="M15 8q5 4 0 8M18 5q8 7 0 14"/>':'<path d="m3 3 18 18"/>')+'</svg>';}});
 const select=t=>{selected=t?.id??t;eligible=containsShorts(t?.items);sound.reset();};
 const paint=()=>{for(const b of buttons)b.hidden=!eligible;play?.toggleAttribute('data-shorts-sound',eligible);dialog?.toggleAttribute('data-shorts-sound',eligible);};
 const sync=()=>{if(root.tour&&(selected===null||selected!==root.tour.id))select(root.tour);paint();};
 if(root.start){const start=root.start;root.start=function(t){if(!dialog?.open){onStart?.();select(t||root.tour);paint();}return start.apply(this,arguments);};}
 return {sync};
}
