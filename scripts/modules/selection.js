(function(root){
var rank=root.WorldCupRanking.rank;
function uniqueActive(items){
  var seen=new Set();
  return items.filter(function(item){
    if(item.active===false)return false;
    if(!item.id || !item.person_id)throw new Error('Each participant needs a unique ID.');
    if(seen.has(item.person_id))return false;
    seen.add(item.person_id);return true;
  });
}
function shuffle(items,random){
  var result=items.slice();random=random||Math.random;
  for(var i=result.length-1;i>0;i--){var j=Math.floor(random()*(i+1));var temp=result[i];result[i]=result[j];result[j]=temp;}
  return result;
}
function select(items,size,snapshot,random){
  if([4,8,16,32].indexOf(size)<0)throw new Error('This round is not supported.');
  var pool=uniqueActive(items);
  if(new Set(pool.map(function(p){return p.id;})).size!==pool.length)throw new Error('Duplicate participant ID.');
  if(pool.length<size)throw new Error('Not enough participants.');
  if(snapshot&&(!Number.isSafeInteger(snapshot.completed_games)||snapshot.completed_games<0))throw new Error('Invalid completed game count.');
  var chosen;
  if(!snapshot || snapshot.completed_games<10)chosen=shuffle(pool,random).slice(0,size);
  else{
    var ordered=rank(pool,snapshot.participants);
    chosen=size===32?ordered.slice(0,24).concat(shuffle(ordered.slice(24),random).slice(0,8)):ordered.slice(0,size);
  }
  return shuffle(chosen,random);
}

root.WorldCupSelection={uniqueActive:uniqueActive,shuffle:shuffle,select:select};
})(globalThis);
