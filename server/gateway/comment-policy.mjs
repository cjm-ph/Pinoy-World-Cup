// Server-only, auditable EN/Filipino patterns. They reduce abuse, not prove humanity.
export const blockedPhrases=['fuck','shit','bitch','nigger','putangina','tangina','gago','ulol','kill yourself','i will kill you','papatayin kita','bet now','online casino','buy now','for sale','free money','promo code','libreng pera','pustahan','pm me'];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=blockedPhrases.map(p=>new RegExp('(?:^|[^a-z])'+[...p.replace(/ /g,'')].map(escape).join('[\\s\\W_]*')+'(?:$|[^a-z])','i'));
export function inspectComment(input){
 if(typeof input!=='string')return {ok:false,code:'INVALID_LENGTH'};
 const text=input.normalize('NFC'),length=[...text].length;
 if(length<1||length>100||!text.trim())return {ok:false,code:'INVALID_LENGTH'};
 let s=text.normalize('NFKC').toLowerCase();
 if(/[<>\u0000-\u001f\u007f\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(s))return {ok:false,code:'CONTENT_BLOCKED'};
 // Preserve emoji ZWJ sequences in stored text; never let joiners hide a rule.
 s=s.replace(/\u200d/g,'');
 s=s.replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\bdot\b/g,'.');
 const tight=s.replace(/\s+/g,'');
 if(/(?:https?|hxxps?|www)[:./]|[a-z0-9-]+\.(?:com|net|org|ph|io|co|me|gg|xyz|info|biz|site|link|online|app|tv|shop|cc|to)(?:\b|\/)|[a-z0-9-]+\.[a-z]{2,24}\//i.test(tight)
 || /[a-z0-9-]+\.[a-z]{2,24}\b/i.test(s)||/@[a-z0-9_]|\b(?:ig|instagram|facebook|telegram|whatsapp|viber|discord)\s*[:=]/i.test(s)
 || /(?:\+?\d[\s().-]*){7,}/.test(s.replace(/\b\d{4}-\d{2}-\d{2}\b/g,''))||patterns.some(r=>r.test(s))
 || patterns.some(r=>r.test(s.replace(/[013457@$]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'})[c])))
 || /\bf[\W_]*u?[\W_]*c?[\W_]*k\b/i.test(s))return {ok:false,code:'CONTENT_BLOCKED'};
 if(/(.)\1{11,}/u.test(tight))return {ok:false,code:'CONTENT_BLOCKED'};
 return {ok:true,text,length};
}
