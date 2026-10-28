import {digest,magic} from './gateway.mjs';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function createStatisticsAdapters({url,publishableKey,serviceKey,fetchImpl=fetch}){
 if(url!=='https://cmnomqsurdwhdbjgnsvw.supabase.co'||!publishableKey||!serviceKey)throw Error('Staging required');
 return async(name,args,publicRead=false)=>{
  const key=publicRead?publishableKey:serviceKey;
  let response;try{response=await fetchImpl(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:key,...(publicRead?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json','Content-Profile':'pwc41_api'},body:JSON.stringify(args)});}catch{throw Object.assign(Error('Statistics unavailable'),{httpStatus:502});}
  if(!response.ok)throw Object.assign(Error('Statistics unavailable'),{httpStatus:response.status>=500?502:response.status===429?429:400});return response.json();
 };
}
export function createStatisticsHttp({rpc,secret,auth,memberBadges=false,enabled=false,allowedOrigin='https://pinoy-worldcup-staging.onrender.com',now=Date.now,imageStore}){
 if(!secret)throw Error('Server signing secret required');
 const sign=value=>createHmac('sha256',secret).update('play-statistics-v1:'+value).digest('hex');
 const buckets=new Map();let active=0;
 return async(req,res,url)=>{
  const send=(status,data)=>{if(!res.destroyed&&!res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}};
  if(!enabled){send(503,{error:'Statistics are not connected yet.'});return;}
  let visitor;const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pwc_stats_guest='))?.slice(16);
  if(cookie){const [id,sig]=cookie.split('.'),expected=sign(id||'');if(uuid.test(id||'')&&/^[a-f0-9]{64}$/.test(sig||'')&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))visitor=id;}
  const existingVisitor=!!visitor;
  if(!visitor){visitor=randomUUID();res.setHeader('Set-Cookie',`pwc_stats_guest=${visitor}.${sign(visitor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);}
  const caller=sign('caller:'+visitor),at=now(),entry=buckets.get(caller);
  if(!entry||entry.until<=at)buckets.set(caller,{count:1,until:at+60000});else entry.count++;
  if(buckets.size>10000)for(const [key,value]of buckets){if(value.until<=at)buckets.delete(key);}
  if(active>=16||buckets.size>10000||buckets.get(caller).count>120){send(429,{error:'Statistics rate limited.'});return;}
  if(req.method==='POST'&&req.headers.origin!==allowedOrigin){send(403,{error:'Origin rejected.'});return;}
  if(req.method==='POST'&&!existingVisitor){send(428,{error:'Establish a statistics session first.'});return;}
  if(!['GET','POST'].includes(req.method)&&!(req.method==='HEAD'&&url.pathname==='/play-statistics/media')){send(405,{error:'Method rejected.'});return;}
  active++;let timer;
  try{
   if(['GET','HEAD'].includes(req.method)){
    if(url.pathname==='/play-statistics/media'){
     const gid=url.searchParams.get('game'),aid=url.searchParams.get('asset');if([...url.searchParams.keys()].some(k=>!['game','asset'].includes(k)||url.searchParams.getAll(k).length!==1)||!existingVisitor||!imageStore||!uuid.test(gid||'')||!/^asset_[0-9a-f-]{36}$/.test(aid||'')||req.headers.range)throw Error('Game media unavailable');
     const args={caller,gid,aid},target=await rpc('play_media_target_v46',args);const bytes=await imageStore.read(target.bucket,target.object_key);
     if(bytes.length!==Number(target.byte_size)||digest(bytes)!==target.sha256||magic(bytes)!=='webp')throw Error('Integrity failure');const current=await rpc('play_media_target_v46',args);if(current.bucket!==target.bucket||current.object_key!==target.object_key||current.sha256!==target.sha256||String(current.byte_size)!==String(target.byte_size))throw Error('Media authority changed');
     res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);return;
    }
    if(url.pathname==='/play-statistics/session'){send(200,{enabled:true});return;}
    if(url.pathname==='/play-statistics/homepage'){
     const sort_mode=url.searchParams.get('sort')??'popular',period=url.searchParams.get('period')??'month';
     const limit=url.searchParams.get('limit')??'24',offset=url.searchParams.get('offset')??'0';
     if([...url.searchParams.keys()].some(k=>!['sort','period','limit','offset'].includes(k)||url.searchParams.getAll(k).length!==1)
      ||!['popular','latest'].includes(sort_mode)||!['today','week','month'].includes(period)
      ||!/^\d{1,5}$/.test(limit)||!/^\d{1,5}$/.test(offset)||Number(limit)<1||Number(limit)>50||Number(offset)>10000)throw Error('Invalid homepage parameters');
     send(200,await rpc('homepage_read',{sort_mode,period,page_size:Number(limit),page_offset:Number(offset)},true));return;
    }
    const tid=url.searchParams.get('tid');if(!tid||tid.length>160)throw Error('Invalid tournament');
    send(200,await rpc('play_statistics_public',{tid},true));return;
   }
   const read=async()=>{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('Too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
   const b=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{req.destroy();reject(Error('Body timeout'));},5000);})]);
   let actor=null;
   if(memberBadges&&req.headers.authorization?.startsWith('Bearer ')&&req.headers.authorization.length<=8200){
    try{const user=await auth.verify(req.headers.authorization.slice(7));if(uuid.test(user?.id||'')&&user.isAnonymous===false)actor=user.id;}catch{/* Invalid auth grants no badge; existing metrics remain available. */}
   }
   if(url.pathname==='/play-statistics/start'){
    if(!uuid.test(b.request)||typeof b.tid!=='string'||b.tid.length>160||typeof b.rid!=='string'||b.rid.length>160||!Array.isArray(b.lineup)||![4,8,16,32].includes(b.lineup.length)||b.lineup.some(x=>typeof x!=='string'||x.length>160))throw Error('Invalid start');
    send(200,await rpc(memberBadges?'play_statistics_member_start':'play_statistics_start',{caller,req:b.request,tid:b.tid,rid:b.rid,lineup:b.lineup,...(memberBadges?{actor}:{})}));
   }else if(url.pathname==='/play-statistics/events'){
    if(!uuid.test(b.game)||!Array.isArray(b.events)||!b.events.length||b.events.length>31||b.events.some(e=>!Number.isInteger(e.seq)||e.seq<1||e.seq>31||typeof e.winner!=='string'||e.winner.length>160))throw Error('Invalid events');
    send(200,await rpc(memberBadges?'play_statistics_member_events':'play_statistics_events',{caller,gid:b.game,events:b.events,...(memberBadges?{actor}:{})}));
   }else send(404,{error:'Not found'});
  }catch(error){send(error.httpStatus||400,{error:'Statistics request was not accepted. Gameplay is unaffected.'});}
  finally{active--;clearTimeout(timer);}
 };
}
