/* Quality-test homepage only. Keep shared recommendation/category behavior intact. */
(function(root){
'use strict';
var createRecommendedOrder=root.WorldCupHomeOrdering.create;
root.WorldCupHomeOrdering={create:function(config,tournaments,random){
 var recommended=createRecommendedOrder(config,tournaments,random);
 random=random||Math.random;
 // One Fisher-Yates shuffle per page visit; never mutate the tournament registry.
 var shuffled=tournaments.slice();
 for(var i=shuffled.length-1;i>0;i--){
  var j=Math.floor(random()*(i+1)),temp=shuffled[i];shuffled[i]=shuffled[j];shuffled[j]=temp;
 }
 var allRanks=new Map(shuffled.map(function(t,index){return [t.id,index];}));
 var categoryOrder=recommended.order;
 // All-tab strategy boundary: future weighted ranking can replace this comparator
 // without changing filtering, rendering, participant order or game state.
 recommended.order=function(list){
  var selected=document.querySelector('#homeTabs button[aria-pressed="true"]');
  if(selected&&selected.textContent!=='All')return categoryOrder(list);
  return list.slice().sort(function(a,b){return allRanks.get(a.id)-allRanks.get(b.id);});
 };
 return recommended;
}};
})(window);
