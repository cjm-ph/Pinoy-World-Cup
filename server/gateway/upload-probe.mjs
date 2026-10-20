// Temporary, explicitly enabled Staging experiment. No decoder or persistence adapters.
import {identity,readBounded,fail} from './gateway.mjs';
import {atStage,diagnostics} from './media-errors.mjs';
export function createUploadProbe({auth,db,admission}){
 let active=0;
 return async({token,tid,body,trace,onProgress=()=>{},mode})=>{
  if(!['existing','body-first'].includes(mode))fail('invalid probe mode');
  if(active>=4)fail('decoder capacity');
  active++;
  let release,failure;
  const connected=()=>{if(trace.disconnected())fail('upload body interrupted');};
  const step=async(stage,action)=>{
   trace.stage(stage);onProgress(stage);const start=performance.now();
   try{return await atStage(stage,async()=>{connected();return action();});}
   finally{trace.stageEnd(stage,performance.now()-start);}
  };
  const receive=()=>step('READ_BODY',()=>readBounded(body,{onBytes:n=>trace.bytes(n)}));
  try{
   // At most four 8 MiB bodies, each with the existing absolute read deadline.
   // Receiving bytes grants no authorization and performs no photo/DB writes.
   let bytes;if(mode==='body-first')bytes=await receive();
   const user=await step('AUTH_VERIFY',async()=>identity(await auth.verify(token)));
   await step('ADMIN_CHECK',()=>db.assertAdminOwner(token,user.id,tid));
   release=await step('ADMISSION',()=>admission.acquire(user.id,{token,tid}));
   if(mode==='existing')bytes=await receive();
   connected();return {probe:true,mode,received_bytes:bytes.length,stored:false};
  }catch(error){failure=error;throw error;}finally{
   try{if(release){trace.event('release_session_start');await release();trace.event('release_session_ok');}}
   catch(error){console.warn(JSON.stringify({event:'media_cleanup_failed',reference:trace.reference,...diagnostics(error),stage:'RELEASE_SESSION'}));if(!failure)throw error;}
   finally{active--;trace.operationEnd();}
  }
 };
}
