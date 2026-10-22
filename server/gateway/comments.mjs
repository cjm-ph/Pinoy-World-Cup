import {randomBytes,randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {inspectComment} from './comment-policy.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function createCommentAdapters({url,publishableKey,serviceKey,fetchImpl=fetch}){
 if(url!=='https://cmnomqsurdwhdbjgnsvw.supabase.co'||!publishableKey||!serviceKey)throw Error('Staging required');
 return {async rpc(name,args){const r=await fetchImpl(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json','Content-Profile':'pwc41_api'},body:JSON.stringify(args)});
  if(!r.ok){let value;try{value=await r.json();}catch{}const code=['COMMENTS_DISABLED','REQUEST_CONFLICT','OPERATION_EXPIRED','INVALID_LENGTH','COMMENT_MISSING','REPORT_MISSING'].find(x=>String(value?.message||'').includes(x));throw Object.assign(Error(code||'COMMENT_REQUEST_FAILED'),{code:code||'COMMENT_REQUEST_FAILED',status:value?.code==='42501'?403:r.status>=500?502:400});}return r.json();}};
}
export function createCommentHttp({rpc,auth,secret,enabled=false,origin='https://pinoy-worldcup-staging.onrender.com',now=Date.now,difficulty=17}){
 if(!secret)throw Error('Comment secret required');
 const mac=(domain,value)=>createHmac('sha256',secret).update(domain+value).digest('hex');
 const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
 const buckets=new Map();let active=0;
 function admit(key,limit){const at=now();let b=buckets.get(key);if(!b||b.until<=at){b={n:0,until:at+60000};buckets.set(key,b);}b.n++;if(buckets.size>12000)for(const [k,v]of buckets)if(v.until<=at)buckets.delete(k);return b.n<=limit&&buckets.size<=12000;}
 function guestIdentity(req,res){let id;const raw=cookie(req,'__Host-pwc_comments');if(raw){const [x,expiry,sig]=raw.split('.');if(/^[a-f0-9]{64}$/.test(x||'')&&Number(expiry)>now()&&Number(expiry)<=now()+366*86400000&&equal(sig,mac('comments-cookie:',x+'.'+expiry)))id=x;}
  const established=!!id;if(!id){id=randomBytes(32).toString('hex');const exp=now()+365*86400000;res.setHeader('Set-Cookie',`__Host-pwc_comments=${id}.${exp}.${mac('comments-cookie:',id+'.'+exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`);}return {guest:mac('comments-guest:',id),established};}
 function statsCaller(req){const raw=cookie(req,'pwc_stats_guest');if(!raw)return null;const [id,sig]=raw.split('.');return uuid.test(id||'')&&equal(sig,mac('play-statistics-v1:',id))?mac('play-statistics-v1:','caller:'+id):null;}
 function challenge(subject,action){const data={subject,action,req:randomUUID(),until:now()+300000,difficulty};const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return {challenge:payload+'.'+mac('comments-proof:',payload),difficulty,expires_at:data.until};}
 function verify(proof,subject,action){if(typeof proof?.challenge!=='string'||proof.challenge.length>1600||!Number.isSafeInteger(proof.counter)||proof.counter<0)throw Object.assign(Error(),{code:'PROOF_REQUIRED'});const [payload,sig]=proof.challenge.split('.');if(!equal(sig,mac('comments-proof:',payload)))throw Object.assign(Error(),{code:'INVALID_PROOF'});let data;try{data=JSON.parse(Buffer.from(payload,'base64url'));}catch{throw Error();}if(data.subject!==subject||data.action!==action||!uuid.test(data.req)||data.difficulty!==difficulty||data.until>now()+301000)throw Object.assign(Error(),{code:'INVALID_PROOF'});
  const digest=createHash('sha256').update(proof.challenge+':'+proof.counter).digest();let bits=0;for(const byte of digest){if(byte===0){bits+=8;continue;}bits+=Math.clz32(byte)-24;break;}if(bits<difficulty)throw Object.assign(Error(),{code:'INVALID_PROOF'});return data;}
 return async(req,res,url)=>{
  const send=(status,data)=>{if(!res.destroyed&&!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(data));}};
  if(!enabled){send(503,{error:'COMMENTS_DISABLED'});return;}
  if(!['GET','POST'].includes(req.method)){send(405,{error:'METHOD_REJECTED'});return;}
  if(req.method==='POST'&&(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json'))){send(403,{error:'ORIGIN_REJECTED'});return;}
  // IP is short-lived HMAC request admission, never the ownership/cooldown key.
  const ip=mac('comments-admission:',String(req.socket.remoteAddress||''));if(active>=12||!admit('ip:'+ip,180)){send(429,{error:'RATE_LIMITED'});return;}
  const identity=guestIdentity(req,res);if(req.method==='POST'&&!identity.established){send(428,{error:'SESSION_REQUIRED'});return;}
  active++;let timer;try{
   let actor=null;const header=req.headers.authorization;
   if(header){if(!header.startsWith('Bearer ')||header.length>8200)throw Object.assign(Error(),{status:401});const user=await auth.verify(header.slice(7));if(!uuid.test(user?.id||'')||user.isAnonymous!==false)throw Object.assign(Error(),{status:401});actor=user.id;}
   const subject=actor?'m:'+actor:'g:'+identity.guest;
   if(!admit('subject:'+subject,90)){send(429,{error:'RATE_LIMITED'});return;}
   const common={actor,guest:identity.guest};
   if(req.method==='GET'){
    const action=url.searchParams.get('action')||'list';
    if(action==='challenge'){const target=url.searchParams.get('for');if(!['post','report'].includes(target))throw Error();send(200,challenge(subject,target));return;}
    const cursor=url.searchParams.get('cursor');let after=null;if(cursor){if(cursor.length>500)throw Error();after=JSON.parse(Buffer.from(cursor,'base64url'));if(!uuid.test(after.id)||!Number.isFinite(Date.parse(after.at)))throw Error();}
    let result;if(action==='admin'){if(!actor)throw Object.assign(Error(),{status:403});const report_id=url.searchParams.get('report');if(report_id&&!uuid.test(report_id))throw Error();result=await rpc('comments_admin',{actor,cursor_at:after?.at||null,cursor_id:after?.id||null,report_id:report_id||null});}
    else if(action==='list'){const tid=url.searchParams.get('tid');if(!tid||tid.length>160)throw Error();result=await rpc('comments_list',{...common,tid,cursor_at:after?.at||null,cursor_id:after?.id||null});}
    else throw Error();send(200,result);return;
   }
   const read=async()=>{let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>4096)throw Error();parts.push(part);}return JSON.parse(Buffer.concat(parts).toString('utf8'));};
   const input=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{req.destroy();reject(Error());},5000);})]);
   const op=input.action;let payload,operation;
   if(op==='post'){if(input.website)throw Object.assign(Error(),{code:'CONTENT_BLOCKED'});const check=inspectComment(input.body);if(!check.ok)throw Object.assign(Error(),{code:check.code});if(typeof input.tid!=='string'||input.tid.length>160)throw Error();payload={tid:input.tid,body:check.text};operation=verify(input.proof,subject,op);}
   else if(['report','delete'].includes(op)){if(!uuid.test(input.id))throw Error();payload={id:input.id};if(op==='report')operation=verify(input.proof,subject,op);}
   else if(['review','hide','restore','ban','unban'].includes(op)){if(!actor)throw Object.assign(Error(),{status:403});if(!uuid.test(input.report_id)||!uuid.test(input.request)||typeof input.note!=='string'||[...input.note].length>500)throw Error();payload={report_id:input.report_id,note:input.note};if(op==='review')payload.state=input.state;if(op==='ban'){if(!Number.isInteger(input.hours)||input.hours<1||input.hours>720)throw Error();payload.hours=input.hours;}operation={req:input.request,until:now()+300000};}
   else throw Error();
   const result=await rpc('comments_mutate',{...common,stats_caller:statsCaller(req),operation:op,req:operation?.req||null,valid_until:operation?new Date(operation.until).toISOString():null,payload});
   send(result?.error?429:200,result);
  }catch(error){send(error.status||400,{error:error.code||'COMMENT_REQUEST_FAILED'});}finally{clearTimeout(timer);active--;}
 };
}
