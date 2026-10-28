// Member orchestration only. No administrator catalog/publish/purge fallback.
export function createMemberCreatorModel({repository=null,uuid=()=>crypto.randomUUID()}={}){
 let user=null,version=0,busy=false;
 const requireUser=()=>{if(!user)throw Error('Sign in with Google and complete your member profile first.');return user;};
 const own=t=>{const u=requireUser();if(!t||t.creator_id!==u.id)throw Error('Only your own World Cups can be managed.');return t;};
 const execute=async(method,...args)=>{requireUser();if(busy)throw Error('A member operation is already running.');if(typeof repository?.[method]!=='function')throw Error('Member server contracts are not connected. Nothing was saved or published.');const at=version;busy=true;try{const result=await repository[method](...args);if(at!==version)throw Error('Member session changed. Reload your World Cups.');return result;}finally{busy=false;}};
 return {
  setIdentity(value){if((user?.id||null)===(value?.id||null))return;user=value?.id?{id:value.id}:null;version++;},
  get ready(){return !!user;},get connected(){return !!repository;},
  newDraft(){const u=requireUser();return {creator_id:u.id,tournament_id:'tournament_'+uuid(),title:'',description:'',category_id:'',category_error:'Member category/catalog contract is not connected.',requested_size:8,participants:[]};},
  async context(){const u=requireUser(),x=await execute('context');if(!Array.isArray(x?.tournaments)||x.tournaments.some(t=>t.creator_id!==u.id))throw Error('Invalid member-owned catalog.');return x;},
  async list(){const u=requireUser(),rows=await execute('list');if(!Array.isArray(rows)||rows.some(t=>t.creator_id!==u.id))throw Error('Invalid member-owned catalog.');return rows;},
  async save(work,t=null){requireUser();if(t){own(t);if(t.revision?.state==='submitted')throw Error('This submission is under review and cannot be changed.');}if(work.creator_id!==user.id)throw Error('Draft owner changed.');return execute('save',work,t);},
  async submit(t){own(t);const issue=memberSubmitIssue(t);if(issue)throw Error(issue);return execute('submit',t);},
  async unpublish(t){own(t);return execute('unpublish',t);},
  async trash(t){own(t);return execute('trash',t);}
 };
}

export function formatMemberReviewTime(value){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
export function memberSubmitIssue(t){
 const r=t?.revision;if(r?.state==='rejected')return 'Open the rejected World Cup and save a new Draft before requesting review again, so its rejection history is retained.';if(!r||r.id!==t.draft_revision_id||!['draft','rejected'].includes(r.state))return 'Refresh your World Cups: the current draft is no longer available for submission.';
 if(![8,16,32].includes(r.requested_size))return 'The saved candidate count is unavailable. The member review-context server update is required.';
 const rows=r.participants||[],active=rows.filter(p=>p.active!==false),missing=rows.flatMap((p,i)=>p.active!==false&&(typeof p.name!=='string'||!p.name.trim())?[i+1]:[]),notes=[];
 if(active.length<r.requested_size){const add=r.requested_size-active.length;notes.push(`Not enough candidates. This ${r.requested_size}-candidate World Cup has ${active.length} saved active candidates. Add ${add} more candidate${add===1?'':'s'}, save, then request review.`);}
 else if(active.length>r.requested_size)notes.push(`This World Cup requires ${r.requested_size} active candidates, but ${active.length} are saved. Check the candidate count and save again before requesting review.`);
 if(missing.length)notes.push(`Add a name for candidate${missing.length===1?'':'s'} ${missing.map(i=>'#'+i).join(', ')} before requesting review.`);
 return notes.length?notes.join(' '):null;
}
export function memberSaveIssue(work,t){
 const expected=work.participants||[],saved=t?.revision?.participants;
 if(!Array.isArray(saved))return 'The saved candidate list could not be checked. Your edits are still open. Reload your World Cups to verify the saved draft before requesting review.';
 const active=rows=>rows.filter(p=>p.active!==false).length;
 if(expected.length!==saved.length||active(expected)!==active(saved))return `Save could not be confirmed: the editor has ${expected.length} candidates (${active(expected)} active), but the saved draft has ${saved.length} (${active(saved)} active). Your edits are still open. Check the saved draft and save again before requesting review.`;
 if(Number.isInteger(work.requested_size)&&Number.isInteger(t?.revision?.requested_size)&&work.requested_size!==t.revision.requested_size)return `The editor is set to ${work.requested_size} candidates, but the saved draft is set to ${t.revision.requested_size}. Your edits are still open. Check the saved setting and save again before requesting review.`;
 const row=p=>[p.id,p.active!==false,typeof p.name==='string'?p.name.trim():p.name];
 if(JSON.stringify(expected.map(row))!==JSON.stringify(saved.map(row)))return 'The saved candidate list or names differ from the editor. Your edits are still open. Check the saved draft and save again before requesting review.';
 return null;
}
