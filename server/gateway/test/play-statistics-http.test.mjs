import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createMediaServer} from '../http.mjs';import {createStatisticsHttp,createStatisticsAdapters} from '../play-statistics.mjs';
test('guest handshake, same-origin, tampered cookie and body/rate limits fail safely',async()=>{
 const calls=[],origin='http://local.test';const server=createMediaServer({}, {statisticsHttp:createStatisticsHttp({enabled:true,secret:'test-secret',allowedOrigin:origin,rpc:async(n,a)=>{calls.push({n,a});return {game_id:'g',sequence:0};}})});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const base='http://127.0.0.1:'+server.address().port,body=JSON.stringify({request:'00000000-0000-4000-8000-000000000001',tid:'t',rid:'r',lineup:['a','b','c','d']});
  let r=await fetch(base+'/play-statistics/start',{method:'POST',headers:{Origin:origin},body});assert.equal(r.status,428);assert.equal(calls.length,0);
  r=await fetch(base+'/play-statistics/session');const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(cookie,/HttpOnly/i.test(r.headers.get('set-cookie'))?/pwc_stats_guest/:/never/);
  r=await fetch(base+'/play-statistics/start',{method:'POST',headers:{Origin:origin,Cookie:cookie},body});assert.equal(r.status,200);assert.match(calls[0].a.caller,/^[a-f0-9]{64}$/);assert.equal(calls[0].n,'play_statistics_start');
  r=await fetch(base+'/play-statistics/start',{method:'POST',headers:{Origin:'https://attacker.invalid',Cookie:cookie},body});assert.equal(r.status,403);
  r=await fetch(base+'/play-statistics/start',{method:'POST',headers:{Origin:origin,Cookie:cookie+'bad'},body});assert.equal(r.status,428);assert.equal(calls.length,1);
  r=await fetch(base+'/play-statistics/start',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:'x'.repeat(8193)});assert.equal(r.status,400);
  for(let i=0;i<121;i++)r=await fetch(base+'/play-statistics/session',{headers:{Cookie:cookie}});assert.equal(r.status,429);assert.equal(calls.length,1);
 }finally{await new Promise(r=>server.close(r));}
});
test('statistics adapters are Staging-only and never disclose service key on public reads',async()=>{
 const calls=[];const rpc=createStatisticsAdapters({url:'https://cmnomqsurdwhdbjgnsvw.supabase.co',publishableKey:'public',serviceKey:'secret',fetchImpl:async(u,o)=>{calls.push(o);return new Response('{}');}});await rpc('play_statistics_public',{tid:'t'},true);assert.equal(calls[0].headers.Authorization,undefined);assert.equal(calls[0].headers.apikey,'public');
 assert.throws(()=>createStatisticsAdapters({url:'https://other.invalid',publishableKey:'p',serviceKey:'s'}));
});
