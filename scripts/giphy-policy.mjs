import {mediaTimeRange} from './candidate-media-policy.mjs';
// URL syntax only. No metadata lookup, API key, redirect resolution or download.
export function giphySource(input){
 const fail=()=>{throw Error('Unsupported media URL');};
 if(typeof input!=='string'||input.length>2048||/[\u0000-\u0020\u007f\\]/.test(input.trim()))return fail();
 let u;try{u=new URL(input.trim());}catch{return fail();}
 if(u.protocol!=='https:'||!['giphy.com','www.giphy.com'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash)return fail();
 const m=/^\/gifs\/([A-Za-z0-9-]+)\/?$/.exec(u.pathname);if(!m)return fail();
 const id=m[1].split('-').at(-1);if(!/^[A-Za-z0-9]{5,64}$/.test(id))return fail();
 return Object.freeze({type:'giphy',gif_id:id,url:`https://giphy.com/gifs/${id}`,embed_url:`https://giphy.com/embed/${id}`});
}
export function checkedGiphy(source){const range=mediaTimeRange(source?.startSeconds,source?.endSeconds);if(range.startSeconds!==0||range.endSeconds!==null)throw Error('GIPHY official iframe does not support time ranges.');const x=giphySource(source?.url);if(source?.type!=='giphy'||source.gif_id!==x.gif_id||(source.embed_url!==undefined&&source.embed_url!==x.embed_url))throw Error('Unsupported media URL');return x;}
export function prepareGiphyCandidate(source,slot,makeCandidate){const media=checkedGiphy(source),candidate=slot?{...slot}:makeCandidate('GIPHY animation');
 if(!candidate?.id||!candidate.entity_id)throw Error('Existing candidate identity required');
 return {...candidate,name:candidate.name?.trim()||'GIPHY animation',media,pending_url:''};
}
