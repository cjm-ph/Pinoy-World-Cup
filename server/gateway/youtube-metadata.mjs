// Server-only fixed-provider reader. The caller supplies active administrator authorization.
import {youtubeSource,youtubeDurationSeconds} from './media-policy.mjs';
export function createYouTubeMetadataReader({authorize,apiKey,fetchImpl=fetch}) {
 if(typeof authorize!=='function'||typeof apiKey!=='string'||!apiKey)throw Error('Administrator authorization and server API key required');
 return async input=>{
  await authorize(); // Always authorize before any provider request.
  const source=youtubeSource(input);
  const url=new URL('https://www.googleapis.com/youtube/v3/videos');
  url.search=new URLSearchParams({part:'snippet,status,contentDetails',id:source.videoId,key:apiKey}).toString();
  let response;
  try{response=await fetchImpl(url.href,{redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw Error('Video metadata unavailable');}
  if(!response.ok)throw Error('Video metadata unavailable');
  const reader=response.body?.getReader();if(!reader)throw Error('Video metadata unavailable');
  const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('Metadata response too large');chunks.push(value);}}
  catch{await reader.cancel().catch(()=>{});throw Error('Video metadata unavailable');}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Video metadata unavailable');}
  const video=Array.isArray(data.items)?data.items.find(v=>v.id===source.videoId):null;
  if(!video||video.status?.embeddable!==true||!['public','unlisted'].includes(video.status.privacyStatus)||video.snippet?.liveBroadcastContent!=='none'||typeof video.snippet.title!=='string'||!video.snippet.title.trim())throw Error('Video is unavailable for embedding');
  const durationSeconds=youtubeDurationSeconds(video.contentDetails?.duration);
  return {videoId:source.videoId,title:video.snippet.title,thumbnailUrl:source.thumbnailUrl,durationISO:video.contentDetails.duration,durationSeconds};
 };
}
