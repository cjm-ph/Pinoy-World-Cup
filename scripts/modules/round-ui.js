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
root.start=function(t){
  selectedTournament=tournaments.find(function(source){return source.id===(t||root.tour).id;});
  if(!selectedTournament)return;
  document.getElementById('roundTitle').textContent=selectedTournament.title;
  options.textContent='';
  var count=uniqueActive(selectedTournament.items).length;
  var sizes=[4,8,16,32].filter(function(size){return count>=size;});
  lastSize=sizes.length?sizes[sizes.length-1]:32;
  var labels={4:'Semi-finals (4)',8:'Quarter-finals (8)',16:'Round of 16 (16)',32:'Round of 32 (32)'};
  sizes.forEach(function(size){
    var label=document.createElement('label'),input=document.createElement('input');
    label.className='round-choice';
    input.type='radio';input.name='roundSize';input.value=String(size);input.checked=size===lastSize;
    var title=document.createElement('span');title.className='round-choice-title';title.textContent=labels[size];
    var detail=document.createElement('small');detail.textContent=(size-1)+' matches to crown a champion';
    label.appendChild(input);label.appendChild(title);label.appendChild(detail);options.appendChild(label);
  });
  document.getElementById('beginRound').disabled=count<4;
  document.getElementById('roundEmpty').hidden=count>=4;
  document.getElementById('roundHeading').hidden=count<4;
  document.getElementById('beginRound').hidden=count<4;
  document.getElementById('roundKicker').textContent=count<4?'Coming Soon':'Your picks. Your champion.';
  document.getElementById('roundNotice').textContent=count>=4?count+' participants · Random matchups · No sign-up needed':'The lineup is being prepared. Check back soon.';
  var hero=document.getElementById('roundHero');hero.textContent='';
  var fallback=document.createElement('span');fallback.className='round-emoji';
  fallback.textContent=selectedTournament.items.slice(0,4).map(function(p){return p.e||'\u2605';}).join(' ')||'\u2605 \u266b \u2605';hero.appendChild(fallback);
  var cover=selectedTournament.cover_image || (selectedTournament.items.find(function(p){return p._localPhoto||p.img;})||{})._localPhoto || (selectedTournament.items.find(function(p){return p.img;})||{}).img;
  if(cover){var image=document.createElement('img');image.alt=selectedTournament.title;image.onload=function(){fallback.hidden=true;};image.onerror=function(){image.hidden=true;fallback.hidden=false;};image.src=cover;hero.appendChild(image);}
  dialog.showModal();
};
async function begin(t,size){
  if(starting)return;starting=true;
  try{
    // Server games and official aggregation are deliberately deferred.
    // Never treat browser test snapshots as actual global statistics.
    var chosen=select(t.items,size,null);
    announce('Practice mode · Global rankings are not connected.');
    lastSize=size;dialog.close();
    previousStart(Object.assign({},t,{items:chosen}));
  }catch(error){var errorText='Unable to start: '+error.message;announce(errorText);document.getElementById('roundNotice').textContent=errorText;}
  finally{starting=false;}
}
document.getElementById('beginRound').onclick=function(){var choice=options.querySelector('input:checked');if(choice)begin(selectedTournament,Number(choice.value));};
document.getElementById('cancelRound').onclick=function(){dialog.close();root.goHome();};
document.getElementById('again').onclick=function(){var t=tournaments.find(function(source){return source.id===root.tour.id;});begin(t,lastSize);};
// Card covers are independent from participant photos; preserve existing emoji mosaics.
var originalBuild=root.buildGrid;
root.buildGrid=function(){originalBuild();var cards=document.querySelectorAll('#grid .tc');tournaments.forEach(function(t,index){if(!t.cover_image)return;var mosaic=cards[index].querySelector('.mo');var image=document.createElement('img');image.src=t.cover_image;image.alt=t.title;image.style.cssText='width:100%;height:100%;object-fit:cover;grid-column:1/-1';image.onload=function(){mosaic.textContent='';mosaic.appendChild(image);};});};
root.buildGrid();

})(window);
