/* VS presentation only. Shared choose/render/selection/result functions are unchanged. */
(function(root){
'use strict';
var arena=document.querySelector('#play .arena');
var overrides=Object.create(null);
var photoSettings=root.WorldCupVSPhotoSettings;
// Reuse known image-specific cover alignment only for the matching participant photo.
root.TOURNAMENTS.forEach(function(t){
 t.items.forEach(function(p){
  var config=photoSettings.byName[p.n];
  overrides[p.id]=config?Object.assign({},config):{};
  if(t.cover_image&&(p._localPhoto||p.img)===t.cover_image&&t.cover_object_position){
   overrides[p.id].position=t.cover_object_position;
  }
 });
});
// Optional per-person settings are test-only; never write back to participant records.
// photos[id] = {fit:'contain'|'cover', position:'50% 15%', head:[x,y,w,h]}.
// Cover is the default. A configured head that cannot fit becomes a responsive exception.
root.WorldCupVSPresentation={photos:overrides};
function chooseFit(image,participant,settings){
 var art=image.parentElement;
 if(!image.isConnected||!art||!art.parentElement||!art.clientWidth||!art.clientHeight)return;
 var w=art.clientWidth,h=art.clientHeight,nw=image.naturalWidth,nh=image.naturalHeight;
 var explicit=settings.fit||participant.vs_object_fit||participant.object_fit;
 var fit=explicit==='contain'?'contain':'cover';
 var position=settings.position||participant.vs_object_position||participant.object_position||'50% 50%';
 image.style.cssText='';
 ['region','head','paintScale','paintX','paintY'].forEach(function(key){delete image.dataset[key];});
 var head=settings.head;
 if(head&&!explicit){
  var cover=Math.max(w/nw,h/nh);
  var name=art.parentElement.querySelector('.name');
  var reserved=name?Math.max(50,name.clientHeight-55):60;
  // Normalize head size where the original composition permits, preserving hair/face.
  var safe=Math.min((w-8)/(nw*head[2]),Math.max(1,h-reserved-16)/(nh*head[3]));
  var scale=Math.min(Math.max(cover,w*.78/(nw*head[2])),safe);
  fit=scale+0.00001>=cover?'cover':'contain';
  var iw=nw*scale,ih=nh*scale;
  var x=w/2-(head[0]+head[2]/2)*iw;
  var y=h*.30-(head[1]+head[3]/2)*ih;
  x=Math.max(4-head[0]*iw,Math.min(w-4-(head[0]+head[2])*iw,x));
  y=Math.max(8-head[1]*ih,Math.min(h-reserved-(head[1]+head[3])*ih,y));
  if(fit==='cover'){
   x=Math.max(w-iw,Math.min(0,x));y=Math.max(h-ih,Math.min(0,y));
  }
  var px=Math.abs(w-iw)<.01?.5:Math.max(0,Math.min(1,x/(w-iw)));
  var py=Math.abs(h-ih)<.01?.5:Math.max(0,Math.min(1,y/(h-ih)));
  position=(px*100).toFixed(3)+'% '+(py*100).toFixed(3)+'%';
  var base=fit==='cover'?cover:Math.min(w/nw,h/nh),zoom=scale/base;
  var tx=x-zoom*(w-nw*base)*px,ty=y-zoom*(h-nh*base)*py;
  image.style.transformOrigin='0 0';
  image.style.transform='matrix('+zoom+',0,0,'+zoom+','+tx+','+ty+')';
  image.dataset.head=JSON.stringify(head);
  image.dataset.paintScale=String(scale);
  var rect=art.getBoundingClientRect();
  image.dataset.paintX=String(rect.left+x);image.dataset.paintY=String(rect.top+y);
  image.dataset.fit=fit==='cover'?'cover':'contain-head';
 }else image.dataset.fit=fit;
 image.style.objectFit=fit;image.style.objectPosition=position;
}
// The engine calls this global display function for both choices every match.
root.fill=function(button,participant){
 button.textContent='';
 button.setAttribute('aria-label','Pick '+participant.n);
 button.dataset.participantId=participant.id;
 var art=document.createElement('div');art.className='art';
 var fallback=document.createElement('span');fallback.className='vs-fallback';
 fallback.textContent=participant.e||'\u2605';art.appendChild(fallback);
 var source=participant._localPhoto||participant.img;
 if(source){
  var settings=overrides[participant.id]||{};
  var background=document.createElement('img');background.className='vs-backdrop';
  background.alt='';background.setAttribute('aria-hidden','true');background.src=source;
  var image=document.createElement('img');image.className='vs-photo';image.alt='';
  image.onload=function(){
   fallback.hidden=true;chooseFit(image,participant,settings);
  };
  image.onerror=function(){image.hidden=true;background.hidden=true;fallback.hidden=false;};
  image.src=source;
  image._vsParticipant=participant;image._vsSettings=settings;
  art.appendChild(background);art.appendChild(image);
 }
 var name=document.createElement('div');name.className='name';name.textContent=participant.n;
 button.appendChild(art);button.appendChild(name);
};
// Recalculate display geometry after viewport/slot changes, without restarting a match.
var observer=new ResizeObserver(function(){
 arena.querySelectorAll('.vs-photo').forEach(function(image){
  if(image.naturalWidth)chooseFit(image,image._vsParticipant,image._vsSettings);
 });
});
observer.observe(arena);

// Selection presentation owns only the delay/effect; the unchanged engine choose()
// still records the winner, advances rounds and renders the result exactly once.
var engineChoose=root.choose,activeChoice=null;
var play=document.getElementById('play');
var choices=[document.getElementById('a'),document.getElementById('b')];
var reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
function isCurrent(session){
 return !play.classList.contains('hide')&&root.cur===session.cur&&root.i===session.index&&root.log===session.log&&root.log.length===session.logLength;
}
function finishChoice(session,advance){
 if(activeChoice!==session||session.done)return;
 var valid=isCurrent(session);session.done=true;activeChoice=null;
 clearTimeout(session.timer);
 session.animations.forEach(function(animation){try{animation.cancel();}catch(ignored){}});
 if(session.layer)session.layer.remove();
 arena.classList.add('vs-resetting');
 arena.classList.remove('vs-selecting','vs-has-victory','vs-reduced-choice');
 arena.removeAttribute('aria-busy');
 choices.forEach(function(button){button.classList.remove('win','lose');button.disabled=false;button.removeAttribute('aria-disabled');});
 // Reset the old scene without fading it back in underneath the next match.
 void arena.offsetWidth;arena.classList.remove('vs-resetting');
 root.busy=false;
 if(advance&&valid)engineChoose(session.side);
}
function winnerScene(session,winner){
 var arenaRect=arena.getBoundingClientRect(),rect=winner.getBoundingClientRect();
 var layer=document.createElement('div');layer.className='vs-victory';layer.setAttribute('aria-hidden','true');
 session.layer=layer;
 var frame=document.createElement('div');frame.className='pick vs-victory-frame';
 frame.style.left=(rect.left-arenaRect.left)+'px';frame.style.top=(rect.top-arenaRect.top)+'px';
 frame.style.width=rect.width+'px';frame.style.height=rect.height+'px';
 var art=winner.querySelector('.art').cloneNode(true);
 var photo=winner.querySelector('.vs-photo');
 var awaitingCrop=photo&&(!photo.naturalWidth||!photo.dataset.fit);
 // Preserve the exact painted photo/crop; cloned images are not live match images.
 art.querySelectorAll('.vs-photo').forEach(function(image){
  image.classList.replace('vs-photo','vs-victory-image');
  if(awaitingCrop)image.hidden=true;
 });
 if(awaitingCrop){
  var backdrop=art.querySelector('.vs-backdrop'),fallback=art.querySelector('.vs-fallback');
  if(backdrop)backdrop.hidden=true;
  if(fallback)fallback.hidden=false;
 }
 frame.appendChild(art);layer.appendChild(frame);
 var name=document.createElement('div');name.className='name vs-victory-name';
 name.textContent=winner.querySelector('.name').textContent;layer.appendChild(name);
 arena.appendChild(layer);
 var originY=rect.height*.35,scale=arenaRect.width<768?1.65:1.28,dy=0;
 if(photo&&photo.naturalWidth&&photo.dataset.head){
  var bounds=JSON.parse(photo.dataset.head),paint=Number(photo.dataset.paintScale);
  var head={x:Number(photo.dataset.paintX)+bounds[0]*photo.naturalWidth*paint-rect.left,
   y:Number(photo.dataset.paintY)+bounds[1]*photo.naturalHeight*paint-rect.top,
   w:bounds[2]*photo.naturalWidth*paint,h:bounds[3]*photo.naturalHeight*paint};
  frame.dataset.head=JSON.stringify(head);
  originY=head.y+head.h/2;
  var extent=Math.max(Math.abs(head.x-rect.width/2),Math.abs(head.x+head.w-rect.width/2));
  // Reserve visible caption text, not its transparent gradient padding.
  var reserved=Math.max(48,name.clientHeight-parseFloat(getComputedStyle(name).paddingTop)+8);
  scale=Math.max(1,Math.min(scale,(arenaRect.width/2-12)/extent,(arenaRect.height-reserved-16)/head.h));
  var center=Math.max(8+head.h*scale/2,Math.min(arenaRect.height-reserved-head.h*scale/2,originY));
  dy=center-originY;
 }
 var dx=arenaRect.width/2-(rect.left-arenaRect.left+rect.width/2);
 frame.style.transformOrigin=(rect.width/2)+'px '+originY+'px';
 var target='translate3d('+dx+'px,'+dy+'px,0) scale('+scale+')';
 frame.dataset.targetScale=String(scale);
 arena.classList.add('vs-has-victory');
 try{
  var move=frame.animate([{transform:'translate3d(0,0,0) scale(1)'},{transform:target}],
   {duration:620,easing:'cubic-bezier(.22,.78,.18,1)',fill:'forwards'});
  session.animations.push(move);move.finished.catch(function(){});
  var caption=name.animate([{opacity:0},{opacity:1}],{delay:140,duration:300,easing:'ease-out',fill:'both'});
  session.animations.push(caption);caption.finished.catch(function(){});
 }catch(ignored){
  // Missing/cancelled animation support cannot prevent the independent deadline.
  frame.style.transform=target;name.style.opacity='1';
 }
}
root.pick=function(side){
 if(root.busy||activeChoice||play.classList.contains('hide'))return;
 side=side?1:0;
 var session={side:side,cur:root.cur,index:root.i,log:root.log,logLength:root.log.length,animations:[],done:false};
 root.busy=true;activeChoice=session;
 // The deadline never depends on animationend/finished, including cancellation.
 session.timer=setTimeout(function(){finishChoice(session,true);},reducedMotion.matches?40:900);
 // Keep keyboard focus on the existing button; busy + pointer blocking reject repeats.
 choices.forEach(function(button){button.setAttribute('aria-disabled','true');});
 arena.setAttribute('aria-busy','true');
 choices[side].classList.add('win');choices[1-side].classList.add('lose');
 if(reducedMotion.matches){arena.classList.add('vs-reduced-choice');return;}
 arena.classList.add('vs-selecting');
 try{winnerScene(session,choices[side]);}catch(ignored){/* Deadline still commits the original choice. */}
};
document.getElementById('quit').addEventListener('click',function(){if(activeChoice)finishChoice(activeChoice,false);},true);
new MutationObserver(function(){if(activeChoice&&!isCurrent(activeChoice))finishChoice(activeChoice,false);})
 .observe(play,{attributes:true,attributeFilter:['class']});
root.addEventListener('resize',function(){if(activeChoice)finishChoice(activeChoice,true);});
document.addEventListener('visibilitychange',function(){if(document.hidden&&activeChoice)finishChoice(activeChoice,true);});
reducedMotion.addEventListener('change',function(event){if(event.matches&&activeChoice)finishChoice(activeChoice,true);});
root.addEventListener('pagehide',function(){if(activeChoice)finishChoice(activeChoice,false);});
})(window);
