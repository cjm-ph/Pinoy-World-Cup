/* Pure, offline content contract. Not loaded by any existing page. */
(function(root){
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
const contexts=['main','banner','start','vs','result'];
const states=['legacy_snapshot','draft','submitted','approved','rejected'];
function fail(message){throw Error(message);}
function text(value){return typeof value==='string'&&value.trim().length>0;}
function safePath(value){
 if(!text(value)||/[<>"'\\\u0000-\u001f]/.test(value)||value.startsWith('//'))return false;
 if(/^[a-z][a-z0-9+.-]*:/i.test(value)){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch(e){return false;}}
 return !value.startsWith('/')&&!value.split('/').includes('..');
}
function validate(bundle){
 if(!bundle||bundle.schema_version!=='1.0.0')fail('Unsupported schema_version');
 const tables=['categories','tournaments','tournament_revisions','entities','participants','revision_participants','media_assets','media_presentations','featured_entries'];
 tables.forEach(key=>{if(!Array.isArray(bundle[key]))fail('Missing table: '+key);});
 const maps={};
 for(const table of tables){
  maps[table]=new Map();
  for(const row of bundle[table]){
   if(!row||typeof row!=='object'||Array.isArray(row))fail('Invalid row: '+table);
   const key=table==='participants'?JSON.stringify([row.tournament_id,row.id]):table==='revision_participants'?JSON.stringify([row.revision_id,row.participant_id]):row.id;
   if(!text(key)||maps[table].has(key))fail('Duplicate/invalid key: '+table+' '+key);
   maps[table].set(key,row);
  }
 }
 const ref=(table,id)=>{if(!text(id)||!maps[table].has(id))fail('Invalid reference: '+table+' '+id);return maps[table].get(id);};
 const asset=id=>{if(id!==null)ref('media_assets',id);};
 for(const c of bundle.categories){
  if(!text(c.id)||!text(c.slug)||!text(c.name))fail('Invalid category');
  let parent=c.parent_id,seen=new Set([c.id]);
  while(parent!==null){if(seen.has(parent))fail('Category cycle');seen.add(parent);parent=ref('categories',parent).parent_id;}
 }
 if(new Set(bundle.categories.map(c=>c.slug)).size!==bundle.categories.length)fail('Duplicate category slug');
 for(const e of bundle.entities)if(!text(e.id)||!['person','food','film','other'].includes(e.kind)||!text(e.canonical_name))fail('Invalid entity');
 for(const t of bundle.tournaments){
  if(!text(t.id)||!['private','public','archived','quarantined'].includes(t.visibility)||!Number.isSafeInteger(t.edit_version)||t.edit_version<0||!(t.creator_id===null||text(t.creator_id)))fail('Invalid tournament');
  for(const key of ['draft_revision_id','published_revision_id'])if(t[key]!==null){const r=ref('tournament_revisions',t[key]);if(r.tournament_id!==t.id)fail('Cross-tournament revision pointer');}
  if(t.visibility==='public'&&!t.published_revision_id)fail('Public tournament needs published revision');
 }
 for(const p of bundle.participants){if(!text(p.id))fail('Invalid participant ID');ref('tournaments',p.tournament_id);ref('entities',p.entity_id);if(!text(p.legacy_person_id))fail('Missing preserved person ID');}
 for(const a of bundle.media_assets){
  if(!text(a.id)||!safePath(a.path)||!/^([a-f0-9]{64})$/.test(a.sha256)||!['unverified','verified','rejected'].includes(a.rights_review.status)||!['ready','missing','pending','failed'].includes(a.technical.state))fail('Invalid asset');
  if(a.rights_review.status==='verified'&&(!text(a.rights_review.evidence)||!text(a.rights_review.reviewed_by)))fail('Verified rights require evidence and reviewer');
 }
 for(const r of bundle.tournament_revisions){
  ref('tournaments',r.tournament_id);asset(r.cover_asset_id);
  if(!text(r.title)||typeof r.description!=='string'||!states.includes(r.state)||!Number.isSafeInteger(r.version)||r.version<1)fail('Invalid revision');
  if(!Array.isArray(r.category_ids)||!r.category_ids.length||new Set(r.category_ids).size!==r.category_ids.length)fail('Invalid revision categories');
  r.category_ids.forEach(id=>ref('categories',id));
  let parent=r.parent_revision_id,seen=new Set([r.id]);
  while(parent!==null){if(seen.has(parent))fail('Revision parent cycle');seen.add(parent);const previous=ref('tournament_revisions',parent);if(previous.tournament_id!==r.tournament_id)fail('Cross-tournament parent');parent=previous.parent_revision_id;}
  const members=bundle.revision_participants.filter(p=>p.revision_id===r.id),people=new Set(),orders=new Set();
  for(const p of members){
   const participant=maps.participants.get(JSON.stringify([r.tournament_id,p.participant_id]));if(!participant)fail('Participant not in tournament');
   if(people.has(participant.entity_id))fail('Duplicate entity in revision');people.add(participant.entity_id);
   if(!Number.isSafeInteger(p.sort_order)||p.sort_order<0||orders.has(p.sort_order))fail('Invalid/duplicate sort_order');orders.add(p.sort_order);
   if(typeof p.name!=='string'||/[<>]/.test(p.name)||typeof p.active!=='boolean'||typeof p.emoji!=='string'||/[<>]/.test(p.emoji)||!['present','missing'].includes(p.image_state))fail('Invalid revision participant');
   asset(p.image_asset_id);asset(p.local_asset_id);asset(p.remote_asset_id);
   if((p.image_asset_id===null)!==(p.image_state==='missing'))fail('Inconsistent image state');
   if(p.image_asset_id!==(p.local_asset_id||p.remote_asset_id))fail('Legacy image precedence changed');
  }
  const count=members.filter(p=>p.active).length,rounds=[4,8,16,32].filter(n=>n<=count);
  if(JSON.stringify(r.round_policy.supported)!==JSON.stringify(rounds)||r.round_policy.default_size!==(rounds.at(-1)||null))fail('Round policy drift');
 }
 for(const p of bundle.revision_participants)ref('tournament_revisions',p.revision_id);
 const versions=new Set();for(const r of bundle.tournament_revisions){const key=JSON.stringify([r.tournament_id,r.version]);if(versions.has(key))fail('Duplicate revision version');versions.add(key);}
 for(const t of bundle.tournaments)if(t.published_revision_id){const r=ref('tournament_revisions',t.published_revision_id);if(!['legacy_snapshot','approved'].includes(r.state))fail('Published revision is not approved or an imported baseline');}
 const uniquePresentation=new Set();
 for(const p of bundle.media_presentations){
  const r=ref('tournament_revisions',p.revision_id);asset(p.asset_id);
  if(!contexts.includes(p.context)||!text(p.policy_id)||!p.settings||typeof p.settings!=='object')fail('Invalid presentation');
  if(p.settings.fit&&!['cover','contain'].includes(p.settings.fit))fail('Invalid image fit');
  const key=JSON.stringify([p.revision_id,p.participant_id,p.context]);if(uniquePresentation.has(key))fail('Duplicate presentation');uniquePresentation.add(key);
  if(p.participant_id!==null){const member=maps.revision_participants.get(JSON.stringify([r.id,p.participant_id]));if(!member||p.asset_id!==member.image_asset_id)fail('Presentation asset/participant mismatch');}
  if(p.settings.head&&(!Array.isArray(p.settings.head)||p.settings.head.length!==4||p.settings.head.some(v=>!Number.isFinite(v)||v<0)||p.settings.head[2]<=0||p.settings.head[3]<=0||p.settings.head[0]+p.settings.head[2]>1.00001||p.settings.head[1]+p.settings.head[3]>1.00001))fail('Invalid normalized head bounds');
 }
 for(const f of bundle.featured_entries){ref('tournaments',f.tournament_id);if(!Number.isSafeInteger(f.sort_order)||f.sort_order<0||typeof f.enabled!=='boolean')fail('Invalid featured entry');}
 if(new Set(bundle.featured_entries.map(f=>f.sort_order)).size!==bundle.featured_entries.length)fail('Duplicate featured order');
 return {valid:true,tournaments:bundle.tournaments.length,participants:bundle.participants.length};
}
function toViewModel(bundle,options){
 validate(bundle);options=options||{};
 const preview=options.mode==='preview';if(options.mode&&!['published','preview'].includes(options.mode))fail('Invalid adapter mode');
 const assets=new Map(bundle.media_assets.map(a=>[a.id,a]));
 const revisions=new Map(bundle.tournament_revisions.map(r=>[r.id,r]));
 const participants=new Map(bundle.participants.map(p=>[JSON.stringify([p.tournament_id,p.id]),p]));
 const members=new Map(),presentationGroups=new Map(),vsSettings=new Map();
 for(const p of bundle.revision_participants){if(!members.has(p.revision_id))members.set(p.revision_id,[]);members.get(p.revision_id).push(p);}
 for(const p of bundle.media_presentations){if(!presentationGroups.has(p.revision_id))presentationGroups.set(p.revision_id,[]);presentationGroups.get(p.revision_id).push(p);if(p.context==='vs'&&p.participant_id!==null)vsSettings.set(JSON.stringify([p.revision_id,p.participant_id]),p);}
 const image=id=>id===null?null:assets.get(id).path;
 const output={tournaments:[],vsPhotos:{},presentations:[],featured:[],homeConfig:copy(bundle.compatibility.home_config)};
 for(const t of bundle.tournaments){
  if(options.tournament_id&&t.id!==options.tournament_id)continue;
  if(!preview&&t.visibility!=='public')continue;
  const id=preview?t.draft_revision_id:t.published_revision_id;if(!id)continue;
  const r=revisions.get(id);
  const vm=copy(r.legacy_fields);
  vm.id=t.id;vm.title=r.title;vm.sub=r.description;
  if(Object.hasOwn(r.legacy_fields,'cover_image')||r.cover_asset_id!==null)vm.cover_image=image(r.cover_asset_id)||'';
  vm.items=(members.get(id)||[]).slice().sort((a,b)=>a.sort_order-b.sort_order).map(p=>{
   const member=participants.get(JSON.stringify([t.id,p.participant_id])),legacy=copy(p.legacy_fields);
   const item=Object.assign(legacy,{id:p.participant_id,person_id:member.legacy_person_id,n:p.name});
   if(Object.hasOwn(p.legacy_fields,'active')||!p.active)item.active=p.active;
   if(Object.hasOwn(p.legacy_fields,'e')||p.emoji)item.e=p.emoji;
   if(Object.hasOwn(p.legacy_fields,'_localPhoto')||p.local_asset_id!==null)item._localPhoto=image(p.local_asset_id)||'';
   if(Object.hasOwn(p.legacy_fields,'img')||p.remote_asset_id!==null)item.img=image(p.remote_asset_id)||'';
   const presentation=vsSettings.get(JSON.stringify([id,p.participant_id]));
   output.vsPhotos[item.id]=presentation?copy(presentation.settings):{};
   return item;
  });
  output.tournaments.push(vm);output.presentations.push(...copy(presentationGroups.get(id)||[]));
 }
 const visible=new Set(output.tournaments.map(t=>t.id));
 output.featured=copy(bundle.featured_entries.filter(f=>f.enabled&&visible.has(f.tournament_id)).sort((a,b)=>a.sort_order-b.sort_order));
 return output;
}
function readyForReview(bundle,r){
 const people=bundle.revision_participants.filter(p=>p.revision_id===r.id&&p.active);
 if(!r.title.trim()||people.length<4||people.some(p=>!p.name.trim()))fail('Content is not playable');
 return people;
}
function publishable(bundle,r){
 const people=readyForReview(bundle,r);
 const representatives=bundle.media_presentations.filter(p=>p.revision_id===r.id&&p.participant_id===null).map(p=>p.asset_id);
 const ids=[r.cover_asset_id,...people.map(p=>p.image_asset_id),...representatives].filter(Boolean);
 for(const id of ids){const a=bundle.media_assets.find(a=>a.id===id);if(a.technical.state!=='ready'||a.rights_review.status!=='verified')fail('Media rights/technical review required');}
}
// actor_id and reviewer checks model a future policy; this module provides no authentication.
function transition(bundle,tournamentId,action,options){
 validate(bundle);options=options||{};const next=copy(bundle),t=next.tournaments.find(t=>t.id===tournamentId);
 if(!t||options.expected_edit_version!==t.edit_version)fail('Missing tournament/stale edit_version');
 if(!text(options.actor_id))fail('actor_id required');
 let r=next.tournament_revisions.find(r=>r.id===t.draft_revision_id);
 if(action==='save_draft'){
  if(!text(options.new_revision_id)||next.tournament_revisions.some(r=>r.id===options.new_revision_id))fail('Fresh revision ID required');
  const source=r||next.tournament_revisions.find(r=>r.id===t.published_revision_id);if(!source)fail('Initial creation uses explicit records');
  const patch=options.patch||{};if(Object.keys(patch).some(k=>!['title','description'].includes(k)))fail('Unsupported draft patch');
  r=Object.assign(copy(source),patch,{id:options.new_revision_id,parent_revision_id:source.id,version:Math.max(...next.tournament_revisions.filter(x=>x.tournament_id===t.id).map(x=>x.version))+1,state:'draft',submitted_by:null,reviewed_by:null,review_note:null});
  next.tournament_revisions.push(r);
  next.revision_participants.filter(p=>p.revision_id===source.id).forEach(p=>next.revision_participants.push(Object.assign(copy(p),{revision_id:r.id})));
  next.media_presentations.filter(p=>p.revision_id===source.id).forEach(p=>{
   const id=(options.presentation_ids||{})[p.id];
   if(!text(id)||next.media_presentations.some(x=>x.id===id))fail('Preallocated fresh presentation ID required');
   next.media_presentations.push(Object.assign(copy(p),{id,revision_id:r.id}));
  });
  t.draft_revision_id=r.id;
 }else if(action==='rollback'){
  const target=next.tournament_revisions.find(x=>x.id===options.revision_id&&x.tournament_id===t.id);
  if(!target||target.state!=='approved')fail('Rollback requires an approved revision');publishable(next,target);t.published_revision_id=target.id;t.visibility='public';
 }else{
  if(!r||options.revision_id!==r.id)fail('Exact draft revision required');
  if(action==='submit'){if(!['draft','rejected'].includes(r.state))fail('Invalid submit transition');readyForReview(next,r);r.state='submitted';r.submitted_by=options.actor_id;r.reviewed_by=null;r.review_note=null;}
  else if(action==='approve'||action==='reject'){
   if(r.state!=='submitted'||options.actor_id===r.submitted_by)fail('Independent reviewer required');
   if(action==='reject'&&!text(options.note))fail('Rejection reason required');
   if(action==='approve')publishable(next,r);r.state=action==='approve'?'approved':'rejected';r.reviewed_by=options.actor_id;r.review_note=options.note||null;
  }else if(action==='publish'){if(r.state!=='approved')fail('Approval required');publishable(next,r);t.published_revision_id=r.id;t.visibility='public';}
  else fail('Unknown transition');
 }
 t.edit_version++;
 if(!next.provenance.lifecycle_events)next.provenance.lifecycle_events=[];
 next.provenance.lifecycle_events.push({tournament_id:t.id,action,actor_id:options.actor_id,revision_id:action==='rollback'?options.revision_id:t.draft_revision_id,published_revision_id:t.published_revision_id,edit_version:t.edit_version,note:options.note||null});
 validate(next);return next;
}
function validateAuthoringInput(input){
 if(!input||!text(input.request_id)||!text(input.title)||![8,16,32].includes(input.requested_round_size)||!['manual','google_manual','gemini_manual','paste'].includes(input.origin))fail('Invalid authoring request');
 if(!Array.isArray(input.candidates)||input.candidates.length!==input.requested_round_size)fail('Candidate count mismatch');
 const seen=new Set();for(const p of input.candidates){
  if(!text(p.proposal_id)||seen.has(p.proposal_id)||!text(p.name)||/[<>]/.test(p.name)||!(p.entity_id===null||text(p.entity_id)))fail('Invalid proposal');seen.add(p.proposal_id);
  if(p.image_input){const m=p.image_input;
   if(!['missing','url','upload'].includes(m.kind))fail('Invalid image input kind');
   if(m.kind==='missing'&&(m.url!==null||m.upload_ref!==null))fail('Missing image must have null references');
   if(m.kind==='url'&&(!safePath(m.url)||!m.url.startsWith('https://')||m.upload_ref!==null))fail('HTTPS image URL required');
   if(m.kind==='upload'&&(!text(m.upload_ref)||m.url!==null))fail('Upload reference required');
  }
 }
 if(input.operations){const operations=new Set();for(const op of input.operations){
  if(!text(op.operation_id)||operations.has(op.operation_id)||!['add','rename','replace','remove'].includes(op.action))fail('Invalid operation');operations.add(op.operation_id);
  if(op.action==='add'?op.participant_id!==null:!text(op.participant_id))fail('Invalid operation target');
  if(op.action==='remove'?op.proposal_id!=null:!seen.has(op.proposal_id))fail('Invalid operation proposal');
 }}
 return {valid:true,requires_identity_review:true,requires_media_review:true};
}
function parsePastedNames(value,proposalIds){
 if(typeof value!=='string'||!Array.isArray(proposalIds))fail('Text and preallocated proposal IDs required');
 const names=value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(![8,16,32].includes(names.length)||names.length!==proposalIds.length||new Set(proposalIds).size!==proposalIds.length||proposalIds.some(id=>!text(id)))fail('Expected 8/16/32 names and unique IDs');
 if(names.some(n=>/[<>]/.test(n)))fail('Plain text names required');
 return {candidates:names.map((name,i)=>({proposal_id:proposalIds[i],name,entity_id:null})),duplicate_names:[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))],requires_identity_review:true};
}
const api={validate,toViewModel,transition,validateAuthoringInput,parsePastedNames};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PinoyContentModelV1=api;
})(globalThis);
