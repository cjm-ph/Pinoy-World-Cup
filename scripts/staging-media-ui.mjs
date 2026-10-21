import {createTournamentManagement,managementActions} from './staging-tournament-management.mjs';
import {createTournamentPurge} from './staging-tournament-purge.mjs';
import {createPhotoCards} from './photo-card-editor.mjs';
import {createGeminiSupport} from './creator-gemini-support.mjs';
import {installAdminLanguage,translate} from './staging-admin-i18n.mjs';
import {createMediaApi, STAGING_URL} from './staging-media-api.mjs';
import {STEPS, statusOf, filterTournaments, workFromRevision, canEditMetadata, createDashboardApi, draftPayload} from './staging-admin-model.mjs';
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const make = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const adminLanguage=installAdminLanguage();
const dataText=(tag,text,className)=>{const node=make(tag,text,className);node.dataset.i18nSkip='';return node;};
const dateText=(tag,date,dateOnly=false)=>{const node=make(tag);node.dataset.i18nDate=date;if(dateOnly)node.dataset.i18nDateOnly='true';return node;};
let client, api, dashboard, user, tournaments=[], categories=[], context=null, selected=null, revision=null;
let managementApi,management={available:false,trash:[]};
let purgeApi,purgeState={enabled:false,jobs:[]};
let photoWorking=false;
let authorized=false, working=false, epoch=0, page='dashboard', asset=null, rightsRecorded=false;
let work=null, editing=null, step=0, dirty=false, newPhotoUrl=null, game=null;
const photoUrls=new Map(), photosPending=new Map();
function say(message, kind='') { $('stagingStatus').textContent=message; $('stagingStatus').className='notice '+kind; $('loginStatus').textContent=message; }
function clearPhotos() { for(const url of photoUrls.values()) URL.revokeObjectURL(url); photoUrls.clear(); photosPending.clear(); if(newPhotoUrl)URL.revokeObjectURL(newPhotoUrl);newPhotoUrl=null; }
function lock() {
 management={available:false,trash:[]};$('trashRows').replaceChildren();
 purgeState={enabled:false,jobs:[]};
 epoch++; authorized=false;selected=revision=asset=work=editing=game=null;user=null;dirty=false;tournaments=[];categories=[];context=null;clearPhotos();
 $('stagingManagement').hidden=true;$('stagingLogin').hidden=false;
 $('stagingPassword').value=''; delete $('adminIdentity').dataset.i18nSkip;$('adminIdentity').textContent='Administrator';
 for(const id of ['tournamentRows','reviewRows','recentTournaments','currentPhotos','stagingHistory','wizardPanel','previewGame','recentActivity']) $(id).replaceChildren();
 for(const id of ['stagingTournament','stagingSlot','stagingRollback']) $(id).replaceChildren();
 $('stagingFile').value='';$('stagingEvidence').value='';$('stagingRightsAck').checked=$('stagingSubmitAck').checked=false;
 for(const dialog of all('dialog[open]'))dialog.close();
}
async function run(action) {
 if(working||photoWorking)return;
 working=true; const buttons=all('#stagingAdmin button');const previous=buttons.map(b=>b.disabled);
 buttons.forEach(b=>b.disabled=true);$('adminMain').setAttribute('aria-busy','true');
 try { await action(); } catch(error) { say(error.message || 'Request failed. Refresh before retrying.','error'); }
 finally { working=false; buttons.forEach((b,i)=>b.disabled=previous[i]);$('adminMain').removeAttribute('aria-busy'); updateControls(); }
}
function options(id, rows, value) { const select=$(id);select.replaceChildren(...rows.map(([key,label])=>{const o=make('option',label);o.value=key;if((key&&['categoryFilter','workCategory','stagingTournament','workCover'].includes(id))||(id==='stagingSlot'&&key!=='cover'))o.dataset.i18nSkip='';return o;}));if(value!==undefined)select.value=value; }
function setPage(next) {
 page=next;all('[data-view]').forEach(n=>n.hidden=n.dataset.view!==next);
 all('[data-page]').forEach(n=>{n.classList.toggle('active',n.dataset.page===next); if(n.dataset.page===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
 $('pageCrumb').textContent=({dashboard:'Dashboard',tournaments:'Tournaments',create:'Create World Cup',reviews:'Review Queue',comments:'Comments',members:'Members',staff:'Staff Permissions',settings:'Settings',editor:'Tournament details',trash:'Trash'})[next];
 toggleMenu(false);window.scrollTo({top:0,behavior:'instant'});
}
async function navigate(next) {
 if(dirty && page==='create' && next!=='create') {
  if(!await confirmAction('Leave unsaved changes?','Your current text and candidate edits have not been saved. Existing server drafts and uploaded photos are preserved.'))return;
  work=null;editing=null;dirty=false;
 }
 if(next==='create') {if(!work)newWork();else renderWizard();}
 setPage(next);
}
function toggleMenu(open) { $('adminSidebar').classList.toggle('open',open);$('menuScrim').classList.toggle('open',open);$('mobileMenu').setAttribute('aria-expanded',String(open)); }
async function guardSession(){const {data,error}=await client.auth.getSession();if(error||!data.session||!authorized){lock();throw Error('Sign in with an authorized Staging administrator account.');}}
async function guard(tid=selected?.id) {
 const {data,error}=await client.auth.getSession();
 if(error || !data.session || !authorized) {lock();throw Error('Sign in with an authorized Staging administrator account.');}
 try { if(tid)await api.authorize(tid); else await api.adminCatalog(); }
 catch(error){lock();throw error;}
}
async function photo(aid) {
 if(!aid)return null;
 if(photoUrls.has(aid))return photoUrls.get(aid);
 if(photosPending.has(aid))return photosPending.get(aid);
 const at=epoch;
 const pending=(async()=>{try{const blob=await dashboard.preview(aid);if(at!==epoch)return null;const url=URL.createObjectURL(blob);photoUrls.set(aid,url);return url;}catch{return null;}finally{photosPending.delete(aid);}})();
 photosPending.set(aid,pending);return pending;
}
async function showPhoto(container, aid, name) {
 container.replaceChildren(make('span',aid?'Loading private preview...':'No photo uploaded','muted'));
 container.dataset.asset=aid||'';if(!aid)return;
 const at=epoch;const url=await photo(aid);
 if(at!==epoch || container.dataset.asset!==aid || !container.isConnected)return;
 if(!url){container.replaceChildren(make('span','Preview unavailable. Check the dashboard read RPC installation and photo access.','muted'));return;}
 const image=make('img');image.src=url;image.alt=name;image.dataset.i18nSkip='';image.loading='lazy';image.onerror=()=>container.replaceChildren(make('span','Photo could not be loaded.','muted'));container.replaceChildren(image);
}
const catName = id => categories.find(c=>c.id===id)?.name || id || 'Uncategorized';
function completeRevision(t,r){
 if(!r)return r;
 return {...r,requested_size:r.requested_size||t.requested_size,
  participants:(r.participants||[]).map(p=>({...p,pending_url:(t.candidate_inputs||[]).find(input=>input.id===p.id)?.pending_url||p.pending_url||''}))};
}
function statusBadge(t) {return make('span',statusOf(t),'badge '+statusOf(t).toLowerCase());}
function renderTrash(){
 $('trashHelp').textContent=purgeState.enabled?'Permanent deletion cannot be undone. Enter the exact tournament name to confirm.':management.available?'Permanent deletion is unavailable. Existing data is preserved.':'Tournament management requires approved Staging 048 migration.';
 $('trashRows').replaceChildren(...management.trash.map(t=>{
  const job=purgeState.jobs.find(j=>j.tournament_id===t.id),tr=make('tr'),actions=make('td');
  tr.append(dataText('td',t.title||t.id),dateText('td',t.trashed_at));
  const restore=make('button','Restore as private','btn small');restore.disabled=!management.available||!!job;restore.onclick=()=>run(()=>manageTournament(t,'restore'));
  const remove=make('button',job?'Continue permanent deletion':'Permanently delete','btn small danger');remove.dataset.i18nSkip='';remove.disabled=!purgeState.enabled;
  remove.onclick=()=>run(()=>permanentlyDelete(t));
  actions.append(restore,remove);if(job){const state=make('p',`Deletion ${job.state}. Remaining files: ${job.remaining}.`,'help');state.dataset.i18nSkip='';actions.append(state);}
  tr.append(actions);return tr;
 }));
}
async function permanentlyDelete(t){
 if(!purgeState.enabled)throw Error('Permanent deletion is disabled.');
 const input=await confirmAction('Permanently Delete',`This cannot be undone.\nTarget ID: ${t.id}\nType the exact tournament name:\n${t.title||t.id}`,true,true);
 if(input===false)return;
 try{
  const result=await purgeApi.erase(t,input,job=>{say(`Deleting tournament. Remaining files: ${job.remaining}.`);});
  await refreshAdmin(false,{quiet:true});
  say(result.state==='complete'?'Tournament permanently deleted.':'Deletion paused safely. Use Continue permanent deletion to proceed.',result.state==='complete'?'success':'');
 }catch(error){
  try{purgeState=await purgeApi.capability();renderTrash();}catch{}
  throw error;
 }
}
async function manageTournament(t,action){
 if(!management.available)throw Error('Tournament management requires approved Staging 048 migration.');
 const title=t.revision?.title||t.title||t.id;
 const labels={trash:'Move to trash',restore:'Restore as private',publish:'Publish approved version',unpublish:'Make private'};
 const message=action==='trash'?'Public access will be blocked. Existing photos and settings are preserved.':action==='restore'?'Restoration keeps this tournament private.':'Existing approval and publication rules still apply.';
 if(!await confirmAction(labels[action],title+'\n'+translate(message,adminLanguage.language)))return;
 await guardSession();await managementApi.change(t,action);
 try{await refreshAdmin(false,{quiet:true});}catch(error){lock();throw error;}
 say('Tournament management updated.','success');
}
function renderCatalog() {
 renderTrash();
 const rows=filterTournaments(tournaments,{search:$('tournamentSearch').value,category:$('categoryFilter').value,status:$('statusFilter').value});
 $('tournamentRows').replaceChildren(...rows.map(t=>{
  const tr=make('tr'), title=make('td');title.append(dataText('span',t.revision?.title||t.id,'table-title'),dataText('span',t.id,'table-id'));tr.append(title,(t.revision?.category_ids?.length?dataText('td',t.revision.category_ids.map(catName).join(', ')):make('td','Not available')));
  const state=make('td');state.append(make('span',({draft:'Draft',submitted:'Pending',approved:'Approved',rejected:'Rejected',legacy_snapshot:'Legacy snapshot'})[t.revision?.state]||'Not available','badge'));tr.append(state,make('td',t.revision?(t.revision.participants||[]).filter(p=>p.active).length:'Unavailable'),make('td',t.visibility==='public'?'Public':'Private'));
  const action=make('td'),button=make('button','Manage','btn small');button.onclick=()=>run(()=>openTournament(t.id));action.append(button);const actions=managementActions(t,management.available);for(const [op,label,enabled] of [[t.visibility==='public'?'unpublish':'publish',t.visibility==='public'?'Make private':'Publish approved version',t.visibility==='public'?actions.unpublish:actions.publish],['trash','Move to trash',actions.trash]]){const b=make('button',label,'btn small');b.disabled=!enabled;b.onclick=()=>run(()=>manageTournament(t,op));action.append(b);}tr.append(action);return tr;
 }));
 if(!rows.length){const tr=make('tr'),td=make('td',tournaments.length?'No World Cups match these filters.':'No World Cups yet. Create your first draft to get started.','empty');td.colSpan=6;tr.append(td);$('tournamentRows').append(tr);}
 $('tournamentCount').textContent=`${rows.length} of ${tournaments.length} World Cups shown. `+(context?'Includes archived and blocked content.':'Current catalog includes private and public content only.');
 $('totalCups').textContent=String(tournaments.length);$('cupScope').textContent=context?'All catalog World Cups':'Private and public World Cups only';
 const incomplete=tournaments.some(t=>(t.draft_revision_id||t.published_revision_id)&&!t.revision);
 $('pendingCount').textContent=incomplete?'Not available yet':String(tournaments.filter(t=>!isAdminCreated(t)&&t.revision?.state==='submitted').length);
 $('pendingCount').classList.toggle('unavailable',incomplete);
 const recent=tournaments.slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,5);
 $('recentTournaments').replaceChildren(...recent.map(t=>{const row=make('div',undefined,'activity-item'),title=make('div');title.append(dataText('strong',t.revision?.title||t.id),make('div',`${t.revision?.participants?.length||0} candidates`,'help'));const b=make('button','Open','btn ghost small');b.onclick=()=>run(()=>openTournament(t.id));row.append(title,b);return row;}));
 if(!recent.length)$('recentTournaments').append(make('div','Your first World Cup starts in the creator studio.','empty'));
 renderReviews();
}
function isAdminCreated(t){return t?.creator_is_admin===true||t?.creator_id===user?.id;}
function renderReviews() {
 const rows=filterTournaments(tournaments,{search:$('reviewSearch').value,status:$('reviewFilter').value}).filter(t=>!isAdminCreated(t)&&['submitted','approved','rejected'].includes(t.revision?.state));
 $('reviewRows').replaceChildren(...rows.map(t=>{const tr=make('tr');const state=make('td');state.append(statusBadge(t));const td=make('td'),b=make('button','Review details','btn small');b.onclick=()=>run(()=>openTournament(t.id));td.append(b);tr.append(dataText('td',t.revision.title),state,(t.revision.submitted_at?dateText('td',t.revision.submitted_at,true):make('td','Not available')),td);return tr;}));
 if(!rows.length){const tr=make('tr'),td=make('td','No submissions match this view.','empty');td.colSpan=4;tr.append(td);$('reviewRows').append(tr);}
}
async function refreshAdmin(keepSelection=false,{quiet=false}={}) {
 const started=performance.now(),chosen=keepSelection?selected?.id:null,at=epoch,measure={};
 say('Restoring administrator session...');
 const sessionStart=performance.now();const {data,error}=await client.auth.getSession();measure.sessionMs=performance.now()-sessionStart;
 if(error||!data.session){lock();say('Sign in with an authorized Staging administrator account.');return;}
 $('loginSignOut').hidden=false;$('loginRetry').hidden=false;
 say('Checking administrator permissions with Supabase...');
 const slow=setTimeout(()=>say('Waiting for Supabase administrator data...'),1500);let details,catalog;
 const permissionStart=performance.now();
 try{details=await dashboard.context();if(!details)catalog=await api.adminCatalog();}catch(error){lock();throw error;}finally{clearTimeout(slow);}
 measure.permissionMs=performance.now()-permissionStart;
 try{management=await managementApi.load();}catch{management={available:false,trash:[]};}
 purgeState=await purgeApi.capability();
 // Session user is display/ownership UI data only. The RPC above is the authority.
 const identity=data.session.user?{data:{user:data.session.user}}:await client.auth.getUser();
 if(identity.error||!identity.data.user)throw Error('Administrator session could not be verified.');if(at!==epoch)return;
 user=identity.data.user;context=details;tournaments=details?details.tournaments:catalog;categories=details?details.categories:[];
 say('Loading tournament data...');const readStart=performance.now(),results=[];
 // New context embeds exact revisions. Older installations use bounded parallel reads.
 for(let offset=0;offset<tournaments.length;offset+=4){const group=await Promise.all(tournaments.slice(offset,offset+4).map(async t=>{try{const rid=t.draft_revision_id||t.published_revision_id;return {...t,revision:rid?completeRevision(t,t.revision?.id===rid?t.revision:await api.revision(rid)):null};}catch{return {...t,revision:null};}}));results.push(...group);}
 measure.revisionMs=performance.now()-readStart;measure.totalMs=performance.now()-started;
 globalThis.PWCAdminPerformance??={};globalThis.PWCAdminPerformance.lastLogin=measure;
 const nav=performance.getEntriesByType('navigation')[0];if(nav)globalThis.PWCAdminPerformance.pageTtfbMs=nav.responseStart-nav.requestStart;
 if(at!==epoch)return;
 tournaments=results.filter(t=>management.available?!management.trash.some(d=>d.id===t.id):t.visibility!=='archived');authorized=true;
 // Older installation: reuse category IDs returned by get_revision, never invent IDs.
 if(!context)categories=[...new Set(tournaments.flatMap(t=>t.revision?.category_ids||[]))].map(id=>({id,name:id}));
 const filter=$('categoryFilter').value;options('categoryFilter',[['','All categories'],...categories.map(c=>[c.id,c.name])],filter);
 $('dashboardCompatibility').hidden=!!context;
 $('dashboardCompatibility').textContent='Basic catalog mode. Full categories, creator ownership, activity and private photo previews require the prepared dashboard read RPCs. Plays and member-directory data are not available.';
 $('recentActivity').replaceChildren();$('recentActivity').className='';
 for(const a of (details?.activity||[])){const row=make('div',undefined,'activity-item');row.append(make('span',a.action.replaceAll('_',' ')),dateText('small',a.created_at));$('recentActivity').append(row);}
 if(!details?.activity?.length)$('recentActivity').append(make('div',details?'No activity recorded yet.':'Not available yet','empty'));
 options('stagingTournament',tournaments.map(t=>[t.id,t.revision?.title||t.id]),chosen||undefined);
 renderCatalog();if(user.email)$('adminIdentity').dataset.i18nSkip='';$('adminIdentity').textContent=user.email||'Administrator';$('stagingManagement').hidden=false;$('stagingLogin').hidden=true;
 if(chosen && tournaments.some(t=>t.id===chosen))await loadSelected(chosen);
 if(quiet||keepSelection)say('Administrator data refreshed.');
 else if(!keepSelection&&!quiet){setPage('dashboard');say('Administrator access confirmed. Welcome to your workspace.','success');}
}
async function loadSelected(id=$('stagingTournament').value) {
 const t=tournaments.find(t=>t.id===id);if(!t)throw Error('This tournament is no longer available.');
 const at=epoch;
 const editable=['private','public'].includes(t.visibility);
 if(editable)await api.authorize(t.id);else await guard(null);
 const rid=t.draft_revision_id||t.published_revision_id;const r=completeRevision(t,t.revision?.id===rid?t.revision:await api.revision(rid));if(at!==epoch)return;
 paintSelected(t,r);
}
function paintSelected(t,r){
 selected=t;revision=r;t.revision=r;asset=null;rightsRecorded=false;
 $('stagingFile').value='';$('stagingEvidence').value='';$('stagingRightsAck').checked=$('stagingSubmitAck').checked=false;$('uploadStatus').textContent='';$('newPhoto').hidden=true;
 if(newPhotoUrl)URL.revokeObjectURL(newPhotoUrl);newPhotoUrl=null;
 $('stagingTournament').value=t.id;$('editorTitle').dataset.i18nSkip='';$('editorTitle').textContent=r.title;$('editorIdentity').dataset.i18nSkip='';$('editorIdentity').textContent=t.id;
 $('editorBadge').replaceWith(Object.assign(statusBadge(t),{id:'editorBadge'}));
 $('stagingRevision').textContent=`Version ${r.version} | ${r.state} | Revision: ${r.id}`;
 const count=r.participants.filter(p=>p.active).length;
 $('stagingReadiness').textContent=`${count} active candidates | Requested: ${r.requested_size||t.requested_size||'not returned by current RPC'} | Publication: ${t.published_revision_id?'existing published version':'not published'}`;
 const owner=canEditMetadata(t,user?.id);
 $('metadataHelp').textContent=owner?'You own this tournament. Text and candidate edits create a new draft.':'Only the creator can edit text and candidates. Administrators can manage photos and review revisions.';
 options('stagingSlot',[['cover','Cover'],...r.participants.map(p=>[p.id,p.name])]);
 options('stagingRollback',(t.approved_revisions||[]).map(r=>[r.id,`Version ${r.version} (${r.id})`]));
 renderPhotos();updateControls();
}
async function openTournament(id) { await loadSelected(id);setPage('editor');say('World Cup loaded. Inspect photos, edit supported fields or review the revision.'); }
function photoSlots(inWizard=false){
 const r=inWizard?work:revision;
 const participants=r?.participants||[];
 return [{id:'cover',name:'Cover',asset:r?.cover_asset_id,settings:inWizard?work?.cover_settings:(revision?.presentations||[]).find(p=>!p.participant_id&&p.context==='start')?.settings},
 ...participants.map(p=>({id:p.id,name:p.name,asset:p.image_asset_id,settings:inWizard?p.presentations?.vs:(revision.presentations||[]).find(m=>m.participant_id===p.id&&m.context==='vs')?.settings}))];
}
async function photoOperation(action){if(photoWorking)throw Error('A photo operation is already running.');photoWorking=true;try{return await action();}finally{photoWorking=false;}}
function cards(inWizard=false){
 const currentTournament=()=>inWizard?tournaments.find(t=>t.id===work?.tournament_id):selected;
 const storageAction=async(name)=>{const t=currentTournament();if(!t)throw Error('Save the tournament draft first.');return api.rpc(name,{tid:t.id});};
 return createPhotoCards({storageDiagnostics:()=>storageAction('admin_media_storage_diagnostics'),releaseExpired:()=>storageAction('admin_media_release_expired'),canEdit:()=>{const t=inWizard?tournaments.find(t=>t.id===work?.tournament_id):selected;return authorized&&(!t||(['private','public'].includes(t.visibility)&&(['draft','rejected','approved'].includes(t.revision?.state)||(inWizard&&t.creator_id===user?.id&&t.revision?.state==='submitted'))));},getSlots:()=>photoSlots(inWizard),loadPhoto:photo,getLanguage:()=>adminLanguage.language,notify:say,
 upload:async(slot,file,settings,rights)=>photoOperation(async()=>{
  if(context?.photo_workflow_version!=='045'||!context?.photo_fit_modes)throw Error('Photo workflow update is not installed. Apply the approved Staging 045 and 046 SQL first.');
  const note=rights?.notes||'';
  if(inWizard&&(!work.base_revision_id||dirty||tournaments.find(t=>t.id===work.tournament_id)?.revision?.state==='submitted'))await saveWork({quiet:true,force:true});
  const t=inWizard?tournaments.find(t=>t.id===work.tournament_id):selected;
  if(!t)throw Error('Save the tournament draft first.');await guardSession();
  const out=await api.upload(t.id,file,rights?.onProgress);
  if(out.technical_state!=='ready'||!out.asset_id)throw Error('Upload is not finalized. Refresh before retrying.');
  return finishUploadedPhoto(t.id,out,slot,inWizard,note,settings,rights?.onProgress);

 }),saveDisplay:async(slot,settings)=>photoOperation(async()=>{
  if(context?.photo_workflow_version!=='045'||!context?.photo_fit_modes)throw Error('Photo workflow update is not installed. Apply the approved Staging 045 and 046 SQL first.');
  if(inWizard&&tournaments.find(t=>t.id===work.tournament_id)?.revision?.state==='submitted')await saveWork({quiet:true,force:true});
  const t=inWizard?tournaments.find(t=>t.id===work.tournament_id):selected;await guardSession();
  const aid=photoSlots(inWizard).find(p=>p.id===slot)?.asset;if(!aid)throw Error('No photo uploaded');
  const result=await api.photoDraft(t,aid,slot,settings);await reloadPhotoState(t.id,inWizard,result);
 })});}
async function finishUploadedPhoto(tid,out,slot,inWizard,note,settings,onProgress){
 try{
  await guardSession();const t=tournaments.find(t=>t.id===tid);onProgress?.('Saving photo settings...');
  const result=await api.applyPhoto(t,out.asset_id,slot,settings,note);
  await reloadPhotoState(t.id,inWizard,result);return out;
 }catch(error){error.resume=(nextSettings=settings,nextNotes)=>photoOperation(()=>finishUploadedPhoto(tid,out,slot,inWizard,nextNotes?.notes??note,nextSettings,onProgress));throw error;}
}
async function reloadPhotoState(tid,inWizard,result){
 selected=tournaments.find(t=>t.id===tid);
 if(result?.revision?.id===result?.revision_id&&selected){
  Object.assign(selected,{draft_revision_id:result.revision_id,edit_version:result.edit_version,candidate_inputs:result.candidate_inputs||selected.candidate_inputs});
  paintSelected(selected,completeRevision(selected,result.revision));
 }else await refreshAdmin(true,{quiet:true});
 if(inWizard){work=workFromRevision(selected,revision);dirty=false;}
 renderCatalog();
}
function renderPhotos(){
 const panel=$('stagingSlot').closest('article');panel.hidden=true;panel.parentElement.style.gridTemplateColumns='1fr';
 $('currentPhotos').className='';$('currentPhotos').replaceChildren(cards(false));
}
function renderSlot(){if(!revision)return;const slot=$('stagingSlot').value;const p=slot==='cover'?{name:'Cover',image_asset_id:revision.cover_asset_id}:revision.participants.find(p=>p.id===slot);all('#currentPhotos .photo-card').forEach(c=>c.classList.toggle('selected',c.dataset.slot===slot));void showPhoto($('currentPhoto'),p?.image_asset_id,p?.name||'Photo');}
function updateControls(){
 if(working)return;
 $('wizardBack').disabled=step===0;$('wizardNext').disabled=step===4;
 const editable=authorized&&selected&&['private','public'].includes(selected.visibility)&&['draft','rejected','approved'].includes(revision?.state);
 for(const id of ['stagingUpload','stagingFile'])$(id).disabled=!editable;
 $('stagingRights').disabled=!editable||!asset;
 $('stagingReplace').disabled=!editable||!asset||!rightsRecorded;
 $('editMetadata').disabled=!canEditMetadata(selected,user?.id);
 $('editorPreview').disabled=!revision;
 const own=selected?.creator_id===user?.id,adminCreated=isAdminCreated(selected);
 $('memberReviewControls').hidden=false;$('stagingApprove').hidden=$('rejectRevision').hidden=adminCreated;$('stagingPublish').hidden=own;
 $('adminPublicationControls').hidden=false;$('editorPublishNow').hidden=!own;
 $('editorPublishNow').disabled=!authorized||!own||!['private','public'].includes(selected?.visibility)||!['draft','submitted','approved','rejected'].includes(revision?.state);
 $('editorMakePrivate').disabled=!authorized||!selected||selected.visibility!=='public';
 $('openPublicSite').hidden=selected?.visibility!=='public';
 $('reviewStateHelp').textContent=adminCreated?'Administrator creations use private save or direct publication.':revision?.state==='submitted'?(revision.submitted_by===user?.id||own?'You cannot review your own submission.':'This member submission is ready for approval or rejection.'):revision?.state==='approved'?'This approved revision can be published.':'Only submitted member revisions can be approved or rejected.';
 $('stagingSubmit').hidden=true;$('stagingSubmitAck').closest('label').hidden=true;
 $('stagingSubmit').disabled=true;$('stagingSubmitAck').disabled=true;
 const independent=authorized&&!adminCreated&&!own&&revision?.state==='submitted'&&revision.submitted_by!==user?.id&&['private','public'].includes(selected?.visibility);
 $('stagingApprove').disabled=!independent;$('rejectRevision').disabled=!independent;
 $('stagingPublish').disabled=!editable||revision?.state!=='approved';
 $('stagingRestore').disabled=!authorized||!selected||!['private','public'].includes(selected.visibility)||!$('stagingRollback').value;
}
function confirmAction(title,text,reason=false,exactName=false) {
 return new Promise(resolve=>{const d=$('confirmDialog');$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('reasonField').hidden=!reason;$('confirmReason').value='';
 $('reasonField').querySelector('label').textContent=exactName?'Tournament name':'Rejection reason';
 const finish=value=>{d.close();d.oncancel=null;resolve(value);};$('confirmCancel').onclick=()=>finish(false);$('confirmAccept').onclick=()=>{if(reason&&!$('confirmReason').value.trim()){$('confirmReason').focus();return;}finish(reason?(exactName?$('confirmReason').value:$('confirmReason').value.trim()):true);};d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();});
}
async function changeRevision(op) {
 await guard();if(!revision||!selected)throw Error('Select a revision first.');
 if(['approve','reject'].includes(op)&&(revision.state!=='submitted'||revision.submitted_by===user.id))throw Error('A different authorized reviewer must review this submitted revision.');
 if(op==='approve'&&selected.creator_id===user.id)throw Error('You cannot review your own submission.');
 if(op==='publish'&&revision.state!=='approved')throw Error('Independent approval is required before publication.');
 const note=await confirmAction(op==='reject'?'Reject this revision?':`${op[0].toUpperCase()+op.slice(1)} this revision?`,op==='publish'?'This approved revision will become publicly playable on Staging.':op==='rollback'?'The selected approved revision will become the Staging publication.':'The existing server workflow and media validation will apply.',op==='reject');
 if(!note)return;
 await guard();if(op==='reject')await dashboard.reject(selected,revision,note);else if(op==='approve')await api.reviewPublish(selected,revision.id);else await api.transition(op,selected,op==='rollback'?$('stagingRollback').value:revision.id);await refreshAdmin(true);say(`${op} completed. Server data refreshed.`,'success');
}
function newWork(){work={tournament_id:window.CreatorModelV3.id('tournament'),base_revision_id:null,title:'',description:'',category_id:categories[0]?.id||'',requested_size:8,cover_participant_id:null,participants:[]};editing=null;step=0;dirty=false;renderWizard();}
function captureWizard(){if(!work)return;if(step===0){work.title=$('workTitle').value;work.description=$('workDescription').value;work.category_id=$('workCategory').value;work.requested_size=Number($('workSize').value);}if(step===1)for(const input of all('[data-candidate-name]'))work.participants[Number(input.dataset.candidateName)].name=input.value;}
function ensureCandidates(){const size=Number(work.requested_size);if(work.participants.length>size)throw Error('Reducing candidate count would discard candidates. Keep the existing size or start a new draft.');while(work.participants.length<size){const p=window.CreatorModelV3.member('');work.participants.push({...p,image_asset_id:null});}}
function field(label,id,type='input',value=''){const box=make('div',undefined,'field'),l=make('label',label),input=make(type);input.id=id;l.htmlFor=id;input.value=value;box.append(l,input);return box;}
function renderWizard(){
 $('wizardPublishedLink').hidden=!tournaments.some(t=>t.id===work?.tournament_id&&t.visibility==='public');
 if(!work)return;
 $('wizardTitle').textContent=editing?'Edit World Cup':'Create World Cup';$('draftStatus').textContent=dirty?'Unsaved changes':work.base_revision_id?'Saved draft':'Unsaved draft';
 $('wizardSteps').replaceChildren(...STEPS.map((label,i)=>{const b=make('button',undefined,'step'+(i===step?' active':''));b.append(make('span',i+1),document.createTextNode(label));b.setAttribute('aria-current',i===step?'step':'false');b.onclick=()=>run(()=>goStep(i));return b;}));
 const panel=$('wizardPanel');panel.replaceChildren();
 if(step===0){panel.append(make('h2','Start with the essentials'),make('p','Give your World Cup a clear title and a focused category.','muted'),field('Title','workTitle','input',work.title),field('Description','workDescription','textarea',work.description));const grid=make('div',undefined,'grid2');grid.append(field('Category','workCategory','select'),field('Candidate count','workSize','select'));panel.append(grid);options('workCategory',categories.map(c=>[c.id,c.name]),work.category_id);options('workSize',[8,16,32].map(n=>[String(n),String(n)]),String(work.requested_size));if(!categories.length)panel.append(make('p','No category directory is available. Install the prepared read RPCs and ensure at least one category exists before saving.','notice'));}
 if(step===1){panel.append(make('h2','Build your candidate list'),make('p','Names and bulk entry reuse the existing creator model.','muted'));const bulk=field('Bulk input · one candidate name per line','bulkNames','textarea');bulk.querySelector('textarea').placeholder=`Enter exactly ${work.requested_size} names`;const apply=make('button','Apply names to these candidates','btn');apply.onclick=()=>{try{const {names,duplicates}=window.CreatorModelV3.parseList($('bulkNames').value,[],Number(work.requested_size),'replace');names.forEach((name,i)=>work.participants[i].name=name);dirty=true;renderWizard();if(duplicates.length)say('Duplicate names found: '+duplicates.join(', '));}catch{say(`Enter exactly ${work.requested_size} plain-text names, one per line. URLs and HTML are not allowed.`,'error');}};panel.append(bulk,apply);const list=make('div',undefined,'candidate-list');list.style.marginTop='20px';work.participants.forEach((p,i)=>{const row=make('div',undefined,'candidate-row'),input=make('input');input.value=p.name;input.maxLength=300;input.dataset.candidateName=i;input.setAttribute('aria-label',`Candidate ${i+1} name`);input.oninput=()=>{p.name=input.value;dirty=true;};row.append(make('span',String(i+1).padStart(2,'0'),'candidate-number'),input);list.append(row);});panel.append(list);}
 if(step===2){panel.append(make('h2','Make every candidate recognizable'),make('p','Click or drop a photo. Optimization and upload run automatically. Usage rights require confirmation before applying.','muted'),cards(true));}
 if(step===3){panel.append(make('h2','Try the tournament'),make('p','Preview uses the shared World Cup selection module without recording official statistics.','muted'));const b=make('button','Play private preview','btn primary');b.onclick=()=>run(async()=>{captureWizard();await saveWork({quiet:true});await refreshAdmin(false,{quiet:true});const latest=tournaments.find(t=>t.id===work.tournament_id);if(!authorized||!latest?.revision)throw Error('This tournament is no longer available.');work=workFromRevision(latest,latest.revision);startPreview(work);});panel.append(b);const summary=make('ul',undefined,'checklist');for(const text of [work.title||'Untitled World Cup',`${work.participants.length} candidates`,`${work.participants.filter(p=>p.image_asset_id).length} candidate photos`,'Your draft stays private until you choose Publish now.'])summary.append(text===work.title?dataText('li',text):make('li',text));panel.append(summary);}
 if(step===4){panel.append(make('h2','Save privately or publish now'),make('p','Save privately keeps your draft editable. Publish now validates and publishes your latest saved content. Existing public revisions stay unchanged until publication succeeds.','muted'));
  const save=make('button','Save privately','btn'),publish=make('button','Publish now','btn primary');save.id='wizardSavePrivate';publish.id='wizardPublishNow';
  save.onclick=()=>run(()=>savePrivateWork());publish.onclick=()=>run(publishWork);panel.append(save,publish);}

 if(step===0||step===1)panel.append(createGeminiSupport({
  getLanguage:()=>adminLanguage.language,
  getContext:()=>{captureWizard();return {...work,category:catName(work.category_id)};},
  onCandidates:()=>{if(step===0)void run(()=>goStep(1));else{$('bulkNames').focus();$('bulkNames').scrollIntoView({block:'center',behavior:'smooth'});}}
 }));
 panel.oninput=e=>{if(e.target.closest('.photo-editor-grid'))return;dirty=true;$('draftStatus').textContent='Unsaved changes';for(const support of all('[data-gemini-support]'))support.refreshPrompt();};
 $('wizardBack').disabled=step===0;$('wizardNext').disabled=step===4;$('wizardProgress').textContent=`Step ${step+1} of 5`;
}
async function goStep(next){captureWizard();if(next>0){if(!work.title.trim()||!work.category_id)throw Error('Enter a title and choose a category before continuing.');ensureCandidates();}if(next>1)draftPayload(work);step=Math.max(0,Math.min(4,next));renderWizard();}
async function saveWork({quiet=false,force=false}={}){
 await guard(null);if(page==='create')captureWizard();
 if(work.base_revision_id&&!dirty&&!force){if(!quiet)say('Draft saved. The current publication and existing photos are preserved.','success');return;}
 const t=tournaments.find(t=>t.id===work.tournament_id)||null;
 const result=await dashboard.save(work,t);work.base_revision_id=result.revision_id;dirty=false;
 await refreshAdmin(false,{quiet});editing=tournaments.find(t=>t.id===work.tournament_id)||null;
 // Reload payload from the actual revision so photo references cannot become stale.
 const saved=editing?.revision;if(saved)work=workFromRevision(editing,saved);
 if(quiet)return;renderWizard();setPage('create');say('Draft saved. The current publication and existing photos are preserved.','success');
}
async function savePrivateWork(){const t=tournaments.find(t=>t.id===work?.tournament_id);return saveWork({force:!!t&&t.revision?.state!=='draft'});}
async function publishWork(){
 const existing=tournaments.find(t=>t.id===work?.tournament_id);
 await saveWork({quiet:true,force:['submitted','rejected'].includes(existing?.revision?.state)});
 const t=tournaments.find(t=>t.id===work.tournament_id);if(!t?.revision)throw Error('Save the tournament draft first.');
 await api.publishOwn(t,t.revision.id);selected=t;await refreshAdmin(true,{quiet:true});
 work=workFromRevision(selected,revision);dirty=false;renderWizard();say('Published successfully. Open the public site to play.','success');
}
async function publishSelected(){
 await guard();if(selected?.creator_id!==user.id)throw Error('Only the creator can save these candidate and text changes. Photo management remains available to administrators.');
 if(['submitted','rejected'].includes(revision.state)){work=workFromRevision(selected,revision);await saveWork({quiet:true,force:true});await loadSelected(work.tournament_id);}
 await api.publishOwn(selected,revision.id);await refreshAdmin(true,{quiet:true});say('Published successfully. Open the public site to play.','success');
}
function startPreview(source){
 try{const active=source.participants.filter(p=>p.active!==false).map(p=>({...p,person_id:p.entity_id}));const size=[32,16,8,4].find(n=>n<=active.length);if(!size)throw Error('At least four active candidates are required for a playable preview.');
 game={round:window.WorldCupSelection.select(active,size,null),next:[],index:0};if(source.title)$('previewTitle').dataset.i18nSkip='';else delete $('previewTitle').dataset.i18nSkip;$('previewTitle').textContent=source.title||'World Cup preview';$('previewDialog').showModal();renderGame();}catch(error){say(error.message,'error');}
}
function renderGame(){const box=$('previewGame');box.style.setProperty('--game-photo-ratio',globalThis.PWCPhotoDisplay.gameRatio(innerWidth,innerHeight));box.replaceChildren();if(!game)return;if(game.round.length===1){box.append(make('h2',`Your champion: ${game.round[0].name}`));const f=make('div',undefined,'preview-frame');f.style.aspectRatio=String(globalThis.PWCPhotoDisplay.resultRatio(innerWidth,innerHeight));box.append(f);void showPhoto(f,game.round[0].image_asset_id,game.round[0].name).then(()=>{const image=f.querySelector('img');if(image)globalThis.PWCPhotoDisplay.apply(image,game.round[0].presentations?.vs||{});});box.append(make('p','Preview complete. No official statistics were recorded.','help'));return;}
 box.append(make('p',`Round of ${game.round.length} · Match ${game.index/2+1} of ${game.round.length/2}`,'help'));const match=make('div',undefined,'match');for(const offset of [0,1]){const p=game.round[game.index+offset],b=make('button'),f=make('div',undefined,'photo-frame');b.append(f,dataText('strong',p.name));void showPhoto(f,p.image_asset_id,p.name).then(()=>{const image=f.querySelector('img');if(image)globalThis.PWCPhotoDisplay.apply(image,p.presentations?.vs||{});});b.onclick=()=>{game.next.push(p);game.index+=2;if(game.index>=game.round.length){game.round=game.next;game.next=[];game.index=0;}renderGame();};match.append(b);}box.append(match);
}
async function signOut(){await run(async()=>{lock();const {error}=await client.auth.signOut();if(error)throw Error('Sign-out failed. Please retry.');$('loginSignOut').hidden=true;say('Signed out.');});}
try {
 const config=window.PWC_STAGING;if(config?.supabaseUrl!==STAGING_URL||!/^sb_publishable_/.test(config.publishableKey||''))throw Error('Staging configuration unavailable.');
 client=window.supabase.createClient(STAGING_URL,config.publishableKey,{auth:{storageKey:'pwc-staging-auth'}});
 managementApi=createTournamentManagement(client);
 purgeApi=createTournamentPurge(client);
 api=createMediaApi({client,gatewayOrigin:location.origin,pageOrigin:location.origin});dashboard=createDashboardApi(client,api);
 $('adminLoginForm').onsubmit=e=>{e.preventDefault();void run(async()=>{const credentials={email:$('stagingEmail').value.trim(),password:$('stagingPassword').value};lock();say('Signing in with Supabase...');const authStart=performance.now();const {error}=await client.auth.signInWithPassword(credentials);globalThis.PWCAdminPerformance??={};globalThis.PWCAdminPerformance.lastPasswordSignInMs=+(performance.now()-authStart).toFixed(2);$('stagingPassword').value='';if(error)throw Error('Sign-in failed. Check your Staging account.');await refreshAdmin();});};
 $('stagingSignOut').onclick=signOut;$('loginSignOut').onclick=signOut;$('loginRetry').onclick=()=>run(()=>refreshAdmin());
 $('stagingRefresh').onclick=()=>run(()=>refreshAdmin(true));
 for(const b of all('[data-page],[data-go]'))b.onclick=()=>run(()=>navigate(b.dataset.page||b.dataset.go));
 $('mobileMenu').onclick=()=>toggleMenu(!$('adminSidebar').classList.contains('open'));$('sidebarClose').onclick=$('menuScrim').onclick=()=>toggleMenu(false);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMenu(false);});
 for(const id of ['tournamentSearch','categoryFilter','statusFilter'])$(id).addEventListener('input',renderCatalog);
 for(const id of ['reviewSearch','reviewFilter'])$(id).addEventListener('input',renderReviews);
 $('stagingTournament').onchange=()=>run(()=>loadSelected());$('stagingSlot').onchange=renderSlot;
 $('stagingFile').onchange=()=>{if(newPhotoUrl)URL.revokeObjectURL(newPhotoUrl);newPhotoUrl=null;asset=null;rightsRecorded=false;$('stagingRightsAck').checked=false;$('stagingEvidence').value='';$('uploadStatus').textContent='';const f=$('stagingFile').files[0];$('newPhoto').hidden=!f;if(f){newPhotoUrl=URL.createObjectURL(f);const img=make('img');img.src=newPhotoUrl;img.alt='Selected new photo';$('newPhoto').replaceChildren(img);}updateControls();};
 $('stagingUpload').onclick=()=>run(async()=>{await guard();const file=$('stagingFile').files[0];if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a JPG, PNG or WebP photo up to 8 MB.');asset=null;rightsRecorded=false;$('uploadStatus').textContent='Uploading and verifying photo...';try{const result=await api.upload(selected.id,file);if(result.technical_state!=='ready'||!result.asset_id)throw Error('Upload is not finalized. Refresh before retrying.');asset=result.asset_id;$('uploadStatus').textContent='Upload complete. Record usage rights before creating a replacement.';say('Photo uploaded and technically verified.','success');}catch(error){$('uploadStatus').textContent='Upload failed. Your current photo is unchanged.';throw error;}});
 $('stagingRights').onclick=()=>run(async()=>{await guard();if(!asset||!$('stagingRightsAck').checked||!$('stagingEvidence').value.trim())throw Error('Confirm usage rights and provide evidence first.');await api.rights(asset,$('stagingEvidence').value.trim());rightsRecorded=true;say('Usage rights recorded. Ready to create a replacement draft.','success');});
 $('stagingReplace').onclick=()=>run(async()=>{await guard();if(!asset||!rightsRecorded)throw Error('Upload and record usage rights first.');const slot=$('stagingSlot').value;const previous=selected.published_revision_id;const result=await api.replace(selected,asset,slot);await refreshAdmin(true);$('stagingSlot').value=slot;renderSlot();$('stagingHistory').textContent=`Previous publication: ${previous||'none'}`;if(work?.tournament_id===selected.id){work=workFromRevision(selected,revision);dirty=false;}say(`Replacement draft created: ${result.revision_id}. Stored photo previews refreshed.`,'success');});
 $('stagingSubmit').onclick=()=>run(async()=>{await guard();if(!revision||!$('stagingSubmitAck').checked)throw Error('Confirm this draft is ready for independent review.');await api.submit(selected,revision.id);await refreshAdmin(true);say('Submitted. A different authorized reviewer must approve it.','success');});
 $('editorPublishNow').onclick=()=>run(publishSelected);
 $('editorMakePrivate').onclick=()=>run(async()=>{await guard();await api.transition('unpublish',selected,selected.published_revision_id||revision.id);await refreshAdmin(true,{quiet:true});say('Tournament is now private. Existing revisions and photos are preserved.','success');});
 $('stagingApprove').onclick=()=>run(()=>changeRevision('approve'));$('stagingPublish').onclick=()=>run(()=>changeRevision('publish'));$('rejectRevision').onclick=()=>run(()=>changeRevision('reject'));$('stagingRestore').onclick=()=>run(()=>changeRevision('rollback'));
 $('editMetadata').onclick=()=>run(async()=>{await guard();if(!canEditMetadata(selected,user.id))throw Error('Only the creator can edit this metadata.');editing=selected;work=workFromRevision(selected,revision);dirty=false;step=0;renderWizard();setPage('create');});
 $('editorPreview').onclick=()=>run(async()=>{await refreshAdmin(true,{quiet:true});if(!authorized||!tournaments.some(t=>t.id===selected?.id))throw Error('This tournament is no longer available.');startPreview(workFromRevision(selected,revision));});
 $('wizardNew').onclick=()=>run(async()=>{if(dirty&&!await confirmAction('Start a new World Cup?','Unsaved text changes will be discarded. Saved server revisions and photos remain unchanged.'))return;newWork();setPage('create');});
 $('wizardBack').onclick=()=>run(()=>goStep(step-1));$('wizardNext').onclick=()=>run(()=>goStep(step+1));
 $('previewClose').onclick=()=>{$('previewDialog').close();game=null;};
 window.addEventListener('pwc-admin-language-change',()=>{for(const support of all('[data-gemini-support]'))support.refreshPrompt();});
 window.addEventListener('resize',()=>{if(game){$('previewGame').style.setProperty('--game-photo-ratio',globalThis.PWCPhotoDisplay.gameRatio(innerWidth,innerHeight));const winner=$('previewGame').querySelector(':scope>.preview-frame');if(winner){winner.style.aspectRatio=String(globalThis.PWCPhotoDisplay.resultRatio(innerWidth,innerHeight));const image=winner.querySelector('img');if(image)globalThis.PWCPhotoDisplay.apply(image,game.round[0]?.presentations?.vs);}all('#previewGame .match img').forEach((image,i)=>globalThis.PWCPhotoDisplay.apply(image,game.round[game.index+i]?.presentations?.vs));}});
 window.addEventListener('beforeunload',e=>{if(dirty||photoWorking){e.preventDefault();e.returnValue='';}});
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){lock();say('Signed out.');}else if(event==='SIGNED_IN'){
  if(authorized&&user?.id===session?.user?.id)return;
  if(authorized)lock();
  setTimeout(()=>{if(!working)void run(()=>refreshAdmin());},0);
 }else if(event==='TOKEN_REFRESHED'){/* SDK refresh preserves the current editor; mutations recheck server authority. */}});
 await run(()=>refreshAdmin());
} catch(error){lock();say(error.message||'Staging management is unavailable.','error');}
