import './photo-display.js';
// Reusable UI: caller supplies authorized persistence and photo loading adapters.
export function createPhotoCards({getSlots,loadPhoto,upload,saveDisplay,storageDiagnostics,releaseExpired,canEdit=()=>true,getLanguage=()=> 'en',notify=()=>{}}){
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
   const card=node('article',null,'photo-editor-card');card.dataset.photoSlot=slot.id;
   const title=node('h3',slot.name);if(slot.id!=='cover')title.dataset.i18nSkip='';
   const pick=node('button',slot.asset?'Replace photo':'+ Add photo','btn photo-picker');pick.type='button';pick.disabled=busy||!canEdit();
   const input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;
   input.setAttribute('aria-label',slot.id==='cover'?'Choose cover photo':'Choose candidate photo');
   const frame=node('div',null,'photo-original');frame.append(node('span','+ Add photo','help'));
   const status=node('p','', 'help');status.setAttribute('role','status');
   const edit=node('button','Edit display area','btn small photo-edit');edit.type='button';edit.disabled=!slot.asset||busy||!canEdit();
   card.append(title,frame,pick,edit,input,status);root.append(card);
   frame.tabIndex=0;frame.setAttribute('role','button');frame.setAttribute('aria-label','Add or replace photo');
   frame.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy&&canEdit())input.click();}};
   card.onclick=e=>{if(!busy&&canEdit()&&!e.target.closest('button,input,select,textarea,label'))input.click();};
   let photoUrl;
   async function load(){if(!slot.asset)return;try{photoUrl=await loadPhoto(slot.asset);if(!photoUrl||!card.isConnected)return;
    const image=node('img');image.src=photoUrl;image.alt=slot.name;image.dataset.i18nSkip='';frame.replaceChildren(image);
   }catch(e){status.textContent=e.message;}}
   edit.onclick=()=>{
    if(!photoUrl||busy||!canEdit())return;
    const dialog=node('dialog',null,'photo-display-dialog');dialog.setAttribute('aria-label','Edit display area');
    const heading=node('h2','Edit display area'),name=node('p',slot.name);if(slot.id!=='cover')name.dataset.i18nSkip='';
    const full=node('div',null,'photo-source-preview'),original=node('img');original.src=photoUrl;original.alt=slot.name;original.dataset.i18nSkip='';full.append(original);
    const manualLabel=node('label',null,'checkbox'),manual=node('input');manual.type='checkbox';
    let settings=globalThis.PWCPhotoDisplay.normalize(slot.settings),drag;
    manual.checked=settings.b2_zoom!==1||settings.position!=='50% 50%';
    manualLabel.append(manual,document.createTextNode('Adjust display area manually'));
    const screenLabel=node('label','Preview screen'),screen=node('select');screen.setAttribute('aria-label','Preview screen');
    for(const [value,label] of [['vs','VS match'],['result','Winner screen']]){const option=node('option',label);option.value=value;screen.append(option);}screenLabel.append(screen);
    const previews=node('div',null,'photo-device-previews');
    const images=[],stages=[],viewports=[];
    for(const [label,width,height] of [['Desktop game preview',1440,900],['Mobile game preview',390,844]]){
     const column=node('section'),stage=node('div',null,'photo-pan-stage photo-game-preview'),image=node('img');
     stage.style.aspectRatio=String(globalThis.PWCPhotoDisplay.gameRatio(width,height));stage.style.maxHeight='none';
     image.src=photoUrl;image.alt='';stage.append(image);column.append(node('h3',label),stage);previews.append(column);images.push(image);stages.push(stage);viewports.push([width,height]);
     stage.onpointerdown=e=>{if(!manual.checked||busy)return;e.preventDefault();stage.setPointerCapture(e.pointerId);drag={stage,x:e.clientX,y:e.clientY,p:settings.position.split(' ').map(parseFloat)};};
     stage.onpointermove=e=>{if(!drag||drag.stage!==stage||!image.naturalWidth)return;
      const g=globalThis.PWCPhotoDisplay.geometry(image.naturalWidth,image.naturalHeight,stage.clientWidth,stage.clientHeight,settings);
      const x=g.width-stage.clientWidth,y=g.height-stage.clientHeight;
      settings.position=`${(x>0?Math.max(0,Math.min(100,drag.p[0]-(e.clientX-drag.x)/x*100)):50).toFixed(3)}% ${(y>0?Math.max(0,Math.min(100,drag.p[1]-(e.clientY-drag.y)/y*100)):50).toFixed(3)}%`;paint();};
     stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
    }
    const zoomLabel=node('label','Zoom'),zoom=node('input');zoom.type='range';zoom.min='1';zoom.max='2.5';zoom.step='.01';zoom.value=String(settings.b2_zoom);zoomLabel.append(zoom);
    const message=node('p','', 'help');message.setAttribute('role','status');
    const apply=node('button','Apply display area','btn primary'),reset=node('button','Return to automatic','btn'),close=node('button','Cancel','btn');
    function paint(){zoom.disabled=!manual.checked||busy;for(const image of images)globalThis.PWCPhotoDisplay.apply(image,settings);for(const stage of stages)stage.classList.toggle('manual',manual.checked);}
    manual.onchange=()=>{if(!manual.checked){settings={fit:'cover',position:'50% 50%',b2_zoom:1};zoom.value='1';}paint();};zoom.oninput=()=>{settings.b2_zoom=Number(zoom.value);paint();};
    screen.onchange=()=>{stages.forEach((stage,i)=>stage.style.aspectRatio=String(globalThis.PWCPhotoDisplay[screen.value==='result'?'resultRatio':'gameRatio'](...viewports[i])));};
    let saving=false;async function persist(value){if(busy||saving)return;busy=saving=true;apply.disabled=reset.disabled=close.disabled=manual.disabled=true;paint();message.textContent='Saving display area...';
     try{await saveDisplay(slot.id,value);dialog.close();busy=false;await refresh();notify('Display area saved.','success');}
     catch(e){message.textContent=e.message;notify(e.message,'error');}
     finally{busy=saving=false;apply.disabled=reset.disabled=close.disabled=manual.disabled=false;paint();}}
    apply.onclick=()=>persist(manual.checked?settings:{fit:'cover',position:'50% 50%'});reset.onclick=()=>persist({fit:'cover',position:'50% 50%'});
    close.onclick=()=>dialog.close();dialog.oncancel=e=>{if(saving)e.preventDefault();};dialog.onclose=()=>dialog.remove();
    dialog.append(heading,name,full,manualLabel,screenLabel,node('p','Drag either preview to move the photo. Both previews use the same saved position and zoom.','help'),previews,zoomLabel,message,apply,reset,close);document.body.append(dialog);dialog.showModal();paint();
   };
   async function accept(file){if(!file||busy)return;if(!canEdit()){status.textContent='This revision cannot be edited.';return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Choose a JPG, PNG or WebP photo up to 8 MB.';return;}
    busy=true;const original=[...root.querySelectorAll('button,input')].map(e=>[e,e.disabled]);original.forEach(([e])=>e.disabled=true);status.textContent='Optimizing and uploading...';
    try{const result=await upload(slot.id,file);busy=false;await refresh();notify(result?.optimized_bytes?`Photo ready: ${file.size} bytes → ${result.optimized_bytes} bytes.`:'Photo updated.','success');}
    catch(error){status.textContent=error.message;notify(error.message,'error');
     if(error.resume){const resume=node('button','Complete usage rights','btn small');resume.type='button';card.append(resume);
      resume.onclick=async()=>{if(busy)return;busy=true;resume.disabled=true;try{await error.resume();busy=false;await refresh();notify('Photo updated.','success');}catch(next){status.textContent=next.message;notify(next.message,'error');}finally{busy=false;resume.disabled=false;}};
     }
    }
    finally{busy=false;original.forEach(([e,disabled])=>e.disabled=disabled);input.value='';}
   }
   pick.onclick=()=>input.click();input.onchange=()=>accept(input.files[0]);
   card.ondragover=e=>{e.preventDefault();card.classList.add('drag-over');};card.ondragleave=()=>card.classList.remove('drag-over');
   card.ondrop=e=>{e.preventDefault();card.classList.remove('drag-over');void accept(e.dataTransfer.files[0]);};
   void load();
  }
 }
 root.refresh=refresh;void refresh();return root;
}
