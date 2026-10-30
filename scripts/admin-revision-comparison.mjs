import {giphyStillUrl} from './giphy-preview.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function compareRevisions(before,after){
 if(!before||!after||!Array.isArray(before.participants)||!Array.isArray(after.participants))return null;
 const changes=[];for(const [key,label]of [['title','Title'],['short_description','Short Description'],['description','Details']]){
  if(!Object.hasOwn(before,key)||!Object.hasOwn(after,key)){changes.push({kind:'unknown',label,before:null,after:null});continue;}
  if(before[key]!==after[key])changes.push({kind:'text',label,before:before[key],after:after[key]});
 }
 const active=r=>r.participants.filter(p=>p.active!==false),a=active(before),b=active(after);
 if(new Set(a.map(p=>p.id)).size!==a.length||new Set(b.map(p=>p.id)).size!==b.length||[...a,...b].some(p=>!p.id))return null;
 const old=new Map(a.map(p=>[p.id,p])),next=new Map(b.map(p=>[p.id,p]));
 for(const p of b){const previous=old.get(p.id);if(!previous){changes.push({kind:'candidate',label:'Added',before:null,after:p});continue;}
  if(previous.name!==p.name)changes.push({kind:'text',label:'Candidate name',before:previous.name,after:p.name,id:p.id});
  if(previous.image_asset_id!==p.image_asset_id||JSON.stringify(canonical(previous.media||null))!==JSON.stringify(canonical(p.media||null)))changes.push({kind:'candidate',label:'Media changed',before:previous,after:p});
 }
 for(const p of a)if(!next.has(p.id))changes.push({kind:'candidate',label:'Removed',before:p,after:null});
 if(JSON.stringify(a.filter(p=>next.has(p.id)).map(p=>p.id))!==JSON.stringify(b.filter(p=>old.has(p.id)).map(p=>p.id)))changes.push({kind:'text',label:'Reordered',before:a.map(p=>p.name).join(' → '),after:b.map(p=>p.name).join(' → ')});
 return changes;
}
const labels={ko:{'Changes in this Revision':'이 리비전의 변경 사항','Comparison unavailable':'변경 비교를 불러올 수 없습니다','New submission':'최초 제출','Before':'변경 전','After':'변경 후','Title':'제목','Short Description':'짧은 설명','Details':'상세 설명','Added':'추가됨','Removed':'제거됨','Reordered':'순서 변경','Candidate name':'후보 이름','Media changed':'미디어 변경','No changes found':'확인된 변경 없음','Expand / Collapse':'펼치기 / 접기','Empty':'빈 값','Image unavailable':'이미지를 불러올 수 없습니다','Full candidate/media review':'전체 후보·미디어 검토','Cover changed':'대표 이미지 변경'}};
export function createRevisionComparison({host,api,selection,guard,loadPhoto,getLanguage=()=> 'en',fullReview}){
 let sequence=0,last=null;const tr=s=>labels[getLanguage()]?.[s]||s;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const label=s=>node('span',tr(s));
 function clear(){sequence++;last=null;host.hidden=true;host.replaceChildren();if(fullReview)fullReview.open=true;}
 function text(value){const span=node('span',value==null?tr('Comparison unavailable'):value===''?tr('Empty'):String(value));span.dataset.i18nSkip='';return span;}
 function picture(p,target,at){if(!p){target.append(label('Empty'));return;}target.append(text(p.name||''));const media=p.media;let src=null;if(media?.type==='giphy')src=giphyStillUrl(media);
  if(media){target.append(text(media.url||media.originalUrl||''));if(media.startSeconds!=null)target.append(text('['+media.startSeconds+' – '+(media.endSeconds??'end')+']'));}
  if(src){const img=node('img');img.alt=p.name||'';img.loading='lazy';img.onerror=()=>img.replaceWith(label('Image unavailable'));img.src=src;target.append(img);}
  else if(p.image_asset_id){const fallback=label('Image unavailable');target.append(fallback);void loadPhoto(p.image_asset_id).then(url=>{if(at!==sequence||!target.isConnected||!url)return;const img=node('img');img.alt=p.name||'';img.onerror=()=>img.replaceWith(label('Image unavailable'));img.src=url;fallback.replaceWith(img);}).catch(()=>{});}else if(media)target.append(label('Image unavailable'));
 }
 function paint(){host.replaceChildren(node('h2',tr('Changes in this Revision')));if(!last){host.append(label('Comparison unavailable'));return;}
  if(last.status==='new'){host.append(label('New submission'));if(fullReview)fullReview.open=true;return;}
  const changes=compareRevisions(last.before,last.after);if(!changes){host.append(label('Comparison unavailable'));return;}
  if(last.before.cover_asset_id!==last.after.cover_asset_id)changes.unshift({kind:'candidate',label:'Cover changed',before:{name:'',image_asset_id:last.before.cover_asset_id},after:{name:'',image_asset_id:last.after.cover_asset_id}});
  if(!changes.length)host.append(label('No changes found'));for(const change of changes){const box=node('details'),summary=node('summary',tr(change.label));box.open=true;box.append(summary);const pair=node('div');pair.className='revision-comparison-pair';
   for(const [side,value]of [['Before',change.before],['After',change.after]]){const column=node('section');column.append(node('h3',tr(side)));if(change.kind==='candidate')picture(value,column,sequence);else if(String(value||'').length>240){const expand=node('details');expand.append(node('summary',tr('Expand / Collapse')),text(value));column.append(text(String(value).slice(0,240)+'…'),expand);}else column.append(text(value));pair.append(column);}box.append(pair);host.append(box);
  }
  if(fullReview)fullReview.open=false;
 }
 async function load(){clear();const s=selection();if(!s||s.r.state!=='submitted')return;host.hidden=false;const at=sequence;try{await guard(s.t.id);const data=await api().comparison(s.t.id,s.r.id);if(at!==sequence||selection()?.r.id!==s.r.id)return;if(data?.contract_version!==1||data.tournament_id!==s.t.id||data.revision_id!==s.r.id||!['new','comparison'].includes(data.status))throw Error('Invalid comparison');if(data.after?.id!==s.r.id||data.status==='comparison'&&data.before?.id!==data.published_revision_id)throw Error('Invalid comparison revisions');last=data;paint();}catch{if(at===sequence){last=null;paint();}}}
 window.addEventListener('pwc-admin-language-change',()=>{if(!host.hidden)paint();if(fullReview)fullReview.querySelector('summary').textContent=tr('Full candidate/media review');});
 if(fullReview)fullReview.querySelector('summary').textContent=tr('Full candidate/media review');
 return {load,clear};
}
