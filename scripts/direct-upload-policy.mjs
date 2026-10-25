export const UNSUPPORTED_FILE='Unsupported file type. Use the media URL field for YouTube or GIPHY; Imgur is not enabled.';
// Byte-level intake gate; trusted image decoding remains mandatory afterward.
export function assertStaticUpload(b){
 const text=(a,z)=>String.fromCharCode(...b.subarray(a,z));
 if(b.length<12)throw Error(UNSUPPORTED_FILE);
 if(b[0]===255&&b[1]===216&&b[2]===255)return;
 if(text(0,4)==='RIFF'&&text(8,12)==='WEBP'){
  const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(view.getUint32(4,true)+8!==b.length)throw Error(UNSUPPORTED_FILE);
  let p=12,frames=0;
  while(p<b.length){if(p+8>b.length)throw Error(UNSUPPORTED_FILE);const tag=text(p,p+4),n=view.getUint32(p+4,true);
   if(p+8+n+(n&1)>b.length||['ANIM','ANMF'].includes(tag)||(tag==='VP8X'&&(n!==10||(b[p+8]&2))))throw Error(UNSUPPORTED_FILE);
   if(['VP8 ','VP8L'].includes(tag))frames++;
   p+=8+n+(n&1);
  }
  if(frames!==1)throw Error(UNSUPPORTED_FILE);return;
 }
 if(b.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10')return;
 throw Error(UNSUPPORTED_FILE);
}
