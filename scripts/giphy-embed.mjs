import {checkedGiphy} from './giphy-policy.mjs';
// Official cross-origin player remains interactive. Never intercept its messages as votes.
export function createGiphyEmbed(source,{name='Candidate',document:doc=document,timeoutMs=10000}={}){
 const box=doc.createElement('div');box.className='giphy-stage';
 const status=doc.createElement('p');status.className='giphy-status';status.setAttribute('role','status');status.textContent='External GIPHY media may be unavailable. You can still select this candidate.';
 if(source?.blocked===true){status.textContent='GIPHY media is temporarily unavailable. You can still select this candidate.';box.append(status);return {element:box,dispose(){box.remove();}};}
 let checked;try{checked=checkedGiphy(source);}catch{status.textContent='Unsupported media URL';box.append(status);return {element:box,dispose(){box.remove();}};}
 const frame=doc.createElement('iframe');frame.title='GIPHY animation: '+name;frame.className='giphy-frame';frame.referrerPolicy='no-referrer';
 frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.src=checked.embed_url;
 const via=doc.createElement('a');via.href=checked.url;via.target='_blank';via.rel='noopener noreferrer';via.textContent='View on GIPHY';
 const timer=setTimeout(()=>{status.textContent='GIPHY loading or availability could not be confirmed. You can still select this candidate.';},timeoutMs);
 frame.onerror=()=>{clearTimeout(timer);status.textContent='GIPHY media unavailable. You can still select this candidate.';};
 // load is NOT proof of a successful cross-origin GIF. Keep the fallback/status visible.
 frame.onload=()=>clearTimeout(timer);box.append(frame,status,via);
 let disposed=false;return {element:box,frame,dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=frame.onerror=null;frame.removeAttribute('src');frame.remove();box.remove();}};
}
