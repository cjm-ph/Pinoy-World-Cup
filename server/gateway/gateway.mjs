import {atStage, diagnostics} from './media-errors.mjs';
import { createHash } from 'node:crypto';

export const limits = Object.freeze({ input: 8 * 1024 * 1024, output: 430080, dimension: 1600 });
export function fail(message) { throw new Error(message); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function identity(user) {
  if (!user || !uuid.test(user.id) || user.isAnonymous !== false) fail('registered identity required');
  return user;
}
export function magic(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('buffer required');
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'webp';
  fail('unsupported bytes');
}
export async function readBounded(stream,{timeoutMs=15000,onBytes=()=>{}}={}) {
  const chunks = []; let total = 0;let timer;
  const iterator=stream?.[Symbol.asyncIterator]?.() ?? stream?.[Symbol.iterator]?.();
  if(!iterator)fail('binary body required');
  const deadline=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{stream.destroy?.();reject(Error('body timeout'));},timeoutMs);
  });
  try {
    while(true){
      let next;try{next=await Promise.race([iterator.next(),deadline]);}catch(error){if(error?.message==='body timeout')throw error;fail(['ECONNRESET','ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE','ERR_STREAM_DESTROYED'].includes(error?.code)?'upload body interrupted':'body stream failed');}
      const {value:chunk,done}=next;
      if(done)break;
      if (!(chunk instanceof Uint8Array)) fail('binary body required');
      total += chunk.byteLength;onBytes(total);
      if (total > limits.input) fail('input too large');
      chunks.push(Buffer.from(chunk));
    }
    if (total < 12) fail('input too short');
    return Buffer.concat(chunks, total);
  } finally {
    clearTimeout(timer);
    // Do not wait on a custom iterator stalled in next(). IncomingMessage.destroy
    // above cancels an actual HTTP body; no subsequent persistence can run on failure.
    try { Promise.resolve(iterator.return?.()).catch(()=>{}); } catch {}
  }
}
export function descriptor(out) {
  if (!out || !Buffer.isBuffer(out.bytes) || magic(out.bytes) !== 'webp' ||
      out.bytes.length < 12 || out.bytes.length > limits.output ||
      !Number.isInteger(out.width) || !Number.isInteger(out.height) ||
      out.width < 1 || out.height < 1 || out.width > 1600 || out.height > 1600) fail('invalid optimized output');
  return { sha: digest(out.bytes), bytes: out.bytes.length, w: out.width, h: out.height };
}
// All adapters are server-owned; none are browser inputs. No external calls at import time.
export function createGateway({ auth, db, storage, decoder, admission }) {
  let activeUploads=0; // Bounds unauthenticated receive plus all retained upload buffers.
  async function actor(token, tid,step=atStage) {
    const user = await step('AUTH_VERIFY',async()=>identity(await auth.verify(token))); // signature, issuer, audience, expiry required
    await step('ADMIN_CHECK',()=>db.assertAdminOwner(token, user.id, tid));
    return user;
  }
  return {
    async upload({ token, tid, requestId, assetId, body,onProgress=()=>{},trace }) {
      if (!uuid.test(requestId) || !/^asset_/.test(assetId) || !uuid.test(assetId.slice(6))) fail('invalid ids');
      if(activeUploads>=4)await atStage('ADMISSION',()=>fail('media admission limited'));
      activeUploads++;
      try {
      const started=performance.now(),timings={};
      let awaitingBody=true;
      const assertConnected=()=>{if(body?.aborted || (body?.destroyed && body?.complete===false) || trace?.disconnected?.())fail('upload body interrupted');};
      const step=async(stage,action)=>{trace?.stage(stage);onProgress(stage);const t=performance.now();try{return await atStage(stage,async()=>{
        if(awaitingBody)assertConnected();
        const result=await action();
        // Keep the acquired release callback even if the peer closed during admission.
        if(awaitingBody && stage!=='ADMISSION')assertConnected();
        return result;
      });}finally{const ms=performance.now()-t;trace?.stageEnd(stage,ms);timings[stage]=+((timings[stage]||0)+ms).toFixed(2);}};
      const input=await step('READ_BODY',()=>readBounded(body,{onBytes:total=>trace?.bytes(total)}));
      const user = await actor(token, tid,step);
      const release = await step('ADMISSION',()=>admission.acquire(user.id,{token,tid})); // shared rate + concurrency budget
      let reservationAttempted=false;
      try {
        await step('OPTIMIZED_VALIDATION',()=>magic(input));
        awaitingBody=false;
        const output = await step('IMAGE_DECODE',()=>decoder.decode(input,onProgress));
        const data = await step('OPTIMIZED_VALIDATION',()=>descriptor(output));
        // admin_media_begin revalidates the user JWT, administrator and tournament after decoding.
        reservationAttempted=true;
        const job = await step('RESERVE_ASSET',()=>db.begin(token, { requestId, tid, assetId, ...data }));
        if (!uuid.test(job.owner_id)) fail('invalid asset owner');
        const key = `${job.owner_id}/${assetId}.webp`;
        if (job.bucket !== 'pwc41-optimized' || job.object_key !== key || job.asset_id !== assetId) fail('unsafe upload target');
        // Adapter MUST use create-only semantics. On collision, hash actual stored bytes.
        const created = await step('STORAGE_CREATE',()=>storage.create(job.bucket, key, output.bytes, { upsert: false, contentType: 'image/webp' }));
        const persisted = await step('STORAGE_VERIFY',()=>storage.read(job.bucket, key));
        if (persisted.length !== data.bytes || digest(persisted) !== data.sha)
          await step('STORAGE_VERIFY',()=>fail(created ? 'persisted object mismatch' : 'object collision'));
        await step('ADMIN_CHECK',()=>db.assertAdminOwner(token,user.id,tid));
        // Wrapper rechecks admin + owner transactionally before existing finalize_upload.
        const result=await step('FINALIZE_ASSET',()=>db.finish({ actorId: user.id, requestId, assetId }));
        timings.image=output.timings;return {...result,original_bytes:input.length,optimized_bytes:data.bytes,width:data.w,height:data.h,timings};
      } catch(error) {
        try{if(reservationAttempted)await db.abandon?.({actorId:user.id,requestId,assetId});}
        catch(cleanup){console.warn(JSON.stringify({event:'media_reservation_release_failed',reference:trace?.reference,...diagnostics(cleanup)}));}
        throw error;
      } finally {const releaseStart=performance.now();trace?.event('release_session_start');try{await release();trace?.event('release_session_ok');}catch(error){console.warn(JSON.stringify({event:'media_cleanup_failed',reference:trace?.reference,...diagnostics(error),stage:'RELEASE_SESSION'}));}trace?.stageEnd('RELEASE_SESSION',performance.now()-releaseStart);timings.RELEASE_SESSION=+(performance.now()-releaseStart).toFixed(2);timings.totalServerMs=+(performance.now()-started).toFixed(2);timings.serverUptimeMs=Math.round(process.uptime()*1000);trace?.operationEnd(); }
      } finally {activeUploads--;}
    },
    async requestDeletion({ token, tid, assetId, requestId }) {
      if (!uuid.test(requestId) || !/^asset_/.test(assetId) || !uuid.test(assetId.slice(6))) fail('invalid ids');
      const user = await actor(token, tid);
      const release = await atStage('ADMISSION',()=>admission.acquire(user.id,{token,tid}));
      try { return await db.requestDeletion(token, { tid, assetId, requestId }); }
      finally { try{await release();}catch(error){console.warn(JSON.stringify({event:'media_cleanup_failed',...diagnostics(error),stage:'RELEASE_SESSION'}));} }
    },
    async replace({ token, tid, requestId, assetId, revisionId, expectedVersion, slot }) {
      if (!uuid.test(requestId) || !/^asset_/.test(assetId) || !uuid.test(assetId.slice(6)) ||
          !/^rev_/.test(revisionId) || !uuid.test(revisionId.slice(4)) ||
          !Number.isSafeInteger(expectedVersion) || expectedVersion<0 ||
          typeof slot!=='string' || !(slot==='cover' || /^participant_[0-9a-f-]{36}$/.test(slot))) fail('invalid replacement');
      const user=await actor(token,tid);const release=await atStage('ADMISSION',()=>admission.acquire(user.id,{token,tid}));
      try { return await atStage('REPLACE_DRAFT',()=>db.replace(token,{tid,requestId,assetId,revisionId,expectedVersion,slot})); }
      finally { try{await release();}catch(error){console.warn(JSON.stringify({event:'media_cleanup_failed',...diagnostics(error),stage:'RELEASE_SESSION'}));} }
    },
    async submit({token,tid,requestId,revisionId,expectedVersion,ack}) {
      if (!uuid.test(requestId) || !/^rev_/.test(revisionId) || !uuid.test(revisionId.slice(4)) ||
          !Number.isSafeInteger(expectedVersion) || expectedVersion<0 || ack!==true) fail('invalid submission');
      const user=await actor(token,tid);const release=await atStage('ADMISSION',()=>admission.acquire(user.id,{token,tid}));
      try { return await atStage('SUBMIT_REVIEW',()=>db.submit(token,{tid,requestId,revisionId,expectedVersion,ack})); }
      finally { try{await release();}catch(error){console.warn(JSON.stringify({event:'media_cleanup_failed',...diagnostics(error),stage:'RELEASE_SESSION'}));} }
    },
    async publicImage({ assetId, method = 'GET', range }) {
      if (!/^asset_/.test(assetId) || !uuid.test(assetId.slice(6))) fail('invalid asset');
      if (!['GET','HEAD'].includes(method) || range) fail('unsupported media request');
      const target = await db.publicTarget(assetId);
      if (target.bucket !== 'pwc41-optimized' || !/^[0-9a-f-]{36}\/asset_[0-9a-f-]{36}\.webp$/.test(target.object_key)) fail('unsafe media target');
      const bytes = await storage.read(target.bucket, target.object_key);
      if (bytes.length > 1048576 || digest(bytes) !== target.sha256 || magic(bytes) !== 'webp') fail('media integrity');
      const current = await db.publicTarget(assetId);
      if (current.object_key !== target.object_key || current.sha256 !== target.sha256) fail('media changed');
      return { headers: { 'Cache-Control':'no-store', 'Content-Type':'image/webp', 'X-Content-Type-Options':'nosniff' }, body: method === 'HEAD' ? null : bytes };
    }
  };
}
