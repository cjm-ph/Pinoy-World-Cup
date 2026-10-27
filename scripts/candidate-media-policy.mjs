// Shared input policy. Server authorization and trusted source registration remain mandatory.
export const ANIMATION_INPUT_MAX=10*1024*1024;
export async function isAnimationInput(file){
 if(file.type==='image/gif')return true;
 if(file.type!=='image/webp')return false;
 const header=new Uint8Array(await file.slice(0,30).arrayBuffer());
 return String.fromCharCode(...header.slice(12,16))==='VP8X'&&!!(header[20]&2);
}
const videoIdPattern=/^[A-Za-z0-9_-]{11}$/;
export function youtubeSource(input,start='',end='') {
 if(typeof input!=='string'||input.length>2048||/[\u0000-\u001f\u007f]/.test(input))throw Error('Invalid YouTube URL');
 let url;try{url=new URL(input.trim());}catch{throw Error('Invalid YouTube URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Use a credential-free HTTPS YouTube URL');
 const parts=url.pathname.split('/').filter(Boolean);let videoId;
 if(url.hostname==='youtu.be'&&parts.length===1)videoId=parts[0];
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname)){
  if(url.pathname==='/watch'&&url.searchParams.getAll('v').length===1)videoId=url.searchParams.get('v');
  else if(parts.length===2&&['shorts','embed','live'].includes(parts[0]))videoId=parts[1];
 }
 if(!videoIdPattern.test(videoId||''))throw Error('Unsupported YouTube URL');
 const seconds=(value,optional)=>{
  if(value===''||value===null||value===undefined)return optional?null:0;
  if((typeof value!=='number'&&typeof value!=='string')||!/^\d+$/.test(String(value)))throw Error('Use non-negative whole seconds');
  const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Invalid seconds');return n;
 };
 const shorts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(url.hostname)&&parts.length===2&&parts[0]==='shorts';
 const startSeconds=shorts?0:seconds(start,false),endSeconds=shorts?null:seconds(end,true);
 if(endSeconds!==null&&endSeconds<=startSeconds)throw Error('End must be after start');
 return Object.freeze({...(shorts?{playbackMode:'shorts',originalUrl:'https://www.youtube.com/shorts/'+videoId}:{}),type:'youtube',videoId,url:'https://www.youtube.com/watch?v='+videoId,startSeconds,endSeconds,
  thumbnailUrl:'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg'});
}
export function checkedYoutubeSource(source){
 const checked=youtubeSource(source.originalUrl??source.url,source.startSeconds,source.endSeconds);
 if(source.videoId&&checked.videoId!==source.videoId)throw Error('Video identity mismatch');
 if(source.playbackMode==='shorts'&&checked.playbackMode!=='shorts')throw Error('Shorts source identity unavailable');
 return checked;
}
export function youtubeEmbedUrl(source,origin) {
 const checked=checkedYoutubeSource(source);
 if(checked.videoId!==source.videoId)throw Error('Video identity mismatch');
 const site=new URL(origin);if(site.protocol!=='https:'||site.origin!==origin)throw Error('HTTPS page origin required');
 const url=new URL('https://www.youtube-nocookie.com/embed/'+checked.videoId);
 url.search=new URLSearchParams({start:String(checked.startSeconds),...(checked.endSeconds===null?{}:{end:String(checked.endSeconds)}),...(checked.playbackMode==='shorts'?{autoplay:'1',mute:'1',loop:'1',playlist:checked.videoId}:{autoplay:'0'}),playsinline:'1',controls:'1',enablejsapi:'1',origin}).toString();
 return url.href;
}
export function youtubeDurationSeconds(value) {
 const m=typeof value==='string'&&/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
 if(!m||value.endsWith('T')||!m.slice(1).some(Boolean))throw Error('Video duration unavailable');
 const seconds=Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0);
 if(!Number.isSafeInteger(seconds)||seconds<=0)throw Error('Video duration unavailable');return seconds;
}
export function validateYouTubeClip(source,durationSeconds) {
 const checked=checkedYoutubeSource(source);
 if(!Number.isSafeInteger(durationSeconds)||durationSeconds<=0||checked.startSeconds>=durationSeconds||(checked.endSeconds!==null&&checked.endSeconds>durationSeconds))throw Error('Clip is outside the video duration');
 return checked;
}
export function prepareYouTubeCandidate(source,title,makeCandidate) {
 const media=checkedYoutubeSource(source);
 if(typeof title!=='string')throw Error('Video title unavailable');
 const name=title.normalize('NFC').replace(/[<>\u0000-\u001f\u007f]/g,' ').trim().slice(0,300);
 if(!name||typeof makeCandidate!=='function')throw Error('Video title or candidate factory unavailable');
 const candidate=makeCandidate(name);
 if(typeof candidate?.id!=='string'||!candidate.id||typeof candidate.entity_id!=='string'||!candidate.entity_id)throw Error('Existing candidate identity factory required');
 return {...candidate,name,media:{...media}};
}
// Preflight only; not a replacement for bounded server decode/container validation.
export function animationDescriptor(meta,bytes,limits) {
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>ANIMATION_INPUT_MAX)throw Error('Animation input must be at most 10 MiB');
 if(!limits||![limits.maxFrames,limits.maxDimension,limits.maxDecodedPixels,limits.maxDurationMs].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Explicit animation budgets required');
 const frames=meta.pages||1,width=meta.width,height=meta.pageHeight||meta.height;
 if(!['gif','webp'].includes(meta.format)||!Number.isSafeInteger(frames)||frames<2||frames>limits.maxFrames||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>limits.maxDimension||height>limits.maxDimension||width*height*frames>limits.maxDecodedPixels)throw Error('Unsupported animation or decoded pixel budget exceeded');
 if(!Array.isArray(meta.delay)||meta.delay.length!==frames||meta.delay.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Animation timing unavailable');
 const durationMs=meta.delay.reduce((a,b)=>a+b,0);if(durationMs>limits.maxDurationMs)throw Error('Animation duration budget exceeded');
 return Object.freeze({type:'animation',format:meta.format,width,height,frames,durationMs,delays:Object.freeze([...meta.delay]),loop:meta.loop??null,byteSize:bytes});
}
