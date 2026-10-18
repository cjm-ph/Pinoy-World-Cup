/* Converts a repository response, independently of page rendering. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function inferred(t){const kind=String(t.category||t.type||'').toLowerCase();if(['food','actor','actress','singer','others'].includes(kind))return kind;const label=(t.id+' '+t.title).toLowerCase();return label.includes('actress')?'actress':/\bactor\b|actors/.test(label)?'actor':label.includes('singer')?'singer':'others';}
async function prepare(repository){
 const snapshot=await repository.exportPublishedContent();
 const view=root.PinoyContentModelV1.toViewModel(snapshot);
 const revisions=new Map(snapshot.tournament_revisions.map(r=>[r.id,r])),cups=new Map(snapshot.tournaments.map(t=>[t.id,t]));
 const categories=new Map(snapshot.categories.map(c=>[c.id,c]));
 const bannerSettings={},categoryLabels={},representatives={},resultPhotos={};
 const assets=new Map(snapshot.media_assets.map(a=>[a.id,a]));
 for(const t of view.tournaments){
  const r=revisions.get(cups.get(t.id).published_revision_id),category=categories.get(r.category_ids[0]);
  const mapping=category.legacy_filter;
  if(!['food','actor','actress','singer','others'].includes(mapping))throw new Error('Unsupported category mapping');
  // Preserve exact legacy objects when they already map correctly.
  if(inferred(t)!==mapping)t.category=mapping;
  categoryLabels[t.id]=mapping==='singer'&&['female-singer','male-singer'].includes(category.id)?category.name:{food:'Food',actor:'Actor',actress:'Actress',singer:'Singer',others:'Others'}[mapping];
  const pres=view.presentations.filter(p=>p.revision_id===r.id&&p.participant_id===null);
  representatives[t.id]={};
  for(const p of pres)representatives[t.id][p.context]=Object.assign(clone(p.settings),{source:p.asset_id?assets.get(p.asset_id).path:null});
  for(const p of view.presentations.filter(p=>p.revision_id===r.id&&p.context==='result'&&p.participant_id!==null))resultPhotos[p.participant_id]=clone(p.settings);
  const banner=pres.find(p=>p.context==='banner');if(banner)bannerSettings[t.id]=Object.assign(clone(banner.settings),{source:banner.asset_id?assets.get(banner.asset_id).path:null});
  // Existing start/main renderer reads these presentation fields directly.
  const start=pres.find(p=>p.context==='start'),main=pres.find(p=>p.context==='main');
  if(start&&start.settings.position!==(t.start_cover_object_position||t.cover_object_position||'50% 50%'))t.start_cover_object_position=start.settings.position;
  if(main&&main.settings.position!==(t.cover_object_position||'50% 50%'))t.cover_object_position=main.settings.position;
 }
 return Object.assign(view,{bannerSettings,categoryLabels,representatives,resultPhotos,categories:clone(snapshot.categories)});
}
root.PinoyContentViewAdapterV2={prepare};
})(globalThis);
