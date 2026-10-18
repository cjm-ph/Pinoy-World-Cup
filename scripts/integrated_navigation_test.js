/* Integration-only navigation. Rendering, bracket decisions and storage stay shared. */
(function(root){
 'use strict';
 var token='integrated-'+Date.now()+'-'+Math.random(),syncing=false;
 var selected=null,run=0,completed=0,gameLog=null;
 var round=document.getElementById('roundSelection');
 var previousStart=root.start;
 root.start=function(t){
  if(!round.open&&t)selected=t.id;
  return previousStart.apply(this,arguments);
 };
 function route(){
  if(round.open)return {view:'round',tid:selected,run:run};
  if(!document.getElementById('play').classList.contains('hide')){
   if(gameLog!==root.log){gameLog=root.log;run++;}
   return {view:'play',tid:root.tour.id,run:run};
  }
  if(!document.getElementById('end').classList.contains('hide')){
   completed=run;return {view:'result',tid:root.tour.id,run:run};
  }
  return {view:'home',tid:null,run:run};
 }
 function write(next,replace){
  var state={pinoyIntegrated:token,view:next.view,tid:next.tid,run:next.run};
  // The URL and localStorage are never used to serialize a game or a result.
  history[replace?'replaceState':'pushState'](state,'');
 }
 function observe(){
  if(syncing)return;
  var next=route(),old=history.state;
  if(old&&old.pinoyIntegrated===token&&old.view===next.view&&old.tid===next.tid&&old.run===next.run)return;
  // Round selection, play and result share one journey entry. Matches add none.
  write(next,next.view!=='round');
 }
 write({view:'home',tid:null,run:0},true);
 var observer=new MutationObserver(observe);
 ['start','play','end'].forEach(function(id){observer.observe(document.getElementById(id),{attributes:true,attributeFilter:['class']});});
 observer.observe(round,{attributes:true,attributeFilter:['open']});
 root.addEventListener('popstate',function(event){
  var state=event.state;
  if(!state||state.pinoyIntegrated!==token)return;
  syncing=true;
  document.querySelectorAll('dialog[open]').forEach(function(d){d.close();});
  var stats=document.getElementById('resultStats');stats.hidden=true;
  document.getElementById('resultStatistics').setAttribute('aria-expanded','false');
  root.goHome();
  var t=root.TOURNAMENTS.find(function(t){return t.id===state.tid;});
  if(state.view==='result'&&state.run===completed&&root.champ&&root.tour.id===state.tid){root.show('end');}
  else if(state.view==='play'&&state.run===run&&completed!==run&&gameLog===root.log&&root.tour.id===state.tid){root.show('play');}
  else if(state.view!=='home'&&t){root.start(t);write({view:'round',tid:t.id,run:run},true);}
  root.scrollTo(0,0);
  // Mutation observers must see the entire restoration as a single operation.
  queueMicrotask(function(){syncing=false;});
 });
})(window);
