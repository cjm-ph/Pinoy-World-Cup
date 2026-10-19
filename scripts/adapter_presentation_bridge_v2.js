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
 if(root.PWCPhotoDisplay&&settings.b2_zoom)root.PWCPhotoDisplay.apply(image,settings);
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
const start=root.start,dialog=document.getElementById('roundSelection');
root.start=function(t){
 const wasOpen=dialog.open,result=start.apply(this,arguments);
 if(!wasOpen&&dialog.open){
  const id=(t||root.tour)?.id,settings=view.representatives[id]?.start,container=dialog.querySelector('.round-photo-frame');
  paint(container,container.querySelector('.round-cover'),container.querySelector('.round-emoji'),dialog.querySelector('.round-photo-backdrop'),settings,'round-cover');
 }
 return result;
};
const show=root.show;
root.show=function(id){
 const target=id==='play'?view.vsPhotos:id==='end'?view.resultPhotos:null;
 if(target)for(const [participantId,settings] of Object.entries(target))root.WorldCupVSPresentation.photos[participantId]=JSON.parse(JSON.stringify(settings));
 return show.apply(this,arguments);
};
cards();
})(window);
