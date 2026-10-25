import {youtubeSource} from './candidate-media-policy.mjs';
import {giphySource} from './giphy-policy.mjs';
export function classifyMediaUrl(input,start='',end=''){
 const fail=()=>{throw Error('Unsupported media URL');};
 if(typeof input!=='string'||input.length>2048||/[\u0000-\u001f\u007f\\]/.test(input))return fail();
 input=input.trim();if(/\s/.test(input))return fail();
 let u;try{u=new URL(input);}catch{return fail();}
 if(u.protocol!=='https:'||u.username||u.password||u.port)return fail();
 if(['giphy.com','www.giphy.com'].includes(u.hostname))return {provider:'giphy',source:giphySource(input)};
 if(['youtu.be','youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(u.hostname)){
  try{return {provider:'youtube',source:youtubeSource(input,start,end)};}catch{return fail();}
 }
 if(['imgur.com','www.imgur.com','i.imgur.com'].includes(u.hostname)&&!u.search&&!u.hash){
  const match=(u.hostname==='i.imgur.com'?/^\/([A-Za-z0-9]{5,12})\.mp4$/:/^\/([A-Za-z0-9]{5,12})$/).exec(u.pathname);
  if(match)return Object.freeze({provider:'imgur',id:match[1],url:u.href,enabled:false});
 }
 return fail();
}
