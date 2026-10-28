import {validateCreatorFile} from './creator-page-model.mjs';
import './photo-display.js';
// Approximate uncropped content in reference battle slots; never persisted.
export function giphyBattleEstimate(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
 const fit=(w,h)=>{const scale=Math.min(w/width,h/height);return `${Math.round(width*scale)}\u00d7${Math.round(height*scale)}`;};
 return `Size: PC ${fit(661,689)} Mobile ${fit(194,669)}`;
}
// Reusable UI: caller supplies authorized persistence and photo loading adapters.
export function createPhotoCards({getSlots,loadPhoto,upload,saveDisplay,storageDiagnostics,releaseExpired,canEdit=()=>true,devicePreviews=false,giphySizeHints=false,staticOnly=false,getLanguage=()=> 'en',notify=()=>{}}){
 const root=document.createElement('div');root.className='photo-editor-grid';
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 let busy=false;
 async function refresh(){
  root.replaceChildren();
  if(storageDiagnostics){const usage=node('button','Storage diagnostics','btn small photo-storage-info');usage.type='button';root.append(usage);
   usage.onclick=async()=>{if(busy)return;usage.disabled=true;try{
    const data=await storageDiagnostics(),d=node('dialog',null,'photo-storage-dialog');d.setAttribute('aria-label','Storage diagnostics');d.append(node('h2','Storage diagnostics'));
    const table=node('dl');for(const [key,label] of Object.entries({physical_bytes:'Stored bytes (project)',pending_bytes:'Pending reserved bytes (project)',actor_bytes:'Administrator storage bytes',tournament_bytes:'Tournament storage bytes',daily_bytes:'Optimized bytes in 24 hours',attempts_10m:'Upload attempts in 10 minutes',attempts_24h:'Upload attempts in 24 hours',expired_empty_reservations:'Expired empty reservations'})){
     if(data[key]===undefined)continue;table.append(node('dt',label));const value=node('dd',String(data[key])+(data.limits?.[key]!==undefined?' / '+data.limits[key]:''));value.dataset.i18nSkip='';table.append(value);}
    d.append(table,node('p','Historical and unreferenced stored photos still count. Releasing empty reservations never deletes a photo.','help'));
    if(releaseExpired){const release=node('button','Release expired empty reservations','btn');release.onclick=async()=>{release.disabled=true;try{await releaseExpired();d.close();usage.click();}catch(e){notify(e.message,'error');}finally{release.disabled=false;}};d.append(release);}
    const close=node('button','Close','btn');close.onclick=()=>d.close();d.onclose=()=>d.remove();d.append(close);document.body.append(d);d.showModal();
   }catch(e){notify(e.message,'error');}finally{usage.disabled=false;}};
  }
  for(const slot of getSlots()){
   const thumbnailOnly=['youtube','giphy'].includes(slot.mediaType);
   const card=node('article',null,'photo-editor-card');card.dataset.photoSlot=slot.id;
   const hint=giphySizeHints&&slot.mediaType==='giphy'?node('p','Size: PC -- Mobile --','giphy-size-estimate'):null;if(hint){hint.title='Approximate CSS pixels: PC 1366x900, Mobile 390x844; actual viewport, provider and safe areas may differ.';hint.setAttribute('role','status');card.append(hint);}const updateHint=image=>{if(hint)hint.textContent=giphyBattleEstimate(image.naturalWidth,image.naturalHeight)||'Estimated battle size unavailable';};
   const title=node('h3',slot.name);if(slot.id!=='cover')title.dataset.i18nSkip='';
   const pick=node('button',slot.asset?'Replace photo':'+ Add photo','btn photo-picker');pick.type='button';pick.disabled=busy||!canEdit();
   const input=node('input');input.type='file';input.accept=staticOnly?'image/jpeg,image/png,image/webp':'image/jpeg,image/png,image/webp,image/gif';input.hidden=true;
   input.setAttribute('aria-label',slot.id==='cover'?'Choose cover photo':'Choose candidate photo');
   const frame=node('div',null,'photo-original');frame.append(node('span','+ Add photo','help'));
   const status=node('p','', 'help');status.setAttribute('role','status');
   const edit=node('button','Edit display area','btn small photo-edit');edit.type='button';edit.disabled=!slot.asset||busy||!canEdit();
   card.append(title,frame,pick,edit,input,status);if(slot.sourceUrl){const source=node('a','View on GIPHY','giphy-preview-source');source.href=slot.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';card.append(source);}root.append(card);
   if(thumbnailOnly){pick.hidden=edit.hidden=true;frame.removeAttribute('tabindex');}
   frame.tabIndex=0;frame.setAttribute('role','button');frame.setAttribute('aria-label','Add or replace photo');
   if(thumbnailOnly){frame.removeAttribute('role');frame.removeAttribute('tabindex');frame.setAttribute('aria-label','Video thumbnail');}
   frame.onkeydown=e=>{if(!thumbnailOnly&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!busy&&canEdit())input.click();}};
   card.onclick=e=>{if(!thumbnailOnly&&!busy&&canEdit()&&!e.target.closest('button,input,select,textarea,label'))input.click();};
   const previewDevices=[];
   if(devicePreviews&&slot.id!=='cover'){
    const previews=node('div',null,'photo-card-device-previews');
    for(const [device,label]of [['desktop','PC Preview'],['mobile','Mobile Preview']]){
     const column=node('section'),stage=device==='desktop'?frame:node('div',null,'photo-original');
     stage.dataset.previewDevice=device;if(device==='mobile')stage.append(node('span','No photo','help'));
     column.append(node('h4',label),stage);previews.append(column);previewDevices.push({device,stage});
    }
    pick.before(previews);
   }
   let photoUrl;
   async function load(){if(!slot.asset&&!slot.previewUrl)return;try{photoUrl=await(slot.previewUrl||loadPhoto(slot.asset));if(!photoUrl||!card.isConnected)return;
    if(previewDevices.length){for(const {device,stage}of previewDevices){const image=node('img');image.src=photoUrl;image.alt=slot.name;image.loading='lazy';image.dataset.i18nSkip='';if(hint)image.onload=()=>updateHint(image);if(slot.previewUrl)image.onerror=()=>{stage.replaceChildren(node('span','Preview unavailable','help'));if(hint)hint.textContent='Estimated battle size unavailable';};stage.replaceChildren(image);globalThis.PWCPhotoDisplay.apply(image,slot.settings,device);}sizeCardPreviews();return;}
    const image=node('img');image.src=photoUrl;image.alt=slot.name;image.dataset.i18nSkip='';if(hint)image.onload=()=>updateHint(image);if(slot.previewUrl)image.onerror=()=>{frame.replaceChildren(node('span','Preview unavailable','help'));if(hint)hint.textContent='Estimated battle size unavailable';};frame.replaceChildren(image);globalThis.PWCPhotoDisplay.apply(image,slot.settings);const r=globalThis.PWCPhotoDisplay[slot.id==='cover'?'coverRatio':'gameRatio'](innerWidth,innerHeight);frame.style.aspectRatio=String(r);frame.style.width=`min(100%, ${150*r}px)`;frame.style.height='auto';frame.style.marginInline='auto';
   }catch(e){status.textContent=e.message;if(hint)hint.textContent='Estimated battle size unavailable';}}
   function sizeCardPreviews(){for(const {device,stage}of previewDevices){const viewport=device==='desktop'?(innerWidth>=768?[innerWidth,innerHeight]:[1440,900]):(innerWidth<768?[innerWidth,innerHeight]:[390,844]);const ratio=globalThis.PWCPhotoDisplay.gameRatio(...viewport);stage.style.aspectRatio=String(ratio);stage.style.width=`min(100%, ${150*ratio}px)`;stage.style.height='auto';stage.style.marginInline='auto';const image=stage.querySelector('img');if(image)globalThis.PWCPhotoDisplay.apply(image,slot.settings,device);}}
   sizeCardPreviews();
   edit.onclick=()=>openEditor();
   function openEditor(file){
    if((!file&&!photoUrl)||busy||!canEdit())return;
    const localUrl=file?URL.createObjectURL(file):null,url=localUrl||photoUrl;let retry=null;
    const dialog=node('dialog',null,'photo-display-dialog');dialog.setAttribute('aria-label','Edit display area');
    const heading=node('h2',file?'Upload and edit photo':'Edit display area'),name=node('p',slot.name);if(slot.id!=='cover')name.dataset.i18nSkip='';
    const stored=file?{}:(slot.settings||{}),baseline=stored;
    let settings={fit:baseline.fit==='contain'?'contain':'cover',position:baseline.position||'50% 50%',b2_zoom:baseline.b2_zoom||1,devices:{desktop:globalThis.PWCPhotoDisplay.normalize(baseline,'desktop'),mobile:globalThis.PWCPhotoDisplay.normalize(baseline,'mobile')}},drag;
    const previews=node('div',null,'photo-device-previews');
    const images=[],stages=[],viewports=[],controls=[],zooms=[],fits=[];const started=performance.now(),metrics={browserResizeMs:null,browserCompressionMs:null};
    for(const [label,width,height] of [['Desktop display',1440,900],['Mobile display',390,844]]){
     const column=node('section'),stage=node('div',null,'photo-pan-stage photo-game-preview'),image=node('img');
     stage.style.aspectRatio=String(globalThis.PWCPhotoDisplay.gameRatio(width,height));
     const device=images.length===0?'desktop':'mobile';column.dataset.device=device;
     const fit=node('select');fit.setAttribute('aria-label',device==='desktop'?'Desktop display mode':'Mobile display mode');
     for(const [value,text] of [['contain','Fit - show whole photo'],['cover','Fill - fill frame']]){const option=node('option',text);option.value=value;fit.append(option);}fit.value=settings.devices[device].fit;const modeButtons=node('div',null,'photo-fit-toggle');modeButtons.setAttribute('role','group');modeButtons.setAttribute('aria-label',fit.getAttribute('aria-label'));for(const [value,text] of [['contain','Fit'],['cover','Fill']]){const button=node('button',text);button.type='button';button.dataset.fit=value;button.dataset.i18nSkip='';button.onclick=()=>{fit.value=value;fit.dispatchEvent(new Event('change'));};modeButtons.append(button);controls.push(button);}
     const zoomLabel=node('label','Zoom'),zoom=node('input');zoom.type='range';zoom.min='1';zoom.max='2.5';zoom.step='.01';zoom.value=String(settings.devices[device].b2_zoom);zoom.setAttribute('aria-label',device==='desktop'?'Desktop zoom':'Mobile zoom');zoomLabel.append(zoom);
     const auto=node('button','Auto fit','btn small');auto.type='button';
     const autoDevice=()=>{settings.devices[device]=globalThis.PWCPhotoDisplay.automatic(image.naturalWidth,image.naturalHeight);zoom.value='1';fit.value=settings.devices[device].fit;paint();};
     auto.onclick=autoDevice;fit.onchange=()=>{settings.devices[device].fit=fit.value;paint();};zoom.oninput=()=>{settings.devices[device].b2_zoom=Number(zoom.value);paint();};
     controls.push(fit,auto);zooms.push(zoom);fits.push(fit);
     image.src=url;image.alt='';stage.append(image);const surface=node('div',null,'photo-preview-surface');surface.append(stage);column.append(node('h3',label),surface,modeButtons,zoomLabel,auto);previews.append(column);images.push(image);stages.push(stage);viewports.push([width,height]);
     stage.onpointerdown=e=>{if(busy||saving)return;e.preventDefault();stage.setPointerCapture(e.pointerId);drag={stage,x:e.clientX,y:e.clientY,p:settings.devices[device].position.split(' ').map(parseFloat)};};
     stage.onpointermove=e=>{if(!drag||drag.stage!==stage||!image.naturalWidth)return;
      const g=globalThis.PWCPhotoDisplay.geometry(image.naturalWidth,image.naturalHeight,stage.clientWidth,stage.clientHeight,settings,device);
      const x=stage.clientWidth-g.width,y=stage.clientHeight-g.height;
      settings.devices[device].position=`${(Math.abs(x)>.01?Math.max(0,Math.min(100,drag.p[0]+(e.clientX-drag.x)/x*100)):50).toFixed(3)}% ${(Math.abs(y)>.01?Math.max(0,Math.min(100,drag.p[1]+(e.clientY-drag.y)/y*100)):50).toFixed(3)}%`;paint();};
     stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
    }
    const message=node('p','', 'help');message.setAttribute('role','status');
    const apply=node('button','Apply photo','btn primary'),close=node('button','Cancel','btn');
    function paint(){images.forEach((image,i)=>{globalThis.PWCPhotoDisplay.apply(image,settings,i===0?'desktop':'mobile');zooms[i].disabled=busy||!ready;stages[i].classList.add('manual');stages[i].closest('section').querySelectorAll('[data-fit]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fit===settings.devices[i===0?'desktop':'mobile'].fit)));});}
    function ratios(){viewports[0]=innerWidth>=768?[innerWidth,innerHeight]:[1440,900];viewports[1]=innerWidth<768?[innerWidth,innerHeight]:[390,844];stages.forEach((stage,i)=>{const ratio=globalThis.PWCPhotoDisplay[slot.id==='cover'?'coverRatio':'gameRatio'](...viewports[i]);stage.style.aspectRatio=String(ratio);stage.style.width=`min(100%, ${Math.min(160,innerHeight*.3)*ratio}px)`;stage.style.maxHeight='160px';});}
    window.addEventListener('resize',ratios);
    const notes=node('textarea');notes.setAttribute('aria-label','Source / notes (optional)');notes.placeholder='Source / notes (optional)';notes.maxLength=4000;notes.hidden=!file;
    let saving=false,ready=false;
    const enabled=()=>{notes.disabled=saving;apply.disabled=saving||!ready;controls.forEach(e=>e.disabled=saving||!ready);};
    async function persist(value){if(busy||saving||!ready)return;const appliedAt=performance.now();busy=saving=true;apply.disabled=close.disabled=true;controls.forEach(e=>e.disabled=true);notes.disabled=true;paint();message.textContent=file?'Optimizing and uploading...':'Saving display area...';
     try{const result=file?await (retry?retry(value,{notes:notes.value.trim()}):upload(slot.id,file,value,{notes:notes.value.trim(),onProgress:text=>{message.textContent=text;}})):await saveDisplay(slot.id,value);
      globalThis.PWCAdminPerformance??={};globalThis.PWCAdminPerformance.lastPhoto={...metrics,...result?.timings,operation:file?'upload':'framing',totalClientMs:+(performance.now()-appliedAt).toFixed(2)};
      dialog.close();busy=false;await refresh();notify(result?.optimized_bytes?`Photo ready: ${file.size} bytes \u2192 ${result.optimized_bytes} bytes.`:file?'Photo updated.':'Display area saved.','success');}
     catch(e){retry=e.resume||retry;message.textContent=e.message;notify(e.message,'error');}
     finally{busy=saving=false;close.disabled=false;enabled();paint();}}
    apply.onclick=()=>persist(settings);
    close.onclick=()=>dialog.close();dialog.oncancel=e=>{if(saving)e.preventDefault();};dialog.onclose=()=>{window.removeEventListener('resize',ratios);if(localUrl)URL.revokeObjectURL(localUrl);dialog.remove();input.value='';};
    const actions=node('div',null,'photo-editor-actions');actions.append(close,apply);const header=node('div',null,'photo-editor-heading'),titles=node('div');titles.append(heading,name);header.append(titles);if(root.closest('#wizardPanel')){const numbers=document.getElementById('wizardProgress')?.textContent.match(/\d+/g);if(numbers?.length>=2){const badge=node('span',numbers[0]+' / '+numbers[numbers.length-1],'photo-step-badge');badge.dataset.i18nSkip='';header.append(badge);}}dialog.append(header);if(slot.id!=='cover')dialog.append(node('p','Choose Fit or Fill, zoom and drag the photo for each device.','help'));dialog.append(previews,notes,message,actions);(root.getRootNode() instanceof ShadowRoot?root.getRootNode():document.body).append(dialog);dialog.showModal();ratios();paint();enabled();
    Promise.all(images.map(image=>image.decode())).then(()=>{metrics.browserDecodeMs=+(performance.now()-started).toFixed(2);if(file){for(const [i,device] of ['desktop','mobile'].entries()){settings.devices[device]=slot.id==='cover'?globalThis.PWCPhotoDisplay.automatic(images[i].naturalWidth,images[i].naturalHeight):{fit:'cover',position:'50% 50%',b2_zoom:1};fits[i].value=settings.devices[device].fit;}}ready=true;enabled();paint();}).catch(()=>{ready=false;enabled();message.textContent='Unable to decode this photo. Choose a valid image.';});
   }
   function accept(file){if(!file||busy||thumbnailOnly)return;if(staticOnly){if(!canEdit()){status.textContent='This revision cannot be edited.';return;}void validateCreatorFile(file).then(()=>openEditor(file)).catch(e=>status.textContent=e.message);return;}if(!canEdit()){status.textContent='This revision cannot be edited.';return;}if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>(file.type==='image/gif'?10:15)*1024*1024){status.textContent='Choose JPG, PNG or WebP up to 15 MiB; GIF/animated WebP up to 10 MiB.';return;}openEditor(file);}
   pick.onclick=()=>input.click();input.onchange=()=>accept(input.files[0]);
   card.ondragover=e=>{e.preventDefault();card.classList.add('drag-over');};card.ondragleave=()=>card.classList.remove('drag-over');
   card.ondrop=e=>{e.preventDefault();card.classList.remove('drag-over');void accept(e.dataTransfer.files[0]);};
   void load();
  }
 }
 const resizeCards=()=>{if(!root.isConnected){responsive.disconnect();window.removeEventListener('resize',resizeCards);return;}const slots=getSlots();for(const card of root.querySelectorAll('.photo-editor-card')){const slot=slots.find(s=>s.id===card.dataset.photoSlot),image=card.querySelector('.photo-original img');if(!slot||!image)continue;if(devicePreviews&&slot.id!=='cover'){for(const stage of card.querySelectorAll('[data-preview-device]')){const device=stage.dataset.previewDevice,v=device==='desktop'?(innerWidth>=768?[innerWidth,innerHeight]:[1440,900]):(innerWidth<768?[innerWidth,innerHeight]:[390,844]),ratio=globalThis.PWCPhotoDisplay.gameRatio(...v);stage.style.aspectRatio=String(ratio);stage.style.width=`min(100%, ${150*ratio}px)`;const img=stage.querySelector('img');if(img)globalThis.PWCPhotoDisplay.apply(img,slot.settings,device);}continue;}globalThis.PWCPhotoDisplay.apply(image,slot.settings);const r=globalThis.PWCPhotoDisplay[slot.id==='cover'?'coverRatio':'gameRatio'](innerWidth,innerHeight),frame=image.parentElement;frame.style.aspectRatio=String(r);frame.style.width=`min(100%, ${150*r}px)`;}};const responsive=new ResizeObserver(resizeCards);responsive.observe(root);if(devicePreviews)window.addEventListener('resize',resizeCards);
 root.refresh=refresh;void refresh();return root;
}
