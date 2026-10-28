import {validateCreatorFile} from './creator-page-model.mjs';
import {classifyMediaUrl} from './media-url-policy.mjs';
import {draftPayload} from './staging-admin-model.mjs';
// New owner-scoped read RPC is a REVIEW_NOT_RUN dependency. No admin catalog fallback.
export function createMemberRepository(client,{uuid=()=>crypto.randomUUID()}={}){
 const rpc=async(name,args={})=>{const {data,error}=await client.schema('pwc41_api').rpc(name,args);if(error)throw Error(['PGRST202','42883'].includes(error.code)?'Member catalog SQL is not installed. Nothing was saved.':'Member operation refused. Refresh your session and World Cups.');return data;};
 let capabilities={};
 const ready=()=>{if(capabilities.policy_version!==45)throw Error('Member Creator server update is required. Nothing was changed.');};
 async function request(path,tid,body,query={}){ready();if(!capabilities.media)throw Error('Member media contracts unavailable.');const {data,error}=await client.auth.getSession();if(error||!data.session?.access_token)throw Error('Sign in again.');const url=new URL(path,location.origin);url.searchParams.set('tid',tid);for(const [k,v]of Object.entries(query))url.searchParams.set(k,v);const r=await fetch(url,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token},body});if(!r.ok)throw Error('Member media request refused. Existing media is preserved.');return body===undefined?r.blob():r.json();}

 const context=async()=>{const next=await client.schema('pwc41_api').rpc('member_creator_context_v45',{});if(!next.error){const x=next.data;if(x?.contract_version!==1||!Array.isArray(x.tournaments)||!Array.isArray(x.categories))throw Error('Invalid member catalog');capabilities=x.capabilities||{};return x;}if(!['PGRST202','42883'].includes(next.error.code))throw Error('Member catalog access refused.');const response=await client.schema('pwc41_api').rpc('member_creator_context_v2',{});let x;if(response.error){if(!['PGRST202','42883'].includes(response.error.code))throw Error('Member catalog access refused.');x=await rpc('member_creator_context_v1');}else x=response.data;if(x?.contract_version!==1||!Array.isArray(x.tournaments)||!Array.isArray(x.categories))throw Error('Member catalog contract unavailable.');capabilities=x.capabilities||{};return x;};
 return {context,list:async()=>(await context()).tournaments,
  async save(work,t){ready();if(work.participants.some(p=>['mp4','animation'].includes(p.media?.type)))throw Error('MP4 and direct animation member contracts are disabled.');const payload=draftPayload(work,{allowIncomplete:true});payload.member_cover_asset_id=work.cover_asset_id||null;if(work.cover_changed)payload.member_cover_settings=work.cover_settings||{};const x=await rpc('member_creator_save_v45',{req:uuid(),tid:work.tournament_id,rid:'rev_'+uuid(),expected:t?.edit_version||0,payload});if(!x?.revision_id)throw Error('Draft save was not confirmed.');return x;},
  submit:t=>{ready();return rpc('submit',{req:uuid(),tid:t.id,rid:t.draft_revision_id,expected:t.edit_version,ack:true});},
  upload:async(tid,file)=>{await validateCreatorFile(file);return request('/member/media/upload',tid,file,{request:uuid(),asset:'asset_'+uuid()});},
  youtube:async(tid,url,start,end)=>{const x=classifyMediaUrl(url,start,end);if(x.provider!=='youtube')throw Error('Unsupported video source');return request('/member/media/youtube',tid,JSON.stringify(x.source));},
  preview:(tid,aid)=>request('/member/media/preview',tid,undefined,{asset:aid}),
  unpublish:t=>{if(!capabilities.private)throw Error('Member private contract is not installed.');return rpc('member_creator_manage_v1',{req:uuid(),tid:t.id,expected:t.edit_version,action:'private'});},
  trash:t=>{if(!capabilities.trash)throw Error('Member trash contract is not installed.');return rpc('member_creator_manage_v1',{req:uuid(),tid:t.id,expected:t.edit_version,action:'trash'});}
  // Existing unpublish/media acquisition/trash RPCs require administrator authority.
  // They are deliberately absent rather than bypassed or silently elevated.
 };
}
