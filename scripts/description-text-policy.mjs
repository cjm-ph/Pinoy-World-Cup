// Plain text only. Never transform stored text or interpret it as markup.
export const descriptionLength=value=>Array.from(value||'').length;
export function descriptionTextAllowed(value){
 return typeof value==='string'&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  &&!/(?:[a-z][a-z0-9+.-]*\s*:\s*\/\/|\b(?:https?|ftp|mailto|javascript|vbscript|data)\s*:|\bwww\.|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\blocalhost(?=[:/\s]|$))/iu.test(value)
  &&!/(?:\[[^\]\n]+\]\s*(?:\(|\[)|```|=>|\b(?:eval|alert|fetch|setTimeout|setInterval|Function)\s*\(|\bfunction\s*(?:[a-z_$][\w$]*)?\s*\(|\b(?:document|window|globalThis|console)\s*[.\[]|\b(?:const|let|var)\s+[a-z_$][\w$]*\s*=)/iu.test(value);
}
export function descriptionIssue({short='',details='',originalDetails}={}){
 if(descriptionLength(short)>120)return 'Short Description must be120 characters or fewer.';
 if(!descriptionTextAllowed(short))return 'Short Description accepts plain text only: no URLs, links, markup or executable code.';
 if(details===originalDetails)return null; // Keep legacy Details exactly as stored, without sanitizing it.
 if(descriptionLength(details)>2000)return 'Details must be2000 characters or fewer.';
 if(!descriptionTextAllowed(details))return 'Details accepts plain text only: no URLs, links, markup or executable code.';
 return null;
}
// Revert rejected input instead of truncating persisted legacy text or interrupting IME.
export function bindDescriptionInput(input,{max,kind,originalDetails,onChange=()=>{},counter,hint}){
 let accepted=input.value,composing=false,selection=0;
 const issue=v=>kind==='short'?descriptionIssue({short:v}):descriptionIssue({details:v,originalDetails});
 const update=message=>{counter.textContent=descriptionLength(input.value)+' / '+max;hint.textContent=message||'';input.setCustomValidity(issue(input.value)||'');};
 const message=v=>descriptionLength(v)>max?'Maximum '+max+' characters.':'URLs and code are not allowed.';
 const insertion=text=>input.value.slice(0,input.selectionStart)+text+input.value.slice(input.selectionEnd);
 const commit=(v,allowRemoval=false)=>{if(issue(v)&&!(allowRemoval&&descriptionLength(v)<descriptionLength(accepted))){input.value=accepted;input.setSelectionRange(Math.min(selection,accepted.length),Math.min(selection,accepted.length));update(message(v));return false;}accepted=v;selection=input.selectionStart;update();onChange();return true;};
 input.addEventListener('beforeinput',e=>{selection=input.selectionStart;if(composing||e.isComposing||e.inputType.startsWith('delete')||e.data==null)return;const next=insertion(e.data);if(issue(next)){e.preventDefault();update(message(next));}});
 for(const event of ['paste','drop'])input.addEventListener(event,e=>{const text=(e.clipboardData||e.dataTransfer)?.getData('text/plain');if(text==null)return;e.preventDefault();selection=input.selectionStart;const next=insertion(text);if(issue(next)){update(message(next));return;}input.setRangeText(text,input.selectionStart,input.selectionEnd,'end');commit(input.value);});
 input.addEventListener('compositionstart',()=>{composing=true;selection=input.selectionStart;});
 input.addEventListener('compositionend',()=>{composing=false;commit(input.value);});
 input.addEventListener('input',e=>{if(!composing&&!e.isComposing&&input.value!==accepted)commit(input.value,e.inputType?.startsWith('delete'));});
 update();
}
