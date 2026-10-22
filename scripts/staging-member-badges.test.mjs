import test from 'node:test';import assert from 'node:assert/strict';import {createPlayCollector} from './staging-play-collector.mjs';
test('collector freezes start identity, switches/Guest never borrow a later account, no tokens in outbox',async()=>{
 let identity='A';const calls=[],data=new Map();const make=()=>createPlayCollector({getIdentity:()=>identity,getToken:async owner=>owner===identity?'token-'+owner:null,storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},schedule:()=>0,uuid:()=>crypto.randomUUID(),fetchImpl:async(url,options)=>{
  calls.push({url,options});if(url.endsWith('session'))return {ok:true};return {ok:true,json:async()=>url.endsWith('start')?{game_id:'game'}:{sequence:JSON.parse(options.body).events.at(-1).seq,complete:false}};}});
 const c=make();c.start('t','r',['a','b','c','d']);await c.flush();assert.equal(calls.at(-1).options.headers.Authorization,'Bearer token-A');
 identity='B';c.match('a');await c.flush();assert.equal(calls.at(-1).options.headers.Authorization,undefined);assert.equal(c.snapshot()[0].owner,'A');assert.ok(!data.get('pwc-stats-outbox').includes('token-'));
 c.identityChanged('B');identity='A';c.match('c');await c.flush();assert.equal(calls.at(-1).options.headers.Authorization,undefined);assert.equal(c.snapshot()[0].owner,null);
 identity=null;const guest=make();guest.start('t','r',['a','b','c','d']);identity='A';await guest.flush();assert.equal(calls.at(-1).options.headers.Authorization,undefined);
});
test('legacy queued games stay unclaimed; same-account refresh uses fresh token without retaining it',async()=>{
 for(const owner of [undefined,'A']){
  const raw=JSON.stringify([{owner,request:'req',tid:'t',rid:'r',lineup:['a','b','c','d'],game:'g',seq:1,at:Date.now(),events:[{seq:1,winner:'a'}]}]);let headers;
  const c=createPlayCollector({storage:{getItem:()=>raw,setItem(){}},schedule:()=>0,getIdentity:()=> 'B',getToken:async who=>who==='A'?'new-token':null,fetchImpl:async(u,o)=>{if(u.endsWith('session'))return {ok:true};headers=o.headers;return {ok:true,json:async()=>({sequence:1,complete:false})};}});
  await c.flush();assert.equal(headers.Authorization,owner?'Bearer new-token':undefined);
 }
});
