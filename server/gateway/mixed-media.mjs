import {randomUUID,createHash} from 'node:crypto';
import {identity,readBounded} from './gateway.mjs';
import {createAnimationDecoder} from './animation-decoder.mjs';
import {createYouTubeMetadataReader} from './youtube-metadata.mjs';
import {youtubeSource,validateYouTubeClip} from './media-policy.mjs';
import {mixedStep,codedError,failureRecord,publicFailure,safeWorkerDiagnostics} from './mixed-media-diagnostics.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePattern=/^source_[0-9a-f-]{36}$/;
// All targets and source descriptors are server-owned. No arbitrary URL fetching.
export function createMixedMediaService({auth,db,admission,gateway,sources,decoder=createAnimationDecoder(),apiKey,fetchImpl=fetch}){
 let active=0;
 async function authorize(token,tid,recheck=false){const actor=await mixedStep('AUTH_VERIFY',async()=>identity(await auth.verify(token)));await mixedStep(recheck?'OWNER_RECHECK':'ADMIN_OWNER',()=>db.assertAdminOwner(token,actor.id,tid));return actor;}
 return {
  async register({token,tid,body,type,start='',end='',signal,onWorkerDiagnostics,onAnimationRead=()=>{}}){
   if(active>=1)await mixedStep('ADMISSION',()=>{throw codedError('CAPACITY','Mixed-media processing busy. Retry later.');});active++;
   const connected=()=>{if(signal?.aborted)throw codedError('REQUEST_ABORTED');};
   let release;try{
    connected();
    const actor=await authorize(token,tid);await mixedStep('MIXED_CAPABILITY',async()=>{if(await sources.capability(token,tid)!==true)throw codedError('CONTRACT_UNAVAILABLE');});
    release=await mixedStep('ADMISSION',()=>admission.acquire(actor.id,{token,tid}));
    connected();
    let bytes,poster,media,metadata,staticGif=false;
    if(type==='youtube'){
     const source=await mixedStep('YOUTUBE_METADATA',()=>{if(!apiKey)throw Error('YouTube metadata is not configured. Contact the operator.');return youtubeSource(body.url,start,end);});
     metadata=await mixedStep('YOUTUBE_METADATA',()=>createYouTubeMetadataReader({authorize:()=>authorize(token,tid),apiKey,fetchImpl})(source.url));
     media=await mixedStep('YOUTUBE_METADATA',()=>validateYouTubeClip(source,metadata.durationSeconds));
     poster=await mixedStep('YOUTUBE_POSTER',async()=>{const response=await fetchImpl(source.thumbnailUrl,{redirect:'error',signal:AbortSignal.timeout(5000)});
     if(!response.ok)throw Error('YouTube thumbnail unavailable');
     const chunks=[];let n=0;for await(const chunk of response.body){n+=chunk.length;if(n>2097152)throw Error('Thumbnail too large');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);});
    }else{
     const input=await mixedStep('READ_ANIMATION',()=>readBounded(body,{onBytes:n=>{if(n>10485760)throw codedError('INPUT_LIMIT','Animation must be at most 10 MiB');}}));
     await mixedStep('ANIMATION_DECODE',()=>{connected();onAnimationRead();});
     const decoded=await mixedStep('ANIMATION_DECODE',()=>decoder.decode(input,{signal,onDiagnostics:onWorkerDiagnostics}));connected();poster=Buffer.from(decoded.poster);
     if(decoded.kind==='static')staticGif=true;
     else{bytes=Buffer.from(decoded.bytes);media={type:'animation',frames:decoded.frames,width:decoded.width,height:decoded.height,delay:decoded.delay,loop:decoded.loop,durationMs:decoded.durationMs};}
    }
    // Release the decode lease before the unchanged static gateway takes its own lease.
    await mixedStep('RELEASE_ADMISSION',()=>release());release=null;
    connected();
    const result=await mixedStep('POSTER_UPLOAD',()=>gateway.upload({token,tid,requestId:randomUUID(),assetId:'asset_'+randomUUID(),body:[poster]}));
    if(staticGif)return result;
    connected();await authorize(token,tid,true);connected();
    const sourceId='source_'+randomUUID();
    const descriptor={...media,...(metadata?{videoId:metadata.videoId,url:media.url,durationSeconds:metadata.durationSeconds,title:metadata.title}:{}),source_id:sourceId,poster_asset_id:result.asset_id,...(bytes?{sha256:hash(bytes),byteSize:bytes.length}:{})};
    const reservation=await mixedStep('MIXED_RESERVE',()=>sources.reserve({token,tid,actor:actor.id,sourceId,descriptor}));
    if(bytes){await mixedStep('MIXED_RESERVE',()=>{if(reservation?.object_key!==actor.id+'/'+sourceId+'.webp')throw codedError('CONTRACT_UNAVAILABLE');});await mixedStep('ANIMATION_STORAGE_CREATE',()=>sources.create(reservation.object_key,bytes));await mixedStep('ANIMATION_STORAGE_VERIFY',async()=>{const stored=await sources.read(reservation.object_key);if(hash(stored)!==descriptor.sha256)throw codedError('INTEGRITY_MISMATCH');});}
    connected();await authorize(token,tid,true);connected();await mixedStep('MIXED_FINISH',async()=>{if(await sources.finish({actor:actor.id,sourceId})!==true)throw codedError('CONTRACT_UNAVAILABLE');});
    return {...result,media:descriptor,...(metadata?{title:metadata.title}:{})};
   }finally{if(release)await release().catch(()=>{});active--;}
  },
  async publicAnimation(sourceId){
   if(!sourcePattern.test(sourceId||''))throw Error('Invalid animation reference');
   const target=await mixedStep('PUBLIC_AUTHORITY',()=>sources.publicTarget(sourceId));const bytes=await mixedStep('ANIMATION_STORAGE_VERIFY',()=>sources.read(target.object_key));
   if(bytes.length!==target.byte_size||hash(bytes)!==target.sha256)throw Error('Animation integrity failed');
   const current=await mixedStep('PUBLIC_AUTHORITY',()=>sources.publicTarget(sourceId));
   if(current.object_key!==target.object_key||current.sha256!==target.sha256||current.byte_size!==target.byte_size)throw Error('Animation publication changed');
   return bytes;
  }
 };
}
export function createMixedMediaHttp(service,{log=entry=>console.error(JSON.stringify(entry))}={}){return async(req,res,url)=>{
 const reference=randomUUID(),started=performance.now();let workerDiagnostics={};
 const animation=url.pathname==='/admin/media/animation'&&req.method==='POST';
 const controller=new AbortController();const originalSocketTimeout=req.socket?.timeout;
 const disconnected=()=>{if(animation&&!res.writableFinished)controller.abort();};
 const aborted=()=>controller.abort();
 const restore=()=>{if(animation&&req.socket&&!req.socket.destroyed&&Number.isFinite(originalSocketTimeout))req.socket.setTimeout(originalSocketTimeout);};
 if(animation){req.once?.('aborted',aborted);res.once?.('close',disconnected);res.once?.('finish',restore);if(req.aborted||res.destroyed)controller.abort();}

 try{
  if(url.pathname==='/animated-media'&&['GET','HEAD'].includes(req.method)){
   if(req.headers.range)throw Error('Range not supported');
   const bytes=await service.publicAnimation(url.searchParams.get('source'));res.writeHead(200,{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);return;
  }
  await mixedStep('HTTP_VALIDATE',()=>{if(!['/admin/media/youtube','/admin/media/animation'].includes(url.pathname)||req.method!=='POST'||!req.headers.authorization?.startsWith('Bearer '))throw Error('Administrator authentication required');
  // Cross-origin authenticated mutations are forbidden; no CORS opt-in.
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('Same-origin request required');});
  const token=req.headers.authorization.slice(7),tid=url.searchParams.get('tid');let body=req;
  const youtube=url.pathname==='/admin/media/youtube';
  if(youtube)body=await mixedStep('HTTP_VALIDATE',async()=>{let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>4096)throw Error('Invalid YouTube request');}return JSON.parse(raw);});
  const result=await service.register({token,tid,body,type:youtube?'youtube':'animation',start:body.startSeconds??'',end:body.endSeconds??'',
   ...(animation?{signal:controller.signal,onWorkerDiagnostics:value=>{workerDiagnostics=safeWorkerDiagnostics(value);},
    // Applied only after bounded body receive. This is the actual Render socket too:
    // render-server forwards the same req/res via media.emit('request',...).
    onAnimationRead:()=>req.setTimeout?.(90000)}:{})});
  if(animation&&controller.signal.aborted)throw codedError('REQUEST_ABORTED');
  if(animation)try{log({event:'mixed_media_animation_completed',reference,stage:'ANIMATION_DECODE',code:'OK',...workerDiagnostics,elapsed_ms:Math.max(0,Math.round(performance.now()-started))});}catch{}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));
 }catch(error){try{log({...failureRecord(error,reference,performance.now()-started),...workerDiagnostics});}catch{}if(res.destroyed)return;res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store','X-PWC-Media-Reference':reference});res.end(JSON.stringify({error:publicFailure(error),reference}));}
 finally{if(animation){req.removeListener?.('aborted',aborted);res.removeListener?.('close',disconnected);restore();}}
};}
