import {mediaTimeRange} from './candidate-media-policy.mjs';
// Explicit local preparation only. No database descriptor or production route.
import {validateCreatorFile} from './creator-page-model.mjs';
const mounted=new WeakMap();
async function cleanThumbnail(blob){
 const b=new Uint8Array(await blob.arrayBuffer()),v=new DataView(b.buffer),parts=[];let size=4,p=12;
 if(String.fromCharCode(...b.subarray(0,4))!=='RIFF'||String.fromCharCode(...b.subarray(8,12))!=='WEBP'||v.getUint32(4,true)+8!==b.length)throw Error('Thumbnail container');
 while(p<b.length){if(p+8>b.length)throw Error('Thumbnail container');const n=v.getUint32(p+4,true),end=p+8+n+(n&1),tag=String.fromCharCode(...b.subarray(p,p+4));if(end>b.length)throw Error('Thumbnail container');
  if(['VP8X','VP8 ','VP8L','ALPH'].includes(tag)){const part=b.slice(p,end);if(tag==='VP8X'){if(n!==10)throw Error('Thumbnail header');part[8]&=~(0x20|0x08|0x04);}parts.push(part);size+=part.length;}
  else if(!['ICCP','EXIF','XMP '].includes(tag))throw Error('Unexpected thumbnail chunk');p=end;
 }
 const header=new Uint8Array(12);header.set([82,73,70,70]);new DataView(header.buffer).setUint32(4,size,true);header.set([87,69,66,80],8);
 return new Blob([header,...parts],{type:'image/webp'});
}
export function bindLocalVideoRange(video,start='',end='') {
 const range=mediaTimeRange(start,end),custom=range.startSeconds!==0||range.endSeconds!==null;
 video.loop=!custom;let disposed=false;
 const restart=()=>{if(disposed)return;video.currentTime=range.startSeconds;video.play().catch(()=>{});};
 const metadata=()=>{if(disposed)return;if(!Number.isFinite(video.duration)||range.startSeconds>=video.duration||(range.endSeconds!==null&&range.endSeconds>video.duration)){video.pause();video.dispatchEvent(new Event('error'));return;}if(custom)restart();};
 const tick=()=>{if(disposed||!custom||video.seeking)return;if(video.currentTime<range.startSeconds||(range.endSeconds!==null&&video.currentTime>=range.endSeconds))restart();};
 const ended=()=>{if(custom)restart();};video.addEventListener('loadedmetadata',metadata);video.addEventListener('timeupdate',tick);video.addEventListener('ended',ended);
 return ()=>{disposed=true;video.removeEventListener('loadedmetadata',metadata);video.removeEventListener('timeupdate',tick);video.removeEventListener('ended',ended);};
}
export function mountLocalMp4(image,{blob,url:sourceUrl,poster,startSeconds=0,endSeconds=null,document:doc=document}){
 if(typeof poster!=='string'||!poster.startsWith('blob:'))throw Error('Validated thumbnail required');
 if(blob){if(!(blob instanceof Blob)||blob.type!=='video/mp4'||blob.size>10_000_000)throw Error('Validated video required');}
 else{const u=new URL(sourceUrl,doc.location.href);if(u.username||u.password||u.origin!==doc.location.origin||u.pathname!=='/video-media'||u.searchParams.size!==1||!/^video_[a-f0-9-]{36}$/.test(u.searchParams.get('video')||'')||u.hash)throw Error('Authorized same-origin video route required');sourceUrl=u.href;}
 mediaTimeRange(startSeconds,endSeconds);mounted.get(image)?.dispose();
 const video=doc.createElement('video'),url=blob?URL.createObjectURL(blob):sourceUrl;
 video.className=image.className;video.style.cssText=image.style.cssText;
 // Reuse the image box, fit, zoom and position; never resize the candidate card.
 video.style.pointerEvents='none';video.muted=true;video.defaultMuted=true;video.autoplay=true;video.loop=true;video.controls=false;video.playsInline=true;video.poster=poster;video.src=url;
 const unbind=bindLocalVideoRange(video,startSeconds,endSeconds);image.replaceWith(video);video.play().catch(()=>{});
 let disposed=false;const handle={video,dispose(){if(disposed)return;disposed=true;unbind();video.pause();video.removeAttribute('src');video.load();video.replaceWith(image);if(blob)URL.revokeObjectURL(url);mounted.delete(image);}};mounted.set(image,handle);return handle;
}
export async function captureLocalMp4Thumbnail(blob,{signal,timeoutMs=8000}={}){
 if(!(blob instanceof Blob)||blob.type!=='video/mp4'||blob.size>10_000_000)throw Error('Local MP4 required');
 const video=document.createElement('video'),url=URL.createObjectURL(blob);video.muted=true;video.playsInline=true;video.preload='auto';
 let timer,abort;
 try{
  await new Promise((resolve,reject)=>{const fail=()=>reject(Error('Automatic thumbnail failed'));timer=setTimeout(fail,timeoutMs);abort=fail;signal?.addEventListener('abort',abort,{once:true});video.onerror=fail;video.onloadeddata=resolve;if(signal?.aborted)return fail();video.src=url;video.load();});
  if(!video.videoWidth||!video.videoHeight||video.videoWidth>1920||video.videoHeight>1920)throw Error('Thumbnail dimensions unavailable or unsupported');
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
  const encoded=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Thumbnail encoding failed')),'image/webp',0.85));
  const result=await cleanThumbnail(encoded);
  if(signal?.aborted)throw Error('Thumbnail aborted');if(result.size>1572864)throw Error('Thumbnail exceeds static image policy');
  const file=new File([result],'thumbnail.webp',{type:result.type});await validateCreatorFile(file);
  return {file,width:canvas.width,height:canvas.height};
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
