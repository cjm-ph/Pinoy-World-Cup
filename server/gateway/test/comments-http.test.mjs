import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createCommentHttp} from '../comments.mjs';import {inspectComment} from '../comment-policy.mjs';import {existsSync} from 'node:fs';
const shared=new URL('../../../../scripts/comment-text-policy.mjs',import.meta.url);
const {commentLength}=await import(existsSync(shared)?shared:new URL('../../../scripts/comment-text-policy.mjs',import.meta.url));
const solve=c=>{for(let i=0;;i++){const h=createHash('sha256').update(c.challenge+':'+i).digest();if(h[0]<(1<<(8-c.difficulty)))return {challenge:c.challenge,counter:i};}};
test('disabled comments reject reads/writes without invoking auth or RPC',async()=>{
 const handler=createCommentHttp({secret:'test-only',enabled:false,rpc:()=>assert.fail('disabled RPC'),auth:{verify:()=>assert.fail('disabled auth')}});
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,'https://staging.test')));server.listen(0,'127.0.0.1');await once(server,'listening');
 try{for(const method of ['GET','POST']){const r=await fetch('http://127.0.0.1:'+server.address().port+'/comments',{method});assert.equal(r.status,503);assert.equal((await r.json()).error,'COMMENTS_DISABLED');assert.equal(r.headers.get('set-cookie'),null);}}
 finally{await new Promise(r=>server.close(r));}
});
test('server moderation/counting covers common EN/Filipino/URL/contact obfuscations without HTML rendering',()=>{
 for(const text of ['https://evil.com','e x a m p l e [dot] c o m','evil.ph','hxxps://short.link','@promo_user','0917 123 4567','p u t a n g i n a','f.u.c.k','f**k','sh1t','Buy NOW','online casino','papatayin kita','<script>alert(1)</script>'])assert.equal(inspectComment(text).ok,false,text);
 for(const text of ['Great choice!','My favorite anime','Nice match 😊','Family 👨‍👩‍👧‍👦','2026-10-22 was fun','Mr. Nice wins'])assert.equal(inspectComment(text).ok,true,text);
 assert.equal(commentLength('😊'.repeat(100)),100);assert.equal(inspectComment('😊a'.repeat(50)).ok,true);assert.equal(inspectComment('😊'.repeat(101)).ok,false);assert.equal(commentLength('e\u0301'),1);assert.equal(inspectComment('e\u0301').length,1);
});
test('HTTP signed identity, CSRF, PoW, expired replay binding and verified member/admin routing',async()=>{
 const calls=[],secret='test-only',origin='https://staging.test';
 const handler=createCommentHttp({enabled:true,secret,origin,difficulty:4,auth:{verify:async t=>t==='member'?{id:'00000000-0000-4000-8000-000000000001',isAnonymous:false}:Promise.reject(Error())},rpc:async(n,a)=>{calls.push({n,a});return n==='comments_list'?{rows:[],has_more:false}:{ok:true};}});
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin)));server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  let r=await fetch(base+'/comments?action=list&tid=t');const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.match(calls[0].a.guest,/^[a-f0-9]{64}$/);assert.equal(calls[0].a.actor,null);
  r=await fetch(base+'/comments?action=challenge&for=post',{headers:{Cookie:cookie}});const proof=solve(await r.json());
  const send=(body,headers={})=>fetch(base+'/comments',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(body)});
  r=await send({action:'post',tid:'t',body:'Legitimate comment',proof});assert.equal(r.status,200);assert.equal(calls.at(-1).n,'comments_mutate');assert.equal(calls.at(-1).a.payload.body,'Legitimate comment');assert.equal(calls.at(-1).a.stats_caller,null);
  r=await send({action:'post',tid:'t',body:'https://evil.com',proof});assert.equal(r.status,400);assert.equal((await r.json()).error,'CONTENT_BLOCKED');
  r=await send({action:'post',tid:'t',body:'Comment',proof},{Origin:'https://attacker.invalid'});assert.equal(r.status,403);
  r=await send({action:'post',tid:'t',body:'Comment',proof:{...proof,counter:-1}});assert.equal(r.status,400);
  r=await send({action:'post',tid:'t',body:'Comment',proof},{Cookie:cookie+'tampered'});assert.equal(r.status,428);
  r=await send({action:'review',report_id:randomUUID(),request:randomUUID(),note:'Safe',state:'reviewed'});assert.equal(r.status,403);
  r=await send({action:'review',report_id:randomUUID(),request:randomUUID(),note:'Safe',state:'reviewed'},{Authorization:'Bearer member'});assert.equal(r.status,200);assert.equal(calls.at(-1).a.actor,'00000000-0000-4000-8000-000000000001');
  const sid=randomUUID(),mac=x=>createHmac('sha256',secret).update('play-statistics-v1:'+x).digest('hex');
  r=await send({action:'delete',id:randomUUID()},{Cookie:cookie+'; pwc_stats_guest='+sid+'.'+mac(sid)});assert.equal(r.status,200);assert.equal(calls.at(-1).a.stats_caller,mac('caller:'+sid));
  r=await fetch(base+'/comments?action=admin');assert.equal(r.status,403);
  r=await send({action:'delete',id:"x');delete from profiles;--"});assert.equal(r.status,400);
  r=await fetch(base+'/comments',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'x'.repeat(4097)});assert.equal(r.status,400);
 }finally{await new Promise(r=>server.close(r));}
});
