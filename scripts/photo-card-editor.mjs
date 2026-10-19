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
    const image=node('img');image.src=photoUrl;image.alt=slot.name;image.dataset.i18nSkip='';frame.replaceChildren(image);globalThis.PWCPhotoDisplay.apply(image,slot.settings);const r=globalThis.PWCPhotoDisplay[slot.id==='cover'?'coverRatio':'gameRatio'](innerWidth,innerHeight);frame.style.aspectRatio=String(r);frame.style.width=`min(100%, ${150*r}px)`;frame.style.height='auto';frame.style.marginInline='auto';
   }catch(e){status.textContent=e.message;}}
   edit.onclick=()=>openEditor();
   function openEditor(file){
    if((!file&&!photoUrl)||busy||!canEdit())return;
    const localUrl=file?URL.createObjectURL(file):null,url=localUrl||photoUrl;let retry=null;
    const dialog=node('dialog',null,'photo-display-dialog');dialog.setAttribute('aria-label','Edit display area');
    const heading=node('h2',file?'Upload and edit photo':'Edit display area'),name=node('p',slot.name);if(slot.id!=='cover')name.dataset.i18nSkip='';
    const manualLabel=node('label',null,'checkbox'),manual=node('input');manual.type='checkbox';
    let settings=globalThis.PWCPhotoDisplay.normalize(file?{}:slot.settings),drag;
    manual.checked=settings.b2_zoom!==1||settings.position!=='50% 50%';
    manualLabel.append(manual,document.createTextNode('Adjust display area manually'));
    const screenLabel=node('label','Preview screen'),screen=node('select');screen.setAttribute('aria-label','Preview screen');
    for(const [value,label] of (slot.id==='cover'?[['cover','Cover (start screen)']]:[['vs','VS match'],['result','Winner screen']])){const option=node('option',label);option.value=value;screen.append(option);}screenLabel.append(screen);
    const previews=node('div',null,'photo-device-previews');
    const images=[],stages=[],viewports=[];
    for(const [label,width,height] of [['Desktop game preview',1440,900],['Mobile game preview',390,844]]){
     const column=node('section'),stage=node('div',null,'photo-pan-stage photo-game-preview'),image=node('img');
     stage.style.aspectRatio=String(globalThis.PWCPhotoDisplay.gameRatio(width,height));
     image.src=url;image.alt='';stage.append(image);column.append(node('h3',label),stage);previews.append(column);images.push(image);stages.push(stage);viewports.push([width,height]);
     stage.onpointerdown=e=>{if(!manual.checked||busy)return;e.preventDefault();stage.setPointerCapture(e.pointerId);drag={stage,x:e.clientX,y:e.clientY,p:settings.position.split(' ').map(parseFloat)};};
     stage.onpointermove=e=>{if(!drag||drag.stage!==stage||!image.naturalWidth)return;
      const g=globalThis.PWCPhotoDisplay.geometry(image.naturalWidth,image.naturalHeight,stage.clientWidth,stage.clientHeight,settings);
      const x=g.width-stage.clientWidth,y=g.height-stage.clientHeight;
      settings.position=`${(x>0?Math.max(0,Math.min(100,drag.p[0]-(e.clientX-drag.x)/x*100)):50).toFixed(3)}% ${(y>0?Math.max(0,Math.min(100,drag.p[1]-(e.clientY-drag.y)/y*100)):50).toFixed(3)}%`;paint();};
     stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
    }
    const zoomLabel=node('label','Zoom'),zoom=node('input');zoom.type='range';zoom.min='1';zoom.max='2.5';zoom.step='.01';zoom.value=String(settings.b2_zoom);zoomLabel.append(zoom);
    const message=node('p','', 'help');message.setAttribute('role','status');
    const apply=node('button',file?'Apply photo':'Apply display area','btn primary'),reset=node('button','Return to automatic','btn'),close=node('button','Cancel','btn');
    function paint(){zoom.disabled=!manual.checked||busy;for(const image of images)globalThis.PWCPhotoDisplay.apply(image,settings);for(const stage of stages)stage.classList.toggle('manual',manual.checked);}
    manual.onchange=()=>{if(!manual.checked){settings={fit:'cover',position:'50% 50%',b2_zoom:1};zoom.value='1';}paint();};zoom.oninput=()=>{settings.b2_zoom=Number(zoom.value);paint();};
    function ratios(){viewports[0]=innerWidth>=768?[innerWidth,innerHeight]:[1440,900];viewports[1]=innerWidth<768?[innerWidth,innerHeight]:[390,844];stages.forEach((stage,i)=>{const ratio=globalThis.PWCPhotoDisplay[screen.value==='cover'?'coverRatio':screen.value==='result'?'resultRatio':'gameRatio'](...viewports[i]);stage.style.aspectRatio=String(ratio);stage.style.width=`min(100%, ${Math.min(240,innerHeight*.3)*ratio}px)`;stage.style.maxHeight='240px';});}
    screen.onchange=ratios;window.addEventListener('resize',ratios);
    const rights=node('div',null,'photo-upload-rights'),basisLabel=node('label','Photo usage rights'),basis=node('select');basis.setAttribute('aria-label','Photo usage rights');
    for(const [value,text] of [['','Choose a truthful rights statement'],['own','I took this photo and permit its use'],['permission','I have a license or permission to use it']]){const option=node('option',text);option.value=value;basis.append(option);}basisLabel.append(basis);
    const notes=node('textarea');notes.setAttribute('aria-label','Source / notes (optional)');notes.placeholder='Source / notes (optional)';
    rights.append(basisLabel,notes);rights.hidden=!file;
    let saving=false;
    const enabled=()=>{apply.disabled=saving||!!file&&!basis.value;};basis.onchange=enabled;
    async function persist(value){if(busy||saving||file&&!basis.value)return;busy=saving=true;apply.disabled=reset.disabled=close.disabled=manual.disabled=basis.disabled=true;paint();message.textContent=file?'Optimizing and uploading...':'Saving display area...';
     try{const result=file?await (retry?retry(value,{basis:basis.value,notes:notes.value.trim()}):upload(slot.id,file,value,{basis:basis.value,notes:notes.value.trim()})):await saveDisplay(slot.id,value);
      dialog.close();busy=false;await refresh();notify(result?.optimized_bytes?`Photo ready: ${file.size} bytes \u2192 ${result.optimized_bytes} bytes.`:file?'Photo updated.':'Display area saved.','success');}
     catch(e){retry=e.resume||retry;message.textContent=e.message;notify(e.message,'error');}
     finally{busy=saving=false;reset.disabled=close.disabled=manual.disabled=basis.disabled=false;enabled();paint();}}
    apply.onclick=()=>persist(manual.checked?settings:{fit:'cover',position:'50% 50%'});
    reset.onclick=()=>{settings={fit:'cover',position:'50% 50%',b2_zoom:1};manual.checked=false;zoom.value='1';paint();};
    close.onclick=()=>dialog.close();dialog.oncancel=e=>{if(saving)e.preventDefault();};dialog.onclose=()=>{window.removeEventListener('resize',ratios);if(localUrl)URL.revokeObjectURL(localUrl);dialog.remove();input.value='';};
    dialog.append(heading,name,manualLabel,screenLabel,previews,zoomLabel,rights,message,apply,reset,close);document.body.append(dialog);dialog.showModal();ratios();paint();enabled();
   }
   function accept(file){if(!file||busy)return;if(!canEdit()){status.textContent='This revision cannot be edited.';return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){status.textContent='Choose a JPG, PNG or WebP photo up to 8 MB.';return;}openEditor(file);}
   pick.onclick=()=>input.click();input.onchange=()=>accept(input.files[0]);
   card.ondragover=e=>{e.preventDefault();card.classList.add('drag-over');};card.ondragleave=()=>card.classList.remove('drag-over');
   card.ondrop=e=>{e.preventDefault();card.classList.remove('drag-over');void accept(e.dataTransfer.files[0]);};
   void load();
  }
 }
 root.refresh=refresh;void refresh();return root;
}
