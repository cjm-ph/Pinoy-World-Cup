/* Home-only presentation. Existing registry, selection dialog and engine stay unchanged. */
(function(root){
'use strict';
var $=id=>document.getElementById(id);
var selectedCategory='all';
var homeOrder=root.WorldCupHomeOrdering.create(root.WorldCupHomeConfig,root.TOURNAMENTS);
root.WorldCupHomeOrder=homeOrder;
function category(t){
 var kind=String(t.category||t.type||'').toLowerCase();
 if(kind==='food')return 'food';
 if(['actor','actress','singer','others'].includes(kind))return kind;
 var label=(t.id+' '+t.title).toLowerCase();
 if(label.includes('actress'))return 'actress';
 if(/\bactor\b|actors/.test(label))return 'actor';
 if(label.includes('singer'))return 'singer';
 return 'others';
}
root.buildGrid=function(){
 var grid=$('grid');grid.textContent='';var query=$('homeSearch').value.trim().toLowerCase(),filter=selectedCategory;
 var visible=homeOrder.order(root.TOURNAMENTS).filter(t=>(!query||t.title.toLowerCase().includes(query))&&(filter==='all'||category(t)===filter));
 $('homeEmpty').hidden=visible.length>0;
 visible.forEach(function(t){
  var count=root.WorldCupSelection.uniqueActive(t.items).length;
  var card=document.createElement('article');card.className='home-card';card.setAttribute('data-tournament-id',t.id);card.setAttribute('data-category',category(t));
  var media=document.createElement('button');media.type='button';media.className='home-photo';media.setAttribute('aria-label','Choose a round for '+t.title);media.onclick=()=>root.start(t);
  var fallback=document.createElement('span');fallback.className='home-fallback';fallback.textContent=t.items.slice(0,4).map(p=>p.e||'★').join(' ')||'★';media.appendChild(fallback);
  var representative=t.items.find(p=>p.active!==false&&(p._localPhoto||p.img));var src=t.cover_image||representative?._localPhoto||representative?.img;
  if(src){var image=document.createElement('img');image.alt=t.title;image.loading='lazy';image.onload=()=>{fallback.hidden=true;};image.onerror=()=>{image.hidden=true;fallback.hidden=false;};image.src=src;if(t.cover_object_position)image.style.objectPosition=t.cover_object_position;media.appendChild(image);}
  var badge=document.createElement('span');badge.className='home-badge';badge.textContent=category(t).toUpperCase();media.appendChild(badge);card.appendChild(media);
  var body=document.createElement('div');body.className='home-card-body';
  var row=document.createElement('div');row.className='home-title-row';
  var title=document.createElement('button');title.type='button';title.className='home-title';title.textContent=t.title;title.onclick=()=>root.start(t);row.appendChild(title);
  var details=document.createElement('button');details.type='button';details.className='home-details';details.textContent='Details';details.setAttribute('aria-label','Details for '+t.title+' - coming soon');details.onclick=function(event){event.stopPropagation();$('homeDetailsTitle').textContent=t.title;$('homeDetailsDialog').showModal();};row.appendChild(details);body.appendChild(row);
  card.appendChild(body);grid.appendChild(card);

 });
};
$('homeSearch').oninput=root.buildGrid;
['All','Food','Actor','Actress','Singer','Others'].forEach(function(label){var tab=document.createElement('button');tab.type='button';tab.textContent=label;tab.className='home-tab';tab.setAttribute('aria-pressed',String(label==='All'));tab.onclick=function(){selectedCategory=label.toLowerCase();Array.from($('homeTabs').children).forEach(function(button){button.setAttribute('aria-pressed',String(button===tab));});root.buildGrid();};$('homeTabs').appendChild(tab);});
$('heroStart').onclick=function(){$('homeCatalogue').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};

$('homeDetailsClose').onclick=()=>$('homeDetailsDialog').close();
$('homeBrand').onclick=function(event){event.preventDefault();root.goHome();};
root.buildGrid();
})(window);
