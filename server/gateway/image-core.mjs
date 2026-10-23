import sharp from 'sharp';
import { magic, descriptor, limits } from './gateway.mjs';
// Per isolated worker: bound native cache and internal threading as input sizes grow.
sharp.cache({memory:32,files:0,items:20});sharp.concurrency(1);
// Only visual WebP chunks may bypass a second lossy encoding. Metadata and
// unknown chunks always take the stripping/encoding path. Full decode is mandatory.
function cleanWebP(bytes){let at=12,images=0;const counts={};while(at+8<=bytes.length){const tag=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4);if(!['VP8 ','VP8L','VP8X','ALPH'].includes(tag)||at+8+size>bytes.length)return false;counts[tag]=(counts[tag]||0)+1;if(counts[tag]>1)return false;if(tag==='VP8 '||tag==='VP8L')images++;at+=8+size+(size%2);}return at===bytes.length&&images===1;}
export async function normalizeImage(input,onProgress=()=>{}) {
    const metrics={};const decodeStart=performance.now();onProgress('IMAGE_RESIZE');
    const bytes = Buffer.from(input);
    if (bytes.length > limits.input) throw Error('input too large');
    const format = magic(bytes);
    if ((format==='webp' && bytes.readUInt32LE(4)+8!==bytes.length) ||
        (format==='jpeg' && (bytes.at(-2)!==255 || bytes.at(-1)!==217)) ||
        (format==='png' && bytes.subarray(-12,-4).toString('hex')!=='0000000049454e44')) throw Error('invalid/trailing container');
    const options = { failOn: 'warning', limitInputPixels: 24000000, sequentialRead: true };
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1 ||
        !metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000 ||
        metadata.width * metadata.height > 24000000) throw Error('invalid input dimensions/frames');
    if(format==='webp'&&bytes.length<=limits.output&&metadata.width<=limits.dimension&&metadata.height<=limits.dimension&&!metadata.exif&&!metadata.xmp&&!metadata.icc&&!metadata.iptc&&cleanWebP(bytes)){
      onProgress('IMAGE_VALIDATE');const validationStart=performance.now();await sharp(bytes,options).raw().toBuffer();
      const result={bytes,width:metadata.width,height:metadata.height};descriptor(result);
      return {...result,timings:{decodeResizeMs:+(validationStart-decodeStart).toFixed(2),encodeMs:0,encodeAttempts:0,validationMs:+(performance.now()-validationStart).toFixed(2),passthrough:true}};
    }
    // No keepMetadata/withMetadata: sharp strips metadata by default.
    // Bounded quality-first fallback. Never upscale or save an oversized result.
    const base=await sharp(bytes,options).rotate().toColourspace('srgb').resize({width:limits.dimension,height:limits.dimension,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true});
    metrics.decodeResizeMs=+(performance.now()-decodeStart).toFixed(2);const encodeStart=performance.now();onProgress('IMAGE_ENCODE');
    let data,info;let attempts=0,qualityUsed=85;
    for(const [size,quality] of [[1920,85],[1920,80],[1920,75],[1760,75],[1600,75],[1440,70]]) {
      attempts++;qualityUsed=quality;({data,info}=await sharp(base.data,{raw:{width:base.info.width,height:base.info.height,channels:base.info.channels}})
        .resize({width:size,height:size,fit:'inside',withoutEnlargement:true})
        .webp({quality,effort:4}).toBuffer({resolveWithObject:true}));
      if(data.length<=limits.output)break;
    }
    metrics.encodeMs=+(performance.now()-encodeStart).toFixed(2);metrics.encodeAttempts=attempts;metrics.quality=qualityUsed;const validationStart=performance.now();onProgress('IMAGE_VALIDATE');
    const result = { bytes:data, width:info.width, height:info.height };
    descriptor(result);
    const check = await sharp(data, options).metadata();
    if (check.format!=='webp' || check.width!==info.width || check.height!==info.height ||
        (check.pages ?? 1)!==1 || check.exif || check.xmp || check.icc || check.iptc) throw Error('output validation');
    await sharp(data, options).raw().toBuffer(); // full output decode, not just header inspection
    metrics.validationMs=+(performance.now()-validationStart).toFixed(2);return {...result,timings:metrics};
}
