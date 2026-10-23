import sharp from 'sharp';
sharp.cache({memory:16,files:0,items:10});sharp.concurrency(1);
export const animationLimits=Object.freeze({input:10485760,output:10485760,frames:120,dimension:1920,pixels:24000000,duration:60000});
function describe(m){
 const frames=m.pages||1,width=m.width,height=m.pageHeight||m.height;
 if(!['gif','webp'].includes(m.format)||frames<2||frames>animationLimits.frames||!width||!height||width>1920||height>1920||width*height*frames>24000000)throw Error('Animation frame or pixel limit exceeded');
 if(!Array.isArray(m.delay)||m.delay.length!==frames||m.delay.some(n=>!Number.isInteger(n)||n<10)||m.delay.reduce((a,b)=>a+b,0)>60000)throw Error('Animation timing limit exceeded');
 return {frames,width,height,delay:m.delay,loop:m.loop??0,durationMs:m.delay.reduce((a,b)=>a+b,0)};
}
export async function normalizeAnimation(input){
 const bytes=Buffer.from(input);if(bytes.length<20||bytes.length>animationLimits.input)throw Error('Animation must be at most 10 MiB');
 const opts={animated:true,failOn:'warning',limitInputPixels:24000000,sequentialRead:true};
 const original=await sharp(bytes,opts).metadata();
 if(original.orientation&&original.orientation!==1)throw Error('Animated orientation must be normalized before upload');
 const before=describe(original);
 // Re-encode all pages, stripping nonvisual metadata. Never truncate frames to fit.
 const output=await sharp(bytes,opts).webp({lossless:true,effort:2,loop:before.loop,delay:before.delay}).toBuffer();
 if(output.length>animationLimits.output)throw Error('Lossless animation exceeds 10 MiB output limit');
 const metadata=await sharp(output,opts).metadata(),after=describe(metadata);
 if(metadata.exif||metadata.xmp||metadata.icc||JSON.stringify(before)!==JSON.stringify(after))throw Error('Animation preservation verification failed');
 await sharp(output,opts).raw().toBuffer();
 const poster=await sharp(bytes,{page:0,pages:1,failOn:'warning',limitInputPixels:24000000}).png().toBuffer();
 return {bytes:output,poster,...after};
}
