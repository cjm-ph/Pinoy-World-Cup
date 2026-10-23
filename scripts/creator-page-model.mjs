// Shared input policy only. No Auth, administrator RPC or database dependencies.
export const IMAGE_TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
export async function validateCreatorFile(file){
 const extension=/\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
 if(!IMAGE_TYPES[extension]||file.type!==IMAGE_TYPES[extension]||file.size<12||file.size>8*1024*1024)throw Error('Choose JPG, PNG or WebP files up to 8 MB. GIF is not supported yet.');
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const format=b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'?'image/webp':null;
 if(format!==file.type)throw Error('File contents do not match the image extension and MIME type.');
}
export function candidateFileName(fileName,names=[]){
 const base=fileName.replace(/\.[^.]+$/,'').normalize('NFC').replace(/[<>\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,280)||'Candidate';
 let name=base,index=2;const used=new Set(names.map(n=>n.trim().toLocaleLowerCase()));
 while(used.has(name.toLocaleLowerCase()))name=`${base} (${index++})`;
 return name;
}
export function assignCreatorFiles(work,files,makeCandidate,jobs){
 let accepted=0;for(const file of files){
  let p=work.participants.find(p=>!p.name.trim()&&!p.image_asset_id&&!jobs.has(p.id));
  if(!p){if(work.participants.length>=work.requested_size)break;p=makeCandidate();work.participants.push(p);}
  p.name=candidateFileName(file.name,work.participants.filter(x=>x!==p).map(x=>x.name));
  jobs.set(p.id,{file,state:'pending',error:'',resume:null});accepted++;
 }return {accepted,excess:files.length-accepted};
}
