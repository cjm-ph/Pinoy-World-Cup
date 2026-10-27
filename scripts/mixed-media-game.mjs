import {createShortsAlternator} from './shorts-alternator.mjs';
import {checkedYoutubeSource} from './candidate-media-policy.mjs';
import {mountLocalMp4} from './local-mp4-presentation.mjs';
import {createGiphyEmbed} from './giphy-embed.mjs';
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
export function installMixedMediaGame(root,{loadPlayer=()=>youtubeLibrary(root),videoSource=null,alternator=createShortsAlternator(),side=null}={}){
 const fill=root.fill,show=root.show,pick=root.pick,live=new Map();let winnerHandle=null,generation=0,selectionUntil=0;
 const dispose=slot=>{const e=live.get(slot);if(!e)return;e.cancelled=true;alternator.detach(e);e.observer?.disconnect();clearInterval(e.muteTimer);try{e.player?.destroy();}catch{}e.embed?.dispose();if(e.shell.isConnected){e.shell.replaceWith(slot);slot.replaceChildren(e.art,e.name);}live.delete(slot);};
 const stop=()=>{generation++;winnerHandle?.dispose();winnerHandle=null;for(const slot of [...live.keys()])dispose(slot);};
 root.fill=function(slot,participant){
  dispose(slot);fill.call(this,slot,participant);
  const source=participant.media,art=slot.querySelector('.art'),name=slot.querySelector('.name');
  const shell=document.createElement('section');shell.className='candidate-shell';shell.dataset.kind=source?.type||'photo';if(source?.playbackMode==='shorts')shell.dataset.playback='shorts';
  const title=document.createElement('div');title.className='candidate-title';title.textContent=participant.n;title.title=participant.n;
  const header=document.createElement('header');header.className='candidate-heading';header.append(title);
  slot.before(shell);shell.append(header,art,slot);art.classList.add('candidate-media');
  name.textContent='SELECT';slot.classList.add('candidate-select');slot.setAttribute('aria-label','Select '+participant.n);slot.replaceChildren(name);
  slot.onclick=()=>root.pick(slot.id==='b'?1:0);
  // Photos retain their existing card-click shortcut and exact fit/position/zoom styles.
  if(!source||source.type==='animation'){art.onclick=()=>slot.click();}
  const entry={cancelled:false,shell,art,name,player:null};live.set(slot,entry);
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
  art.replaceChildren();let checked;try{checked=checkedYoutubeSource(source);}catch{art.textContent='Video unavailable. You can still select this candidate.';return;}
  const host=document.createElement('div');host.className='mixed-player';
  const status=document.createElement('p');status.className='mixed-player-status';status.setAttribute('role','status');
  const shorts=checked.playbackMode==='shorts',pair=()=>shorts&&(alternator.isPair()||entry.alternatingManaged===true),index=side??(slot.id==='a'?0:slot.id==='b'?1:null);if(shorts&&index!==null)alternator.attach(index,entry,checked);const manual=document.createElement('button');manual.type='button';manual.textContent='Play';manual.hidden=true;manual.onclick=()=>{if(entry.cancelled)return;entry.player?.mute();if(pair()){alternator.manual();entry.player?.loadVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});}else entry.player?.playVideo();};const notice=document.createElement('div');notice.className='mixed-player-status';status.className='';status.style.margin='0';notice.append(status,manual);art.append(host,notice);let loading=false,failed=false;entry.onAlternationStopped=message=>{status.textContent=message;manual.hidden=false;if(entry.player?.getPlayerState?.()!==1)notice.hidden=false;};
  const size=()=>{if(entry.cancelled)return;const rect=art.getBoundingClientRect();
   if(rect.width<200||rect.height-notice.getBoundingClientRect().height<200){if(pair())alternator.blocked();clearInterval(entry.muteTimer);entry.player?.destroy();entry.player=null;host.replaceChildren();host.hidden=true;manual.hidden=true;status.textContent='YouTube unavailable: this card is below the required 200 x 200 minimum. Selection remains available.';shell.dataset.playerSize='blocked';return;}
   shell.dataset.playerSize='supported';host.hidden=false;if(entry.player||loading||failed)return;loading=true;status.textContent='Loading YouTube?';
   Promise.resolve().then(loadPlayer).then(YT=>{if(entry.cancelled)return;const r=art.getBoundingClientRect();if(r.width<200||r.height-notice.getBoundingClientRect().height<200){loading=false;size();return;}
    const target=document.createElement('div');host.replaceChildren(target);entry.player=new YT.Player(target,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:checked.videoId,
     playerVars:{autoplay:shorts&&!pair()?1:0,...(shorts?{mute:1,loop:pair()?0:1,...(!pair()?{playlist:checked.videoId}:{})}:{}),controls:1,fs:1,playsinline:1,origin:root.location.origin,start:checked.startSeconds,...(checked.endSeconds===null?{}:{end:checked.endSeconds})},
     events:{onReady:event=>{if(entry.cancelled||entry.player!==event.target){event.target.destroy();return;}if(shorts){event.target.mute();const clip={videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})};if(pair()){event.target.cueVideoById(clip);alternator.ready(entry);}else{event.target.loadVideoById(clip);event.target.playVideo();alternator.ready(entry);}entry.muteTimer=setInterval(()=>{if(!entry.cancelled){event.target.mute();const current=event.target.getCurrentTime?.();if(!pair()&&event.target.getPlayerState?.()===1&&Number.isFinite(current)&&(current<checked.startSeconds||(checked.endSeconds!==null&&current>=checked.endSeconds))){event.target.seekTo(checked.startSeconds,true);event.target.playVideo();}}},200);manual.hidden=pair();if(pair()){status.textContent='';notice.hidden=true;}else status.textContent='Muted loop. If playback stops, press Play.';size();return;}event.target.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});status.textContent='';notice.hidden=true;},
      onError:()=>{if(pair())alternator.blocked();notice.hidden=false;status.textContent='Video unavailable. You can still select this candidate.';},
      onAutoplayBlocked:()=>{if(entry.cancelled)return;if(pair())alternator.blocked();notice.hidden=false;status.textContent='Use the official player controls to play.';if(shorts)manual.hidden=false;},
      onStateChange:event=>{if(entry.cancelled)return;if(shorts){event.target.mute();if(pair()){alternator.event(entry,event.data);if(event.data===1){manual.hidden=true;notice.hidden=true;}return;}if(event.data===0){event.target.seekTo(checked.startSeconds,true);event.target.playVideo();}if(event.data===1){manual.hidden=true;notice.hidden=true;}return;}if(event.data===1)for(const other of live.values())if(other!==entry)try{other.player?.pauseVideo();}catch{}}}});
   }).catch(()=>{failed=true;status.textContent='Video player unavailable. You can still select this candidate.';}).finally(()=>{loading=false;});
  };
  entry.observer=new ResizeObserver(size);entry.observer.observe(art);size();
 };
 root.pick=function(side){if(root.busy||performance.now()<selectionUntil)return;selectionUntil=performance.now()+300;for(const e of live.values()){e.cancelled=true;alternator.detach(e);e.observer?.disconnect();clearInterval(e.muteTimer);try{e.player?.destroy();}catch{}e.embed?.dispose();}return pick?.call(this,side);};
 root.show=function(id){if(id!=='play')stop();const result=show.apply(this,arguments);
  if(id==='end'&&['youtube','giphy','mp4'].includes(root.champ?.media?.type)){const at=generation,candidate=root.champ;queueMicrotask(()=>{const art=document.getElementById('winArt');if(at!==generation||!art||document.getElementById('end')?.classList.contains('hide'))return;winnerHandle=mountCandidateMedia(art,candidate,{showSelect:false,loadPlayer,videoSource});});}return result;};
 root.addEventListener('pagehide',stop);return {dispose:stop};
}

// Creator and champion surfaces use the same lifecycle, without persistence or statistics calls.
export function mountCandidateMedia(container,participant,{onSelect,showSelect=true,loadPlayer=()=>youtubeLibrary(globalThis),videoSource=null,alternator,side=null}={}){
 const slot=document.createElement('button');slot.type='button';slot.className='pick';slot.id='media-choice';let chosen=false;
 const virtual={location:globalThis.location,addEventListener(){},show(){},pick(){if(chosen||!onSelect)return;chosen=true;onSelect();},fill(button,p){button.replaceChildren();const art=document.createElement('div');art.className='art';if(p.media?.type==='mp4'){const image=document.createElement('img');image.className='vs-photo';image.alt=p.n;art.append(image);}const name=document.createElement('span');name.className='name';name.textContent=p.n;button.append(art,name);}};
 container.replaceChildren(slot);const handle=installMixedMediaGame(virtual,{loadPlayer,videoSource,alternator,side});virtual.fill(slot,{...participant,n:participant.n||participant.name||'Candidate'});
 if(!showSelect){slot.hidden=true;container.firstElementChild.classList.add('candidate-champion');}return {element:container,dispose(){handle.dispose();container.replaceChildren();}};
}
