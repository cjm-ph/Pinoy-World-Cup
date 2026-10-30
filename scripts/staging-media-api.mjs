import {giphyStillUrl} from './giphy-preview.mjs';
import {classifyMediaUrl} from './media-url-policy.mjs';
import {validateCreatorFile} from './creator-page-model.mjs';
export const STAGING_URL = 'https://cmnomqsurdwhdbjgnsvw.supabase.co';
const stageNames={IMAGE_RESIZE:'Image orientation and resize',IMAGE_ENCODE:'Image compression',IMAGE_VALIDATE:'Image integrity validation',AUTH_VERIFY:'Session verification',ADMIN_CHECK:'Administrator permission check',ADMISSION:'Upload session admission',READ_BODY:'Image request body',IMAGE_DECODE:'Image decoding',OPTIMIZED_VALIDATION:'Optimized image validation',RESERVE_ASSET:'Upload reservation (admin_media_begin)',STORAGE_CREATE:'Storage creation',STORAGE_VERIFY:'Stored image verification',FINALIZE_ASSET:'Upload finalization (admin_media_finish)',REPLACE_DRAFT:'Draft replacement (admin_media_replace)',SUBMIT_REVIEW:'Review submission (admin_media_submit)',REQUEST:'Request validation'};
const reasonNames={UNSUPPORTED_FILE_TYPE:'Unsupported file type. Use the media URL field for YouTube or GIPHY; Imgur is not enabled.',INVALID_BODY:'The upload body must contain raw image bytes.',BODY_INTERRUPTED:'The image request body was interrupted before it could be read.',BODY_STREAM_FAILED:'The server could not read the image request stream.',SERVER_ACCESS_DENIED:'The server credential or service permissions were rejected.',SESSION_INVALID:'Sign in again.',ADMIN_REQUIRED:'Administrator access is required.',RUNTIME_DISABLED:'Photo management is disabled.',TOURNAMENT_UNAVAILABLE:'This tournament is not editable.',RATE_LIMITED:'Too many upload attempts. Wait and try again.',QUOTA_EXCEEDED:'The legacy upload attempt or storage limit has been reached. Check storage diagnostics.',DAILY_COUNT_LIMIT:'The daily upload attempt limit has been reached.',DAILY_BYTE_QUOTA:'The daily optimized upload byte limit has been reached.',ACTOR_STORAGE_QUOTA:'Your actual stored photos and pending reservations have reached the administrator storage limit.',TOURNAMENT_STORAGE_QUOTA:'This tournament has reached its storage limit.',PROJECT_STORAGE_QUOTA:'The Staging optimized photo bucket has reached its storage limit.',RESERVATION_RELEASED:'This failed reservation was released. Select the photo again.',STALE_VERSION:'The draft changed. Refresh before replacing the photo.',REVISION_NOT_EDITABLE:'This revision cannot be edited.',SLOT_UNAVAILABLE:'The selected candidate is unavailable.',ASSET_NOT_READY:'The uploaded photo is not ready.',INPUT_TOO_LARGE:'The input exceeds 15 MiB.',INVALID_IMAGE:'The image is invalid or unsupported.',DECODE_TIMEOUT:'Image decoding timed out.',DECODER_UNAVAILABLE:'The server image decoder is unavailable.',OPTIMIZED_IMAGE_INVALID:'The optimized image exceeds the allowed output constraints.',BODY_TIMEOUT:'The upload request timed out.',STORAGE_MISMATCH:'The stored image did not match the verified bytes.',STORAGE_MISSING:'The uploaded Storage object is missing.',DATABASE_AMBIGUOUS:'The database function has an ambiguous column reference.',RPC_UNAVAILABLE:'The required database function is unavailable.',ACCESS_DENIED:'The upstream service denied access.',REQUEST_REJECTED:'The server rejected this operation.'};
export function mediaFailureMessage(response,diagnostic) {
  if(diagnostic?.code==='MEDIA_REQUEST_FAILED'&&stageNames[diagnostic.stage]&&reasonNames[diagnostic.reason]) {
    const reference=/^[0-9a-f-]{36}$/.test(diagnostic.reference||'')?diagnostic.reference:'unavailable';
    return `Photo request failed at ${stageNames[diagnostic.stage]}: ${reasonNames[diagnostic.reason]} Reference: ${reference}.`;
  }
  return `Media request rejected (HTTP ${Number(response.status)||0}). Detailed diagnostics require the updated Staging gateway.`;
}
export function adminReadError(error) {
  const code=error?.code;
  const message=code==='PT401' || code==='PGRST301' || code==='PGRST303'
    ? 'Your session has expired. Sign in again.'
    : code==='PT403' || code==='42501' ? 'Administrator access is required. Check account provisioning and membership.'
    : code==='PT423' ? 'Staging photo management is disabled. Contact the site operator.'
    : 'Administrator data is unavailable. Contact the site operator.';
  return Error(message);
}
export function createMediaApi({ client, gatewayOrigin, pageOrigin, fetchImpl = fetch, uuid = () => crypto.randomUUID(),mp4ContractsEnabled=false,giphyContractsEnabled=false,combinedMediaContractsEnabled=false }) {
  if (gatewayOrigin !== pageOrigin || !/^https?:\/\//.test(pageOrigin)) throw Error('Use the same-origin Staging media gateway.');
  const rpc = async (name, args) => {
    const started=performance.now();const { data, error } = await client.schema('pwc41_api').rpc(name, args);
    globalThis.PWCAdminPerformance??={};const trace=globalThis.PWCAdminPerformance.requests??=[];trace.push({operation:name,ms:+(performance.now()-started).toFixed(2),ok:!error});if(trace.length>100)trace.shift();
    if (error) {
      const publicationErrors={'required media missing, technically unavailable or rights revoked':'Required media is missing, technically unavailable or blocked by a rights decision.','administrator creator required':'Only the administrator creator can publish directly.','current administrator draft/stale edit_version':'The draft changed. Refresh before publishing.','requested roster/names/category incomplete':'Complete the selected candidate count, names and category before publishing.','approval/media rights or technical review required':'Photos still need technical verification or usage rights before publication.','save a new draft before direct publication':'Save a new draft before publishing.','self review forbidden':'You cannot review your own submission.','independent reviewer/submitted revision required':'Only a different administrator can review a submitted member revision.'};
      if(['admin_publish_own','admin_review_publish'].includes(name)&&publicationErrors[error.message])throw Error(publicationErrors[error.message]);
      if(['admin_publish_own','admin_review_publish'].includes(name)&&['PGRST202','42883'].includes(error.code))throw Error('Publication functions are not installed. Apply the approved Staging publication SQL first.');
      if(['admin_media_storage_diagnostics','admin_media_release_expired'].includes(name)&&['PGRST202','42883'].includes(error.code))throw Error('Storage recovery functions are not installed. Apply the approved Staging quota SQL first.');
      if(['admin_media_apply_photo','admin_media_photo_draft','admin_media_save_draft'].includes(name)&&['PGRST202','42883'].includes(error.code))throw Error('Photo-card database functions are not installed. Apply the approved Staging SQL before using this feature.');
      // Only known diagnostic codes may leave this boundary; never message/details/hint.
      const code = /^(PGRST[0-9]{3}|[0-9]{5})$/.test(error.code || '') ? error.code : 'RPC_FAILED';
      throw Error(`Request rejected: ${name}${name === 'list_published' ? ' ['+code+']' : ''}. Check your permissions and current revision.`);
    }
    return data;
  };
  const adminCatalog = async () => {
    let response;
    try { response=await client.schema('pwc41_api').rpc('admin_media_catalog',{}); }
    catch { throw adminReadError(); }
    if(response.error) throw adminReadError(response.error);
    if(!Array.isArray(response.data) || response.data.some(t=>!t || typeof t.id!=='string' || !Array.isArray(t.approved_revisions))) throw adminReadError();
    return response.data;
  };
  async function mutation(path, args, body,onProgress) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Error('Sign in to continue.');
    const url = new URL(path, gatewayOrigin);
    for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
    if(onProgress&&typeof XMLHttpRequest!=='undefined')return uploadStream(url,body,data.session.access_token,onProgress);
    const response = await fetchImpl(url, { method:'POST', redirect:'error', cache:'no-store',
      headers:{ Authorization:`Bearer ${data.session.access_token}` }, body });
    if (!response.ok) {
      let diagnostic,message;try{const failure=await response.json();diagnostic=failure.diagnostic;message=failure.error;}catch{}
      if(['/admin/media/youtube','/admin/media/animation'].includes(path))throw Error(message||'Mixed media unavailable. Check installed contracts.');
      throw Error(mediaFailureMessage(response,diagnostic));
    }
    const result=await response.json();
    if(path==='/admin/media/upload'&&(!result?.asset_id||result.technical_state!=='ready'))throw Error('Upload ended without a finalized result. Existing photo is unchanged.');
    return result;
  }
  function uploadStream(url,body,token,onProgress){return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),started=performance.now();let result,uploadMs,ttfbMs,lastStage='REQUEST';
    const reference=new URL(url).searchParams.get('request'),events=[];globalThis.PWCAdminPerformance??={};const traces=globalThis.PWCAdminPerformance.uploadTraces??=[];const trace={reference,events,timeoutMs:120000,bodyBytes:body?.size??body?.byteLength??null};traces.push(trace);if(traces.length>10)traces.shift();
    const record=event=>{if(events.length<40)events.push({event,ms:+(performance.now()-started).toFixed(2),status:xhr.status||0,stage:lastStage});};
    const rejected=error=>{record('rejected');error.message+=` Trace reference: ${reference}.`;reject(error);};
    xhr.open('POST',url);xhr.timeout=120000;xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Accept','application/json');
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(`Sending photo: ${Math.round(e.loaded/e.total*100)}%.`);};
    xhr.upload.onload=()=>{record('body_sent');uploadMs=performance.now()-started;onProgress('Waiting for Staging server response...');};
    xhr.onreadystatechange=()=>{if(xhr.readyState===2)ttfbMs=performance.now()-started;};
    xhr.onerror=()=>{record('network_error');rejected(Error('Upload connection failed. Existing photo is unchanged.'));};xhr.ontimeout=()=>{record('client_timeout');rejected(Error('Upload connection failed. Existing photo is unchanged.'));};xhr.onabort=()=>{record('client_abort');rejected(Error('Upload connection failed. Existing photo is unchanged.'));};
    xhr.onload=()=>{record('response_end');try{result=JSON.parse(xhr.responseText);}catch{rejected(Error('Upload response was incomplete. Existing photo is unchanged.'));return;}
     if(xhr.status<200||xhr.status>=300||result?.diagnostic){rejected(Error(mediaFailureMessage({status:xhr.status},result?.diagnostic)));return;}
     if(!result?.asset_id||result.technical_state!=='ready'){rejected(Error('Upload ended without a finalized result. Existing photo is unchanged.'));return;}record('server_result');
     const timings={...(result.timings||{}),requestMs:+(performance.now()-started).toFixed(2),uploadTransferMs:uploadMs,ttfbMs};resolve({...result,timings});};
    record('send');onProgress('Sending photo...');xhr.send(body);
   });}
  return {
    rpc, adminCatalog,
    publishOwn:(t,rid)=>rpc('admin_publish_own',{req:uuid(),tid:t.id,rid,expected:t.edit_version}),
    reviewMediaStatus:(t,rid)=>rpc('admin_submitted_media_v45',{tid:t.id,rid}),
    reviewPublish:(t,rid)=>rpc('admin_review_publish',{req:uuid(),tid:t.id,rid,expected:t.edit_version}),
    applyPhoto:(t,aid,slot,display_settings,note='')=>rpc('admin_media_apply_photo',{req:uuid(),tid:t.id,aid,new_rid:'rev_'+uuid(),expected:t.edit_version,slot,display_settings,note}),
    photoDraft: (t,aid,slot,display_settings)=>rpc('admin_media_photo_draft',{req:uuid(),tid:t.id,aid,new_rid:'rev_'+uuid(),expected:t.edit_version,slot,display_settings}),
    authorize: tid => rpc('admin_media_assert_owner', { tid }),
    published: async () => {const r=await client.schema('pwc41_api').rpc('list_published_descriptions_v1',{});if(!r.error)return r.data;if(['PGRST202','42883'].includes(r.error.code))return rpc('list_published',{});throw Error('Published descriptions unavailable.');},
    revision: async rid => {
      if(combinedMediaContractsEnabled){
        if(!giphyContractsEnabled||!mp4ContractsEnabled)throw Error('Combined reader requires both media contracts.');
        const next=await client.schema('pwc41_api').rpc('get_revision_media_all_v23',{rid});
        if(next.error||!Array.isArray(next.data?.participants))throw Error('Combined media reader unavailable. Keep the current draft.');
        return next.data;
      }
      // The separate readers cannot compose a single revision without losing sidecars.
      if(giphyContractsEnabled&&mp4ContractsEnabled)throw Error('Combined GIPHY/MP4 reader is not qualified. Keep the current draft.');
      if(giphyContractsEnabled){const next=await client.schema('pwc41_api').rpc('get_revision_giphy_v1',{rid});if(next.error)throw Error('GIPHY contracts unavailable. Keep the current draft.');if(!Array.isArray(next.data?.participants))throw Error('Invalid GIPHY revision');return next.data;}

      if(mp4ContractsEnabled){const next=await client.schema('pwc41_api').rpc('get_revision_media_mp4_v1',{rid});
        if(!next.error){if(!Array.isArray(next.data?.participants))throw Error('Invalid MP4 revision response');return next.data;}
        if(['PGRST202','42883'].includes(next.error.code))throw Error('MP4 contracts are unavailable. Keep the current draft.');
        throw adminReadError(next.error);
      }
      const response=await client.schema('pwc41_api').rpc('get_revision_media',{rid});
      if(response.error&&['PGRST202','42883'].includes(response.error.code))return rpc('get_revision',{rid});
      if(response.error||!Array.isArray(response.data?.participants))throw Error('Mixed revision lookup failed. Refresh or contact the operator.');
      return response.data;
    },
    youtube:async(tid,url,start='',end='')=>{const classified=classifyMediaUrl(url,start,end);if(classified.provider==='giphy')throw Error('Use the GIPHY draft URL workflow.');if(classified.provider!=='youtube')throw Error('Imgur registration is not enabled.');const source=classified.source;if(source.playbackMode==='shorts'){const probe=await rpc('youtube_shorts_capability_v29',{});if(probe!==true)throw Error('Shorts server contract is unavailable.');}return mutation('/admin/media/youtube',{tid},JSON.stringify(source));},
    upload: async(tid,file,onProgress)=>{
      await validateCreatorFile(file);
      return mutation('/admin/media/upload',{tid,request:uuid(),asset:'asset_'+uuid()},file,onProgress);
    },
    replace: (t, asset, slot) => mutation('/admin/media/replace', { tid:t.id, asset, slot,
      request:uuid(), revision:'rev_'+uuid(), expected:t.edit_version }),
    submit: (t, rid) => mutation('/admin/media/submit', { tid:t.id, request:uuid(), revision:rid, expected:t.edit_version, ack:true }),
    rights: (aid, evidence) => rpc('review_media', { req:uuid(), aid, status:'verified', evidence }),
    videoRights: (vid,verdict,note) => {
      if(!mp4ContractsEnabled||!/^video_[a-f0-9-]{36}$/.test(vid||'')||!['verified','rejected'].includes(verdict))throw Error('MP4 contracts are not enabled.');
      return rpc('mp4_review_v1',{req:uuid(),vid,verdict,note});
    },
    transition: (name, t, rid) => {
      if (!['approve','publish','rollback','unpublish'].includes(name)) throw Error('Unsupported action.');
      return rpc(name, { req:uuid(), tid:t.id, rid, expected:t.edit_version });
    },
    mediaUrl: aid => {
      if (!/^asset_[0-9a-f-]{36}$/.test(aid)) throw Error('Invalid image reference.');
      return gatewayOrigin+'/media?asset='+encodeURIComponent(aid);
    },
    videoUrl: (id,{preview=false}={}) => {
      if(!mp4ContractsEnabled||!/^video_[a-f0-9-]{36}$/.test(id||''))throw Error('MP4 contracts are not enabled.');
      return gatewayOrigin+(preview?'/video-media/preview':'/video-media')+'?video='+encodeURIComponent(id);
    }
  };
}
// Work on copies: preserve the previous local image and never overwrite Storage objects.
export function publishedItem(p, previous, mediaUrl) {
  const fallback = previous?._localPhoto || previous?.img || '';
  return { ...previous, id:p.id, person_id:p.entity_id, n:p.name, e:p.emoji || '',
    description:p.description, active:p.active, media:p.media?structuredClone(p.media):undefined, _localPhoto:undefined,
    img:giphyStillUrl(p.media)||(p.image_asset_id ? mediaUrl(p.image_asset_id) : fallback), _imageFallback:fallback };
}
