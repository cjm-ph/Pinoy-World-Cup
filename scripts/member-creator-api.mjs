import {draftPayload} from './staging-admin-model.mjs';
// New owner-scoped read RPC is a REVIEW_NOT_RUN dependency. No admin catalog fallback.
export function createMemberRepository(client,{uuid=()=>crypto.randomUUID()}={}){
 const rpc=async(name,args={})=>{const {data,error}=await client.schema('pwc41_api').rpc(name,args);if(error)throw Error(['PGRST202','42883'].includes(error.code)?'Member catalog SQL is not installed. Nothing was saved.':'Member operation refused. Refresh your session and World Cups.');return data;};
 let capabilities={};
 const context=async()=>{const response=await client.schema('pwc41_api').rpc('member_creator_context_v2',{});let x;if(response.error){if(!['PGRST202','42883'].includes(response.error.code))throw Error('Member catalog access refused.');x=await rpc('member_creator_context_v1');}else x=response.data;if(x?.contract_version!==1||!Array.isArray(x.tournaments)||!Array.isArray(x.categories))throw Error('Member catalog contract unavailable.');capabilities=x.capabilities||{};return x;};
 return {context,list:async()=>(await context()).tournaments,
  async save(work,t){if(t?.revision?.cover_asset_id&&!capabilities.cover_save)throw Error('This revision has a dedicated cover. Member cover-preserving save is not connected; existing media was not changed.');const mixed=work.giphy_contract||work.participants.some(p=>p.media);if(work.participants.some(p=>p.media?.type==='mp4'))throw Error('MP4 member contracts are disabled.');
   const x=await rpc(capabilities.cover_save?'member_creator_save_v1':mixed?'giphy_save_draft_v1':'save_draft',{req:uuid(),tid:work.tournament_id,rid:'rev_'+uuid(),expected:t?.edit_version||0,payload:draftPayload(work,{allowIncomplete:true})});if(!x?.revision_id)throw Error('Draft save was not confirmed.');return x;},
  submit:t=>rpc('submit',{req:uuid(),tid:t.id,rid:t.draft_revision_id,expected:t.edit_version,ack:true}),
  unpublish:t=>{if(!capabilities.private)throw Error('Member private contract is not installed.');return rpc('member_creator_manage_v1',{req:uuid(),tid:t.id,expected:t.edit_version,action:'private'});},
  trash:t=>{if(!capabilities.trash)throw Error('Member trash contract is not installed.');return rpc('member_creator_manage_v1',{req:uuid(),tid:t.id,expected:t.edit_version,action:'trash'});}
  // Existing unpublish/media acquisition/trash RPCs require administrator authority.
  // They are deliberately absent rather than bypassed or silently elevated.
 };
}
