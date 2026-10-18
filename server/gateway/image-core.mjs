import sharp from 'sharp';
import { magic, descriptor, limits } from './gateway.mjs';
export async function normalizeImage(input) {
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
    // No keepMetadata/withMetadata: sharp strips metadata by default.
    const { data, info } = await sharp(bytes, options).rotate().toColourspace('srgb')
      .resize({ width:1600, height:1600, fit:'inside', withoutEnlargement:true })
      .webp({ quality:75, effort:4 }).toBuffer({ resolveWithObject:true });
    const result = { bytes:data, width:info.width, height:info.height };
    descriptor(result);
    const check = await sharp(data, options).metadata();
    if (check.format!=='webp' || check.width!==info.width || check.height!==info.height ||
        (check.pages ?? 1)!==1 || check.exif || check.xmp || check.icc || check.iptc) throw Error('output validation');
    await sharp(data, options).raw().toBuffer(); // full output decode, not just header inspection
    return result;
}
