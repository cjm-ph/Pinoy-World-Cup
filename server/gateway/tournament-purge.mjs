// Explicit, user-driven Staging purge. No worker, schedule or automatic retry.
import {randomUUID} from 'node:crypto';
export function validatePurgeObject(object){
 if(object?.bucket!=='pwc41-optimized'||!/^asset_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(object?.asset_id||'')
 ||!new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'+object.asset_id+'\\.webp$').test(object.key||''))throw Error('UNSAFE_PURGE_OBJECT');
 return object;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createPurgeController({auth,db,storage,enabled=false}){
 let active=0;
 const run=async({token,requestId,tid,expected,confirmation})=>{
  if(!enabled)throw Error('PURGE_DISABLED');
  if(!uuid.test(requestId)||typeof tid!=='string'||tid.length>160||!tid||!Number.isSafeInteger(expected)||expected<0||typeof confirmation!=='string'||!confirmation||confirmation.length>1000)throw Error('INVALID_PURGE_REQUEST');
  if(active>=1)throw Error('PURGE_BUSY');active++;
  let job,worker;
  try{
   const user=await auth.verify(token);if(!uuid.test(user?.id)||user.isAnonymous!==false)throw Error('PURGE_AUTH_REQUIRED');
   job=await db.begin(token,{req:requestId,tid,expected,confirmation});
   if(job?.tournament_id!==tid||!uuid.test(job?.job_id)||!['pending','running','failed','complete'].includes(job.state))throw Error('INVALID_PURGE_RESULT');
   if(job.state==='complete')return job;
   worker=randomUUID();const args={jid:job.job_id,actor:user.id,worker};
   const claim=await db.claim(args);
   if(claim?.job_id!==job.job_id||claim.tournament_id!==tid)throw Error('INVALID_PURGE_RESULT');
   if(claim.state==='complete'||claim.state==='failed')return claim;
   if(!Array.isArray(claim.objects)||claim.objects.length>1)throw Error('INVALID_PURGE_MANIFEST');
   try{
    for(const entry of claim.objects){
     const object=validatePurgeObject(entry);
     // Only a verified absence is acknowledged. A 2xx DELETE by itself is not proof.
     await storage.remove(object);
     if(!await storage.absent(object))throw Error('PURGE_OBJECT_STILL_PRESENT');
     await db.ack({...args,aid:object.asset_id});
    }
    const result=await db.finish(args);
    if(result?.tournament_id!==tid||result?.job_id!==job.job_id||!['pending','failed','complete'].includes(result.state))throw Error('INVALID_PURGE_RESULT');
    return result;
   }catch{
    try{await db.fail(args);}catch{/* Lease expiry permits an explicit later resume. */}
    throw Error('PURGE_ATTEMPT_FAILED');
   }
  }finally{active--;}
 };
 run.capability=async({token})=>{
  if(!enabled)return {enabled:false,jobs:[]};
  const user=await auth.verify(token);if(!uuid.test(user?.id)||user.isAnonymous!==false)throw Error('PURGE_AUTH_REQUIRED');
  return db.capability(token);
 };
 return run;
}

export function createPurgeAdapters({url,publishableKey,serviceKey,fetchImpl=fetch}){
 if(url!=='https://cmnomqsurdwhdbjgnsvw.supabase.co'||!publishableKey||!serviceKey)throw Error('Staging configuration required');
 async function request(path,token,key,options={}){
  return fetchImpl(url+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:'Bearer '+token,...options.headers}});
 }
 async function rpc(name,args,token=serviceKey,key=serviceKey){
  const r=await request('/rest/v1/rpc/'+name,token,key,{method:'POST',headers:{'Content-Type':'application/json','Content-Profile':'pwc41_api'},body:JSON.stringify(args)});
  if(!r.ok)throw Error('PURGE_RPC_REJECTED');return r.json();
 }
 async function absent(object){
  validatePurgeObject(object);
  const r=await request('/storage/v1/object/authenticated/'+object.bucket+'/'+object.key,serviceKey,serviceKey);
  if(r.ok){await r.body?.cancel();return false;}
  let d;try{d=await r.json();}catch{return false;}
  // Generic 404, permission errors and missing buckets do NOT prove object absence.
  return (r.status===404||r.status===400)&&d?.code==='NoSuchKey';
 }
 return {db:{capability:token=>rpc('admin_tournament_purge_capability',{},token,publishableKey),begin:(token,args)=>rpc('admin_tournament_purge_begin',args,token,publishableKey),claim:args=>rpc('admin_tournament_purge_claim',args),ack:args=>rpc('admin_tournament_purge_ack',args),finish:args=>rpc('admin_tournament_purge_finish',args),fail:args=>rpc('admin_tournament_purge_fail',args)},
 storage:{absent,async remove(object){
  validatePurgeObject(object);
  const r=await request('/storage/v1/object/'+object.bucket,serviceKey,serviceKey,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[object.key]})});
  if(!r.ok&&!await absent(object))throw Error('PURGE_STORAGE_DELETE_FAILED');
  if(r.ok)await r.body?.cancel();
 }}};
}

export function createPurgeHttp(controller){return async(req,res)=>{
 res.setTimeout(120000); // This bounded deletion step only; upload timeouts are untouched.
 const reference=randomUUID();let timer;
 try{
  if(!req.headers.authorization?.startsWith('Bearer '))throw Error('AUTH_REQUIRED');
  if(req.method==='GET'){
   const capability=await controller.capability({token:req.headers.authorization.slice(7)});
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(capability));return;
  }
  const chunks=[];let size=0;
  const read=async()=>{for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('BODY_LIMIT');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
  const body=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{req.destroy();reject(Error('BODY_TIMEOUT'));},5000);})]);
  const result=await controller({...body,token:req.headers.authorization.slice(7)});
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({...result,reference}));
 }catch{if(!res.destroyed){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'PURGE_REJECTED',reference}));}}
 finally{clearTimeout(timer);}
};}
