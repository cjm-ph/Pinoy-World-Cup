import {assertStaticUpload,UNSUPPORTED_FILE} from './direct-upload-policy.mjs';
export const IMAGE_TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
export async function validateCreatorFile(file){
 const extension=/\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
 if(!IMAGE_TYPES[extension]||file.type!==IMAGE_TYPES[extension])throw Error(UNSUPPORTED_FILE);
 if(file.size<12||file.size>15*1024*1024)throw Error('Choose JPG, PNG or static WebP up to 15 MiB.');
 const b=new Uint8Array(await file.arrayBuffer());assertStaticUpload(b);
 const mime=b[0]===255?'image/jpeg':b[0]===137?'image/png':'image/webp';
 if(mime!==file.type)throw Error('File contents do not match the image extension and MIME type.');
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

// Name is committed only after successful lower-card upload/application; existing input wins.
export async function autofillPhotoCandidate(work,slot,file,commit){
 const p=slot==='cover'?null:work?.participants.find(p=>p.id===slot);
 if(!p||p.name.trim())return false;
 const previous=p.name,name=candidateFileName(file.name,work.participants.filter(x=>x!==p).map(x=>x.name));p.name=name;
 try{await commit();return true;}catch(error){if(p.name===name)p.name=previous;throw error;}
}
