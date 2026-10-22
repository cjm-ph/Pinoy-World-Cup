import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';import {randomUUID} from 'node:crypto';import {createStatisticsHttp} from '../play-statistics.mjs';
test('member badge HTTP trusts only verified Authorization plus signed stats cookie; CSRF and invalid auth cannot claim',async()=>{
 const a=randomUUID(),b=randomUUID(),calls=[],origin='https://staging.test';
 const http=createStatisticsHttp({enabled:true,memberBadges:true,secret:'test-only',allowedOrigin:origin,
  auth:{verify:async token=>{if(token==='A')return {id:a,isAnonymous:false};if(token==='B')return {id:b,isAnonymous:false};throw Error();}},
  rpc:async(name,args)=>{calls.push({name,args});return {game_id:randomUUID(),sequence:3,complete:true};}});
 const server=createServer((req,res)=>http(req,res,new URL(req.url,origin)));server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  const session=await fetch(base+'/play-statistics/session'),cookie=session.headers.get('set-cookie').split(';')[0];
  const send=(path,body,token,overrides={})=>fetch(base+'/play-statistics/'+path,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...overrides},body:JSON.stringify(body)});
  const body={request:randomUUID(),tid:'t',rid:'r',lineup:['a','b','c','d'],actor:b,member_id:b,champion_name:'Forged',game_id:randomUUID()};
  assert.equal((await send('start',body,'A')).status,200);assert.equal(calls.at(-1).args.actor,a);assert.equal(calls.at(-1).name,'play_statistics_member_start');assert.equal(calls.at(-1).args.champion_name,undefined);assert.equal(calls.at(-1).args.game_id,undefined);
  const event={game:randomUUID(),events:[{seq:1,winner:'a'}],actor:a};
  await send('events',event,'B');assert.equal(calls.at(-1).args.actor,b);
  await send('events',event);assert.equal(calls.at(-1).args.actor,null);
  await send('events',event,'expired');assert.equal(calls.at(-1).args.actor,null);
  const n=calls.length;assert.equal((await send('start',body,'A',{Origin:'https://evil.invalid'})).status,403);assert.equal(calls.length,n);
  assert.equal((await send('events',event,'A',{Cookie:cookie+'forged'})).status,428);assert.equal(calls.length,n);
 }finally{await new Promise(r=>server.close(r));}
});
