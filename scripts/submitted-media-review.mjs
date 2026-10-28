import {translate} from './staging-admin-i18n.mjs';
export function mediaBlockers(data){
 const out=[];for(const a of data.assets){const reasons=[];if(!a.exists)reasons.push('Missing asset');else{if(a.upload_state!=='ready'||a.technical_state!=='ready')reasons.push('Technical verification required');if(!a.usage_allowed)reasons.push('Usage rights review required');}if(reasons.length)out.push({asset_id:a.asset_id,reasons});}return out;
}
export function createSubmittedMediaReview({host,api,selection,guard,loadPhoto,onStatus=()=>{},getLanguage=()=> 'en'}){
 let sequence=0,busy=false,last=null;
 const t=s=>translate(s,getLanguage());
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=t(text);return e;};
 const current=(s,n)=>n===sequence&&selection()?.r.id===s.r.id&&selection()?.t.id===s.t.id;
 const name=(s,id)=>[...(s.r.cover_asset_id===id?[t('Cover image')]:[]),...s.r.participants.filter(p=>p.active!==false&&p.image_asset_id===id).map(p=>p.name)].join(' / ')||t('Additional required image');
 function clear(){sequence++;last=null;host.hidden=true;host.replaceChildren();}
 function validate(data,s){if(data?.contract_version!==1||data.revision_id!==s.r.id||!Array.isArray(data.assets)||typeof data.media_ready!=='boolean'||typeof data.giphy_ready!=='boolean'||!Number.isSafeInteger(data.unresolved_count)||data.assets.some(a=>!a||typeof a.asset_id!=='string'||typeof a.exists!=='boolean'||typeof a.usage_allowed!=='boolean'))throw Error(t('Media review status unavailable. Nothing was changed.'));return data;}
 function render(s,data,n){
  host.replaceChildren(node('h2','Submitted media review'));host.hidden=false;
  const status=node('p',data.media_ready&&data.giphy_ready?'Required media checks passed.':'Required media checks are incomplete.');status.setAttribute('role','status');host.append(status);
  if(data.unresolved_count)host.append(node('p','Unresolved candidate URLs block publication.'));
  if(!data.giphy_ready)host.append(node('p','GIPHY is disabled or its revision contract is unavailable.'));
  if(!data.assets.length)host.append(node('p','No stored images require review.'));
  for(const a of data.assets){
   const row=node('section');row.className='card';row.dataset.reviewAsset=a.asset_id;
   const label=node('h3');label.textContent=name(s,a.asset_id);label.dataset.i18nSkip='';row.append(label);
   const image=node('img');image.alt=label.textContent;image.width=120;image.style.cssText='max-width:100%;height:100px;object-fit:contain';row.append(image);
   void loadPhoto(a.asset_id).then(url=>{if(current(s,n)&&image.isConnected&&url)image.src=url;else if(image.isConnected)image.remove();}).catch(()=>image.remove());
   const technical=node('p',a.exists&&a.upload_state==='ready'&&a.technical_state==='ready'?'Technical verification complete.':'Technical verification required');row.append(technical);
   row.append(node('p',a.rights_status==='verified'?'Usage rights verified.':a.usage_allowed?'Existing usage policy allows this image.':a.rights_status==='rejected'?'Usage rights rejected.':'Usage rights review required'));
   if(a.rights_status==='verified'&&a.has_rights_evidence)row.append(node('p','Existing rights evidence is recorded.'));
   // Explicit human action only. Verified assets are not re-reviewed/reset automatically.
   if(a.exists&&a.rights_status!=='verified'){
    const ack=node('input');ack.type='checkbox';ack.dataset.rightsAck='';const ackLabel=node('label','I checked the usage rights and supporting evidence.');ackLabel.prepend(ack);
    const evidence=node('textarea');evidence.maxLength=4000;evidence.setAttribute('aria-label',t('Rights evidence'));evidence.placeholder=t('Source, license or permission details');evidence.dataset.rightsEvidence='';
    const button=node('button','Record usage rights');button.type='button';button.dataset.recordRights='';const message=node('p');message.setAttribute('role','status');
    button.onclick=async()=>{if(busy)return;if(!ack.checked||!evidence.value.trim()){message.textContent=t('Confirm usage rights and provide evidence first.');return;}busy=true;button.disabled=true;try{await guard();if(!current(s,n))throw Error(t('The selected revision changed. Reload it.'));const result=await api().rights(a.asset_id,evidence.value.trim());if(result?.asset_id!==a.asset_id||result?.status!=='verified')throw Error(t('Rights review was not confirmed. Reload the status.'));const updated=validate(await api().reviewMediaStatus(s.t,s.r.id),s);if(!current(s,n))return;if(!updated.assets.some(x=>x.asset_id===a.asset_id&&x.rights_status==='verified'&&x.usage_allowed))throw Error(t('Rights review was not confirmed. Reload the status.'));last=updated;render(s,updated,n);onStatus('Usage rights recorded. Required media status refreshed.');}catch{if(current(s,n))message.textContent=t('Rights review failed or could not be confirmed. Reload the status.');}finally{busy=false;button.disabled=false;}};
    row.append(ackLabel,evidence,button,message);
   }
   host.append(row);
  }
  const refresh=node('button','Refresh media status');refresh.type='button';refresh.onclick=()=>void load();host.append(refresh);
 }
 async function load(){const s=selection();if(!s||s.r.state!=='submitted'){clear();return null;}const n=++sequence;last=null;host.hidden=false;host.replaceChildren(node('p','Loading submitted media status...'));try{await guard();const data=validate(await api().reviewMediaStatus(s.t,s.r.id),s);if(!current(s,n))return null;last=data;render(s,data,n);if(data.media_ready&&data.giphy_ready)onStatus('Required media checks passed.');return data;}catch{if(current(s,n)){host.replaceChildren(node('p','Media review status unavailable. Nothing was changed.'));const retry=node('button','Refresh media status');retry.onclick=()=>void load();host.append(retry);}return null;}}
 return {load,clear,async assertReady(){if(busy)throw Error(t('Wait for the media review to finish.'));const data=await load();if(!data)throw Error(t('Media review status unavailable. Nothing was changed.'));if(!data.media_ready||!data.giphy_ready){const s=selection(),details=mediaBlockers(data).map(x=>name(s,x.asset_id)+': '+x.reasons.map(t).join(', '));throw Error(t('Required media checks are incomplete.')+(details.length?' '+details.join('; '):''));}return data;}};
}
