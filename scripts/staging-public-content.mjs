import { getMemberClient } from './staging-member-auth.mjs';
import { createMediaApi, STAGING_URL, publishedItem } from './staging-media-api.mjs';
const text = value => String(value ?? '');
// Produce an independent view before the approved home/carousel/VS modules initialize.
export async function mergePublishedView(original, api) {
  const response=await api.published();
  if(!Array.isArray(response)) throw Error('Published content unavailable [INVALID_RESPONSE].');
  // list_published is the authority. Never mix in unpublished static tournaments.
  const unique=new Map();
  for(const cup of response) {
    if(cup.visibility !== undefined && cup.visibility !== 'public') continue;
    if(typeof cup.id!=='string' || !cup.id || typeof cup.revision_id!=='string' || !cup.revision_id) throw Error('Published content unavailable [INVALID_RESPONSE].');
    if(unique.has(cup.id) && unique.get(cup.id).revision_id!==cup.revision_id) throw Error('Published content unavailable [INVALID_RESPONSE].');
    if(!unique.has(cup.id)) unique.set(cup.id,cup);
  }
  const cups=[...unique.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(!cups.length) return {view:original,count:0};
  const view=structuredClone(original);
  view.tournaments=[];view.featured=[];view.vsPhotos={};view.resultPhotos={};
  view.bannerSettings={};view.representatives={};view.categoryLabels={};
  for(const cup of cups) {
    const r=await api.revision(cup.revision_id);
    const old=original.tournaments.find(t=>t.id===cup.id);
    const category=original.categories.find(c=>cup.category_ids?.includes(c.id));
    const cover=cup.cover_asset_id ? api.mediaUrl(cup.cover_asset_id) : old?.cover_image || '';
    const t={...old,id:cup.id,title:text(cup.title),sub:text(cup.description),category:category?.legacy_filter || old?.category || 'others',c:old?.c || '#0038a8',cover_image:cover,
      supported_rounds:r.supported_rounds || cup.supported_rounds,default_size:r.default_size || cup.default_size,
      items:(r.participants || []).filter(p=>p.active).map(p=>publishedItem({...p,name:text(p.name),emoji:text(p.emoji)},old?.items.find(i=>i.id===p.id),api.mediaUrl))};
    t.short_description=typeof cup.short_description==='string'?cup.short_description:'';
    t._statistics_revision_id=cup.revision_id;
    view.tournaments.push(t);
    view.categoryLabels[t.id]=category?.name || original.categoryLabels[t.id] || 'Others';
    view.representatives[t.id]={};
    for(const ctx of ['main','banner','start']) {
      const p=(r.presentations || []).find(p=>!p.participant_id&&p.context===ctx);
      view.representatives[t.id][ctx]={...(p?.settings || {}),source:p?.asset_id ? api.mediaUrl(p.asset_id) : cover};
    }
    view.bannerSettings[t.id]=view.representatives[t.id].banner;
    for(const p of r.presentations || []) if(p.participant_id) {
      if(p.context==='vs') view.vsPhotos[p.participant_id]=p.settings || {};
      if(p.context==='result') view.resultPhotos[p.participant_id]=p.settings || {};
    }
  }
  // Keep editorial order for surviving public IDs; append new public IDs in stable ID order.
  const featuredIds=new Set();
  for(const f of original.featured) if(unique.has(f.tournament_id) && !featuredIds.has(f.tournament_id)) {
    view.featured.push({...f,sort_order:view.featured.length});featuredIds.add(f.tournament_id);
  }
  for(const cup of cups) if(!featuredIds.has(cup.id)) {
    view.featured.push({tournament_id:cup.id,sort_order:view.featured.length});featuredIds.add(cup.id);
  }
  return {view,count:cups.length};
}
// The legacy engine assigns art() output to innerHTML. Serialize DOM nodes here,
// while the approved home, carousel, VS and result modules receive raw text.
export function installTextRenderBoundary(root) {
  root.art=f=>{
    const box=document.createElement('div');
    const source=f._localPhoto || f.img;
    if(source) {
      const image=document.createElement('img');image.src=source;image.alt=text(f.n);
      image.dataset.fallback=text(f.e);
      image.setAttribute('onerror',"this.replaceWith(document.createTextNode(this.dataset.fallback))");
      box.appendChild(image);
    } else box.textContent=text(f.e);
    return box.innerHTML;
  };
}
export async function prepareStagingView(original) {
  let first=true;
  const status=document.getElementById('stagingPublicStatus');
  window.PWCStagingPublic={refresh:async()=>{
    if(first){first=false;return;}
    // Reinitialize all presentation closures together, avoiding mixed old/new carousel data.
    location.reload();
  }};
  try {
    const config=window.PWC_STAGING;
    if(config?.supabaseUrl!==STAGING_URL || !/^sb_publishable_/.test(config.publishableKey || '')) throw Error('Staging configuration unavailable.');
    const client=getMemberClient();
    const api=createMediaApi({client,gatewayOrigin:location.origin,pageOrigin:location.origin,giphyContractsEnabled:config.giphyContractsEnabled===true});
    const result=await mergePublishedView(original,api);
    status.textContent=result.count ? '' : 'No published World Cups yet. Enjoy our practice World Cups.';
    status.hidden=!!result.count;
    return result.view;
  } catch(error) {
    status.hidden=false;
    status.textContent='World Cups are temporarily unavailable. You can still enjoy practice World Cups.';
    return original;
  }
}
