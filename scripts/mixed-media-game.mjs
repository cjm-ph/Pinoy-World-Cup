import {createShortsAlternator} from './shorts-alternator.mjs';
import {checkedYoutubePlayback,createShortsSound,bindShortsSoundUi} from './shorts-sound.mjs';
import {mountLocalMp4} from './local-mp4-presentation.mjs';
import {createGiphyEmbed} from './giphy-embed.mjs';

export {checkedYoutubePlayback} from './shorts-sound.mjs';
let playerLibrary;
function youtubeLibrary(root){
 if(root.YT?.Player)return Promise.resolve(root.YT);
 if(!playerLibrary)playerLibrary=new Promise((resolve,reject)=>{
  const previous=root.onYouTubeIframeAPIReady;
  const timeout=setTimeout(()=>reject(Error('Video player unavailable')),15000);
  root.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);try{previous?.();}catch{}resolve(root.YT);};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);reject(Error('Video player unavailable'));};document.head.append(script);
 }).catch(error=>{playerLibrary=null;throw error;});return playerLibrary;
}
// Presentation only: existing pick/choose and persistence contracts remain authoritative.
export function installMixedMediaGame(root,{loadPlayer=()=>youtubeLibrary(root),videoSource=null,alternator=createShortsAlternator(),side=null,sound=createShortsSound()}={}){
 const soundUi=bindShortsSoundUi(root,sound,{onStart:()=>stop()});
 const fill=root.fill,show=root.show,pick=root.pick,live=new Map();let winnerHandle=null,generation=0,selectionUntil=0,screen=null;
 const dispose=slot=>{const e=live.get(slot);if(!e)return;e.cancelled=true;alternator.detach(e);e.observer?.disconnect();if(e.resize)root.removeEventListener?.('resize',e.resize);clearInterval(e.muteTimer);sound.detach(e.player);try{e.player?.destroy();}catch{}e.embed?.dispose();if(e.shell.isConnected){e.shell.replaceWith(slot);slot.replaceChildren(e.art,e.name);}live.delete(slot);};
 const stop=()=>{generation++;winnerHandle?.dispose();winnerHandle=null;for(const slot of [...live.keys()])dispose(slot);};
 root.fill=function(slot,participant){
  soundUi.sync();dispose(slot);fill.call(this,slot,participant);
  let source=participant.media;
  if(source?.type==='youtube')try{source={...source,...checkedYoutubePlayback(source)};}catch{}
  const art=slot.querySelector('.art'),name=slot.querySelector('.name');
  const shell=document.createElement('section');shell.className='candidate-shell';shell.dataset.kind=source?.type||'photo';if(source?.playbackMode==='shorts')shell.dataset.playback='shorts';
  const title=document.createElement('div');title.className='candidate-title';title.textContent=participant.n;title.title=participant.n;
  const header=document.createElement('header');header.className='candidate-heading';header.append(title);
  slot.before(shell);shell.append(header,art,slot);art.classList.add('candidate-media');
  name.textContent='SELECT';slot.classList.add('candidate-select');slot.setAttribute('aria-label','Select '+participant.n);slot.replaceChildren(name);
  slot.onclick=()=>root.pick(slot.id==='b'?1:0);
  // Photos retain their existing card-click shortcut and exact fit/position/zoom styles.
  if(!source||source.type==='animation'){art.onclick=()=>slot.click();}
  const entry={cancelled:false,shell,art,name,player:null};entry.applySound=()=>sound.apply(entry.player);live.set(slot,entry);
  if(source?.type==='giphy'){art.replaceChildren();entry.embed=createGiphyEmbed(source,{name:participant.n});art.append(entry.embed.element);return;}
  if(source?.type==='mp4'){
   const image=art.querySelector('.vs-photo');
   const unavailable=()=>{if(entry.cancelled)return;art.replaceChildren();const notice=document.createElement('p');notice.className='mixed-player-status';notice.textContent='Video unavailable. You can still select this candidate.';art.append(notice);};
   if(!image||typeof videoSource!=='function'||!/^video_[a-f0-9-]{36}$/.test(source.video_id||'')){unavailable();return;}
   Promise.resolve().then(()=>videoSource(source)).then(data=>{
    let released=false;const release=()=>{if(!released){released=true;data?.release?.();}};
    if(entry.cancelled){release();return;}
    try{const handle=mountLocalMp4(image,{...data,startSeconds:source.startSeconds,endSeconds:source.endSeconds});entry.player={destroy:()=>{handle.dispose();release();}};handle.video.addEventListener('error',()=>{clearInterval(entry.muteTimer);entry.player?.destroy();entry.player=null;unavailable();},{once:true});}
    catch(e){release();throw e;}
   }).catch(unavailable);return;
  }
  if(source?.type==='animation'){if(/^source_[0-9a-f-]{36}$/.test(source.source_id||'')){const image=art.querySelector('.vs-photo');if(image)image.src='/animated-media?source='+encodeURIComponent(source.source_id);}return;}
  if(source?.type!=='youtube')return;
  art.replaceChildren();let checked;try{checked=checkedYoutubePlayback(source);}catch{art.textContent='Video unavailable. You can still select this candidate.';return;}
  const host=document.createElement('div');host.className='mixed-player';
  const status=document.createElement('p');status.className='mixed-player-status';status.setAttribute('role','status');
  const shorts=checked.playbackMode==='shorts',pair=()=>shorts&&(alternator.isPair()||entry.alternatingManaged===true),index=side??(slot.id==='a'?0:slot.id==='b'?1:null);if(shorts&&index!==null)alternator.attach(index,entry,checked);const notice=document.createElement('div');notice.hidden=true;notice.className='mixed-player-status';status.className='';status.style.margin='0';notice.append(status);art.append(host,notice);let loading=false,failed=false;
  const clip={videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})};
  // Errors still halt internally. Official iframe controls are the only manual Play UI.
  entry.onAlternationStopped=message=>{if(entry.cancelled||shell.dataset.playerSize==='blocked')return;notice.hidden=false;status.textContent=message||'Automatic playback paused. Use the official player controls to play.';};
  const size=()=>{if(entry.cancelled)return;delete shell.dataset.playerSize;host.hidden=false;
   if(shorts&&globalThis.innerWidth>=901){const arena=shell.closest('#play .arena');if(arena){const top=arena.getBoundingClientRect().top;arena.style.setProperty('--shorts-arena-height',Math.max(300,globalThis.innerHeight-Math.max(0,top)-16)+'px');}
    const bounds=art.getBoundingClientRect(),height=Math.max(0,Math.min(bounds.height-notice.getBoundingClientRect().height,bounds.width*16/9));host.style.width=(height*9/16)+'px';host.style.height=height+'px';
   }else if(!shorts&&globalThis.innerWidth>=768&&shell.closest('#play .arena')){const bounds=art.getBoundingClientRect(),width=Math.max(0,Math.min(bounds.width,(bounds.height-notice.getBoundingClientRect().height)*16/9));host.style.width=width+'px';host.style.height=(width*9/16)+'px';}else{host.style.removeProperty('width');host.style.removeProperty('height');}
   const frame=entry.apiReady?(entry.player?.getIframe?.()||host.querySelector('iframe')):null,rect=(frame||art).getBoundingClientRect();
   if(rect.width<200||(frame?rect.height:rect.height-notice.getBoundingClientRect().height)<200||(shorts&&globalThis.innerWidth>=901&&Number.parseFloat(host.style.width)<200)){if(pair())alternator.blocked(undefined,'A video player is below the required 200 x 200 minimum. Selection remains available.');clearInterval(entry.muteTimer);sound.detach(entry.player);entry.player?.destroy();entry.player=null;host.replaceChildren();host.hidden=true;notice.hidden=false;status.textContent='YouTube unavailable: this card is below the required 200 x 200 minimum. Selection remains available.';shell.dataset.playerSize='blocked';return;}
   shell.dataset.playerSize='supported';host.hidden=false;if(entry.player||loading||failed)return;loading=true;if(!shorts){notice.hidden=false;status.textContent='Loading YouTube?';}
   Promise.resolve().then(loadPlayer).then(YT=>{if(entry.cancelled)return;const r=art.getBoundingClientRect();if(r.width<200||r.height-notice.getBoundingClientRect().height<200){loading=false;size();return;}
    const target=document.createElement('div');host.replaceChildren(target);entry.player=new YT.Player(target,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:checked.videoId,
     playerVars:{autoplay:shorts&&!pair()?1:0,...(shorts?{mute:sound.enabled?0:1,loop:pair()?0:1,...(!pair()?{playlist:checked.videoId}:{})}:{}),controls:1,fs:1,playsinline:1,origin:root.location.origin,start:checked.startSeconds,...(checked.endSeconds===null?{}:{end:checked.endSeconds})},
     events:{onReady:event=>{if(entry.cancelled||entry.player!==event.target){event.target.destroy();return;}entry.apiReady=true;if(shorts){sound.attach(event.target);
       if(pair())alternator.ready(entry,{manual:entry.pendingManual===true});else{event.target.loadVideoById(clip);event.target.playVideo();alternator.ready(entry);}
       entry.pendingManual=false;if(!pair())entry.muteTimer=setInterval(()=>{if(entry.cancelled||entry.player!==event.target)return;const t=event.target.getCurrentTime?.();if(event.target.getPlayerState?.()===1&&Number.isFinite(t)&&(t<checked.startSeconds||(checked.endSeconds!==null&&t>=checked.endSeconds))){event.target.seekTo(checked.startSeconds,true);event.target.playVideo();}},200);size();return;}
       event.target.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});status.textContent='';notice.hidden=true;requestAnimationFrame(size);},
      onError:event=>{if(entry.cancelled||(event?.target&&event.target!==entry.player))return;if(pair())alternator.blocked(entry,'Video unavailable. Use Play.');notice.hidden=false;status.textContent='Video unavailable. You can still select this candidate.';},
      onAutoplayBlocked:event=>{if(entry.cancelled||(event?.target&&event.target!==entry.player))return;if(pair())alternator.blocked(entry);notice.hidden=false;status.textContent='Automatic playback was blocked. Use the official player controls to play.';},
      onStateChange:event=>{if(entry.cancelled||entry.player!==event.target)return;if(shorts){if(event.data===1){notice.hidden=true;status.textContent='';}if(pair()){if(event.data===1&&!entry.apiReady){entry.pendingManual=true;return;}alternator.event(entry,event.data);return;}if(event.data===0){event.target.seekTo(checked.startSeconds,true);event.target.playVideo();}if(event.data===1){notice.hidden=true;}return;}if(event.data===1)for(const other of live.values())if(other!==entry)try{other.player?.pauseVideo();}catch{}}}});
   }).catch(()=>{failed=true;notice.hidden=false;status.textContent='Video player unavailable. You can still select this candidate.';}).finally(()=>{loading=false;});
  };
  entry.resize=size;root.addEventListener('resize',size);entry.observer=new ResizeObserver(size);entry.observer.observe(art);size();
 };
 root.pick=function(side){if(root.busy||performance.now()<selectionUntil)return;selectionUntil=performance.now()+300;for(const e of live.values()){e.cancelled=true;alternator.detach(e);e.observer?.disconnect();if(e.resize)root.removeEventListener?.('resize',e.resize);clearInterval(e.muteTimer);sound.detach(e.player);try{e.player?.destroy();}catch{}e.embed?.dispose();}return pick?.call(this,side);};
 root.show=function(id){if(id==='play'&&screen==='end'){winnerHandle?.dispose();winnerHandle=null;sound.reset();}screen=id;if(id!=='play')stop();const result=show.apply(this,arguments);
  if(id==='end'&&['youtube','giphy','mp4'].includes(root.champ?.media?.type)){const at=generation,candidate=root.champ;queueMicrotask(()=>{const art=document.getElementById('winArt');if(at!==generation||!art||document.getElementById('end')?.classList.contains('hide'))return;winnerHandle=mountCandidateMedia(art,candidate,{showSelect:false,loadPlayer,videoSource,sound});});}return result;};
 root.addEventListener('pagehide',stop);return {dispose:stop};
}

// Creator and champion surfaces use the same lifecycle, without persistence or statistics calls.
export function mountCandidateMedia(container,participant,{onSelect,showSelect=true,loadPlayer=()=>youtubeLibrary(globalThis),videoSource=null,alternator,side=null,sound}={}){
 const slot=document.createElement('button');slot.type='button';slot.className='pick';slot.id='media-choice';let chosen=false;
 const virtual={location:globalThis.location,addEventListener(){},show(){},pick(){if(chosen||!onSelect)return;chosen=true;onSelect();},fill(button,p){button.replaceChildren();const art=document.createElement('div');art.className='art';if(p.media?.type==='mp4'){const image=document.createElement('img');image.className='vs-photo';image.alt=p.n;art.append(image);}const name=document.createElement('span');name.className='name';name.textContent=p.n;button.append(art,name);}};
 container.replaceChildren(slot);const handle=installMixedMediaGame(virtual,{loadPlayer,videoSource,alternator,side,sound});virtual.fill(slot,{...participant,n:participant.n||participant.name||'Candidate'});
 if(!showSelect){slot.hidden=true;container.firstElementChild.classList.add('candidate-champion');}return {element:container,dispose(){handle.dispose();container.replaceChildren();}};
}
