/* Local creator simulation. No storage, authentication or network in this model. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),id=kind=>kind+'_'+crypto.randomUUID();
const plain=s=>typeof s==='string'&&!/[<>\u0000-\u0008]/.test(s);
const validURL=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch(e){return false;}};
const fail=message=>{throw Error(message);};
function empty(categories){return {format:'pinoy-creator-test-v3',generation:0,bundle:{schema_version:'1.0.0',test_only:true,provenance:{kind:'creator_local_test'},compatibility:{home_config:{},photo_settings_by_name:{},ordering:'local creator only',display_policy_sources:{}},categories:clone(categories),tournaments:[],tournament_revisions:[],entities:[],participants:[],revision_participants:[],media_assets:[],media_presentations:[],featured_entries:[]},blobs:{}};}
function owned(state,tid,actor){const t=state.bundle.tournaments.find(t=>t.id===tid);if(!t||t.creator_id!==actor||actor==='test-admin')fail('본인 초안만 편집할 수 있습니다. 역할은 테스트 시뮬레이션입니다.');return t;}
function member(name=''){return {id:id('participant'),entity_id:id('entity'),name,description:'',active:true,asset:null,data_url:null,pending_url:'',media_notes:{source_url:'',author:'',license:'',license_url:''},presentations:{vs:{position:'50% 50%'},result:{position:'50% 50%'},main:{fit:'cover',position:'50% 50%'},banner:{fit:'cover',position:'50% 50%'},start:{fit:'contain',position:'50% 50%'}}};}
function fresh(state,actor){if(actor==='test-admin')fail('제작자 역할을 선택하세요.');return {tournament_id:id('tournament'),base_revision_id:null,title:'Untitled World Cup',description:'',category_id:state.bundle.categories[0].id,requested_size:32,cover_participant_id:null,participants:[]};}
function load(state,tid,revisionId){
 const b=state.bundle,t=b.tournaments.find(t=>t.id===tid);if(!t)fail('월드컵을 찾을 수 없습니다.');const r=b.tournament_revisions.find(r=>r.tournament_id===tid&&r.id===(revisionId||t.draft_revision_id||t.published_revision_id));if(!r)fail('리비전이 없습니다.');
 return {tournament_id:tid,base_revision_id:r.id,title:r.title,description:r.description,category_id:r.category_ids[0],requested_size:r.legacy_fields.creator_requested_size||r.round_policy.default_size||32,cover_participant_id:r.legacy_fields.creator_cover_participant_id||null,participants:b.revision_participants.filter(p=>p.revision_id===r.id).sort((a,b)=>a.sort_order-b.sort_order).map(p=>{
  const identity=b.participants.find(x=>x.tournament_id===tid&&x.id===p.participant_id),a=b.media_assets.find(a=>a.id===p.image_asset_id);
  return {id:p.participant_id,entity_id:identity.entity_id,name:p.name,description:p.legacy_fields.description||'',active:p.active,asset:a?clone(a):null,data_url:a?(state.blobs[a.id]||null):null,pending_url:p.legacy_fields.creator_pending_image_url||'',media_notes:clone(p.legacy_fields.creator_media_notes||{source_url:'',author:'',license:'',license_url:''}),presentations:clone(p.legacy_fields.creator_presentations||{vs:{},result:{},main:{fit:'cover'},banner:{fit:'cover'},start:{fit:'contain'}})};
 })};
}
function save(state,work,actor){
 if(!plain(work.title)||!work.title.trim()||!plain(work.description)||![8,16,32].includes(work.requested_size))fail('제목·설명·강수를 확인하세요. HTML 입력은 허용하지 않습니다.');
 const next=clone(state),b=next.bundle;let t=b.tournaments.find(t=>t.id===work.tournament_id);
 if(t){owned(state,t.id,actor);if(t.draft_revision_id!==work.base_revision_id&&t.published_revision_id!==work.base_revision_id)fail('초안이 바뀌었습니다. 다시 열어 주세요.');if(t.visibility==='archived')fail('보관한 월드컵은 복제해서 편집하세요.');}
 else {if(actor==='test-admin')fail('제작자 역할이 필요합니다.');t={id:work.tournament_id,creator_id:actor,ownership_state:'assigned',visibility:'private',edit_version:0,draft_revision_id:null,published_revision_id:null};b.tournaments.push(t);}
 const category=b.categories.find(c=>c.id===work.category_id);if(!category)fail('카테고리를 선택하세요.');
 const source=b.tournament_revisions.find(r=>r.id===work.base_revision_id),rid=id('rev'),count=work.participants.filter(p=>p.active).length,rounds=[4,8,16,32].filter(n=>n<=count);
 const revision={id:rid,tournament_id:t.id,parent_revision_id:source?(source.state==='draft'?source.parent_revision_id:source.id):null,version:Math.max(0,...b.tournament_revisions.filter(r=>r.tournament_id===t.id).map(r=>r.version))+1,state:'draft',title:work.title.trim(),description:work.description,cover_asset_id:null,category_ids:[category.id],round_policy:{supported:rounds,default_size:rounds.at(-1)||null},submitted_by:null,reviewed_by:null,review_note:null,legacy_fields:{type:category.legacy_filter==='food'?'food':'other',c:'#0038a8',cover_image:'',creator_requested_size:work.requested_size,creator_cover_participant_id:work.cover_participant_id}};
 for(const [sort,p] of work.participants.entries()){
  if(!plain(p.name)||!plain(p.description)||p.name.length>300)fail('참가자 이름·설명을 확인하세요.');
  if(p.pending_url&&!validURL(p.pending_url))fail('이미지는 HTTPS URL로 입력하세요.');
  for(const s of Object.values(p.presentations)){if(s.position){const values=s.position.match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);if(!values||values.slice(1).some(v=>Number(v)>100))fail('이미지 위치는 0~100%의 x% y%로 입력하세요.');}}
  if(!b.entities.some(e=>e.id===p.entity_id))b.entities.push({id:p.entity_id,kind:category.id==='film'?'film':category.legacy_filter==='food'?'food':category.legacy_filter==='others'?'other':'person',canonical_name:p.name.trim()||'Unnamed draft item',external_ids:{}});
  if(!b.participants.some(x=>x.tournament_id===t.id&&x.id===p.id))b.participants.push({id:p.id,tournament_id:t.id,entity_id:p.entity_id,legacy_person_id:p.entity_id});
  let aid=null;
  if(p.asset){
   const a=clone(p.asset),existing=b.media_assets.find(x=>x.id===a.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(a))fail('이미지 자산을 덮어쓸 수 없습니다. 새 자산이 필요합니다.');
   if(!existing)b.media_assets.push(a);if(p.data_url)next.blobs[a.id]=p.data_url;aid=a.id;
  }
  const fields={active:p.active,e:'★',img:'',description:p.description,creator_pending_image_url:p.pending_url,creator_media_notes:clone(p.media_notes),creator_presentations:clone(p.presentations)};
  b.revision_participants.push({revision_id:rid,participant_id:p.id,name:p.name.trim(),emoji:'★',active:p.active,sort_order:sort,image_asset_id:aid,image_state:aid?'present':'missing',local_asset_id:aid,remote_asset_id:null,legacy_fields:fields});
  for(const context of ['vs','result'])b.media_presentations.push({id:id('presentation'),revision_id:rid,participant_id:p.id,asset_id:aid,context,policy_id:context==='vs'?'vs-head-fit-v1':'result-head-fit-v1',settings:clone(p.presentations[context]||{})});
  if(p.id===work.cover_participant_id)revision.cover_asset_id=aid;
 }
 const cover=work.participants.find(p=>p.id===work.cover_participant_id);
 for(const context of ['main','banner','start'])b.media_presentations.push({id:id('presentation'),revision_id:rid,participant_id:null,asset_id:revision.cover_asset_id,context,policy_id:context+'-representative-v1',settings:clone(cover?.presentations[context]||{fit:context==='start'?'contain':'cover',position:'50% 50%'})});
 b.tournament_revisions.push(revision);t.draft_revision_id=rid;t.edit_version++;
 // Coalesce only unsubmitted working snapshots; never remove submitted/public history.
 if(source&&source.state==='draft'&&source.id!==t.published_revision_id&&!b.tournament_revisions.some(r=>r.parent_revision_id===source.id)){
  b.tournament_revisions=b.tournament_revisions.filter(r=>r.id!==source.id);b.revision_participants=b.revision_participants.filter(p=>p.revision_id!==source.id);b.media_presentations=b.media_presentations.filter(p=>p.revision_id!==source.id);
 }
 const referenced=new Set([...b.revision_participants.flatMap(p=>[p.image_asset_id,p.local_asset_id,p.remote_asset_id]),...b.tournament_revisions.map(r=>r.cover_asset_id),...b.media_presentations.map(p=>p.asset_id)].filter(Boolean));
 b.media_assets=b.media_assets.filter(a=>referenced.has(a.id));next.blobs=Object.fromEntries(Object.entries(next.blobs).filter(([id])=>referenced.has(id)));
 root.PinoyContentModelV1.validate(b);return next;
}
function action(state,tid,operation,actor,options){
 options=options||{};const b=state.bundle,t=b.tournaments.find(t=>t.id===tid);if(!t)fail('월드컵이 없습니다.');
 if(operation==='submit'){
  owned(state,tid,actor);if(!options.reviewed)fail('후보·이미지 정보를 직접 검토했다는 확인이 필요합니다.');
  const r=b.tournament_revisions.find(r=>r.id===t.draft_revision_id),people=b.revision_participants.filter(p=>p.revision_id===r.id&&p.active);
  if(people.length!==r.legacy_fields.creator_requested_size)fail('선택한 강수와 활성 참가자 수가 다릅니다.');
 }else if(operation==='archive'&&actor!=='test-admin')owned(state,tid,actor);
 else if(actor!=='test-admin')fail('관리자 테스트 역할이 필요합니다.');
 const next=clone(state);
 if(['private','archive'].includes(operation)){const n=next.bundle.tournaments.find(x=>x.id===tid);n.visibility=operation==='archive'?'archived':'private';n.edit_version++;if(!next.bundle.provenance.lifecycle_events)next.bundle.provenance.lifecycle_events=[];next.bundle.provenance.lifecycle_events.push({action:operation,tournament_id:tid,actor_id:actor,edit_version:n.edit_version});root.PinoyContentModelV1.validate(next.bundle);return next;}
 if(['approve','publish','rollback'].includes(operation)){
  const rid=options.revision_id||t.draft_revision_id;
  if(b.revision_participants.some(p=>p.revision_id===rid&&p.active&&p.legacy_fields.creator_pending_image_url))fail('URL 이미지는 아직 파일 검증 전입니다. 업로드하거나 URL을 제거해 주세요.');
 }
 const target=options.revision_id||t.draft_revision_id,projected=clone(b);
 if(operation!=='rollback')projected.tournaments.find(x=>x.id===tid).draft_revision_id=target;
 next.bundle=root.PinoyContentModelV1.transition(projected,tid,operation,{expected_edit_version:t.edit_version,actor_id:actor,revision_id:target,note:options.note});
 next.bundle.tournaments.find(x=>x.id===tid).draft_revision_id=t.draft_revision_id;
 root.PinoyContentModelV1.validate(next.bundle);return next;
}
function duplicate(state,tid,actor){owned(state,tid,actor);const work=load(state,tid);work.tournament_id=id('tournament');work.base_revision_id=null;work.title+=' (copy)';const remap=new Map();for(const p of work.participants){const old=p.id;p.id=id('participant');p.entity_id=id('entity');remap.set(old,p.id);}work.cover_participant_id=remap.get(work.cover_participant_id)||null;return save(state,work,actor);}
function parseList(text,existing,target,mode){
 if(typeof text!=='string'||text.length>60000)fail('입력 길이를 확인하세요.');
 const names=text.split(/\r?\n/).map(s=>s.trim().replace(/^(?:\d{1,3}[.)、:]\s+|\(\d{1,3}\)\s*|[-*•]\s+)/,'').trim()).filter(Boolean);
 if(names.some(n=>!plain(n)||n.length>300||/^https?:\/\//i.test(n)))fail('한 줄에 후보 이름 하나만 입력하세요. HTML·URL 목록은 허용하지 않습니다.');
 if(!['append','replace'].includes(mode)||names.length+(mode==='append'?existing.length:0)!==target)fail('등록 후 후보 수는 정확히 '+target+'개여야 합니다.');
 const all=(mode==='append'?existing.map(p=>p.name):[]).concat(names),seen=new Set(),duplicates=[];
 for(const name of all){const key=name.normalize('NFKC').replace(/\s+/g,' ').toLowerCase();if(seen.has(key))duplicates.push(name);seen.add(key);}
 return {names,duplicates:[...new Set(duplicates)]};
}
function preview(state,tid,revisionId){
 const b=clone(state.bundle),t=b.tournaments.find(t=>t.id===tid);if(!t)fail('미리보기 대상을 선택하세요.');const rid=revisionId||t.draft_revision_id||t.published_revision_id,r=b.tournament_revisions.find(r=>r.id===rid&&r.tournament_id===tid);if(!r)fail('미리보기 리비전을 확인하세요.');
 const members=b.revision_participants.filter(p=>p.revision_id===rid);if(members.filter(p=>p.active&&p.name.trim()).length<8)fail('이름이 있는 활성 참가자가 최소 8명 필요합니다.');
 if(members.some(p=>p.active&&!p.name.trim()))fail('이름 없는 활성 참가자를 먼저 입력하거나 비활성화하세요.');
 // Read-only display projection for the unchanged public adapter; not a workflow approval.
 b.tournaments=[Object.assign(t,{visibility:'public',draft_revision_id:null,published_revision_id:rid})];b.tournament_revisions=[Object.assign(r,{state:'legacy_snapshot',parent_revision_id:null})];b.revision_participants=members;
 const ids=new Set(members.map(p=>p.participant_id));b.participants=b.participants.filter(p=>p.tournament_id===tid&&ids.has(p.id));const entities=new Set(b.participants.map(p=>p.entity_id));b.entities=b.entities.filter(e=>entities.has(e.id));
 b.media_presentations=b.media_presentations.filter(p=>p.revision_id===rid);const assets=new Set([...members.map(p=>p.image_asset_id),r.cover_asset_id].filter(Boolean));b.media_assets=b.media_assets.filter(a=>assets.has(a.id));b.featured_entries=[];b.provenance={kind:'creator_private_preview',never_record_statistics:true};
 root.PinoyContentModelV1.validate(b);return {bundle:b,blobs:Object.fromEntries([...assets].filter(id=>state.blobs[id]).map(id=>[id,state.blobs[id]]))};
}
function validateState(state){
 if(!state||state.format!=='pinoy-creator-test-v3'||!Number.isSafeInteger(state.generation)||!state.blobs||typeof state.blobs!=='object')fail('지원하지 않는 제작자 백업입니다.');
 root.PinoyContentModelV1.validate(state.bundle);
 const uuid=(value,kind)=>typeof value==='string'&&new RegExp('^'+kind+'_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$','i').test(value);
 for(const t of state.bundle.tournaments)if(!uuid(t.id,'tournament'))fail('제작자 월드컵 UUID를 확인하세요.');
 for(const p of state.bundle.participants)if(!uuid(p.id,'participant')||!uuid(p.entity_id,'entity'))fail('참가자 UUID를 확인하세요.');
 for(const r of state.bundle.tournament_revisions){if(!uuid(r.id,'rev')||!plain(r.title)||!plain(r.description)||![8,16,32].includes(r.legacy_fields?.creator_requested_size))fail('리비전 입력 정보를 확인하세요.');}
 for(const p of state.bundle.revision_participants){
  const fields=p.legacy_fields;if(!fields||typeof fields.description!=='string'||!plain(fields.description)||typeof fields.creator_pending_image_url!=='string'||(fields.creator_pending_image_url&&!validURL(fields.creator_pending_image_url)))fail('참가자 입력 정보를 확인하세요.');
  const notes=fields.creator_media_notes;if(!notes||typeof notes!=='object'||Array.isArray(notes)||['source_url','author','license','license_url'].some(k=>typeof notes[k]!=='string'))fail('이미지 출처 입력 형식을 확인하세요.');
  const displays=fields.creator_presentations;if(!displays||typeof displays!=='object'||Array.isArray(displays)||['main','banner','start','vs','result'].some(k=>!displays[k]||typeof displays[k]!=='object'||Array.isArray(displays[k])))fail('사진 표시 입력 형식을 확인하세요.');
 }
 const assetIds=new Set(state.bundle.media_assets.map(a=>a.id));if(Object.keys(state.blobs).some(id=>!assetIds.has(id)))fail('참조되지 않은 이미지 백업입니다.');
 for(const a of state.bundle.media_assets){const blob=state.blobs[a.id];if(!uuid(a.id,'asset')||a.path!=='creator-media/'+a.id+'.webp'||!Number.isSafeInteger(a.width)||a.width<1||!Number.isSafeInteger(a.height)||a.height<1||!blob||!/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(blob)||blob.length>600000)fail('이미지 데이터가 잘못되었거나 너무 큽니다.');}
 for(const r of state.bundle.tournament_revisions)if(r.state==='legacy_snapshot')fail('제작자 백업에 원본 공개본을 섞을 수 없습니다.');
 for(const t of state.bundle.tournaments)if(!['creator-a','creator-b'].includes(t.creator_id))fail('테스트 제작자 소유권을 확인하세요.');
 return true;
}
root.CreatorModelV3={empty,member,fresh,load,save,action,duplicate,parseList,preview,validateState,validURL,clone,id};
})(globalThis);
