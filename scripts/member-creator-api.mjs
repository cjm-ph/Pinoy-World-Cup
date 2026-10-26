import {draftPayload} from './staging-admin-model.mjs';
// New owner-scoped read RPC is a REVIEW_NOT_RUN dependency. No admin catalog fallback.
export function createMemberRepository(client,{uuid=()=>crypto.randomUUID()}={}){
 const rpc=async(name,args={})=>{const {data,error}=await client.schema('pwc41_api').rpc(name,args);if(error)throw Error(['PGRST202','42883'].includes(error.code)?'Member catalog SQL is not installed. Nothing was saved.':'Member operation refused. Refresh your session and World Cups.');return data;};
 const context=async()=>{const x=await rpc('member_creator_context_v1');if(x?.contract_version!==1||!Array.isArray(x.tournaments)||!Array.isArray(x.categories))throw Error('Member catalog contract unavailable.');return x;};
 return {context,list:async()=>(await context()).tournaments,
  async save(work,t){if(t?.revision?.cover_asset_id)throw Error('This revision has a dedicated cover. Member cover-preserving save is not connected; existing media was not changed.');const mixed=work.giphy_contract||work.participants.some(p=>p.media);if(work.participants.some(p=>p.media?.type==='mp4'))throw Error('MP4 member contracts are disabled.');
   const x=await rpc(mixed?'giphy_save_draft_v1':'save_draft',{req:uuid(),tid:work.tournament_id,rid:'rev_'+uuid(),expected:t?.edit_version||0,payload:draftPayload(work,{allowIncomplete:true})});if(!x?.revision_id)throw Error('Draft save was not confirmed.');return x;},
  submit:t=>rpc('submit',{req:uuid(),tid:t.id,rid:t.draft_revision_id,expected:t.edit_version,ack:true})
  // Existing unpublish/media acquisition/trash RPCs require administrator authority.
  // They are deliberately absent rather than bypassed or silently elevated.
 };
}
