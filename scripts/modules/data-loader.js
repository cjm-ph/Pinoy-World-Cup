/* External script data loading works on file:// without fetch or ES modules. */
(function(root){
'use strict';
var tournaments=[];
function register(record){
 if(!record||typeof record.id!=='string'||!record.id||typeof record.title!=='string'||!record.title||!Array.isArray(record.items))throw Error('Invalid tournament data.');
 if(tournaments.some(function(t){return t.id===record.id;}))throw Error('Duplicate tournament ID.');
 var ids=new Set(),people=new Set();
 record.items.forEach(function(p){
  if(!p.id||!p.person_id||typeof p.n!=='string'||!p.n)throw Error('Invalid participant data.');
  if(ids.has(p.id)||people.has(p.person_id))throw Error('Duplicate participant in tournament.');
  ids.add(p.id);people.add(p.person_id);
 });
 var tournament=Object.assign({sub:'',c:'#0038a8',cover_image:''},record,{items:record.items.map(function(p){return Object.assign({},p);})});
 tournaments.push(tournament);
 if(typeof root.buildGrid==='function')root.buildGrid();
 return tournament;
}
root.TOURNAMENTS=tournaments;
root.WorldCupRegistry={register:register,list:function(){return tournaments.slice();}};
if(!Array.isArray(root.WorldCupData))throw Error('Tournament data could not be loaded.');
root.WorldCupData.forEach(register);
})(window);
