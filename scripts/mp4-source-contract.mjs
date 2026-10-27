import {classifyMediaUrl} from './media-url-policy.mjs';
// Provenance only: URL acceptance never grants permission or starts collection.
export function imgurProvenance(input) {
 const url=classifyMediaUrl(input);
 if(url.provider!=='imgur')throw Error('Unsupported MP4 source URL');
 return Object.freeze({provider:'imgur',original_url:url.url,provider_id:url.id});
}
export function checkedImgurProvenance(value) {
 const source=imgurProvenance(value?.original_url);
 if(value.provider!==source.provider||value.provider_id!==source.provider_id)throw Error('MP4 source identity mismatch');
 return {...source};
}
export function checkedMp4(media) {
 if(media?.type!=='mp4'||!/^video_[a-f0-9-]{36}$/.test(media.video_id||''))throw Error('Invalid MP4 descriptor');
 const result={...structuredClone(media)};
 if(media.source!==undefined){
  result.source=checkedImgurProvenance(media.source);
 }
 return result;
}
