import './photo-display.js';
// Reusable UI: caller supplies authorized persistence and photo loading adapters.
export function createPhotoCards({getSlots,loadPhoto,upload,saveDisplay,canEdit=()=>true,getLanguage=()=> 'en',notify=()=>{}}){
 const root=document.createElement('div');root.className='photo-editor-grid';
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 let busy=false;
 async function refresh(){
  root.replaceChildren();
  for(const slot of getSlots()){
   const card=node('article',null,'photo-editor-card');card.dataset.photoSlot=slot.id;
   const title=node('h3',slot.name);if(slot.id!=='cover')title.dataset.i18nSkip='';
   const pick=node('button',slot.asset?'Replace photo':'＋ Add photo','btn photo-picker');pick.type='button';pick.disabled=busy||!canEdit();
   const input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;
   input.setAttribute('aria-label',slot.id==='cover'?'Choose cover photo':'Choose candidate photo');
   const frame=node('div',null,'photo-original');frame.append(node('span','Full image','help'));
   const preview=node('div',null,'photo-game-preview');preview.setAttribute('aria-label','Game card preview');
   const device=node('select');device.setAttribute('aria-label','Preview device');
   for(const [value,text] of [['desktop','Desktop game preview'],['mobile','Mobile game preview']]){const o=node('option',text);o.value=value;device.append(o);}
   const status=node('p','', 'help');status.setAttribute('role','status');
   card.append(title,frame,device,preview,pick,input,status);root.append(card);
   frame.tabIndex=0;frame.setAttribute('role','button');frame.setAttribute('aria-label','Add or replace photo');
   frame.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!busy&&canEdit())input.click();}};
   card.onclick=e=>{if(!busy&&canEdit()&&!e.target.closest('button,input,select,textarea,label,.photo-adjust-controls'))input.click();};
   const manualLabel=node('label',null,'checkbox'),manual=node('input');manual.type='checkbox';
   manual.disabled=!canEdit();
   const initial=globalThis.PWCPhotoDisplay.normalize(slot.settings);manual.checked=!!slot.settings?.b2_zoom||initial.position!=='50% 50%';
   manualLabel.append(manual,document.createTextNode('Adjust display area manually'));card.append(manualLabel);
   let settings={...initial},image=null;
   const controls=node('div',null,'photo-adjust-controls');controls.hidden=!manual.checked;
   const canvas=node('div',null,'photo-pan-stage'),panImage=node('img'),selection=node('div',null,'photo-selection');selection.append(panImage);canvas.append(selection);
   const before=node('div',null,'photo-game-preview'),after=node('div',null,'photo-game-preview');
   const comparison=node('div',null,'photo-comparison');comparison.append(before,after);
   function ratio(){const r=globalThis.PWCPhotoDisplay.gameRatio(...(device.value==='mobile'?[390,844]:[1440,900]));for(const box of [preview,before,after,canvas]){box.style.aspectRatio=String(r);box.style.width='100%';box.style.maxWidth=`min(100%, ${260*r}px)`;box.style.maxHeight='none';box.style.marginInline='auto';}}
   device.onchange=ratio;ratio();
   const zoomLabel=node('label','Zoom'),zoom=node('input');zoom.type='range';zoom.min='1';zoom.max='2.5';zoom.step='.01';zoom.value=String(settings.b2_zoom);zoomLabel.append(zoom);
   const apply=node('button','Apply display area','btn small'),reset=node('button','Return to automatic','btn small');apply.type=reset.type='button';
   apply.disabled=reset.disabled=!canEdit();
   controls.append(node('p','Drag the image to move it. The frame shows the game area; the dimmed border shows the rest of the image.','help'),canvas,zoomLabel,node('p','Before / After','help'),comparison,apply,reset);card.append(controls);
   function paint(){for(const container of [preview,after]){const img=container.querySelector('img');if(img)globalThis.PWCPhotoDisplay.apply(img,settings);}globalThis.PWCPhotoDisplay.apply(panImage,settings);}
   async function load(){if(!slot.asset){manual.disabled=true;preview.append(node('span','Automatic game display','help'));return;}
    const url=await loadPhoto(slot.asset);if(!url||!card.isConnected)return;
    image=node('img');image.src=url;image.alt=slot.name;image.dataset.i18nSkip='';frame.replaceChildren(image);
    for(const container of [preview,before,after]){const img=node('img');img.src=url;img.alt='';container.replaceChildren(img);}
    panImage.src=url;panImage.alt='';canvas.style.backgroundImage=`linear-gradient(#09111a88,#09111a88),url("${url}")`;globalThis.PWCPhotoDisplay.apply(before.firstChild,initial);paint();
   }
   manual.onchange=()=>{controls.hidden=!manual.checked;if(!manual.checked)void persist({fit:'cover',position:'50% 50%'});};
   zoom.oninput=()=>{settings.b2_zoom=Number(zoom.value);paint();};
   let drag;
   canvas.onpointerdown=e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,p:settings.position.split(' ').map(parseFloat)};};
   canvas.onpointermove=e=>{if(!drag||!panImage.naturalWidth)return;const g=globalThis.PWCPhotoDisplay.geometry(panImage.naturalWidth,panImage.naturalHeight,selection.clientWidth,selection.clientHeight,settings);
    const x=drag.p[0]-(e.clientX-drag.x)/Math.max(1,g.width-selection.clientWidth)*100,y=drag.p[1]-(e.clientY-drag.y)/Math.max(1,g.height-selection.clientHeight)*100;
    settings.position=`${Math.max(0,Math.min(100,x)).toFixed(3)}% ${Math.max(0,Math.min(100,y)).toFixed(3)}%`;paint();};
   canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
   async function persist(value){if(busy)return;busy=true;apply.disabled=reset.disabled=true;status.textContent='Saving display area...';try{await saveDisplay(slot.id,value);busy=false;await refresh();notify('Display area saved.','success');}catch(e){status.textContent=e.message;notify(e.message,'error');}finally{busy=false;apply.disabled=reset.disabled=false;}}
   apply.onclick=()=>persist(settings);reset.onclick=()=>persist({fit:'cover',position:'50% 50%'});
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
