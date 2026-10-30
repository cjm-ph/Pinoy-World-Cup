// Read-only presentation rules. Never infer ownership/permissions from labels.
export function localTimestamp(value){
 if(typeof value!=='string')return null;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
 if(!m)return null;
 const [y,month,day,h,min,s]=m.slice(1).map(Number),calendar=new Date(Date.UTC(y,month-1,day));
 if(calendar.getUTCFullYear()!==y||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||h>23||min>59||s>59||!Number.isFinite(Date.parse(value)))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));
 return `${p.month}/${p.day}/${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}
export function publicContentType(t){
 const items=t?.items;if(!Array.isArray(items)||!items.length)return 'unknown';
 if(items.some(p=>['youtube','giphy','animation','mp4'].includes(p.media?.type)))return 'video';
 return items.every(p=>!p.media&&typeof p.img==='string'&&p.img&&!/\.(?:gif|webm|mp4)(?:[?#]|$)/i.test(p.img))?'image':'unknown';
}
export function memberCurrentStatus(t){
 const r=t?.revision,hasPublic=!!t?.published_revision_id,published=hasPublic&&t.visibility==='public';
 const base=published?'Published':hasPublic&&t.visibility==='private'?'Private':null;
 const changed=r&&r.id===t.draft_revision_id&&r.id!==t.published_revision_id;
 if(base){const suffix=changed?({draft:'Editing',submitted:'Edit pending review',rejected:'Edit rejected'})[r.state]:null;return suffix?base+' · '+suffix:base;}
 return ({draft:'Draft',submitted:'Pending review',rejected:'Rejected',approved:t?.visibility==='private'?'Private':'Approved'})[r?.state]||'Status unavailable';
}
export function historyEvents(rows){
 const events=[],seenComparisons=new Set();
 for(const row of rows){
  const comparison=row.comparison_basis==='retained_revision_vs_parent';
  if(comparison&&row.revision_id&&row.parent_revision_id){const key=JSON.stringify([row.revision_id,row.parent_revision_id]);if(seenComparisons.has(key))continue;seenComparisons.add(key);}
  const add=(key,text)=>events.push({id:row.id+':'+key,text:comparison?'Retained revision comparison — '+text:text,at:comparison?null:row.created_at,actor_id:comparison?null:row.actor_id,actor_role:comparison?'Unknown':row.actor_role,comparison});
  const label={submit:'Review requested',approve:'Review approved',reject:'Review rejected',publish:'Published',unpublish:'Made private',rollback:'Publication restored'}[row.action];
  if(label){add('state',label+(row.action==='reject'&&row.note?' — '+row.note:''));continue;}
  if(!row.previous_available||!Array.isArray(row.current_candidates)||!Array.isArray(row.previous_candidates))continue;
  const active=items=>new Map(items.filter(p=>p.active!==false).map(p=>[p.id,p]));
  const before=active(row.previous_candidates),after=active(row.current_candidates);
  for(const [id,p]of before)if(!after.has(id))add('remove:'+id,'Candidate removed: '+p.name);
  for(const [id,p]of after){const old=before.get(id);if(!old){add('add:'+id,'Candidate added: '+p.name);continue;}
   if(old.name!==p.name)add('name:'+id,'Candidate renamed: '+old.name+' → '+p.name);
  }
  if(row.cover_asset_id!==row.previous_cover_asset_id||row.cover_settings!==row.previous_cover_settings)add('cover','Cover changed');
  if(row.description_comparison_available===true){for(const [field,label]of [['short_description','Short Description'],['description','Details']]){const before=row['previous_'+field],after=row[field];if(typeof before==='string'&&typeof after==='string'&&before!==after)add(field,label+': '+before+' → '+after);}}
 }
 return [...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
}
