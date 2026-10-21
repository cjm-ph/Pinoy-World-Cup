import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPurgeController,createPurgeAdapters,createPurgeHttp,validatePurgeObject} from '../tournament-purge.mjs';
import {createMediaServer} from '../http.mjs';
const actor='00000000-0000-4000-8000-000000000001',jid='00000000-0000-4000-8000-000000000002',aid='asset_00000000-0000-4000-8000-000000000003';
const object={asset_id:aid,bucket:'pwc41-optimized',key:actor+'/'+aid+'.webp'};
function setup(){
 const s={state:'pending',pending:true,exists:true,deleted:false,calls:[],locked:false,audit:[],trash:true,shared:false};
 const result=()=>({job_id:jid,tournament_id:'test',state:s.state,remaining:s.pending?1:0});
 const args={token:'admin',requestId:jid,tid:'test',expected:7,confirmation:'Test title'};
 const deps={enabled:true,auth:{verify:async token=>{if(token!=='admin')throw Error('denied');return {id:actor,isAnonymous:false};}},db:{
  capability:async()=>({enabled:true,jobs:[]}),
  begin:async(token,a)=>{s.calls.push('begin');assert.equal(token,'admin');if(!s.trash||s.shared||a.tid!=='test'||a.confirmation!=='Test title'||a.expected!==7)throw Error('rejected');return result();},
  claim:async()=>{if(s.locked)throw Error('busy');s.locked=true;s.state='running';return {...result(),objects:s.pending?[object]:[]};},
  ack:async()=>{s.calls.push('ack');assert.equal(s.exists,false);s.pending=false;},
  finish:async()=>{s.calls.push('finish');assert.equal(s.pending,false);s.state=s.dbFail?'failed':'complete';s.deleted=!s.dbFail;s.locked=false;s.audit.push(s.state);return result();},
  fail:async()=>{s.state='failed';s.locked=false;s.audit.push('failed');return result();}
 },storage:{remove:async()=>{s.calls.push('remove');if(s.storageFail)throw Error('storage failure');s.exists=false;},absent:async()=>!s.exists}};
 return {s,args,deps,run:()=>createPurgeController(deps)(args)};
}
test('dedicated object is removed and verified before ack/finalization',async()=>{const x=setup();assert.equal((await x.run()).state,'complete');assert.deepEqual(x.s.calls,['begin','remove','ack','finish']);assert.equal(x.s.deleted,true);assert.deepEqual(x.s.audit,['complete']);});
test('server opt-in cannot override the database physical Storage barrier',async()=>{
 const x=setup();x.deps.db.capability=async()=>({enabled:false,jobs:[],blocked_reason:'STORAGE_WRITE_BARRIER_UNIMPLEMENTED'});
 x.deps.db.begin=async()=>{throw Error('purge blocked: physical Storage write barrier not implemented');};
 const controller=createPurgeController(x.deps);
 assert.equal((await controller.capability({token:'admin'})).enabled,false);
 await assert.rejects(controller(x.args),/Storage write barrier/);
 assert.equal(x.s.calls.includes('remove'),false);assert.equal(x.s.exists,true);assert.equal(x.s.deleted,false);
});
test('disabled, nonadministrator, public/private, wrong name and wrong immutable ID cannot delete',async()=>{
 for(const scenario of ['disabled','nonadmin','not-trash','name','id']){const x=setup();if(scenario==='disabled')x.deps.enabled=false;if(scenario==='nonadmin')x.args.token='member';if(scenario==='not-trash')x.s.trash=false;if(scenario==='name')x.args.confirmation='wrong';if(scenario==='id')x.args.tid='other';await assert.rejects(x.run());assert.ok(!x.s.calls.includes('remove'));assert.equal(x.s.deleted,false);}
});
test('shared owned asset blocks before Storage; external owned objects are never enumerated',async()=>{const x=setup();x.s.shared=true;await assert.rejects(x.run());assert.ok(!x.s.calls.includes('remove'));assert.equal(x.s.exists,true);});
test('Storage failure retains DB and explicit retry resumes',async()=>{const x=setup();x.s.storageFail=true;await assert.rejects(x.run());assert.equal(x.s.deleted,false);assert.equal(x.s.state,'failed');x.s.storageFail=false;assert.equal((await x.run()).state,'complete');});
test('delete acknowledgement uncertainty retries absence safely without deleting DB early',async()=>{const x=setup();const ack=x.deps.db.ack;x.deps.db.ack=async()=>{throw Error('uncertain ack');};await assert.rejects(x.run());assert.equal(x.s.exists,false);assert.equal(x.s.deleted,false);x.deps.db.ack=ack;assert.equal((await x.run()).state,'complete');});
test('DB failure preserves verified object receipts and retries finalization without another Storage removal',async()=>{const x=setup();x.s.dbFail=true;assert.equal((await x.run()).state,'failed');assert.equal(x.s.deleted,false);x.s.dbFail=false;assert.equal((await x.run()).state,'complete');assert.equal(x.s.calls.filter(v=>v==='remove').length,1);});
test('completed retry is idempotent and performs no Storage calls',async()=>{const x=setup();await x.run();x.s.calls=[];assert.equal((await x.run()).state,'complete');assert.deepEqual(x.s.calls,['begin']);});
test('two controllers sharing a lease do not execute concurrent object removal',async()=>{const x=setup();let release,entered;const gate=new Promise(r=>release=r),start=new Promise(r=>entered=r);x.deps.storage.remove=async()=>{x.s.calls.push('remove');entered();await gate;x.s.exists=false;};const a=createPurgeController(x.deps),b=createPurgeController(x.deps);const first=a(x.args);await start;await assert.rejects(b(x.args));release();await first;assert.equal(x.s.calls.filter(v=>v==='remove').length,1);});
test('bucket/path traversal and manifest mismatch fail closed',()=>{for(const bad of [{...object,bucket:'other'},{...object,key:'../photo.webp'},{...object,key:actor+'/other.webp'}])assert.throws(()=>validatePurgeObject(bad));});
test('Storage REST delete is exact-prefix and absence requires explicit NoSuchKey',async()=>{
 let missing=false;const calls=[];
 const adapters=createPurgeAdapters({url:'https://cmnomqsurdwhdbjgnsvw.supabase.co',publishableKey:'synthetic',serviceKey:'server-only',fetchImpl:async(url,options)=>{calls.push({url,options});return options.method==='DELETE'?new Response('[]'):new Response(JSON.stringify(missing?{code:'NoSuchKey'}:{code:'AccessDenied'}),{status:404});}});
 await adapters.storage.remove(object);assert.deepEqual(JSON.parse(calls[0].options.body),{prefixes:[object.key]});assert.equal(await adapters.storage.absent(object),false);missing=true;assert.equal(await adapters.storage.absent(object),true);
 assert.throws(()=>createPurgeAdapters({url:'https://invalid.example',publishableKey:'x',serviceKey:'y'}));
});
test('new HTTP route is absent by default; enabled route validates and returns bounded JSON',async()=>{
 const x=setup(),off=createMediaServer({});off.listen(0,'127.0.0.1');await once(off,'listening');
 try{assert.equal((await fetch(`http://127.0.0.1:${off.address().port}/admin/media/tournament-purge`)).status,404);}finally{off.closeAllConnections();await new Promise(r=>off.close(r));}
 const server=createMediaServer({},{purgeHttp:createPurgeHttp(createPurgeController(x.deps))});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}/admin/media/tournament-purge`;
 try{assert.equal((await fetch(url)).status,400);const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify(x.args)});assert.equal((await response.json()).state,'complete');}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
