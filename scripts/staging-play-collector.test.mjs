import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayCollector} from './staging-play-collector.mjs';
function fixture(fetchImpl){const data=new Map(),timers=[];return {data,timers,collector:createPlayCollector({storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},schedule:fn=>{timers.push(fn);return timers.length;},uuid:()=> 'request-id',fetchImpl})};}
test('start and match order are asynchronous and one persisted identity is used across retries',async()=>{
 const calls=[];let fail=true;const f=fixture(async(url,opts)=>{calls.push({url,body:opts?.body&&JSON.parse(opts.body)});if(url.endsWith('session'))return {ok:true};if(url.endsWith('start'))return {ok:true,json:async()=>({game_id:'game'})};if(fail){fail=false;throw Error('uncertain network acknowledgement');}return {ok:true,json:async()=>({sequence:3,complete:true})};});
 f.collector.start('t','r',['a','b','c','d']);f.collector.match('a');f.collector.match('c');f.collector.match('a');assert.equal(calls.length,0);
 await f.collector.flush();assert.equal(f.collector.snapshot()[0].events.length,3);await f.collector.flush();assert.equal(f.collector.snapshot().length,0);
 assert.equal(calls.filter(c=>c.url.endsWith('/start')).length,1);assert.deepEqual(calls.filter(c=>c.url.endsWith('/events')).map(c=>c.body),[{game:'game',events:[{seq:1,winner:'a'},{seq:2,winner:'c'},{seq:3,winner:'a'}]},{game:'game',events:[{seq:1,winner:'a'},{seq:2,winner:'c'},{seq:3,winner:'a'}]}]);
});
test('disabled/unavailable collection never throws into gameplay and has bounded retries',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return {ok:false,status:503};});f.collector.start('t','r',['a','b','c','d']);f.collector.match('a');await f.collector.flush();assert.equal(calls,1);assert.equal(f.collector.snapshot()[0].dead,true);f.collector.match('c');assert.equal(calls,1);
});
test('refresh resumes the same queued game; corrupt storage is ignored',async()=>{
 const raw=JSON.stringify([{request:'req',tid:'t',rid:'r',lineup:['a','b','c','d'],game:'g',seq:1,at:Date.now(),events:[{seq:1,winner:'a'}]}]);let body;
 const c=createPlayCollector({storage:{getItem:()=>raw,setItem(){}},schedule:()=>0,fetchImpl:async(u,o)=>u.endsWith('session')?{ok:true}:{ok:true,json:async()=>{body=JSON.parse(o.body);return {sequence:1,complete:false};}}});await c.flush();assert.equal(body.game,'g');assert.equal(c.snapshot()[0].events.length,0);
 assert.doesNotThrow(()=>createPlayCollector({storage:{getItem:()=>'{bad'}}));
});
