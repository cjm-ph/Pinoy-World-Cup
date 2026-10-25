import {youtubeSource} from './candidate-media-policy.mjs';
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
// Presentation adapter only. No choice, bracket or statistics mutation.
export function installMixedMediaGame(root,{loadPlayer=()=>youtubeLibrary(root),videoSource=null}={}){
 const fill=root.fill,show=root.show,live=new Map();let winnerHandle=null,generation=0;
 const dispose=slot=>{const entry=live.get(slot);if(entry){entry.cancelled=true;try{entry.player?.destroy();}catch{}if(entry.shell?.isConnected)entry.shell.replaceWith(slot);live.delete(slot);}};
 const stop=()=>{generation++;winnerHandle?.dispose();winnerHandle=null;for(const slot of [...live.keys()])dispose(slot);};
 root.fill=function(slot,participant){
  dispose(slot);fill.call(this,slot,participant);
  slot.classList.remove('mixed-video-candidate');slot.onclick=()=>root.pick(slot.id==='b'?1:0);
  const source=participant.media;if(!source)return;
  if(source.type==='giphy'){
   const shell=document.createElement('section');shell.className='giphy-shell';
   const embed=createGiphyEmbed(source,{name:participant.n});
   slot.before(shell);shell.append(embed.element,slot);slot.classList.add('giphy-select');
   const art=slot.querySelector('.art');if(art)art.hidden=true;
   slot.querySelector('.name').textContent='Select '+participant.n;
   const entry={cancelled:false,shell,player:{destroy(){embed.dispose();slot.classList.remove('giphy-select');}}};live.set(slot,entry);return;
  }
  if(source.type==='mp4'){
   const image=slot.querySelector('.vs-photo');
   if(!image||typeof videoSource!=='function'||!/^video_[a-f0-9-]{36}$/.test(source.video_id||''))return;
   const entry={cancelled:false,player:null};live.set(slot,entry);
   Promise.resolve().then(()=>videoSource(source)).then(data=>{if(entry.cancelled){data.release?.();return;}try{const handle=mountLocalMp4(image,data);entry.player={destroy:()=>{handle.dispose();data.release?.();}};}catch(e){data.release?.();throw e;}}).catch(()=>{});
   return;
  }
  if(source.type==='animation'){
   if(!/^source_[0-9a-f-]{36}$/.test(source.source_id||''))return;
   const image=slot.querySelector('.vs-photo');if(image)image.src='/animated-media?source='+encodeURIComponent(source.source_id);return;
  }
  if(source.type!=='youtube')return;
  let checked;try{checked=youtubeSource(source.url,source.startSeconds,source.endSeconds);}catch{return;}
  slot.classList.add('mixed-video-candidate');
  const art=slot.querySelector('.art');art.textContent='';
  const host=document.createElement('div');host.className='mixed-player';host.hidden=true;
  const poster=document.createElement('img');poster.className='mixed-video-poster';poster.alt=participant.n;poster.src=participant._localPhoto||participant.img||checked.thumbnailUrl;poster.onerror=()=>{poster.hidden=true;};
  const status=document.createElement('p');status.className='mixed-player-status';status.setAttribute('role','status');status.textContent='Press Play video. Select this candidate separately to choose a winner.';
  const play=document.createElement('button');play.type='button';play.textContent='Play video';
  // Stop parent selection for every player control, including keyboard activation.
  art.addEventListener('click',event=>event.stopPropagation());art.addEventListener('keydown',event=>event.stopPropagation());
  art.append(poster,host,play,status);
  // Keep the original engine button as the winner selector; controls are siblings,
  // never interactive children of a button. Preserve the VS module's button references.
  const shell=document.createElement('section');shell.className='mixed-video-shell';slot.before(shell);shell.append(art,slot);
  slot.querySelector('.name').textContent='Select '+participant.n;
  const entry={cancelled:false,player:null,shell};live.set(slot,entry);
  play.onclick=async event=>{event.stopPropagation();play.disabled=true;host.hidden=false;poster.hidden=true;
   try{const YT=await loadPlayer();if(entry.cancelled||!slot.isConnected)return;
    if(entry.player){if(entry.ended)entry.player.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});entry.ended=false;entry.player.playVideo();play.disabled=false;return;}
    entry.player=new YT.Player(host,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:checked.videoId,
     playerVars:{autoplay:0,playsinline:1,origin:root.location.origin,start:checked.startSeconds,...(checked.endSeconds===null?{}:{end:checked.endSeconds})},
     events:{onReady:event=>{if(entry.cancelled){event.target.destroy();return;}event.target.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});event.target.playVideo?.();status.textContent='Use the video controls to play. Select a winner separately.';play.disabled=false;},
      onAutoplayBlocked:()=>{status.textContent='Press Play in the video controls.';play.disabled=false;},
      onError:()=>{status.textContent='Video unavailable. You can still select this candidate.';play.disabled=false;},
      onStateChange:event=>{if(entry.cancelled)return;if(event.data===0){entry.ended=true;status.textContent='Video ended. Select a winner to continue.';}if(event.data===1)for(const other of live.values())if(other!==entry)try{other.player?.pauseVideo();}catch{}}}});
   }catch{status.textContent='Video player unavailable. You can still select this candidate.';play.disabled=false;}
  };
 };
 root.show=function(id){if(id!=='play')stop();const result=show.apply(this,arguments);
  if(id==='end'&&['youtube','giphy'].includes(root.champ?.media?.type)){const at=generation,candidate=root.champ;queueMicrotask(()=>{const art=document.getElementById('winArt');if(at!==generation||!art||document.getElementById('end')?.classList.contains('hide'))return;winnerHandle=mountCandidateMedia(art,candidate,{showSelect:false,loadPlayer});});}
  return result;};
 root.addEventListener('pagehide',stop);return {dispose:stop};
}

// Reuse the game adapter for Creator preview and champion surfaces. No persistence/vote API.
export function mountCandidateMedia(container,participant,{onSelect,showSelect=true,loadPlayer=()=>youtubeLibrary(globalThis)}={}){
 const slot=document.createElement('button');slot.type='button';slot.className='pick';slot.id='media-choice';let chosen=false;
 const virtual={location:globalThis.location,addEventListener(){},show(){},pick(){if(chosen||!onSelect)return;chosen=true;onSelect();},fill(button,p){button.replaceChildren();const art=document.createElement('div');art.className='art';const name=document.createElement('span');name.className='name';name.textContent=p.n;button.append(art,name);}};
 container.replaceChildren(slot);const handle=installMixedMediaGame(virtual,{loadPlayer});virtual.fill(slot,{...participant,n:participant.n||participant.name||'Candidate'});
 if(!showSelect)slot.style.display='none';return {element:container,dispose(){handle.dispose();container.replaceChildren();}};
}
