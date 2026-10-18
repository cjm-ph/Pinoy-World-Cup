(function(root){
var uniqueActive=root.WorldCupSelection.uniqueActive,select=root.WorldCupSelection.select;
var tournaments=root.TOURNAMENTS;
tournaments.forEach(function(t){t.items.forEach(function(p,index){p.id=p.id||t.id+':'+index;p.person_id=p.person_id||p.id;});});
var visitorId;
try{visitorId=localStorage.getItem('pinoy-anonymous-visitor-v1');if(!visitorId || !/^[a-f0-9-]{36}$/i.test(visitorId)){visitorId=crypto.randomUUID();localStorage.setItem('pinoy-anonymous-visitor-v1',visitorId);}}
catch(error){visitorId=crypto.randomUUID();}
var previousStart=root.start;
var lastSize=32,starting=false;
var dialog=document.getElementById('roundSelection');
var options=document.getElementById('roundOptions');
var message=document.getElementById('expansionStatus');
var selectedTournament=null;
function announce(text){message.textContent=text;}
// Test-only one-tap picker; selection and bracket generation remain shared.
var names={4:'Semi-finals',8:'Quarter-finals',16:'Round of 16',32:'Round of 32'};
var frame=dialog.querySelector('.round-photo-frame');
var hero=document.getElementById('roundHero');
var back=document.getElementById('cancelRound');
var error=document.getElementById('roundError');
var generation=0;
function buttonsDisabled(disabled){options.querySelectorAll('button').forEach(function(button){button.disabled=disabled;});}
function returnHome(){dialog.close();root.goHome();}
root.start=function(t){
 if(dialog.open)return;
 selectedTournament=tournaments.find(function(source){return source.id===(t||root.tour).id;});
 if(!selectedTournament)return;
 starting=false;error.hidden=true;error.textContent='';
 var session=++generation;
 document.getElementById('roundTitle').textContent=selectedTournament.title;
 var count=uniqueActive(selectedTournament.items).length;
 var sizes=[4,8,16,32].filter(function(size){return count>=size;});
 lastSize=sizes.length?sizes[sizes.length-1]:32;
 options.textContent='';
 sizes.forEach(function(size){
  var button=document.createElement('button');button.type='button';button.className='round-choice';
  button.dataset.roundSize=String(size);button.setAttribute('aria-label',names[size]+' ('+size+')');
  var name=document.createElement('span');name.className='round-choice-title';name.textContent=names[size];
  var participants=document.createElement('span');participants.className='round-choice-count';participants.textContent=size+' participants';
  button.appendChild(name);button.appendChild(participants);
  button.onclick=function(event){event.preventDefault();event.stopPropagation();if(dialog.open&&session===generation&&button.isConnected&&!button.disabled)begin(selectedTournament,size);};
  options.appendChild(button);
 });
 document.getElementById('roundEmpty').hidden=sizes.length>0;
 frame.textContent='';hero.querySelectorAll('.round-photo-backdrop').forEach(function(image){image.remove();});
 var fallback=document.createElement('span');fallback.className='round-emoji';
 fallback.textContent=selectedTournament.items.slice(0,4).map(function(p){return p.e||'\u2605';}).join(' ')||'\u2605';frame.appendChild(fallback);
 var representative=selectedTournament.items.find(function(p){return p._localPhoto||p.img;})||{};
 var source=selectedTournament.cover_image||representative._localPhoto||representative.img;
 if(source){
  var position=selectedTournament.start_cover_object_position||selectedTournament.cover_object_position||'50% 50%';
  var background=document.createElement('img');background.className='round-photo-backdrop';
  background.alt='';background.setAttribute('aria-hidden','true');background.style.objectPosition=position;background.src=source;
  hero.prepend(background);
  var image=document.createElement('img');image.className='round-cover';image.alt=selectedTournament.title;
  image.style.objectPosition=position;
  image.onload=function(){fallback.hidden=true;};
  image.onerror=function(){image.hidden=true;background.hidden=true;fallback.hidden=false;};
  image.src=source;frame.appendChild(image);
 }
 dialog.showModal();back.focus({preventScroll:true});dialog.scrollTop=0;
};
function begin(t,size){
 // Keep the latch closed after success, even when a queued second click arrives.
 // Opening a new picker or a valid result-screen replay creates the next launch session.
 if(starting)return;
 starting=true;buttonsDisabled(true);
 try{
  var chosen=select(t.items,size,null);
  announce('Practice mode · Global rankings are not connected.');
  lastSize=size;dialog.close();
  previousStart(Object.assign({},t,{items:chosen}));
 }catch(failure){
  starting=false;buttonsDisabled(false);
  error.textContent='Unable to start: '+failure.message;error.hidden=false;
  if(!dialog.open)dialog.showModal();
 }
}
back.onclick=returnHome;
dialog.addEventListener('cancel',function(event){event.preventDefault();returnHome();});
document.getElementById('again').onclick=function(){
 if(document.getElementById('end').classList.contains('hide'))return;
 var t=tournaments.find(function(source){return source.id===root.tour.id;});
 starting=false;begin(t,lastSize);
};
// Preserve the original shared module's cover handling before the home adapter loads.
var originalBuild=root.buildGrid;
root.buildGrid=function(){originalBuild();var cards=document.querySelectorAll('#grid .tc');tournaments.forEach(function(t,index){if(!t.cover_image)return;var mosaic=cards[index].querySelector('.mo');var image=document.createElement('img');image.src=t.cover_image;image.alt=t.title;image.style.cssText='width:100%;height:100%;object-fit:cover;grid-column:1/-1';image.onload=function(){mosaic.textContent='';mosaic.appendChild(image);};});};
root.buildGrid();
})(window);
