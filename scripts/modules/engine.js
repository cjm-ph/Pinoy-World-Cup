function photoAttribute(value){return String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

var $=function(i){return document.getElementById(i)};
var cur,next,i,champ,mine,db,tour,busy=false,log=[],plays=[],cms=[],allPlays=[],allCms=[];
var shuffle=WorldCupSelection.shuffle;
function label(n){return n==2?"Final":n==4?"Semifinal":n==8?"Quarterfinal":"Round of "+n}
function art(f){var src=f._localPhoto||f.img;return src?'<img src="'+photoAttribute(src)+'" alt="'+photoAttribute(f.n)+'" data-fallback="'+photoAttribute(f.e||"")+'" onerror="this.replaceWith(document.createTextNode(this.getAttribute(\'data-fallback\')))">':f.e}
function fill(el,f){el.innerHTML='<div class="art">'+art(f)+'</div><div class="name">'+f.n+'</div>';el.setAttribute("aria-label","Pick "+f.n)}
function show(id){["start","play","end"].forEach(function(s){$(s).classList.toggle("hide",s!==id)})}
function start(t){tour=t||tour;cur=tour._admittedOrder?tour.items.slice():shuffle(tour.items);next=[];i=0;busy=false;log=[];show("play");render()}
function render(){
  var ar=document.querySelector(".arena");ar.classList.add("nt");
  ["a","b"].forEach(function(k){$(k).classList.remove("win","lose")});
  void ar.offsetWidth;ar.classList.remove("nt");
  $("round").textContent=label(cur.length);
  $("count").textContent="Match "+(i/2+1)+" of "+cur.length/2;
  fill($("a"),cur[i]);fill($("b"),cur[i+1]);
}
function pick(w){
  if(busy)return;busy=true;
  var rm=matchMedia("(prefers-reduced-motion:reduce)").matches;
  $(w?"b":"a").classList.add("win");$(w?"a":"b").classList.add("lose");
  setTimeout(function(){busy=false;choose(w)},rm?0:650);
}
function choose(w){
  log.push(cur[i+w].n+"|"+cur[i+1-w].n);
  next.push(cur[i+w]);i+=2;
  if(i>=cur.length){
    if(next.length===1){champ=next[0];finish();return}
    cur=next;next=[];i=0;
  }
  render();
}
function finish(){
  mine=champ.n;record();renderRank();renderComments();
  show("end");$("winArt").innerHTML=art(champ);$("winName").textContent=champ.n;$("msg").textContent="";
}
function share(){
  var text="My #1 in "+tour.title+": "+champ.n+"! What's yours? "+location.href;
  var done=function(m){$("msg").textContent=m};
  try{
    if(navigator.share){navigator.share({text:text}).catch(function(){});return}
    navigator.clipboard.writeText(text).then(function(){done("Copied! Paste it on Facebook.")},function(){done(text)});
  }catch(e){done(text)}
}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function pct(a,b){return b?(Math.round(a/b*1000)/10)+"%":"-"}
function S(t,a){var e=document.createElementNS("http://www.w3.org/2000/svg",t);for(var k in a)e.setAttribute(k,a[k]);return e}
function tbl(head,rows){var t=el("table","tb"),h=el("tr");head.forEach(function(x){h.appendChild(el("th",null,x))});t.appendChild(h);rows.forEach(function(r){var tr=el("tr",r[0]===mine?"me":"");r.forEach(function(c){tr.appendChild(el("td",null,c))});t.appendChild(tr)});var w=el("div");w.style.overflowX="auto";w.appendChild(t);return w}
function renderDetail(){
  var box=$("detail");box.textContent="";
  if(!db){box.textContent="Stats are not available in this view.";return}
  var P=allPlays.filter(function(x){return tour&&(x.tid||"food")===tour.id}).sort(function(a,b){return a.ts-b.ts});
  if(!P.length){box.textContent="No data yet.";return}
  var names=tour.items.map(function(f){return f.n}),win={},pl={},pw={},mp=0;
  names.forEach(function(n){win[n]=0;pl[n]=0;pw[n]=0});
  P.forEach(function(p){
    if(win[p.champ]!=null)win[p.champ]++;
    if(p.m){mp++;p.m.forEach(function(s){var a=s.split("|");if(pl[a[0]]!=null){pl[a[0]]++;pw[a[0]]++}if(pl[a[1]]!=null)pl[a[1]]++})}
  });
  var byWin=names.slice().sort(function(a,b){return win[b]-win[a]});
  box.appendChild(el("h4",null,"Champion rate ("+P.length+" plays)"));
  box.appendChild(tbl(["Item","Titles","Rate"],byWin.map(function(n){return[n,String(win[n]),pct(win[n],P.length)]})));
  box.appendChild(el("h4",null,"1:1 pick rate"));
  if(!mp){box.appendChild(el("p","note","Match data appears after the next plays."))}else{
    var rate=function(n){return pl[n]?pw[n]/pl[n]:-1};
    box.appendChild(tbl(["Item","Picked","Rate"],names.slice().sort(function(a,b){return rate(b)-rate(a)}).filter(function(n){return pl[n]}).map(function(n){return[n,pw[n]+" of "+pl[n],pct(pw[n],pl[n])]})));
  }
  box.appendChild(el("h4",null,"Rank trend (top 5)"));
  if(P.length<2){box.appendChild(el("p","note","The chart appears after 2 plays."));return}
  var top=byWin.slice(0,5),K=Math.min(P.length,12),marks=[],cnt={},rk={},cp=[],N=names.length;
  for(var j=1;j<=K;j++)marks.push(Math.ceil(j*P.length/K));
  names.forEach(function(n){cnt[n]=0});top.forEach(function(n){rk[n]=[]});
  P.forEach(function(p,idx){
    if(cnt[p.champ]!=null)cnt[p.champ]++;
    if(marks.indexOf(idx+1)>-1){var ord=names.slice().sort(function(a,b){return cnt[b]-cnt[a]});top.forEach(function(n){rk[n].push(ord.indexOf(n)+1)});cp.push(idx+1)}
  });
  var W=340,H=210,px=30,py=16,cols=["#0038a8","#ce1126","#e08a00","#1b9e5a","#8a3ffc"];
  var svg=S("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Rank trend chart"});
  var X=function(q){return px+(W-2*px)*q/(cp.length-1)},Y=function(r){return py+(H-2*py-14)*(r-1)/(N-1)};
  [1,Math.ceil(N/2),N].forEach(function(r){var t=S("text",{x:4,y:Y(r)+4,fill:"currentColor","font-size":10});t.textContent="#"+r;svg.appendChild(t);svg.appendChild(S("line",{x1:px-4,x2:W-px+4,y1:Y(r),y2:Y(r),stroke:"currentColor","stroke-opacity":.15}))});
  top.forEach(function(n,k){
    svg.appendChild(S("polyline",{points:rk[n].map(function(r,q){return X(q)+","+Y(r)}).join(" "),fill:"none",stroke:cols[k],"stroke-width":3,"stroke-linejoin":"round"}));
    rk[n].forEach(function(r,q){svg.appendChild(S("circle",{cx:X(q),cy:Y(r),r:3.5,fill:cols[k]}))});
  });
  [[px,"start",cp[0]],[W-px,"end",cp[cp.length-1]]].forEach(function(a){var t=S("text",{x:a[0],y:H-2,fill:"currentColor","font-size":10,"text-anchor":a[1]});t.textContent="after "+a[2]+" plays";svg.appendChild(t)});
  box.appendChild(svg);
  var lg=el("div","note");top.forEach(function(n,k){var s=el("span",null,"\u25cf "+n+"  ");s.style.color=cols[k];s.style.fontWeight="800";lg.appendChild(s)});
  box.appendChild(lg);
}
function renderRank(){renderDetail();renderRank0()}
function renderRank0(){
  plays=allPlays.filter(function(x){return tour&&(x.tid||"food")===tour.id}).map(function(x){return x.champ});
  var box=$("rank");box.textContent="";
  if(!db){box.textContent="Stats are not available in this view.";return}
  if(!plays.length){box.textContent="No results yet. You are the first!";return}
  var t={};plays.forEach(function(n){t[n]=(t[n]||0)+1});
  var arr=Object.keys(t).map(function(k){return[k,t[k]]}).sort(function(a,b){return b[1]-a[1]}).slice(0,10);
  var max=arr[0][1];
  arr.forEach(function(r,idx){
    var row=el("div","rk"+(r[0]===mine?" me":""));
    row.appendChild(el("span",null,(idx+1)+". "+r[0]));
    var tr=el("span","t"),b=el("i");b.style.width=Math.round(r[1]/max*100)+"%";tr.appendChild(b);row.appendChild(tr);
    row.appendChild(el("span",null,Math.round(r[1]/plays.length*100)+"%"));
    box.appendChild(row);
  });
  box.appendChild(el("p","note","Based on "+plays.length+" plays. Your pick is in red."));
}
function renderComments(){
  cms=allCms.filter(function(c){return tour&&(c.tid||"food")===tour.id});
  var box=$("list");box.textContent="";
  if(!cms.length){box.appendChild(el("p","note","No comments yet."));return}
  cms.forEach(function(c){var d=el("div","cm");d.appendChild(el("b",null,(c.name||"Anonymous")+(c.champ?" · picked #1: "+c.champ:"")));d.appendChild(el("span",null,c.text));if(c.ts)d.appendChild(el("div","note",new Date(c.ts).toLocaleString([],{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})));box.appendChild(d)});
}
function record(){
  if(!db)return;
  db.collection("plays").add({champ:champ.n,tid:tour.id,m:log,ts:Date.now()}).catch(function(){});
}
function postComment(){
  var text=$("txt").value.trim(),name=$("nick").value.trim();
  if(!text||!db){$("cmsg").textContent=db?"Write something first.":"Comments are not available in this view.";return}
  $("send").disabled=true;
  db.collection("comments").add({name:name.slice(0,20),text:text.slice(0,200),champ:mine||"",tid:tour?tour.id:"food",ts:Date.now()}).then(function(){$("txt").value="";$("cmsg").textContent="Posted!"},function(){$("cmsg").textContent="Could not post. You may need contributor access."}).then(function(){$("send").disabled=false});
}
(async function(){
  try{
    if(!window.claude)return;
    db=await claude.use("db");
    if(!db){renderRank();return}
    db.collection("plays").orderBy("ts","desc").limit(1000).onSnapshot(function(s){allPlays=s.docs.map(function(d){return d.data()});renderRank();buildGrid()},function(){});
    db.collection("comments").orderBy("ts","desc").limit(200).onSnapshot(function(s){allCms=s.docs.map(function(d){return d.data()});renderComments()},function(){});
  }catch(e){db=null}
})();
$("send").onclick=postComment;
function goHome(){busy=false;show("start");buildGrid()}
function buildGrid(){
  var g=$("grid");g.textContent="";
  TOURNAMENTS.forEach(function(t){
    var b=el("button","tc"),mo=el("div","mo");mo.style.background=t.c;
    t.items.slice(0,4).forEach(function(f){mo.appendChild(el("span",null,f.e))});
    b.appendChild(mo);b.appendChild(el("div","tt",t.title));b.appendChild(el("div","ss",t.sub));
    var n=allPlays.filter(function(x){return (x.tid||"food")===t.id}).length;
    if(n)b.appendChild(el("div","ss",n+" plays"));
    b.onclick=function(){start(t)};
    g.appendChild(b);
  });
  var s=el("div","tc soon");s.appendChild(el("div","tt","More coming soon"));s.appendChild(el("div","ss","New tournaments are added regularly."));g.appendChild(s);
}
buildGrid();
$("again").onclick=function(){start(tour)};$("home").onclick=goHome;$("quit").onclick=goHome;$("shareBtn").onclick=share;
$("a").onclick=function(){pick(0)};$("b").onclick=function(){pick(1)};
