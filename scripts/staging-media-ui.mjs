import { createMediaApi, STAGING_URL } from './staging-media-api.mjs';
const $ = id => document.getElementById(id);
const status = $('stagingStatus');
let api, client, tournaments=[], selected, revision, asset, previousPublication, working=false;
let authorized=false, accessEpoch=0;
function lock() {
  accessEpoch++; authorized=false; selected=revision=asset=null; tournaments=[];
  $('stagingManagement').hidden=true; $('stagingLogin').hidden=false;
  for(const id of ['stagingTournament','stagingSlot','stagingRollback']) options(id,[]);
  for(const id of ['stagingRevision','stagingReadiness','stagingHistory']) $(id).textContent='';
  $('stagingFile').value=''; $('stagingEvidence').value='';
  $('stagingRightsAck').checked=$('stagingSubmitAck').checked=false;
}
async function guard() {
  const {data}=await client.auth.getSession();
  if(!data.session || !authorized || !selected) { lock(); throw Error('Sign in with an authorized Staging administrator account.'); }
  try { await api.authorize(selected.id); } catch { lock(); throw Error('Management access is unavailable. Check your administrator access and Staging availability.'); }
}
const say = message => { status.textContent=message; };
function options(id, rows) {
  $(id).replaceChildren(...rows.map(([value,label]) => { const o=document.createElement('option'); o.value=value; o.textContent=label; return o; }));
}
async function run(action) {
  if (working) return;
  working=true;
  document.querySelectorAll('#stagingAdmin button').forEach(b=>b.disabled=true);
  say('Loading…');
  try { await action(); } catch(e) { if(!authorized) lock(); say(e.message || 'Request failed. Please refresh before retrying.'); }
  finally { working=false; document.querySelectorAll('#stagingAdmin button').forEach(b=>b.disabled=false); }
}
async function loadSelected() {
  selected=tournaments.find(t=>t.id===$('stagingTournament').value);
  asset=null;
  if (!selected) { revision=null; say('No editable tournament is available.'); return; }
  try { await api.authorize(selected.id); } catch(e) { lock(); throw e; } // Server authority + runtime gate, never a browser UID allowlist.
  const rid=selected.draft_revision_id || selected.published_revision_id;
  if(!rid) { revision=null; throw Error('No revision is available. Prepare a Staging tournament draft first.'); }
  revision=await api.revision(rid);
  options('stagingSlot',[['cover','Cover'],...(revision.participants || []).map(p=>[p.id,p.name])]);
  const revisions=await api.table('tournament_revisions','id,tournament_id,state,version');
  options('stagingRollback',revisions.filter(r=>r.tournament_id===selected.id && r.state==='approved').map(r=>[r.id,`Version ${r.version} (${r.id})`]));
  if($('stagingReadiness')) {
    const active=(revision.participants || []).filter(p=>p.active);
    $('stagingReadiness').textContent=`Active participants: ${active.length}; requested: ${revision.requested_size ?? 'unknown'}; unnamed: ${active.filter(p=>!p.name?.trim()).length}. Server validation and independent review are required.`;
  }
  $('stagingRevision').textContent=`Revision: ${revision.id}; state: ${revision.state}. Published: ${selected.published_revision_id || 'none'}`;
  say(revision.state==='submitted' ? 'Waiting for a different authorized reviewer. Sign in with the reviewer account to approve.' : 'Admin access confirmed. Upload a new photo or review the current revision.');
}
async function refreshAdmin() {
  const chosen=selected?.id;
  lock();
  const epoch=accessEpoch;
  const {data}=await client.auth.getSession();
  $('stagingSignOut').hidden=!data.session;
  if(!data.session) { say('Sign in with an authorized Staging administrator account.'); return; }
  const candidates=await api.table('tournaments','id,draft_revision_id,published_revision_id,edit_version,visibility');
  const allowed=[];
  for(const t of candidates.filter(t=>['private','public'].includes(t.visibility))) {
    try { await api.authorize(t.id); allowed.push(t); } catch { /* Fail closed: no candidate details rendered. */ }
  }
  if(!allowed.length) throw Error('No authorized editable tournament is available. Administrator access and enabled Staging management are required.');
  tournaments=allowed;
  options('stagingTournament',tournaments.map(t=>[t.id,t.id]));
  if(chosen && tournaments.some(t=>t.id===chosen)) $('stagingTournament').value=chosen;
  await loadSelected();
  if(epoch!==accessEpoch) return;
  authorized=true; $('stagingManagement').hidden=false; $('stagingLogin').hidden=true;
}
async function transition(name,rid) {
  if (!selected || !rid) throw Error('Select an available revision first.');
  await api.authorize(selected.id);
  await api.transition(name,selected,rid);
  await refreshAdmin(); say(`${name === 'rollback' ? 'Previous publication restored' : name === 'publish' ? 'Revision published' : 'Revision approved'}.`);
}
try {
  const config=window.PWC_STAGING;
  if (config?.supabaseUrl!==STAGING_URL || !config.publishableKey || !/^(sb_publishable_)/.test(config.publishableKey)) throw Error('Staging is not configured. Ask the site operator to supply the Staging publishable key.');
  client=window.supabase.createClient(STAGING_URL,config.publishableKey,{auth:{storageKey:'pwc-staging-auth'}});
  api=createMediaApi({client,gatewayOrigin:location.origin,pageOrigin:location.origin});
  $('stagingSignIn').onclick=()=>run(async()=>{
    lock();
    const {error}=await client.auth.signInWithPassword({email:$('stagingEmail').value.trim(),password:$('stagingPassword').value});
    $('stagingPassword').value='';
    if(error) throw Error('Sign-in failed. Check your Staging account.');
    await refreshAdmin();
  });
  $('stagingSignOut').onclick=()=>run(async()=>{lock(); $('stagingSignOut').hidden=true; const {error}=await client.auth.signOut(); if(error) throw Error('Sign-out failed. Close this page and retry.'); say('Signed out.');});
  $('stagingRefresh').onclick=()=>run(refreshAdmin);
  $('stagingTournament').onchange=()=>run(loadSelected);
  $('stagingUpload').onclick=()=>run(async()=>{
    if(!selected) throw Error('Select a tournament and confirm admin access first.');
    const file=$('stagingFile').files[0];
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024) throw Error('Choose a JPG, PNG or WebP photo up to 8 MB.');
    asset=null; $('stagingRightsAck').checked=false; $('stagingEvidence').value='';
    const result=await api.upload(selected.id,file); asset=result.asset_id;
    if(result.technical_state!=='ready' || !asset) throw Error('Upload is not finalized. Refresh before retrying.');
    say('Photo uploaded and technically verified. Confirm its usage rights before creating a replacement.');
  });
  $('stagingRights').onclick=()=>run(async()=>{
    if(!asset || !$('stagingRightsAck').checked || !$('stagingEvidence').value.trim()) throw Error('Upload a photo, confirm usage rights and provide evidence first.');
    await api.authorize(selected.id); await api.rights(asset,$('stagingEvidence').value.trim()); say('Usage rights recorded. Ready to create a replacement draft.');
  });
  $('stagingReplace').onclick=()=>run(async()=>{
    if(!selected || !asset) throw Error('Upload and verify a photo first.');
    previousPublication={revision:selected.published_revision_id};
    const result=await api.replace(selected,asset,$('stagingSlot').value);
    await refreshAdmin(); $('stagingHistory').textContent=JSON.stringify(previousPublication); say(`Replacement draft created: ${result.revision_id}. Existing publication is preserved.`);
  });
  $('stagingSubmit').onclick=()=>run(async()=>{if(!revision || !$('stagingSubmitAck').checked) throw Error('Confirm the draft is ready for review.'); await api.submit(selected,revision.id); await refreshAdmin(); say('Submitted. Waiting for a different authorized reviewer; public photos are unchanged.');});
  $('stagingApprove').onclick=()=>run(async()=>{const {data}=await client.auth.getUser(); if(!revision || revision.state!=='submitted' || !data.user || revision.submitted_by===data.user.id) throw Error('Waiting for a different authorized reviewer. Self-approval is unavailable.'); await transition('approve',revision.id);});
  $('stagingPublish').onclick=()=>run(async()=>{if(revision?.state!=='approved') throw Error('Waiting for approval before publication.'); await transition('publish',revision.id);});
  $('stagingRestore').onclick=()=>run(()=>transition('rollback',$('stagingRollback').value));
  // Every management handler rechecks the session and server authority.
  for(const id of ['stagingUpload','stagingRights','stagingReplace','stagingSubmit','stagingApprove','stagingPublish','stagingRestore']) {
    const handler=$(id).onclick;
    $(id).onclick=async()=>{ if(working) return; try { await guard(); } catch(e) { say(e.message); return; } return handler(); };
  }
  client.auth.onAuthStateChange?.((event)=>{ if(event==='SIGNED_OUT' || event==='SIGNED_IN' || event==='TOKEN_REFRESHED') { lock(); setTimeout(()=>run(refreshAdmin),0); } });
  await run(refreshAdmin);
} catch { lock(); say('Staging management is unavailable. Please contact the site operator.'); }
