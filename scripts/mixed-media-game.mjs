import {youtubeSource} from './candidate-media-policy.mjs';
let playerLibrary;
function youtubeLibrary(root){
 if(root.YT?.Player)return Promise.resolve(root.YT);
 if(!playerLibrary)playerLibrary=new Promise((resolve,reject)=>{
  const previous=root.onYouTubeIframeAPIReady;
  const timeout=setTimeout(()=>reject(Error('Video player unavailable')),15000);
  root.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);try{previous?.();}catch{}resolve(root.YT);};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);reject(Error('Video player unavailable'));};document.head.append(script);
 });return playerLibrary;
}
// Presentation adapter only. No choice, bracket or statistics mutation.
export function installMixedMediaGame(root,{loadPlayer=()=>youtubeLibrary(root)}={}){
 const fill=root.fill,show=root.show,live=new Map();
 const dispose=slot=>{const entry=live.get(slot);if(entry){entry.cancelled=true;try{entry.player?.destroy();}catch{}if(entry.shell?.isConnected)entry.shell.replaceWith(slot);live.delete(slot);}};
 const stop=()=>{for(const slot of [...live.keys()])dispose(slot);};
 root.fill=function(slot,participant){
  dispose(slot);fill.call(this,slot,participant);
  slot.classList.remove('mixed-video-candidate');slot.onclick=()=>root.pick(slot.id==='b'?1:0);
  const source=participant.media;if(!source)return;
  if(source.type==='animation'){
   if(!/^source_[0-9a-f-]{36}$/.test(source.source_id||''))return;
   const image=slot.querySelector('.vs-photo');if(image)image.src='/animated-media?source='+encodeURIComponent(source.source_id);return;
  }
  if(source.type!=='youtube')return;
  let checked;try{checked=youtubeSource(source.url,source.startSeconds,source.endSeconds);}catch{return;}
  slot.classList.add('mixed-video-candidate');
  const art=slot.querySelector('.art');art.textContent='';
  const host=document.createElement('div');host.className='mixed-player';
  const status=document.createElement('p');status.className='mixed-player-status';status.setAttribute('role','status');status.textContent='Press Play video. Select this candidate separately to choose a winner.';
  const play=document.createElement('button');play.type='button';play.textContent='Play video';
  // Stop parent selection for every player control, including keyboard activation.
  art.addEventListener('click',event=>event.stopPropagation());art.addEventListener('keydown',event=>event.stopPropagation());
  art.append(host,play,status);
  // Keep the original engine button as the winner selector; controls are siblings,
  // never interactive children of a button. Preserve the VS module's button references.
  const shell=document.createElement('section');shell.className='mixed-video-shell';slot.before(shell);shell.append(art,slot);
  slot.querySelector('.name').textContent='Select '+participant.n;
  const entry={cancelled:false,player:null,shell};live.set(slot,entry);
  play.onclick=async event=>{event.stopPropagation();play.disabled=true;
   try{const YT=await loadPlayer();if(entry.cancelled||!slot.isConnected)return;
    if(entry.player){if(entry.ended)entry.player.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});entry.ended=false;entry.player.playVideo();play.disabled=false;return;}
    entry.player=new YT.Player(host,{host:'https://www.youtube-nocookie.com',width:'100%',height:'100%',videoId:checked.videoId,
     playerVars:{autoplay:0,playsinline:1,origin:root.location.origin,start:checked.startSeconds,...(checked.endSeconds===null?{}:{end:checked.endSeconds})},
     events:{onReady:event=>{if(entry.cancelled){event.target.destroy();return;}event.target.cueVideoById({videoId:checked.videoId,startSeconds:checked.startSeconds,...(checked.endSeconds===null?{}:{endSeconds:checked.endSeconds})});status.textContent='Use the video controls to play. Select a winner separately.';play.disabled=false;},
      onAutoplayBlocked:()=>{status.textContent='Press Play in the video controls.';play.disabled=false;},
      onError:()=>{status.textContent='Video unavailable. You can still select this candidate.';play.disabled=false;},
      onStateChange:event=>{if(entry.cancelled)return;if(event.data===0){entry.ended=true;status.textContent='Video ended. Select a winner to continue.';}if(event.data===1)for(const other of live.values())if(other!==entry)try{other.player?.pauseVideo();}catch{}}}});
   }catch{status.textContent='Video player unavailable. You can still select this candidate.';play.disabled=false;}
  };
 };
 root.show=function(id){if(id!=='play')stop();return show.apply(this,arguments);};
 root.addEventListener('pagehide',stop);return {dispose:stop};
}
