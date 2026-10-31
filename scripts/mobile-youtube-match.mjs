import {checkedYoutubePlayback} from './shorts-sound.mjs';
import {createShortsAlternator} from './shorts-alternator.mjs';
// One visible official iframe, ID-only game/selection state remains in the existing engine.
export function mountMobileYoutubeMatch({arena,entries,sound,loadPlayer}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const sources=entries.map(e=>{try{return e.sharedYoutube?checkedYoutubePlayback(e.sharedYoutube):null;}catch{return null;}}),pair=sources.every(s=>s?.playbackMode==='shorts');
 const panel=el('section',undefined,'mobile-youtube-panel'),tabs=el('nav',undefined,'mobile-youtube-tabs'),stage=el('div',undefined,'mobile-youtube-stage'),host=el('div',undefined,'mobile-youtube-frame'),status=el('p',undefined,'mobile-youtube-status');
 tabs.setAttribute('aria-label','Video candidate');status.setAttribute('role','status');status.hidden=true;panel.hidden=true;stage.append(host);panel.append(tabs,stage,status);arena.append(panel);
 let player=null,alternator=null,logical=[],active=sources.findIndex(Boolean),closed=false,opened=false,loading=false,timer=null,version=0;const buttons=[];
 const message=text=>{if(status.textContent!==text)status.textContent=text;status.hidden=!text;};
 const clip=side=>({videoId:sources[side].videoId,startSeconds:sources[side].startSeconds,...(sources[side].endSeconds===null?{}:{endSeconds:sources[side].endSeconds})});
 function paint(){buttons.forEach(([b,side])=>b.setAttribute('aria-pressed',String(active===side)));}
 function fit(){if(closed||!opened)return false;const a=arena.getBoundingClientRect(),top=Math.max(...entries.map(e=>e.shell.querySelector('.candidate-heading').getBoundingClientRect().bottom))-a.top,bottom=Math.min(...entries.map(e=>e.slot.getBoundingClientRect().top))-a.top;
  panel.style.top=top+'px';panel.style.height=Math.max(0,bottom-top-40)+'px';arena.style.setProperty('--mobile-youtube-vs-top',(bottom-20)+'px');
  const box=stage.getBoundingClientRect(),ratio=sources[active]?.playbackMode==='shorts'?9/16:16/9,{width:w,height:h}=mobileYoutubeFrame(box.width,box.height,ratio);
  host.style.width=w+'px';host.style.height=h+'px';if(w<200||h<200){message('More video space is needed. Rotate your device or close the player to select a candidate.');return false;}return true;
 }
 function soundForSide(){if(!player)return;if(sources[active].playbackMode==='shorts'){sound.attach(player);sound.apply(player);}else{sound.detach(player);player.unMute?.();}}
 function activate(side){active=side;paint();fit();soundForSide();}
 function release(){version++;clearInterval(timer);timer=null;alternator?.dispose();alternator=null;logical=[];if(player){sound.detach(player);try{player.destroy();}catch{}}player=null;host.replaceChildren();loading=false;}
 function close(){opened=false;release();panel.hidden=true;delete arena.dataset.mobileYoutubeActive;message('');}
 function setupPair(){alternator=createShortsAlternator();logical=entries.map((e,side)=>({cancelled:false,applySound:()=>soundForSide(),onAlternationStopped:text=>message(text||'Use the official player controls to play.'),player:{getPlayerState:()=>active===side?player?.getPlayerState?.():2,getCurrentTime:()=>active===side?player?.getCurrentTime?.():0,loadVideoById:value=>{activate(side);player.loadVideoById(value);},playVideo:()=>player.playVideo(),pauseVideo:()=>{if(active===side)player.pauseVideo();}}}));logical.forEach((e,side)=>alternator.attach(side,e,sources[side]));logical.forEach(e=>alternator.ready(e));}
 async function open(side=active){if(closed)return;active=side;paint();opened=true;panel.hidden=false;arena.dataset.mobileYoutubeActive='true';message('');if(!fit())return;
  if(player){alternator?.manual();activate(side);player.loadVideoById(clip(side));player.playVideo();return;}
  if(loading)return;loading=true;const at=++version;
  try{const YT=await loadPlayer();if(closed||!opened||at!==version)return;if(!fit())return;const target=el('div');host.replaceChildren(target);
   player=new YT.Player(target,{host:'https://www.youtube-nocookie.com',width:host.clientWidth,height:host.clientHeight,videoId:sources[active].videoId,playerVars:{autoplay:0,controls:1,fs:1,playsinline:1,origin:location.origin,start:sources[active].startSeconds,...(sources[active].endSeconds===null?{}:{end:sources[active].endSeconds})},events:{
    onReady:event=>{if(closed||!opened||at!==version||event.target!==player){event.target.destroy();return;}const frame=player.getIframe?.()||host.querySelector('iframe'),rect=frame?.getBoundingClientRect();if(!rect||rect.width<200||rect.height<200){release();message('The video player does not meet the required minimum size.');return;}
     soundForSide();if(pair)setupPair();else{player.cueVideoById(clip(active));if(sources[active].playbackMode==='shorts'){player.loadVideoById(clip(active));player.playVideo();}}
     if(!pair&&sources.some(s=>s?.playbackMode==='shorts'))timer=setInterval(()=>{if(closed||!player||pair||sources[active].playbackMode!=='shorts'||player.getPlayerState?.()!==1)return;const t=player.getCurrentTime?.(),s=sources[active];if(Number.isFinite(t)&&(t<s.startSeconds||(s.endSeconds!==null&&t>=s.endSeconds))){player.seekTo(s.startSeconds,true);player.playVideo();}},200);
    },
    onStateChange:event=>{if(event.target!==player||closed||!opened)return;if(player.getPlayerState?.()!==event.data)return;if(event.data===1)message('');if(pair){alternator?.event(logical[active],event.data);return;}if(event.data===0&&sources[active].playbackMode==='shorts'){player.seekTo(sources[active].startSeconds,true);player.playVideo();}},
    onAutoplayBlocked:()=>{if(closed||!opened)return;alternator?.blocked(logical[active]);message('Automatic playback was blocked. Use the official player controls to play.');},
    onError:()=>{if(closed||!opened)return;alternator?.blocked(logical[active]);message('Video unavailable. You can still select either candidate.');}
   }});
  }catch{if(!closed&&opened&&at===version)message('Video player could not be loaded. Close and reopen it to retry.');}finally{if(at===version)loading=false;}
 }
 sources.forEach((source,side)=>{if(!source)return;const b=el('button',side===0?'Left video':'Right video');b.type='button';b.setAttribute('aria-label','Play '+(side===0?'left':'right')+' video: '+entries[side].participant.n);b.onclick=()=>void open(side);tabs.append(b);buttons.push([b,side]);entries[side].launch.onclick=()=>void open(side);});
 const back=el('button','View candidates');back.type='button';back.onclick=close;tabs.append(back);paint();
 const resize=()=>{if(!opened)return;if(!fit()){release();return;}const f=player?.getIframe?.()||host.querySelector('iframe');if(f){const r=f.getBoundingClientRect();if(r.width<200||r.height<200){release();message('More video space is needed. Rotate your device to play.');}}};
 const observer=new ResizeObserver(resize);observer.observe(arena);observer.observe(stage);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
 if(sources.every(Boolean))void open(active);
 return {entries,open,dispose(){if(closed)return;close();closed=true;observer.disconnect();window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);panel.remove();arena.style.removeProperty('--mobile-youtube-vs-top');}};
}

export function mobileYoutubeFrame(width,height,ratio){
 if(!Number.isFinite(width)||!Number.isFinite(height)||!Number.isFinite(ratio)||width<0||height<0||ratio<=0)return {width:0,height:0};
 const w=Math.min(width,height*ratio);return {width:w,height:w/ratio};
}
