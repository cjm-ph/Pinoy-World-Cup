// Presentation only: the existing captured choose() commits exactly once.
export function installPCBattle(root=window){
 const play=document.getElementById('play'),arena=play?.querySelector('.arena'),bar=play?.querySelector('.bar');if(!play||!arena||!bar)return;
 const desktop=matchMedia('(min-width: 768px)'),title=document.createElement('span'),progress=document.createElement('span');title.className='pc-battle-title';progress.className='pc-battle-progress';bar.append(title,progress);let scene=null;
 const update=()=>{document.body.classList.toggle('pc-battle',desktop.matches&&!play.classList.contains('hide'));title.textContent=root.tour?.title||'';progress.textContent=(document.getElementById('round')?.textContent||'')+' · '+(document.getElementById('count')?.textContent||'').replace(/^Match (\d+) of (\d+)$/,'$1/$2');};
 function clear(advance){if(!scene)return;const s=scene;scene=null;clearTimeout(s.timer);s.element.remove();play.classList.remove('pc-photo-victory');root.busy=false;if(advance&&root.log===s.log&&!play.classList.contains('hide'))s.advance();}
 const render=root.render;root.render=function(){const result=render.apply(this,arguments);update();return result;};
 const show=root.show;root.show=function(id){clear(false);const result=show.apply(this,arguments);update();return result;};
 const isPhoto=p=>p&&!p.media&&!!(p._localPhoto||p.img)&&!(/\.(?:gif|webp\?animated|mp4|webm)(?:[?#]|$)/i.test(p._localPhoto||p.img));
 root.PWCPCPhotoChoice=(side,choose)=>{
  if(!desktop.matches||root.busy||scene||!root.cur?.slice(root.i,root.i+2).every(isPhoto))return false;
  const winner=root.cur[root.i+side],image=arena.querySelector(side?'#b':'#a')?.closest('.candidate-shell')?.querySelector('img.vs-photo');if(!image)return false;
  const bounds=image.parentElement.getBoundingClientRect();const photo=image.cloneNode(false);photo.className='pc-victory-photo';photo.removeAttribute('id');photo.alt=winner.n;photo.style.cssText=image.style.cssText;photo.style.width='100%';photo.style.height='100%';photo.style.position='absolute';photo.style.inset='0';
  const nextRender=root.render,finish=root.finish;let pending=null;
  root.render=()=>{pending=nextRender;};root.finish=()=>{pending=finish;};
  try{choose(side);}finally{root.render=nextRender;root.finish=finish;}
  if(pending===finish){finish.call(root);update();return true;}if(!pending)return true;
  const element=document.createElement('div'),name=document.createElement('div');element.className='pc-photo-interlude';name.className='pc-victory-caption';name.textContent=winner.n;const frame=document.createElement('div');frame.className='pc-victory-frame';frame.style.width=bounds.width+'px';frame.style.height=bounds.height+'px';frame.style.setProperty('--winner-from-x',(bounds.left+bounds.width/2-innerWidth/2)+'px');frame.style.setProperty('--winner-from-y',(bounds.top+bounds.height/2-innerHeight/2)+'px');frame.append(photo);element.append(frame,name);play.append(element);play.classList.add('pc-photo-victory');root.busy=true;
  scene={element,log:root.log,advance:()=>pending.call(root),timer:setTimeout(()=>clear(true),matchMedia('(prefers-reduced-motion:reduce)').matches?60:650)};return true;
 };
 document.getElementById('quit')?.addEventListener('click',()=>clear(false),true);root.addEventListener('pagehide',()=>clear(false));root.addEventListener('resize',()=>{clear(true);update();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clear(true);});desktop.addEventListener('change',()=>{clear(true);update();});update();
 return {dispose(){clear(false);delete root.PWCPCPhotoChoice;document.body.classList.remove('pc-battle');}};
}
