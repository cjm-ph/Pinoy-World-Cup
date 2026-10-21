/* Connect model-provided settings to approved DOM and crop calculators. */
(function(root){
'use strict';
const view=root.PinoyAdapterV2.viewModel;
function paint(container,image,fallback,background,settings,cls){
 if(!settings)return;
 if(!settings.source){if(image)image.hidden=true;if(background)background.hidden=true;if(fallback)fallback.hidden=false;return;}
 if(!image){image=document.createElement('img');if(cls)image.className=cls;image.alt='';container.appendChild(image);}
 image.hidden=false;
 image.onload=()=>{if(fallback)fallback.hidden=true;};
 image.onerror=()=>{image.hidden=true;if(background)background.hidden=true;if(fallback)fallback.hidden=false;};
 if(settings.fit)image.style.objectFit=settings.fit;
 if(settings.position)image.style.objectPosition=settings.position;
 if(cls==='round-cover'&&(settings.fit==='cover'||settings.fit==='contain'||settings.devices)){
  container.style.padding='0';container.style.overflow='hidden';
  image.style.width='100%';image.style.height='100%';image.style.maxWidth='none';image.style.maxHeight='none';
 }
 if(root.PWCPhotoDisplay&&(settings.b2_zoom||settings.devices))root.PWCPhotoDisplay.apply(image,settings);
 else{image.style.transform='none';image.style.transformOrigin='50% 50%';}
 if(image.getAttribute('src')!==settings.source)image.src=settings.source;
 else if(image.complete&&image.naturalWidth&&fallback)fallback.hidden=true;
 if(background){background.hidden=false;background.style.objectPosition=settings.position||'50% 50%';if(background.getAttribute('src')!==settings.source)background.src=settings.source;}
}
function cards(){document.querySelectorAll('.home-card').forEach(card=>{
 const settings=view.representatives[card.dataset.tournamentId]?.main,container=card.querySelector('.home-photo');
 if(container)paint(container,container.querySelector('img'),container.querySelector('.home-fallback'),null,settings);
});}
const build=root.buildGrid;root.buildGrid=function(){const result=build.apply(this,arguments);cards();return result;};
// The existing search input retains the original bound buildGrid function.
document.getElementById('homeSearch').addEventListener('input',cards);
let activeCover=null;
const start=root.start,dialog=document.getElementById('roundSelection');
root.start=function(t){
 const wasOpen=dialog.open,result=start.apply(this,arguments);
 if(!wasOpen&&dialog.open){
  const id=(t||root.tour)?.id,settings=view.representatives[id]?.start,container=dialog.querySelector('.round-photo-frame');
  activeCover=settings;paint(container,container.querySelector('.round-cover'),container.querySelector('.round-emoji'),dialog.querySelector('.round-photo-backdrop'),settings,'round-cover');
 }
 return result;
};
const show=root.show;
root.show=function(id){
 // Staging has one candidate framing editor: the winner reuses the VS crop.
 // Keep legacy result settings/data and non-Staging display behavior intact.
 const sharedWinner=id==='end'&&root.PWC_STAGING?.supabaseUrl==='https://cmnomqsurdwhdbjgnsvw.supabase.co';
 const target=id==='play'||sharedWinner?view.vsPhotos:id==='end'?view.resultPhotos:null;
 if(target)for(const [participantId,settings] of Object.entries(target))root.WorldCupVSPresentation.photos[participantId]=JSON.parse(JSON.stringify(settings));
 return show.apply(this,arguments);
};
let resizeFrame=0;root.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{cards();if(dialog.open&&activeCover){const container=dialog.querySelector('.round-photo-frame');paint(container,container.querySelector('.round-cover'),container.querySelector('.round-emoji'),dialog.querySelector('.round-photo-backdrop'),activeCover,'round-cover');}document.querySelectorAll('.carousel-slide').forEach(slide=>{const image=slide.querySelector('.carousel-photo'),cfg=view.representatives[slide.dataset.tournamentId]?.banner;if(image&&cfg?.devices)root.PWCPhotoDisplay.apply(image,cfg);});});});
cards();
})(window);
