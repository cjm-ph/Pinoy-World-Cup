import {randomUUID,createHash} from 'node:crypto';
import {identity,readBounded} from './gateway.mjs';
import {createAnimationDecoder} from './animation-decoder.mjs';
import {createYouTubeMetadataReader} from './youtube-metadata.mjs';
import {youtubeSource,validateYouTubeClip} from './media-policy.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePattern=/^source_[0-9a-f-]{36}$/;
// All targets and source descriptors are server-owned. No arbitrary URL fetching.
export function createMixedMediaService({auth,db,admission,gateway,sources,decoder=createAnimationDecoder(),apiKey,fetchImpl=fetch}){
 let active=0;
 async function authorize(token,tid){const actor=identity(await auth.verify(token));await db.assertAdminOwner(token,actor.id,tid);return actor;}
 return {
  async register({token,tid,body,type,start='',end=''}){
   if(active>=1)throw Error('Mixed-media processing busy. Retry later.');active++;
   let release;try{
    const actor=await authorize(token,tid);if(await sources.capability(token,tid)!==true)throw Error('Mixed-media contract unavailable');
    release=await admission.acquire(actor.id,{token,tid});
    let bytes,poster,media,metadata;
    if(type==='youtube'){
     if(!apiKey)throw Error('YouTube metadata is not configured. Contact the operator.');
     const source=youtubeSource(body.url,start,end);
     metadata=await createYouTubeMetadataReader({authorize:()=>authorize(token,tid),apiKey,fetchImpl})(source.url);
     media=validateYouTubeClip(source,metadata.durationSeconds);
     const response=await fetchImpl(source.thumbnailUrl,{redirect:'error',signal:AbortSignal.timeout(5000)});
     if(!response.ok)throw Error('YouTube thumbnail unavailable');
     const chunks=[];let n=0;for await(const chunk of response.body){n+=chunk.length;if(n>2097152)throw Error('Thumbnail too large');chunks.push(Buffer.from(chunk));}poster=Buffer.concat(chunks);
    }else{
     const input=await readBounded(body,{onBytes:n=>{if(n>10485760)throw Error('Animation must be at most 10 MiB');}});
     const decoded=await decoder.decode(input);bytes=Buffer.from(decoded.bytes);poster=Buffer.from(decoded.poster);
     media={type:'animation',frames:decoded.frames,width:decoded.width,height:decoded.height,delay:decoded.delay,loop:decoded.loop,durationMs:decoded.durationMs};
    }
    // Release the decode lease before the unchanged static gateway takes its own lease.
    await release();release=null;
    const result=await gateway.upload({token,tid,requestId:randomUUID(),assetId:'asset_'+randomUUID(),body:[poster]});
    await authorize(token,tid);
    const sourceId='source_'+randomUUID();
    const descriptor={...media,...(metadata?{videoId:metadata.videoId,url:media.url,durationSeconds:metadata.durationSeconds,title:metadata.title}:{}),source_id:sourceId,poster_asset_id:result.asset_id,...(bytes?{sha256:hash(bytes),byteSize:bytes.length}:{})};
    const reservation=await sources.reserve({token,tid,actor:actor.id,sourceId,descriptor});
    if(bytes){if(reservation?.object_key!==actor.id+'/'+sourceId+'.webp')throw Error('Animation reservation identity mismatch');await sources.create(reservation.object_key,bytes);const stored=await sources.read(reservation.object_key);if(hash(stored)!==descriptor.sha256)throw Error('Animation Storage verification failed');}
    await authorize(token,tid);if(await sources.finish({actor:actor.id,sourceId})!==true)throw Error('Source finalization was not confirmed');
    return {...result,media:descriptor,...(metadata?{title:metadata.title}:{})};
   }finally{if(release)await release().catch(()=>{});active--;}
  },
  async publicAnimation(sourceId){
   if(!sourcePattern.test(sourceId||''))throw Error('Invalid animation reference');
   const target=await sources.publicTarget(sourceId);const bytes=await sources.read(target.object_key);
   if(bytes.length!==target.byte_size||hash(bytes)!==target.sha256)throw Error('Animation integrity failed');
   const current=await sources.publicTarget(sourceId);
   if(current.object_key!==target.object_key||current.sha256!==target.sha256||current.byte_size!==target.byte_size)throw Error('Animation publication changed');
   return bytes;
  }
 };
}
export function createMixedMediaHttp(service){return async(req,res,url)=>{
 try{
  if(url.pathname==='/animated-media'&&['GET','HEAD'].includes(req.method)){
   if(req.headers.range)throw Error('Range not supported');
   const bytes=await service.publicAnimation(url.searchParams.get('source'));res.writeHead(200,{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
  }
  if(!['/admin/media/youtube','/admin/media/animation'].includes(url.pathname)||req.method!=='POST'||!req.headers.authorization?.startsWith('Bearer '))throw Error('Administrator authentication required');
  // Cross-origin authenticated mutations are forbidden; no CORS opt-in.
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('Same-origin request required');
  const token=req.headers.authorization.slice(7),tid=url.searchParams.get('tid');let body=req;
  const youtube=url.pathname==='/admin/media/youtube';
  if(youtube){let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>4096)throw Error('Invalid YouTube request');}body=JSON.parse(raw);}
  const result=await service.register({token,tid,body,type:youtube?'youtube':'animation',start:body.startSeconds??'',end:body.endSeconds??''});
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
 }catch(error){const safe=['YouTube metadata is not configured. Contact the operator.','Mixed-media processing busy. Retry later.','Animation must be at most 10 MiB'];res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:safe.includes(error.message)?error.message:'Mixed media unavailable. Check permissions, media limits and the installed mixed-media contract.'}));}
};}
