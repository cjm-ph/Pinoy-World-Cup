import {createGeminiSupport} from './creator-gemini-support.mjs';
import {installAdminLanguage} from './staging-admin-i18n.mjs';
import {createMediaApi, STAGING_URL} from './staging-media-api.mjs';
import {STEPS, statusOf, filterTournaments, workFromRevision, canEditMetadata, createDashboardApi, draftPayload} from './staging-admin-model.mjs';
const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const make = (tag, text, className) => { const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node; };
const adminLanguage=installAdminLanguage();
const dataText=(tag,text,className)=>{const node=make(tag,text,className);node.dataset.i18nSkip='';return node;};
const dateText=(tag,date,dateOnly=false)=>{const node=make(tag);node.dataset.i18nDate=date;if(dateOnly)node.dataset.i18nDateOnly='true';return node;};
let client, api, dashboard, user, tournaments=[], categories=[], context=null, selected=null, revision=null;
let authorized=false, working=false, epoch=0, page='dashboard', asset=null, rightsRecorded=false;
let work=null, editing=null, step=0, dirty=false, newPhotoUrl=null, game=null;
const photoUrls=new Map(), photosPending=new Map();
function say(message, kind='') { $('stagingStatus').textContent=message; $('stagingStatus').className='notice '+kind; $('loginStatus').textContent=message; }
function clearPhotos() { for(const url of photoUrls.values()) URL.revokeObjectURL(url); photoUrls.clear(); photosPending.clear(); if(newPhotoUrl)URL.revokeObjectURL(newPhotoUrl);newPhotoUrl=null; }
function lock() {
 epoch++; authorized=false;selected=revision=asset=work=editing=game=null;user=null;dirty=false;tournaments=[];categories=[];context=null;clearPhotos();
 $('stagingManagement').hidden=true;$('stagingLogin').hidden=false;
 $('stagingPassword').value=''; delete $('adminIdentity').dataset.i18nSkip;$('adminIdentity').textContent='Administrator';
 for(const id of ['tournamentRows','reviewRows','recentTournaments','currentPhotos','stagingHistory','wizardPanel','previewGame','recentActivity']) $(id).replaceChildren();
 for(const id of ['stagingTournament','stagingSlot','stagingRollback']) $(id).replaceChildren();
 $('stagingFile').value='';$('stagingEvidence').value='';$('stagingRightsAck').checked=$('stagingSubmitAck').checked=false;
 for(const dialog of all('dialog[open]'))dialog.close();
}
async function run(action) {
 if(working)return;
 working=true; const buttons=all('#stagingAdmin button');const previous=buttons.map(b=>b.disabled);
 buttons.forEach(b=>b.disabled=true);$('adminMain').setAttribute('aria-busy','true');
 try { await action(); } catch(error) { say(error.message || 'Request failed. Refresh before retrying.','error'); }
 finally { working=false; buttons.forEach((b,i)=>b.disabled=previous[i]);$('adminMain').removeAttribute('aria-busy'); updateControls(); }
}
function options(id, rows, value) { const select=$(id);select.replaceChildren(...rows.map(([key,label])=>{const o=make('option',label);o.value=key;if((key&&['categoryFilter','workCategory','stagingTournament','workCover'].includes(id))||(id==='stagingSlot'&&key!=='cover'))o.dataset.i18nSkip='';return o;}));if(value!==undefined)select.value=value; }
function setPage(next) {
 page=next;all('[data-view]').forEach(n=>n.hidden=n.dataset.view!==next);
 all('[data-page]').forEach(n=>{n.classList.toggle('active',n.dataset.page===next); if(n.dataset.page===next)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
 $('pageCrumb').textContent=({dashboard:'Dashboard',tournaments:'Tournaments',create:'Create World Cup',reviews:'Review Queue',comments:'Comments',members:'Members',staff:'Staff Permissions',settings:'Settings',editor:'Tournament details'})[next];
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
function renderCatalog() {
 const rows=filterTournaments(tournaments,{search:$('tournamentSearch').value,category:$('categoryFilter').value,status:$('statusFilter').value});
 $('tournamentRows').replaceChildren(...rows.map(t=>{
  const tr=make('tr'), title=make('td');title.append(dataText('span',t.revision?.title||t.id,'table-title'),dataText('span',t.id,'table-id'));tr.append(title,(t.revision?.category_ids?.length?dataText('td',t.revision.category_ids.map(catName).join(', ')):make('td','Not available')));
  const state=make('td');state.append(statusBadge(t));tr.append(state,make('td',t.revision?(t.revision.participants||[]).filter(p=>p.active).length:'Unavailable'),make('td',t.published_revision_id?'Published version exists':'Not published'));
  const action=make('td'),button=make('button','Manage','btn small');button.onclick=()=>run(()=>openTournament(t.id));action.append(button);tr.append(action);return tr;
 }));
 if(!rows.length){const tr=make('tr'),td=make('td',tournaments.length?'No World Cups match these filters.':'No World Cups yet. Create your first draft to get started.','empty');td.colSpan=6;tr.append(td);$('tournamentRows').append(tr);}
 $('tournamentCount').textContent=`${rows.length} of ${tournaments.length} World Cups shown. `+(context?'Includes archived and blocked content.':'Current catalog includes private and public content only.');
 $('totalCups').textContent=String(tournaments.length);$('cupScope').textContent=context?'All catalog World Cups':'Private and public World Cups only';
 const incomplete=tournaments.some(t=>(t.draft_revision_id||t.published_revision_id)&&!t.revision);
 $('pendingCount').textContent=incomplete?'Not available yet':String(tournaments.filter(t=>t.revision?.state==='submitted').length);
 $('pendingCount').classList.toggle('unavailable',incomplete);
 const recent=tournaments.slice().sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).slice(0,5);
 $('recentTournaments').replaceChildren(...recent.map(t=>{const row=make('div',undefined,'activity-item'),title=make('div');title.append(dataText('strong',t.revision?.title||t.id),make('div',`${t.revision?.participants?.length||0} candidates`,'help'));const b=make('button','Open','btn ghost small');b.onclick=()=>run(()=>openTournament(t.id));row.append(title,b);return row;}));
 if(!recent.length)$('recentTournaments').append(make('div','Your first World Cup starts in the creator studio.','empty'));
 renderReviews();
}
function renderReviews() {
 const rows=filterTournaments(tournaments,{search:$('reviewSearch').value,status:$('reviewFilter').value}).filter(t=>['submitted','approved','rejected'].includes(t.revision?.state));
 $('reviewRows').replaceChildren(...rows.map(t=>{const tr=make('tr');const state=make('td');state.append(statusBadge(t));const td=make('td'),b=make('button','Review details','btn small');b.onclick=()=>run(()=>openTournament(t.id));td.append(b);tr.append(dataText('td',t.revision.title),state,(t.revision.submitted_at?dateText('td',t.revision.submitted_at,true):make('td','Not available')),td);return tr;}));
 if(!rows.length){const tr=make('tr'),td=make('td','No submissions match this view.','empty');td.colSpan=4;tr.append(td);$('reviewRows').append(tr);}
}
async function refreshAdmin(keepSelection=false) {
 const chosen=keepSelection?selected?.id:null;const at=epoch;
 const {data,error}=await client.auth.getSession();if(error||!data.session){lock();say('Sign in with an authorized Staging administrator account.');return;}
 $('loginSignOut').hidden=false;$('loginRetry').hidden=false;
 // Authorization works even with an empty tournament catalog.
 let catalog;
 try { catalog=await api.adminCatalog(); } catch(error) { lock(); throw error; }
 const identity=await client.auth.getUser();if(identity.error||!identity.data.user)throw Error('Administrator session could not be verified.');
 let details;try {details=await dashboard.context();}catch(error){lock();throw error;}if(at!==epoch)return;
 user=identity.data.user;context=details;
 tournaments=details?details.tournaments:catalog;
 categories=details?details.categories:[];
 const results=[];
 for(const t of tournaments){try{const rid=t.draft_revision_id||t.published_revision_id;results.push({...t,revision:rid?completeRevision(t,await api.revision(rid)):null});}catch{results.push({...t,revision:null});}}
 if(at!==epoch)return;
 tournaments=results;authorized=true;
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
 else if(!keepSelection){setPage('dashboard');say('Administrator access confirmed. Welcome to your workspace.','success');}
}
async function loadSelected(id=$('stagingTournament').value) {
 const t=tournaments.find(t=>t.id===id);if(!t)throw Error('This tournament is no longer available.');
 const at=epoch;
 const editable=['private','public'].includes(t.visibility);
 if(editable)await api.authorize(t.id);else await guard(null);
 const r=completeRevision(t,await api.revision(t.draft_revision_id||t.published_revision_id));if(at!==epoch)return;
 selected=t;revision=r;t.revision=r;asset=null;rightsRecorded=false;
 $('stagingFile').value='';$('stagingEvidence').value='';$('stagingRightsAck').checked=$('stagingSubmitAck').checked=false;$('uploadStatus').textContent='';$('newPhoto').hidden=true;
 if(newPhotoUrl)URL.revokeObjectURL(newPhotoUrl);newPhotoUrl=null;
 $('stagingTournament').value=t.id;$('editorTitle').dataset.i18nSkip='';$('editorTitle').textContent=r.title;$('editorIdentity').dataset.i18nSkip='';$('editorIdentity').textContent=t.id;
 $('editorBadge').replaceWith(Object.assign(statusBadge(t),{id:'editorBadge'}));
 $('stagingRevision').textContent=`Version ${r.version} | ${r.state} | Revision: ${r.id}`;
 const count=r.participants.filter(p=>p.active).length;
 $('stagingReadiness').textContent=`${count} active candidates | Requested: ${r.requested_size||t.requested_size||'not returned by current RPC'} | Publication: ${t.published_revision_id?'existing published version':'not published'}`;
 const owner=canEditMetadata(t,user?.id);
 $('metadataHelp').textContent=owner?'You own this tournament. Text and candidate edits create a new draft.':'Text saves require creator ownership and a cover the existing save RPC can preserve. Separate cover photos can be replaced here; their metadata editor is unavailable.';
 options('stagingSlot',[['cover','Cover'],...r.participants.map(p=>[p.id,p.name])]);
 options('stagingRollback',(t.approved_revisions||[]).map(r=>[r.id,`Version ${r.version} (${r.id})`]));
 renderPhotos();updateControls();
}
async function openTournament(id) { await loadSelected(id);setPage('editor');say('World Cup loaded. Inspect photos, edit supported fields or review the revision.'); }
function renderPhotos() {
 $('currentPhotos').replaceChildren();
 const slots=[{id:'cover',name:'Cover',image_asset_id:revision.cover_asset_id},...revision.participants];
 for(const p of slots){const card=make('button',undefined,'photo-card'),frame=make('div',undefined,'photo-frame'),info=make('div',undefined,'photo-card-info');card.type='button';info.append(p.id==='cover'?make('strong','Cover'):dataText('strong',p.name),make('small',p.image_asset_id?'Stored photo':'No photo uploaded'));card.append(frame,info);card.onclick=()=>{$('stagingSlot').value=p.id;renderSlot();};card.dataset.slot=p.id;$('currentPhotos').append(card);void showPhoto(frame,p.image_asset_id,p.name);}
 renderSlot();
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
 $('stagingSubmit').disabled=!editable||!['draft','rejected'].includes(revision?.state);
 const independent=authorized&&revision?.state==='submitted'&&revision.submitted_by!==user?.id&&['private','public'].includes(selected?.visibility);
 $('stagingApprove').disabled=!independent;$('rejectRevision').disabled=!independent;
 $('stagingPublish').disabled=!editable||revision?.state!=='approved';
 $('stagingRestore').disabled=!authorized||!selected||!['private','public'].includes(selected.visibility)||!$('stagingRollback').value;
}
function confirmAction(title,text,reason=false) {
 return new Promise(resolve=>{const d=$('confirmDialog');$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('reasonField').hidden=!reason;$('confirmReason').value='';
 const finish=value=>{d.close();d.oncancel=null;resolve(value);};$('confirmCancel').onclick=()=>finish(false);$('confirmAccept').onclick=()=>{if(reason&&!$('confirmReason').value.trim()){$('confirmReason').focus();return;}finish(reason?$('confirmReason').value.trim():true);};d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();});
}
async function changeRevision(op) {
 await guard();if(!revision||!selected)throw Error('Select a revision first.');
 if(['approve','reject'].includes(op)&&(revision.state!=='submitted'||revision.submitted_by===user.id))throw Error('A different authorized reviewer must review this submitted revision.');
 if(op==='publish'&&revision.state!=='approved')throw Error('Independent approval is required before publication.');
 const note=await confirmAction(op==='reject'?'Reject this revision?':`${op[0].toUpperCase()+op.slice(1)} this revision?`,op==='publish'?'This approved revision will become publicly playable on Staging.':op==='rollback'?'The selected approved revision will become the Staging publication.':'The existing server workflow and media validation will apply.',op==='reject');
 if(!note)return;
 await guard();if(op==='reject')await dashboard.reject(selected,revision,note);else await api.transition(op,selected,op==='rollback'?$('stagingRollback').value:revision.id);await refreshAdmin(true);say(`${op} completed. Server data refreshed.`,'success');
}
function newWork(){work={tournament_id:window.CreatorModelV3.id('tournament'),base_revision_id:null,title:'',description:'',category_id:categories[0]?.id||'',requested_size:8,cover_participant_id:null,participants:[]};editing=null;step=0;dirty=false;renderWizard();}
function captureWizard(){if(!work)return;if(step===0){work.title=$('workTitle').value;work.description=$('workDescription').value;work.category_id=$('workCategory').value;work.requested_size=Number($('workSize').value);}if(step===1)for(const input of all('[data-candidate-name]'))work.participants[Number(input.dataset.candidateName)].name=input.value;}
function ensureCandidates(){const size=Number(work.requested_size);if(work.participants.length>size)throw Error('Reducing candidate count would discard candidates. Keep the existing size or start a new draft.');while(work.participants.length<size){const p=window.CreatorModelV3.member('');work.participants.push({...p,image_asset_id:null});}}
function field(label,id,type='input',value=''){const box=make('div',undefined,'field'),l=make('label',label),input=make(type);input.id=id;l.htmlFor=id;input.value=value;box.append(l,input);return box;}
function renderWizard(){
 if(!work)return;
 $('wizardTitle').textContent=editing?'Edit World Cup':'Create World Cup';$('draftStatus').textContent=dirty?'Unsaved changes':work.base_revision_id?'Saved draft':'Unsaved draft';
 $('wizardSteps').replaceChildren(...STEPS.map((label,i)=>{const b=make('button',undefined,'step'+(i===step?' active':''));b.append(make('span',i+1),document.createTextNode(label));b.setAttribute('aria-current',i===step?'step':'false');b.onclick=()=>run(()=>goStep(i));return b;}));
 const panel=$('wizardPanel');panel.replaceChildren();
 if(step===0){panel.append(make('h2','Start with the essentials'),make('p','Give your World Cup a clear title and a focused category.','muted'),field('Title','workTitle','input',work.title),field('Description','workDescription','textarea',work.description));const grid=make('div',undefined,'grid2');grid.append(field('Category','workCategory','select'),field('Candidate count','workSize','select'));panel.append(grid);options('workCategory',categories.map(c=>[c.id,c.name]),work.category_id);options('workSize',[8,16,32].map(n=>[String(n),String(n)]),String(work.requested_size));if(!categories.length)panel.append(make('p','No category directory is available. Install the prepared read RPCs and ensure at least one category exists before saving.','notice'));}
 if(step===1){panel.append(make('h2','Build your candidate list'),make('p','Names and bulk entry reuse the existing creator model.','muted'));const bulk=field('Bulk input · one candidate name per line','bulkNames','textarea');bulk.querySelector('textarea').placeholder=`Enter exactly ${work.requested_size} names`;const apply=make('button','Apply names to these candidates','btn');apply.onclick=()=>{try{const {names,duplicates}=window.CreatorModelV3.parseList($('bulkNames').value,[],Number(work.requested_size),'replace');names.forEach((name,i)=>work.participants[i].name=name);dirty=true;renderWizard();if(duplicates.length)say('Duplicate names found: '+duplicates.join(', '));}catch{say(`Enter exactly ${work.requested_size} plain-text names, one per line. URLs and HTML are not allowed.`,'error');}};panel.append(bulk,apply);const list=make('div',undefined,'candidate-list');list.style.marginTop='20px';work.participants.forEach((p,i)=>{const row=make('div',undefined,'candidate-row'),input=make('input');input.value=p.name;input.maxLength=300;input.dataset.candidateName=i;input.setAttribute('aria-label',`Candidate ${i+1} name`);input.oninput=()=>{p.name=input.value;dirty=true;};row.append(make('span',String(i+1).padStart(2,'0'),'candidate-number'),input);list.append(row);});panel.append(list);}
 if(step===2){
  panel.append(make('h2','Make every candidate recognizable'),make('p','Save candidate names once before uploading. Uploaded files use the existing verified media gateway and rights workflow.','muted'));
  const save=make('button','Save draft & open photo editor','btn primary');save.onclick=()=>run(async()=>{captureWizard();await saveWork();await openTournament(work.tournament_id);say('Draft saved. Select a candidate below to upload and record usage rights. Return to Create World Cup to continue.','success');});panel.append(save);
  const cover=field('Cover candidate · choose a candidate photo for the cover','workCover','select');panel.append(cover);
  options('workCover',[['','No candidate cover'],...work.participants.map(p=>[p.id,p.name||'Unnamed candidate'])],work.cover_participant_id||'');
  $('workCover').onchange=()=>{work.cover_participant_id=$('workCover').value||null;work.cover_asset_id=work.participants.find(p=>p.id===work.cover_participant_id)?.image_asset_id||null;dirty=true;};
  const grid=make('div',undefined,'photo-grid');grid.style.marginTop='20px';
  work.participants.forEach(p=>{const card=make('div',undefined,'photo-card'),frame=make('div',undefined,'photo-frame'),info=make('div',undefined,'photo-card-info');info.append((p.name?dataText('strong',p.name):make('strong','Unnamed candidate')));card.append(frame,info);grid.append(card);void showPhoto(frame,p.image_asset_id,p.name);
   const settings=p.presentations?.vs||{},coords=(settings.position||'50% 50%').split(' ').map(parseFloat);
   const controls=make('div',undefined,'row');
   for(const [axis,index] of [['Horizontal',0],['Vertical',1]]){const l=make('label',axis+' %'),input=make('input');input.type='number';input.min='0';input.max='100';input.value=String(coords[index]??50);input.setAttribute('aria-label',`${p.name} ${axis.toLowerCase()} position`);input.oninput=()=>{coords[index]=Math.max(0,Math.min(100,Number(input.value)||0));p.presentations||={};for(const context of ['vs','result'])p.presentations[context]={...(p.presentations[context]||{}),position:`${coords[0]}% ${coords[1]}%`};const image=frame.querySelector('img');if(image){image.style.objectFit='cover';image.style.objectPosition=`${coords[0]}% ${coords[1]}%`;}dirty=true;};l.append(input);controls.append(l);}
   info.append(controls);
  });panel.append(grid,make('p','Position edits apply to VS and result views when you save the draft.','help'));
 }
 if(step===3){panel.append(make('h2','Try the tournament'),make('p','Preview uses the shared World Cup selection module without recording official statistics.','muted'));const b=make('button','Play private preview','btn primary');b.onclick=()=>{captureWizard();startPreview(work);};panel.append(b);const summary=make('ul',undefined,'checklist');for(const text of [work.title||'Untitled World Cup',`${work.participants.length} candidates`,`${work.participants.filter(p=>p.image_asset_id).length} candidate photos`,'Changes remain private until independently approved and published.'])summary.append(text===work.title?dataText('li',text):make('li',text));panel.append(summary);}
 if(step===4){panel.append(make('h2','Save your draft. Prepare for review.'),make('p','Saving creates a new draft revision. It never publishes or removes existing photos.','muted'));const save=make('button','Save draft','btn primary');save.onclick=()=>run(saveWork);panel.append(save);const checks=make('ul',undefined,'checklist');checks.append(make('li',`${work.participants.filter(p=>p.active!==false).length} active candidates / ${work.requested_size} requested`),make('li','Review names, candidate photos and usage-rights evidence.'),make('li','A different administrator must approve a submitted revision.'));panel.append(checks);const b=make('button','Open saved draft for review preparation','btn');b.disabled=!work.base_revision_id;b.onclick=()=>run(async()=>{if(dirty)await saveWork();await openTournament(work.tournament_id);});panel.append(b);}
 if(step===0||step===1)panel.append(createGeminiSupport({
  getLanguage:()=>adminLanguage.language,
  getContext:()=>{captureWizard();return {...work,category:catName(work.category_id)};},
  onCandidates:()=>{if(step===0)void run(()=>goStep(1));else{$('bulkNames').focus();$('bulkNames').scrollIntoView({block:'center',behavior:'smooth'});}}
 }));
 panel.oninput=()=>{dirty=true;$('draftStatus').textContent='Unsaved changes';for(const support of all('[data-gemini-support]'))support.refreshPrompt();};
 $('wizardBack').disabled=step===0;$('wizardNext').disabled=step===4;$('wizardProgress').textContent=`Step ${step+1} of 5`;
}
async function goStep(next){captureWizard();if(next>0){if(!work.title.trim()||!work.category_id)throw Error('Enter a title and choose a category before continuing.');ensureCandidates();}if(next>1)draftPayload(work);step=Math.max(0,Math.min(4,next));renderWizard();}
async function saveWork(){
 await guard(null);captureWizard();
 const t=tournaments.find(t=>t.id===work.tournament_id)||null;
 const result=await dashboard.save(work,t);work.base_revision_id=result.revision_id;dirty=false;
 await refreshAdmin(false);editing=tournaments.find(t=>t.id===work.tournament_id)||null;
 // Reload payload from the actual revision so photo references cannot become stale.
 const saved=editing?.revision;if(saved)work=workFromRevision(editing,saved);
 renderWizard();setPage('create');say('Draft saved. The current publication and existing photos are preserved.','success');
}
function startPreview(source){
 try{const active=source.participants.filter(p=>p.active!==false).map(p=>({...p,person_id:p.entity_id}));const size=[32,16,8,4].find(n=>n<=active.length);if(!size)throw Error('At least four active candidates are required for a playable preview.');
 game={round:window.WorldCupSelection.select(active,size,null),next:[],index:0};if(source.title)$('previewTitle').dataset.i18nSkip='';else delete $('previewTitle').dataset.i18nSkip;$('previewTitle').textContent=source.title||'World Cup preview';$('previewDialog').showModal();renderGame();}catch(error){say(error.message,'error');}
}
function renderGame(){const box=$('previewGame');box.replaceChildren();if(!game)return;if(game.round.length===1){box.append(make('h2',`Your champion: ${game.round[0].name}`));const f=make('div',undefined,'preview-frame');box.append(f);void showPhoto(f,game.round[0].image_asset_id,game.round[0].name);box.append(make('p','Preview complete. No official statistics were recorded.','help'));return;}
 box.append(make('p',`Round of ${game.round.length} · Match ${game.index/2+1} of ${game.round.length/2}`,'help'));const match=make('div',undefined,'match');for(const offset of [0,1]){const p=game.round[game.index+offset],b=make('button'),f=make('div',undefined,'photo-frame');b.append(f,dataText('strong',p.name));void showPhoto(f,p.image_asset_id,p.name);b.onclick=()=>{game.next.push(p);game.index+=2;if(game.index>=game.round.length){game.round=game.next;game.next=[];game.index=0;}renderGame();};match.append(b);}box.append(match);
}
async function signOut(){await run(async()=>{lock();const {error}=await client.auth.signOut();if(error)throw Error('Sign-out failed. Please retry.');$('loginSignOut').hidden=true;say('Signed out.');});}
try {
 const config=window.PWC_STAGING;if(config?.supabaseUrl!==STAGING_URL||!/^sb_publishable_/.test(config.publishableKey||''))throw Error('Staging configuration unavailable.');
 client=window.supabase.createClient(STAGING_URL,config.publishableKey,{auth:{storageKey:'pwc-staging-auth'}});
 api=createMediaApi({client,gatewayOrigin:location.origin,pageOrigin:location.origin});dashboard=createDashboardApi(client,api);
 $('adminLoginForm').onsubmit=e=>{e.preventDefault();void run(async()=>{const credentials={email:$('stagingEmail').value.trim(),password:$('stagingPassword').value};lock();const {error}=await client.auth.signInWithPassword(credentials);$('stagingPassword').value='';if(error)throw Error('Sign-in failed. Check your Staging account.');await refreshAdmin();});};
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
 $('stagingApprove').onclick=()=>run(()=>changeRevision('approve'));$('stagingPublish').onclick=()=>run(()=>changeRevision('publish'));$('rejectRevision').onclick=()=>run(()=>changeRevision('reject'));$('stagingRestore').onclick=()=>run(()=>changeRevision('rollback'));
 $('editMetadata').onclick=()=>run(async()=>{await guard();if(!canEditMetadata(selected,user.id))throw Error('Only the creator can edit this metadata.');editing=selected;work=workFromRevision(selected,revision);dirty=false;step=0;renderWizard();setPage('create');});
 $('editorPreview').onclick=()=>startPreview({title:revision.title,participants:revision.participants});
 $('wizardNew').onclick=()=>run(async()=>{if(dirty&&!await confirmAction('Start a new World Cup?','Unsaved text changes will be discarded. Saved server revisions and photos remain unchanged.'))return;newWork();setPage('create');});
 $('wizardBack').onclick=()=>run(()=>goStep(step-1));$('wizardNext').onclick=()=>run(()=>goStep(step+1));
 $('previewClose').onclick=()=>{$('previewDialog').close();game=null;};
 window.addEventListener('pwc-admin-language-change',()=>{for(const support of all('[data-gemini-support]'))support.refreshPrompt();});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){lock();say('Signed out.');}else if(event==='SIGNED_IN'){
  if(authorized&&user?.id===session?.user?.id)return;
  if(authorized)lock();
  setTimeout(()=>{if(!working)void run(()=>refreshAdmin());},0);
 }else if(event==='TOKEN_REFRESHED'){/* SDK refresh preserves the current editor; mutations recheck server authority. */}});
 await run(()=>refreshAdmin());
} catch(error){lock();say(error.message||'Staging management is unavailable.','error');}
