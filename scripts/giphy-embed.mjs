import {checkedGiphy} from './giphy-policy.mjs';
// Official frame playback stays native; only SELECT chooses a candidate.
export function createGiphyEmbed(source,{name='Candidate',document:doc=document,timeoutMs=10000}={}){
 const box=doc.createElement('div');box.className='giphy-stage';
 const status=doc.createElement('p');status.className='giphy-status';status.setAttribute('role','status');status.hidden=true;
 if(source?.blocked===true){status.hidden=false;status.textContent='GIPHY media is temporarily unavailable. You can still select this candidate.';box.append(status);return {element:box,dispose(){box.remove();}};}
 let checked;try{checked=checkedGiphy(source);}catch{status.hidden=false;status.textContent='Unsupported media URL';box.append(status);return {element:box,dispose(){box.remove();}};}
 const frame=doc.createElement('iframe');frame.title='GIPHY animation: '+name;frame.className='giphy-frame';frame.referrerPolicy='no-referrer';frame.tabIndex=-1;frame.style.pointerEvents='none';
 frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');frame.allow='autoplay; fullscreen';frame.allowFullscreen=true;frame.src=checked.embed_url;
 const via=doc.createElement('a');via.href=checked.url;via.target='_blank';via.rel='noopener noreferrer';via.textContent='View on GIPHY';
 let failed=false;const timer=setTimeout(()=>{status.hidden=false;status.textContent='GIPHY loading or availability could not be confirmed. You can still select this candidate.';},timeoutMs);
 frame.onerror=()=>{clearTimeout(timer);failed=true;status.hidden=false;status.textContent='GIPHY media unavailable. You can still select this candidate.';};
 // load is not decode proof; keep failure handling without a permanent warning footer.
 frame.onload=()=>{clearTimeout(timer);if(!failed){status.hidden=true;status.textContent='';}};box.append(frame,status,via);
 let disposed=false;return {element:box,frame,dispose(){if(disposed)return;disposed=true;clearTimeout(timer);frame.onload=frame.onerror=null;frame.removeAttribute('src');frame.remove();box.remove();}};
}
