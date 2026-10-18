(function(root){
function numbers(stat){
  stat=stat||{};var result={wins:stat.wins===undefined?0:stat.wins,losses:stat.losses===undefined?0:stat.losses,titles:stat.titles===undefined?0:stat.titles};
  Object.keys(result).forEach(function(key){if(!Number.isSafeInteger(result[key])||result[key]<0)throw new Error('Invalid ranking data.');});return result;
}
function rank(items,stats){
  return items.slice().sort(function(a,b){
    var x=numbers(stats&&stats[a.id]),y=numbers(stats&&stats[b.id]);
    var comparison=(y.wins+5)*(x.wins+x.losses+10)-(x.wins+5)*(y.wins+y.losses+10);
    return comparison || y.wins-x.wins || y.titles-x.titles || (a.id<b.id?-1:a.id>b.id?1:0);
  });
}

root.WorldCupRanking={rank:rank};
})(globalThis);
