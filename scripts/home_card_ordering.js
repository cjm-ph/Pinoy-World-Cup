/* Homepage presentation only: no participant order, game state or storage writes. */
(function(root){
'use strict';
function create(config, tournaments, random){
 config=config||{};random=random||Math.random;
 var priorities=config.priorities||{},tieOrder=new Map(),serverOrder=null;
 function priority(t){var value=priorities[t.id];return Number.isFinite(value)?value:100;}
 function initialize(list){
  var groups=new Map();
  list.forEach(function(t){if(tieOrder.has(t.id))return;var p=priority(t);if(!groups.has(p))groups.set(p,[]);groups.get(p).push(t.id);});
  groups.forEach(function(ids){
   if(config.shuffle_equal_priority!==false)for(var i=ids.length-1;i>0;i--){var j=Math.floor(random()*(i+1));var temp=ids[i];ids[i]=ids[j];ids[j]=temp;}
   ids.forEach(function(id,index){tieOrder.set(id,index);});
  });
 }
 initialize(tournaments);
 return {
  order:function(list){
   initialize(list);
   var ranks=serverOrder&&config.mode==='server-popularity'?new Map(serverOrder.map(function(id,index){return [id,index];})):null;
   return list.slice().sort(function(a,b){
    if(ranks){var difference=(ranks.has(a.id)?ranks.get(a.id):Number.MAX_SAFE_INTEGER)-(ranks.has(b.id)?ranks.get(b.id):Number.MAX_SAFE_INTEGER);if(difference)return difference;}
    return priority(a)-priority(b)||tieOrder.get(a.id)-tieOrder.get(b.id)||(a.id<b.id?-1:a.id>b.id?1:0);
   });
  },
  // Future trusted server adapter supplies ordered IDs, never invented counts.
  setServerOrder:function(ids){
   var known=new Set(tournaments.map(function(t){return t.id;}));
   if(!Array.isArray(ids)||ids.length!==known.size||new Set(ids).size!==ids.length||ids.some(function(id){return !known.has(id);}))return false;
   serverOrder=ids.slice();return true;
  }
 };
}
root.WorldCupHomeOrdering={create:create};
})(typeof window!=='undefined'?window:globalThis);
