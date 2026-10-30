import {createGeminiSupport} from './creator-gemini-support.mjs';
import {checkedMp4} from './mp4-source-contract.mjs';
import {descriptionLength,bindDescriptionInput} from './description-text-policy.mjs';
const clipTime=seconds=>`${Math.floor((seconds??0)/60)}:${String((seconds??0)%60).padStart(2,'0')}`;
// Stateless page renderer. Persistence and role checks are supplied by its caller.
export function createCreatorPage({work,categories,capture,onChange,onResize,onFiles,onYouTube,onRetry,onAdd,onRemove,onMove,onSave,onPublish,onPreview,photos,jobs,busy,notice,getLanguage,adminGiphyPresentation=false,memberMode=false,memberTab='basic',onMemberTab=()=>{},onError=()=>{}}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const action=(text,fn)=>{const b=el('button',text,'btn small');b.type='button';b.onclick=()=>{try{fn();}catch(e){onError(e.message);}};b.disabled=busy;return b;};
 const root=el('div',undefined,'creator-single-page');let selectMemberTab=()=>{};
 const section=title=>{const s=el('section',undefined,'creator-section');s.append(el('h2',title));root.append(s);return s;};
 const basic=section('Basic Information');
 const field=(label,id,value,type='input')=>{const box=el('label',label,'field'),input=el(type);input.id=id;input.value=value;input.disabled=busy;box.append(input);input.oninput=()=>onChange();return box;};
 basic.append(field('Title','workTitle',work.title));
 if(memberMode){
  for(const [label,id,value,max]of [['Short Description','workShortDescription',work.short_description||'',120],['Details','workDescription',work.description||'',2000]]){
   const box=field(label,id,value,'textarea'),input=box.lastChild,counter=el('small');input.dataset.maxCharacters=String(max);counter.setAttribute('aria-live','polite');counter.id=id+'Count';input.setAttribute('aria-describedby',counter.id);
   input.oninput=null;const hint=el('small');hint.id=id+'Hint';hint.setAttribute('role','status');input.setAttribute('aria-describedby',counter.id+' '+hint.id);bindDescriptionInput(input,{max,kind:id==='workShortDescription'?'short':'details',originalDetails:work.original_description??value,onChange,counter,hint});box.append(counter,hint);
   if(id==='workShortDescription'&&work.short_description_supported!==true){input.disabled=true;box.append(el('small','Short Description requires the separately approved server update. Existing Details remain available.'));}
   if(descriptionLength(value)>max)box.append(el('small','Existing longer Details are preserved. Editing must fit the new limit.'));
   basic.append(box);
  }
 }else basic.append(field('Description','workDescription',work.description,'textarea'));
 const grid=el('div',undefined,'grid2'),size=field('Candidate count','workSize','','select');
 for(const n of [8,16,32]){const o=el('option',String(n));o.value=String(n);size.lastChild.append(o);}size.lastChild.value=String(work.requested_size);
 size.lastChild.onchange=()=>onResize(Number(size.lastChild.value));grid.append(size);basic.append(grid);
 if(!work.category_id)basic.append(el('p',work.category_error||'The internal category is unavailable. Saving and uploads are unavailable; contact the administrator.','notice'));
 const candidates=section('Candidates'),drop=el('div',undefined,'creator-drop-zone'),pick=el('input');pick.type='file';pick.multiple=true;pick.accept='.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';pick.id='creatorFiles';pick.disabled=false;pick.setAttribute('aria-label','Add candidate photos');
 drop.append(el('p','Choose or drop JPG, PNG or static WebP up to 15 MiB. Use the URL field for YouTube or GIPHY; Imgur is not enabled. File names become candidate names.'),pick);pick.onchange=()=>{const files=[...pick.files];pick.value='';void onFiles(files);};
 drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();void onFiles([...e.dataTransfer.files]);};candidates.append(drop);if(notice)candidates.append(el('p',notice,'notice'));
 const video=el('div',undefined,'creator-youtube');
 const videoInput=(label,type)=>{const box=el('label',label),input=el('input');input.type=type;input.disabled=busy;if(type==='number'){input.min='0';input.step='1';}box.append(input);video.append(box);return input;};
 const url=videoInput('YouTube / GIPHY / Imgur URL','url'),start=videoInput('Start (seconds, optional)','number'),end=videoInput('End (seconds, optional)','number');
 start.value='0';const timingNote=el('span','Start defaults to 0; an empty end plays to the end.');timingNote.setAttribute('role','status');const updateTiming=()=>{let giphy=false;try{giphy=['giphy.com','www.giphy.com'].includes(new URL(url.value).hostname);}catch{}start.disabled=end.disabled=busy||giphy;timingNote.textContent=giphy?'GIPHY official iframe does not support time ranges.':'Start defaults to 0; an empty end plays to the end.';};url.addEventListener('input',updateTiming);
 url.id='creatorYouTubeUrl';start.id='creatorYouTubeStart';end.id='creatorYouTubeEnd';
 const register=action('Add media URL',async()=>{register.disabled=true;try{await onYouTube?.(url.value,start.disabled?'':start.value,end.disabled?'':end.value,url.dataset.candidateId||null);}catch(error){onError(error.message);}finally{register.disabled=busy;}});video.append(register);candidates.append(video,timingNote);
 const notes=el('textarea');notes.id='creatorBatchNotes';notes.maxLength=4000;notes.placeholder='Source / notes (optional)';notes.setAttribute('aria-label','Batch source / notes');notes.disabled=busy;candidates.append(notes);
 for(const p of work.participants){const row=el('div',undefined,'creator-candidate-input');row.dataset.candidateId=p.id;const input=el('input');input.value=p.name;input.maxLength=300;input.dataset.candidateName=p.id;input.dataset.i18nSkip='';input.setAttribute('aria-label','Candidate name');input.disabled=busy;input.oninput=()=>{p.name=input.value;onChange();};
  if(p.media?.type==='giphy'){const info=el('div',undefined,'creator-video-info'),edit=action(p.media.url,()=>{url.value=p.media.url;url.dataset.candidateId=p.id;start.value='0';end.value='';updateTiming();if(memberMode){selectMemberTab('basic');root.getRootNode().querySelector('dialog.compact-media-dialog')?.close();}url.focus();});edit.setAttribute('aria-label','Edit media URL for '+p.name);info.append(edit);if(!adminGiphyPresentation)info.append(el('span','External GIPHY URL; availability and rights unverified.'));row.append(info);}
  if(p.media?.type==='youtube'){
   const info=el('div',undefined,'creator-video-info');
   const edit=action(p.media.url,()=>{url.value=p.media.originalUrl||p.media.url;url.dataset.candidateId=p.id;start.value=p.media.startSeconds??0;end.value=p.media.endSeconds??'';updateTiming();if(memberMode){selectMemberTab('basic');root.getRootNode().querySelector('dialog.compact-media-dialog')?.close();}url.focus();});edit.setAttribute('aria-label','Edit media URL for '+p.name);info.append(edit,el('span','Start: '+clipTime(p.media.startSeconds)+' / '+(p.media.endSeconds==null?'End of video':'End: '+clipTime(p.media.endSeconds))));row.append(info);
  }
  if(p.media?.type==='mp4'){
   const info=el('div',undefined,'creator-video-info');
   try{const source=checkedMp4(p.media).source;
    if(source){const edit=action(source.original_url,()=>{url.value=source.original_url;url.dataset.candidateId=p.id;start.value=p.media.startSeconds??0;end.value=p.media.endSeconds??'';updateTiming();if(memberMode){selectMemberTab('basic');root.getRootNode().querySelector('dialog.compact-media-dialog')?.close();}url.focus();});edit.setAttribute('aria-label','Edit media URL for '+p.name);info.append(edit);}
    else info.append(el('span','Original MP4 source URL unavailable. Existing media is preserved.'));
   }catch{info.append(el('span','Invalid MP4 source metadata. Saving must remain blocked.'));}
   row.append(info);
  }
  const state=jobs.get(p.id);row.append(input);if(adminGiphyPresentation&&p.media?.type==='giphy'){const hint=[...photos.querySelectorAll('[data-photo-slot]')].find(c=>c.dataset.photoSlot===p.id)?.querySelector('.giphy-size-estimate');if(hint)row.append(hint);}else if(!memberMode)row.append(action('Move up',()=>onMove(p.id,-1)),action('Move down',()=>onMove(p.id,1)));const remove=action('Remove candidate',()=>onRemove(p.id));remove.classList.add('candidate-remove');row.append(remove);
  if(state){const status=el('span',state.state==='complete'?'Upload complete':state.error||state.state,'creator-upload-state');status.setAttribute('role','status');row.append(status);if(state.state==='failed')row.append(action('Retry photo',()=>onRetry(p.id,notes.value)));}
  const card=[...photos.querySelectorAll('[data-photo-slot]')].find(card=>card.dataset.photoSlot===p.id);if(card){if(memberMode){for(const info of row.querySelectorAll('.creator-video-info'))card.querySelector('.compact-media-tools')?.append(info);card.append(row);}else card.prepend(row);}else candidates.append(row);
 }
 candidates.append(photos);const add=action('Add candidate',onAdd);add.disabled=busy||work.participants.length>=work.requested_size;candidates.append(add);
 const bulk=el('details'),summary=el('summary','Paste candidate names'),area=el('textarea');area.id='bulkNames';area.setAttribute('aria-label','Candidate names, one per line');area.disabled=busy;
 bulk.append(summary,area,action('Apply names',()=>{capture();const {names}=globalThis.CreatorModelV3.parseList(area.value,[],Number(work.requested_size),'replace');while(work.participants.length<names.length)work.participants.push({...globalThis.CreatorModelV3.member(''),image_asset_id:null});names.forEach((name,i)=>work.participants[i].name=name);onChange(true);}));candidates.append(bulk);
 if(!memberMode){const gemini=createGeminiSupport({getContext:()=>{capture();return {...work,category:categories.find(c=>c.id===work.category_id)?.name||''};},getLanguage,onCandidates:null});
 gemini.querySelectorAll('button').forEach(b=>b.disabled=busy);basic.append(gemini);}
 const save=section(memberMode?'Save / Request review':'Save / Publish'),privateButton=action('Save privately',onSave),publishButton=action('Publish now',onPublish);if(memberMode)publishButton.textContent='Submit for administrator review';privateButton.disabled=publishButton.disabled=busy||!work.category_id;save.append(el('p',memberMode?'Save a private draft, then request administrator review. Existing public content remains live.':'Save a private draft, or publish your latest validated content. An existing public revision stays live until publication succeeds.','help'),privateButton,publishButton);
 if(onPreview)(memberMode?candidates:save).append(action('Preview tournament',onPreview));
 if(memberMode){
  const tabs=el('div',undefined,'creator-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Creator steps');
  const basicPanel=el('div'),managePanel=el('div'),upload=el('section',undefined,'creator-section creator-add-media');basicPanel.id='creator-basic-panel';managePanel.id='creator-manage-panel';basicPanel.setAttribute('role','tabpanel');managePanel.setAttribute('role','tabpanel');upload.append(el('h2','Add Media'),drop,video,timingNote,notes);basicPanel.append(basic,upload);managePanel.append(candidates);
  const buttons=[];for(const [key,label,panel]of [['basic','Basic Information & Add Media',basicPanel],['manage','Manage Candidates',managePanel]]){const b=el('button',label);b.type='button';b.id='creator-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',b.id);b.onclick=()=>selectMemberTab(key);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=key==='basic'?'manage':'basic';selectMemberTab(e.key==='Home'?'basic':e.key==='End'?'manage':next);tabs.querySelector('[aria-selected=true]').focus();}};buttons.push([b,key,panel]);tabs.append(b);}
  selectMemberTab=key=>{for(const [b,k,panel]of buttons){b.setAttribute('aria-selected',String(key===k));b.tabIndex=key===k?0:-1;panel.hidden=key!==k;}onMemberTab(key);};root.prepend(tabs,basicPanel,managePanel);selectMemberTab(memberTab);
 }
 return root;
}
