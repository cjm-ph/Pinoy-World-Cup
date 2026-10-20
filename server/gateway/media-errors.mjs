// Only bounded diagnostic codes cross the HTTP/log boundary. Never raw error messages.
export const stages = new Set(['IMAGE_RESIZE','IMAGE_ENCODE','IMAGE_VALIDATE','AUTH_VERIFY','ADMIN_CHECK','ADMISSION','READ_BODY','IMAGE_DECODE','OPTIMIZED_VALIDATION','RESERVE_ASSET','STORAGE_CREATE','STORAGE_VERIFY','FINALIZE_ASSET','REPLACE_DRAFT','SUBMIT_REVIEW','RELEASE_SESSION','REQUEST']);
const reasons = new Map([
 ['ready permitted tournament asset required','ASSET_NOT_READY'],
 ['authentication rejected','SESSION_INVALID'],['invalid token','SESSION_INVALID'],
 ['authentication required','SESSION_INVALID'],
 ['admin required','ADMIN_REQUIRED'],['admin media disabled','RUNTIME_DISABLED'],
 ['admin editable tournament required','TOURNAMENT_UNAVAILABLE'],
 ['media admission limited','RATE_LIMITED'],['media quota exceeded','QUOTA_EXCEEDED'],
 ['media upload rate exceeded','RATE_LIMITED'],['media daily upload count exceeded','DAILY_COUNT_LIMIT'],
 ['media daily byte quota exceeded','DAILY_BYTE_QUOTA'],['media actor storage quota exceeded','ACTOR_STORAGE_QUOTA'],
 ['media tournament storage quota exceeded','TOURNAMENT_STORAGE_QUOTA'],['media project storage quota exceeded','PROJECT_STORAGE_QUOTA'],
 ['media reservation released','RESERVATION_RELEASED'],
 ['stale edit_version','STALE_VERSION'],['editable revision required','REVISION_NOT_EDITABLE'],
 ['replacement participant unavailable','SLOT_UNAVAILABLE'],
 ['verified ready asset required','ASSET_NOT_READY'],
 ['input too large','INPUT_TOO_LARGE'],['input too short','INVALID_IMAGE'],
 ['unsupported bytes','INVALID_IMAGE'],['image rejected','INVALID_IMAGE'],
 ['decoder timeout','DECODE_TIMEOUT'],['decoder capacity','RATE_LIMITED'],
 ['decoder unavailable or crashed','DECODER_UNAVAILABLE'],
 ['invalid optimized output','OPTIMIZED_IMAGE_INVALID'],
 ['body timeout','BODY_TIMEOUT'],['persisted object mismatch','STORAGE_MISMATCH'],
 ['object collision','STORAGE_MISMATCH'],['uploaded object missing','STORAGE_MISSING'],
 ['verified bytes mismatch','STORAGE_MISMATCH']
]);
export function reasonFor(message, status, code) {
 if(reasons.has(message))return reasons.get(message);
 if(code==='42702')return 'DATABASE_AMBIGUOUS';
 if(code==='PGRST202'||code==='42883')return 'RPC_UNAVAILABLE';
 if(status===401)return 'SESSION_INVALID';
 if(status===403||code==='42501')return 'ACCESS_DENIED';
 if(status===429)return 'RATE_LIMITED';
 return 'REQUEST_REJECTED';
}
export class MediaFailure extends Error {
 constructor(stage, cause) {
  super('media operation failed');
  this.stage=stages.has(stage)?stage:'REQUEST';
  this.reason=cause?.reason || reasonFor(cause?.message);
  if(['FINALIZE_ASSET','STORAGE_CREATE','STORAGE_VERIFY'].includes(this.stage)&&['SESSION_INVALID','ACCESS_DENIED'].includes(this.reason))this.reason='SERVER_ACCESS_DENIED';
  this.rpc=cause?.rpc;
  this.upstreamStatus=cause?.upstreamStatus;
  this.upstreamCode=cause?.upstreamCode;
 }
}
export async function atStage(stage, action) {
 try{return await action();}catch(error){throw error instanceof MediaFailure?error:new MediaFailure(stage,error);}
}
export function upstreamFailure({message,status,code,rpc}) {
 const error=new Error('upstream request rejected');
 error.reason=reasonFor(message,status,code);
 error.upstreamStatus=status;
 error.upstreamCode=/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code||'')?code:undefined;
 error.rpc=rpc;
 return error;
}
export function diagnostics(error) {
 const e=error instanceof MediaFailure?error:new MediaFailure('REQUEST',error);
 return {code:'MEDIA_REQUEST_FAILED',stage:e.stage,reason:e.reason,
  ...(e.rpc&&/^(admin_media_|public_media_target$)/.test(e.rpc)?{rpc:e.rpc}:{}),
  ...(Number.isInteger(e.upstreamStatus)?{upstream_status:e.upstreamStatus}:{}),
  ...(e.upstreamCode?{upstream_code:e.upstreamCode}:{})};
}
