import sharp from 'sharp';
import {codedError,animationCodes} from './mixed-media-diagnostics.mjs';
sharp.cache({memory:16,files:0,items:10});sharp.concurrency(1);
export const animationLimits=Object.freeze({input:10485760,output:10485760,frames:120,dimension:1920,pixels:24000000,duration:60000});
function describe(m){
 const frames=m.pages||1,width=m.width,height=m.pageHeight||m.height;
 if(!['gif','webp'].includes(m.format)||frames<2||frames>animationLimits.frames)throw codedError('FRAME_LIMIT','Animation frame limit exceeded');
 if(!width||!height||width>1920||height>1920||width*height*frames>24000000)throw codedError('PIXEL_LIMIT','Animation pixel limit exceeded');
 if(!Array.isArray(m.delay)||m.delay.length!==frames||m.delay.some(n=>!Number.isInteger(n)||n<10)||m.delay.reduce((a,b)=>a+b,0)>60000)throw codedError('TIMING_LIMIT','Animation timing limit exceeded');
 return {frames,width,height,delay:m.delay,loop:m.loop??0,durationMs:m.delay.reduce((a,b)=>a+b,0)};
}
// Structural validation only: bounded byte walk, no pixel decode and no client claims.
function singleGifContainer(bytes){
 if(!/^GIF8[79]a$/.test(bytes.toString('ascii',0,6))||bytes.length<14)throw codedError('DECODE_REJECTED');
 let at=13,images=0;
 const take=n=>{if(at+n>bytes.length)throw codedError('DECODE_REJECTED');at+=n;};
 const blocks=()=>{while(true){if(at>=bytes.length)throw codedError('DECODE_REJECTED');const n=bytes[at++];if(!n)return;take(n);}};
 if(bytes[10]&128)take(3*(2**((bytes[10]&7)+1)));
 while(at<bytes.length){const tag=bytes[at++];if(tag===59){if(at!==bytes.length||images!==1)throw codedError('DECODE_REJECTED');return;}
  if(tag===33){if(![1,249,254,255].includes(bytes[at]))throw codedError('DECODE_REJECTED');take(1);blocks();}
  else if(tag===44){if(++images!==1)throw codedError('DECODE_REJECTED');const packed=bytes[at+8];take(9);if(packed&128)take(3*(2**((packed&7)+1)));if(bytes[at]<2||bytes[at]>8)throw codedError('DECODE_REJECTED');take(1);blocks();}
  else throw codedError('DECODE_REJECTED');
 }throw codedError('DECODE_REJECTED');
}
export async function normalizeAnimation(input,{allowSingleGif=false}={}){
 try{
 const bytes=Buffer.from(input);if(bytes.length<20||bytes.length>animationLimits.input)throw codedError('INPUT_LIMIT','Animation must be at most 10 MiB');
 const opts={animated:true,failOn:'warning',limitInputPixels:24000000,sequentialRead:true};
 const original=await sharp(bytes,opts).metadata();
 if(original.orientation&&original.orientation!==1)throw codedError('DECODE_REJECTED','Animated orientation must be normalized before upload');
 if(allowSingleGif&&original.format==='gif'&&(original.pages||1)===1){
  singleGifContainer(bytes);
  const width=original.width,height=original.pageHeight||original.height;
  if(!width||!height||width>12000||height>12000||width*height>24000000)throw codedError('PIXEL_LIMIT');
  // One full GIF decode. The unchanged static gateway then validates/optimizes this PNG.
  let poster;try{poster=await sharp(bytes,{...opts,page:0,pages:1}).png().toBuffer();}catch{throw codedError('POSTER_REJECTED');}
  if(poster.length>15728640)throw codedError('OUTPUT_LIMIT');
  return {kind:'static',sourceFormat:'gif',frames:1,width,height,poster};
 }
 const before=describe(original);
 // Re-encode all pages, stripping nonvisual metadata. Never truncate frames to fit.
 const output=await sharp(bytes,opts).webp({lossless:true,effort:2,loop:before.loop,delay:before.delay}).toBuffer();
 if(output.length>animationLimits.output)throw codedError('OUTPUT_LIMIT','Lossless animation exceeds 10 MiB output limit');
 const metadata=await sharp(output,opts).metadata(),after=describe(metadata);
 if(metadata.exif||metadata.xmp||metadata.icc||JSON.stringify(before)!==JSON.stringify(after))throw codedError('PRESERVATION_FAILED','Animation preservation verification failed');
 // Full output decode remains mandatory. Reuse its first frame rather than decoding
 // the original GIF again solely for the poster (lossless output preserves pixels).
 const decoded=await sharp(output,opts).raw().toBuffer({resolveWithObject:true});
 const firstFrame=decoded.data.subarray(0,after.width*after.height*decoded.info.channels);
 let poster;try{poster=await sharp(firstFrame,{raw:{width:after.width,height:after.height,channels:decoded.info.channels}}).png().toBuffer();}catch{throw codedError('POSTER_REJECTED');}
 return {bytes:output,poster,...after};
 }catch(error){if(animationCodes.has(error?.diagnosticCode))throw error;throw codedError('DECODE_REJECTED');}
}
