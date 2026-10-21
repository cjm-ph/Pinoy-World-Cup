import {createPlayCollector} from './staging-play-collector.mjs';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
const percentage=n=>n===null||n===undefined?'—':Number(n).toFixed(2)+'%';
function styles(){if(document.querySelector('link[data-play-statistics]'))return;const s=node('link');s.rel='stylesheet';s.href='/templates/staging-play-statistics.css';s.dataset.playStatistics='';document.head.append(s);}
export function candidateTable(rows,admin=false){const table=node('table');table.className='play-statistics-table';const head=node('tr');
 for(const label of ['Rank','Candidate','Championship rate','Match win rate',...(admin?['Titles','Matches','Wins']:[])])head.append(node('th',label));table.append(head);
 rows.forEach((p,index)=>{const tr=node('tr');tr.append(node('td',index+1));const name=node('td');if(p.image_asset_id){const image=node('img');image.src='/media?asset='+encodeURIComponent(p.image_asset_id);image.alt='';image.loading='lazy';image.onerror=()=>image.remove();name.append(image);}name.append(node('span',p.name));tr.append(name,node('td',percentage(p.championship_rate)),node('td',percentage(p.win_rate)));if(admin)for(const value of [p.titles,p.appearances,p.wins])tr.append(node('td',value));table.append(tr);});return table;
}
export function installPlayCollection(root=window){
 if(root.PWC_STAGING?.supabaseUrl!=='https://cmnomqsurdwhdbjgnsvw.supabase.co')return;
 if(root.__stagingPlayCollector)return root.__stagingPlayCollector;
 const note=node('p');note.className='play-statistics-status';note.setAttribute('role','status');document.getElementById('play')?.append(note);
 const collector=createPlayCollector({onStatus:text=>note.textContent=text});collector.resume();
 const show=root.show;root.show=function(id){const result=show.apply(this,arguments);if(id==='play')try{
  const cup=root.PinoyAdapterV2?.viewModel?.tournaments.find(t=>t.id===root.tour.id);
  collector.start(root.tour.id,cup?._statistics_revision_id,root.cur.map(p=>p.id));
 }catch{note.textContent='Statistics unavailable; gameplay is unaffected.';}return result;};
 // Install before the VS presenter captures choose(). Only committed choices count.
 const choose=root.choose;root.choose=function(side){try{collector.match(root.cur[root.i+side].id);}catch{/* Never interrupt selection. */}return choose.apply(this,arguments);};
 root.__stagingPlayCollector=collector;return collector;
}
export function installPublicStatistics(root=window){
 if(root.PWC_STAGING?.supabaseUrl!=='https://cmnomqsurdwhdbjgnsvw.supabase.co')return;
 styles();const dialog=node('dialog');dialog.id='playRankings';dialog.className='play-statistics-dialog';dialog.setAttribute('aria-label','Tournament rankings');
 const close=node('button','Close'),title=node('h2','Rankings'),content=node('div');close.type='button';close.onclick=()=>dialog.close();dialog.append(title,close,content);document.body.append(dialog);
 let readEpoch=0,selectedTid=null;
 const start=root.start;root.start=function(t){selectedTid=t?.id||root.tour?.id;return start.apply(this,arguments);};
 async function open(){const tid=selectedTid||root.tour?.id;if(!tid)return;const epoch=++readEpoch;content.replaceChildren(node('p','Loading rankings...'));if(!dialog.open)dialog.showModal();try{
  const r=await fetch('/play-statistics?'+new URLSearchParams({tid}),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const data=await r.json();if(epoch!==readEpoch)return;
  content.replaceChildren(node('p','All recorded games; current published candidates. Titles ÷ completed games; wins ÷ match appearances.'));
  if(!data.started)content.append(node('p','No recorded games yet. Historical plays have not been invented.'));
  else content.append(node('p',`${data.started} starts · ${data.completed} completed games`));
  content.append(candidateTable(data.candidates||[]));
 }catch{if(epoch===readEpoch)content.replaceChildren(node('p','Statistics are unavailable. You can keep playing.'));}}
 const before=node('button','Rankings');before.type='button';before.className='btn';document.getElementById('roundSelection')?.append(before);before.onclick=open;
 const after=document.getElementById('resultStatistics');if(after){const span=after.querySelector('span');if(span)span.textContent='View Statistics';else after.textContent='View Statistics';after.setAttribute('aria-controls','playRankings');after.removeAttribute('aria-expanded');after.onclick=open;}
 const collector=installPlayCollection(root);
 return {collector,open};
}
export function installAdminStatistics({client,getTournaments,getSelected}){
 styles();const host=document.querySelector('[data-view=dashboard]');if(!host)return;
 const panel=node('section');panel.className='card play-statistics-admin';panel.append(node('h2','Play statistics'));
 const from=node('input'),until=node('input');from.type=until.type='date';from.setAttribute('aria-label','Statistics from');until.setAttribute('aria-label','Statistics through');
 until.value=new Date().toISOString().slice(0,10);from.value=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
 const bucket=node('select');bucket.setAttribute('aria-label','Statistics grouping');for(const [value,text]of [['day','Daily'],['week','Weekly'],['month','Monthly']]){const o=node('option',text);o.value=value;bucket.append(o);}
 const tournament=node('select');tournament.setAttribute('aria-label','Statistics tournament');const load=node('button','Load statistics');load.type='button';load.className='btn';const results=node('div');results.setAttribute('aria-live','polite');const controls=node('div');controls.className='play-statistics-controls';controls.append(from,until,bucket,tournament,load);panel.append(controls,results);host.append(panel);
 function options(tid=''){tournament.replaceChildren();const all=node('option','All tournaments');all.value='';tournament.append(all);for(const t of getTournaments()){const o=node('option',t.revision?.title||t.id);o.value=t.id;tournament.append(o);}tournament.value=tid;}
 let readEpoch=0;
 async function refresh(){if(load.disabled)return;const epoch=++readEpoch;load.disabled=true;results.replaceChildren(node('p','Loading statistics...'));try{
  const since_at=new Date(from.value+'T00:00:00Z').toISOString(),until_at=new Date(new Date(until.value+'T00:00:00Z').getTime()+86400000).toISOString();
  let timeout;const request=client.schema('pwc41_api').rpc('play_statistics_admin',{since_at,until_at,bucket:bucket.value,tid:tournament.value||null});
  const {data,error}=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Statistics timeout')),10000);})]).finally(()=>clearTimeout(timeout));if(epoch!==readEpoch)return;if(error||!data||typeof data.started!=='number')throw Error();
  if(!data.enabled){results.replaceChildren(node('p','Collection is disabled. No historical plays have been generated.'));return;}
  const rate=data.started?(data.completed*100/data.started).toFixed(2)+'%':'—';const cards=node('div');cards.className='play-statistics-controls';for(const label of [`Starts: ${data.started}`,`Completed: ${data.completed}`,`Completion rate: ${rate}`])cards.append(node('strong',label));results.replaceChildren(cards,node('p',`UTC start-date cohorts. Collection since ${data.collection_since}. Ongoing and expired games are not completed games.`));
  const series=node('table');series.className='play-statistics-table';const sh=node('tr');for(const v of ['Period (UTC)','Starts','Completed'])sh.append(node('th',v));series.append(sh);for(const row of data.series||[]){const tr=node('tr');for(const v of [row.period,row.started,row.completed])tr.append(node('td',v));series.append(tr);}results.append(series);
  const popular=node('ol');for(const row of data.popular||[])popular.append(node('li',`${row.title}: ${row.started} starts, ${row.completed} completed`));results.append(node('h3','Popular tournaments by starts'),popular);
  if(tournament.value)results.append(candidateTable(data.candidates||[],true));
  if(!tournament.value){const metric=document.querySelector('.metrics .metric-card:nth-child(2) .metric');if(metric){metric.textContent=String(data.started);metric.classList.remove('unavailable');metric.title='Starts in the selected UTC interval';const foot=metric.parentElement.querySelector('.metric-foot');if(foot)foot.textContent='Starts in the selected UTC interval';}}
 }catch{if(epoch===readEpoch)results.replaceChildren(node('p','Statistics unavailable. Check access, dates or the approved statistics installation.'));}finally{load.disabled=false;}}
 load.onclick=refresh;
 const detail=node('button','Tournament statistics');detail.type='button';detail.className='btn';document.querySelector('[data-view=editor]')?.append(detail);
 const modal=node('dialog');modal.className='play-statistics-dialog';modal.setAttribute('aria-label','Administrator play statistics');const close=node('button','Close');close.type='button';close.onclick=()=>modal.close();modal.append(close);document.body.append(modal);modal.onclose=()=>host.append(panel);
 detail.onclick=()=>{options(getSelected()?.id||'');modal.append(panel);modal.showModal();void refresh();};
 // Rebuild available IDs before opening filters, without clearing an existing choice.
 tournament.onfocus=()=>options(tournament.value);options();
 return {panel,refresh,reset(){readEpoch++;results.replaceChildren();if(modal.open)modal.close();const metric=document.querySelector('.metrics .metric-card:nth-child(2) .metric');if(metric){metric.textContent='Not loaded';metric.classList.add('unavailable');metric.removeAttribute('title');const foot=metric.parentElement.querySelector('.metric-foot');if(foot)foot.textContent='Load statistics to select a reporting interval';}}};
}
