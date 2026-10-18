/* Repository boundary only: no DOM, rendering, fetch, storage or database SDK. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
class RepositoryError extends Error{constructor(code,message){super(message);this.name='RepositoryError';this.code=code;}}
function create(input,options){
 options=options||{};
 try{root.PinoyContentModelV1.validate(input);}catch(e){throw new RepositoryError('INVALID_CONTENT',e.message);}
 const data=clone(input),cups=new Map(data.tournaments.map(t=>[t.id,t])),revisions=new Map(data.tournament_revisions.map(r=>[r.id,r]));
 const publicCups=data.tournaments.filter(t=>t.visibility==='public'&&t.published_revision_id);
 const publicIds=new Set(publicCups.map(t=>t.id)),revisionIds=new Set(publicCups.map(t=>t.published_revision_id));
 const presentations=data.media_presentations.filter(p=>revisionIds.has(p.revision_id));
 const members=data.revision_participants.filter(p=>revisionIds.has(p.revision_id));
 const assetIds=new Set([...members.flatMap(p=>[p.image_asset_id,p.local_asset_id,p.remote_asset_id]),...publicCups.map(t=>revisions.get(t.published_revision_id).cover_asset_id),...presentations.map(p=>p.asset_id)].filter(Boolean));
 function published(id){const t=cups.get(id);if(!t||!publicIds.has(id))throw new RepositoryError('NOT_FOUND','Published World Cup not found.');return t;}
 function revisionFor(id,rid){const t=published(id);if(rid!==t.published_revision_id)throw new RepositoryError('NOT_FOUND','Published revision not found.');return revisions.get(rid);}
 function summary(t){const r=revisions.get(t.published_revision_id);return {id:t.id,revision_id:r.id,title:r.title,description:r.description,category_ids:clone(r.category_ids),cover_asset_id:r.cover_asset_id,round_policy:clone(r.round_policy),participant_count:members.filter(p=>p.revision_id===r.id&&p.active).length};}
 function publicSnapshot(){
  const result=clone(data);result.tournaments=clone(publicCups);
  // Do not include a public cup's unpublished draft pointer or content.
  result.tournaments.forEach(t=>{t.draft_revision_id=null;});
  result.tournament_revisions=clone(data.tournament_revisions.filter(r=>revisionIds.has(r.id)));
  result.tournament_revisions.forEach(r=>{r.parent_revision_id=null;});
  result.revision_participants=clone(members);
  const keys=new Set(members.map(p=>JSON.stringify([revisions.get(p.revision_id).tournament_id,p.participant_id])));
  result.participants=clone(data.participants.filter(p=>keys.has(JSON.stringify([p.tournament_id,p.id]))));
  const entities=new Set(result.participants.map(p=>p.entity_id));result.entities=clone(data.entities.filter(e=>entities.has(e.id)));
  result.media_assets=clone(data.media_assets.filter(a=>assetIds.has(a.id)));
  result.media_presentations=clone(presentations);
  result.featured_entries=clone(data.featured_entries.filter(f=>f.enabled&&publicIds.has(f.tournament_id)));
  const categories=new Set(result.tournament_revisions.flatMap(r=>r.category_ids));
  const categoryMap=new Map(data.categories.map(c=>[c.id,c]));
  for(const id of [...categories]){let p=categoryMap.get(id).parent_id;while(p!==null){categories.add(p);p=categoryMap.get(p).parent_id;}}
  result.categories=clone(data.categories.filter(c=>categories.has(c.id)));
  const config=result.compatibility.home_config;
  for(const key of ['priorities','covers'])if(config[key])config[key]=Object.fromEntries(Object.entries(config[key]).filter(([id])=>publicIds.has(id)));
  result.compatibility.photo_settings_by_name={};
  // UI output does not need private workflow events or unrelated import details.
  result.provenance={kind:data.provenance.kind,source_hashes:clone(data.provenance.source_hashes||{})};
  return result;
 }
 const api={
  async listPublishedTournaments(){return clone(publicCups.map(summary));},
  async getPublishedTournament(id){const t=published(id);return {summary:summary(t),revision:clone(revisions.get(t.published_revision_id))};},
  async getTournamentParticipants(id,rid){revisionFor(id,rid);return clone(members.filter(p=>p.revision_id===rid).sort((a,b)=>a.sort_order-b.sort_order));},
  async getMediaPresentations(assetId,context){if(!['main','banner','start','vs','result'].includes(context))throw new RepositoryError('INVALID_ARGUMENT','Unknown image context.');return clone(presentations.filter(p=>p.asset_id===assetId&&p.context===context));},
  async getMediaAsset(id){if(!assetIds.has(id))throw new RepositoryError('NOT_FOUND','Published image not found.');return clone(data.media_assets.find(a=>a.id===id));},
  async listFeaturedEntries(){return clone(data.featured_entries.filter(f=>f.enabled&&publicIds.has(f.tournament_id)).sort((a,b)=>a.sort_order-b.sort_order));},
  async getDraftPreview(id,rid){
   if(!options.allowDraftPreview)throw new RepositoryError('PREVIEW_DISABLED','Preview is disabled in the public repository.');
   const t=cups.get(id);if(!t||!t.draft_revision_id||t.draft_revision_id!==rid)throw new RepositoryError('NOT_FOUND','Current draft not found.');
   return clone(root.PinoyContentModelV1.toViewModel(data,{mode:'preview',tournament_id:id}));
  },
  async exportPublishedContent(){return publicSnapshot();}
 };
 return Object.freeze(api);
}
root.PinoyStaticContentRepositoryV2={create,RepositoryError};
})(globalThis);
