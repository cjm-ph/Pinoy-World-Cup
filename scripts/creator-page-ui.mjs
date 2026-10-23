import {createGeminiSupport} from './creator-gemini-support.mjs';
// Stateless page renderer. Persistence and role checks are supplied by its caller.
export function createCreatorPage({work,categories,capture,onChange,onResize,onFiles,onRetry,onAdd,onRemove,onMove,onSave,onPublish,photos,jobs,busy,notice,getLanguage,onError=()=>{}}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const action=(text,fn)=>{const b=el('button',text,'btn small');b.type='button';b.onclick=()=>{try{fn();}catch(e){onError(e.message);}};b.disabled=busy;return b;};
 const root=el('div',undefined,'creator-single-page');
 const section=title=>{const s=el('section',undefined,'creator-section');s.append(el('h2',title));root.append(s);return s;};
 const basic=section('Basic Information');
 const field=(label,id,value,type='input')=>{const box=el('label',label,'field'),input=el(type);input.id=id;input.value=value;input.disabled=busy;box.append(input);input.oninput=()=>onChange();return box;};
 basic.append(field('Title','workTitle',work.title),field('Description','workDescription',work.description,'textarea'));
 const grid=el('div',undefined,'grid2'),category=field('Category','workCategory','','select'),size=field('Candidate count','workSize','','select');
 for(const c of categories){const o=el('option',c.name);o.value=c.id;o.dataset.i18nSkip='';category.lastChild.append(o);}category.lastChild.value=work.category_id;
 for(const n of [8,16,32]){const o=el('option',String(n));o.value=String(n);size.lastChild.append(o);}size.lastChild.value=String(work.requested_size);
 size.lastChild.onchange=()=>onResize(Number(size.lastChild.value));grid.append(category,size);basic.append(grid);
 if(!categories.length)basic.append(el('p','No category is available. Saving is unavailable.','notice'));
 const candidates=section('Candidates'),drop=el('div',undefined,'creator-drop-zone'),pick=el('input');pick.type='file';pick.multiple=true;pick.accept='.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';pick.id='creatorFiles';pick.disabled=false;pick.setAttribute('aria-label','Add candidate photos');
 drop.append(el('p','Choose or drop JPG, PNG or WebP photos. File names become candidate names.'),pick);pick.onchange=()=>{const files=[...pick.files];pick.value='';void onFiles(files);};
 drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();void onFiles([...e.dataTransfer.files]);};candidates.append(drop);if(notice)candidates.append(el('p',notice,'notice'));
 const notes=el('textarea');notes.id='creatorBatchNotes';notes.maxLength=4000;notes.placeholder='Source / notes (optional)';notes.setAttribute('aria-label','Batch source / notes');notes.disabled=busy;candidates.append(notes);
 for(const p of work.participants){const row=el('div',undefined,'creator-candidate-input');row.dataset.candidateId=p.id;const input=el('input');input.value=p.name;input.maxLength=300;input.dataset.candidateName=p.id;input.dataset.i18nSkip='';input.setAttribute('aria-label','Candidate name');input.disabled=busy;input.oninput=()=>{p.name=input.value;onChange();};
  const state=jobs.get(p.id);row.append(input,action('Move up',()=>onMove(p.id,-1)),action('Move down',()=>onMove(p.id,1)),action('Remove candidate',()=>onRemove(p.id)));
  if(state){const status=el('span',state.state==='complete'?'Upload complete':state.error||state.state,'creator-upload-state');status.setAttribute('role','status');row.append(status);if(state.state==='failed')row.append(action('Retry photo',()=>onRetry(p.id,notes.value)));}
  const card=[...photos.querySelectorAll('[data-photo-slot]')].find(card=>card.dataset.photoSlot===p.id);if(card)card.prepend(row);else candidates.append(row);
 }
 candidates.append(photos);const add=action('Add candidate',onAdd);add.disabled=busy||work.participants.length>=work.requested_size;candidates.append(add);
 const bulk=el('details'),summary=el('summary','Paste candidate names'),area=el('textarea');area.id='bulkNames';area.setAttribute('aria-label','Candidate names, one per line');area.disabled=busy;
 bulk.append(summary,area,action('Apply names',()=>{capture();const {names}=globalThis.CreatorModelV3.parseList(area.value,[],Number(work.requested_size),'replace');while(work.participants.length<names.length)work.participants.push({...globalThis.CreatorModelV3.member(''),image_asset_id:null});names.forEach((name,i)=>work.participants[i].name=name);onChange(true);}));candidates.append(bulk);
 const gemini=createGeminiSupport({getContext:()=>{capture();return {...work,category:categories.find(c=>c.id===work.category_id)?.name||''};},getLanguage,onCandidates:null});
 gemini.querySelectorAll('button').forEach(b=>b.disabled=busy);basic.append(gemini);
 const save=section('Save / Publish');save.append(el('p','Save a private draft, or publish your latest validated content. An existing public revision stays live until publication succeeds.','help'),action('Save privately',onSave),action('Publish now',onPublish));
 return root;
}
