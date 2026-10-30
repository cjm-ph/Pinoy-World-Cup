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
