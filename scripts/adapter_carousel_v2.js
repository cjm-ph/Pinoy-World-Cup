(function(root){
 'use strict';
 var hero=document.querySelector('#start .home-hero');
 if(!hero||!root.TOURNAMENTS)return;
 // Presentation overrides stay separate from participant data and VS cropping.
 var presentation=root.PinoyAdapterV2.viewModel.bannerSettings;
 var ids=root.PinoyAdapterV2.viewModel.featured.map(function(f){return f.tournament_id;});
 var entries=ids.map(function(id){return root.TOURNAMENTS.find(function(t){return t.id===id;});}).filter(Boolean);
 if(!entries.length){hero.hidden=true;return;}
 var motion=matchMedia('(prefers-reduced-motion: reduce)'),index=Math.floor(Math.random()*entries.length);
 var timer=null,paused=false,hover=false,focused=false,gesture=null,suppressClickUntil=0;
 var slides=[],dots=[];
 function element(tag,cls,text){var node=document.createElement(tag);node.className=cls;if(text)node.textContent=text;return node;}
 function button(cls,label,text){var node=element('button',cls,text);node.type='button';node.setAttribute('aria-label',label);return node;}
 hero.classList.add('home-carousel');hero.setAttribute('role','region');hero.setAttribute('aria-roledescription','carousel');hero.setAttribute('aria-label','Featured World Cups');
 // Enhance only the hero once; card DOM, search and category state are untouched.
 hero.replaceChildren();
 entries.forEach(function(t,n){
  var slide=button('carousel-slide','Play '+t.title);slide.dataset.tournamentId=t.id;
  var portrait=t.type==='celebrity'||['actor','actress','singer'].includes(t.category)||['actresses','actors','female-singers','male-singers'].includes(t.id);
  if(portrait)slide.classList.add('is-portrait');
  var item=t.items.find(function(p){return p._localPhoto||p.img;})||{};
  var source=(presentation[t.id]||{}).source||t.cover_image||item._localPhoto||item.img;
  var settings=presentation[t.id]||{},position=settings.position||t.cover_object_position||'50% 20%';
  var fallback=element('span','carousel-fallback',item.e||'\u2605');fallback.setAttribute('aria-hidden','true');slide.appendChild(fallback);
  if(source){
   var backdrop=element('img','carousel-backdrop');backdrop.alt='';backdrop.setAttribute('aria-hidden','true');backdrop.src=source;
   var photo=element('img','carousel-photo');photo.alt='';photo.style.objectPosition=position;backdrop.style.objectPosition=position;
   if(settings.fit)photo.style.objectFit=settings.fit;
   if(root.PWCPhotoDisplay&&(settings.b2_zoom||settings.devices))root.PWCPhotoDisplay.apply(photo,settings);
   photo.onload=function(){fallback.hidden=true;};photo.onerror=function(){photo.hidden=true;backdrop.hidden=true;fallback.hidden=false;};
   photo.src=source;slide.append(backdrop,photo);
  }
  var copy=element('span','carousel-copy');
  var category=root.PinoyAdapterV2.viewModel.categoryLabels[t.id];
  copy.append(element('span','carousel-category',category),element('span','carousel-title',t.title));
  slide.append(element('span','carousel-shade'),copy);
  slide.onclick=function(event){if(Date.now()<suppressClickUntil){event.preventDefault();return;}root.start(t);};
  hero.appendChild(slide);slides.push(slide);
 });
 var controls=element('div','carousel-controls'),previous=button('carousel-control','Previous featured World Cup','\u2039'),next=button('carousel-control','Next featured World Cup','\u203a');
 var group=element('div','carousel-dots');group.setAttribute('role','group');group.setAttribute('aria-label','Choose featured World Cup');
 entries.forEach(function(t,n){var dot=button('carousel-dot',t.title+', '+(n+1)+' of '+entries.length);dot.onclick=function(){show(n,true);};group.appendChild(dot);dots.push(dot);});
 controls.append(previous,group,next);hero.appendChild(controls);
 var pause=button('carousel-control carousel-pause','Pause automatic slides','\u23f8');hero.appendChild(pause);
 var status=element('span','carousel-sr-only');status.setAttribute('role','status');status.setAttribute('aria-live','polite');hero.appendChild(status);
 function schedule(){
  clearTimeout(timer);timer=null;
  var home=document.getElementById('start');
  if(paused||hover||focused||motion.matches||document.hidden||home.classList.contains('hide')||document.querySelector('dialog[open]'))return;
  timer=setTimeout(function(){show(index+1,false);},6000);
 }
 function show(n,manual){
  index=(n+entries.length)%entries.length;
  slides.forEach(function(slide,k){var active=k===index;slide.classList.toggle('is-active',active);slide.tabIndex=active?0:-1;slide.inert=!active;slide.setAttribute('aria-hidden',String(!active));dots[k].setAttribute('aria-current',String(active));dots[k].tabIndex=active?0:-1;});
  hero.dataset.currentTournament=entries[index].id;
  if(manual)status.textContent=entries[index].title+', '+(index+1)+' of '+entries.length;
  schedule();
 }
 function updatePause(){pause.disabled=motion.matches;pause.setAttribute('aria-pressed',String(paused||motion.matches));pause.textContent=paused||motion.matches?'\u25b6':'\u23f8';pause.setAttribute('aria-label',motion.matches?'Automatic slides disabled for reduced motion':paused?'Resume automatic slides':'Pause automatic slides');schedule();}
 previous.onclick=function(){show(index-1,true);};next.onclick=function(){show(index+1,true);};
 pause.onclick=function(){paused=!paused;updatePause();};
 hero.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'){hover=true;schedule();}});
 hero.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse'){hover=false;schedule();}});
 hero.addEventListener('focusin',function(){focused=true;schedule();});
 hero.addEventListener('focusout',function(){queueMicrotask(function(){focused=hero.contains(document.activeElement);schedule();});});
 hero.addEventListener('keydown',function(e){
  var target=e.key==='ArrowLeft'?index-1:e.key==='ArrowRight'?index+1:e.key==='Home'?0:e.key==='End'?entries.length-1:null;
  if(target===null)return;e.preventDefault();var dotFocus=group.contains(document.activeElement);show(target,true);if(dotFocus)dots[index].focus();
 });
 hero.addEventListener('pointerdown',function(e){if(e.isPrimary&&e.target.closest('.carousel-slide'))gesture={id:e.pointerId,x:e.clientX,y:e.clientY};});
 root.addEventListener('pointerup',function(e){
  if(!gesture||e.pointerId!==gesture.id)return;var dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;
  if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClickUntil=Date.now()+450;show(index+(dx<0?1:-1),true);}
 });
 root.addEventListener('pointercancel',function(){gesture=null;});
 document.addEventListener('visibilitychange',schedule);motion.addEventListener('change',updatePause);
 var observer=new MutationObserver(schedule);observer.observe(document.getElementById('start'),{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('dialog').forEach(function(dialog){observer.observe(dialog,{attributes:true,attributeFilter:['open']});});
 root.addEventListener('pagehide',function(){clearTimeout(timer);});
 root.addEventListener('pageshow',schedule);
 show(index,false);updatePause();
})(window);
