(function(root){
 'use strict';
 var end=document.getElementById('end'),art=document.getElementById('winArt'),name=document.getElementById('winName');
 var again=document.getElementById('again'),share=document.getElementById('shareBtn'),home=document.getElementById('home'),msg=document.getElementById('msg');
 function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;}
 var paths={again:'M4 10a8 8 0 1 1 1 8M4 4v6h6',share:'M12 16V3m-5 5 5-5 5 5M5 12v8h14v-8',home:'m3 11 9-8 9 8M6 9v12h12V9M10 21v-7h4v7',stats:'M5 20V10m7 10V4m7 16v-7'};
 function icon(button,key,label){button.textContent='';var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','result-icon');svg.setAttribute('aria-hidden','true');var p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[key]);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.6');p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.appendChild(p);button.append(svg,el('span','',label));button.type='button';}
 var photo=el('figure','result-photo'),caption=el('figcaption','result-caption');caption.append(el('div','result-kicker','CHAMPION'),name);photo.append(art,caption);
 var actions=el('nav','result-actions');actions.setAttribute('aria-label','Champion actions');
 var statsButton=el('button','','Statistics');statsButton.id='resultStatistics';statsButton.setAttribute('aria-expanded','false');statsButton.setAttribute('aria-controls','resultStats');
 [[again,'again','Play Again'],[share,'share','Share'],[home,'home','Home'],[statsButton,'stats','Statistics']].forEach(function(a){icon.apply(null,a);actions.appendChild(a[0]);});
 var stats=el('section','result-stats');stats.id='resultStats';stats.hidden=true;stats.tabIndex=-1;stats.setAttribute('aria-labelledby','resultStatsTitle');
 var title=el('h2','','Statistics');title.id='resultStatsTitle';
 // Keep shared engine targets available without presenting disconnected values as statistics.
 var rank=document.getElementById('rank'),detail=document.getElementById('detail');rank.hidden=true;detail.hidden=true;
 var statsClose=el('button','result-stats-close','Back to champion');statsClose.type='button';
 stats.append(title,el('p','','Statistics are not connected yet. No global rankings or play counts are available.'),rank,detail,statsClose);
 var comments=el('section','result-comments');comments.id='resultComments';comments.dataset.state='disconnected';comments.setAttribute('aria-labelledby','resultCommentsTitle');
 var ch=el('h2','','Comments');ch.id='resultCommentsTitle';
 var notice=el('p','','Comments are not connected yet. Reading and posting will be available after the service is connected.');notice.id='resultCommentsStatus';
 var list=document.getElementById('list');list.hidden=true;list.dataset.role='comment-list';
 var form=el('form');form.dataset.role='comment-composer';form.setAttribute('aria-describedby',notice.id);form.onsubmit=function(e){e.preventDefault();};
 var fields=el('fieldset');fields.disabled=true;
 [['nick','Nickname'],['txt','Comment']].forEach(function(pair){var label=el('label','',pair[1]);var input=document.getElementById(pair[0]);input.placeholder=pair[1];label.appendChild(input);fields.appendChild(label);});
 var send=document.getElementById('send');send.disabled=true;send.type='submit';fields.appendChild(send);form.appendChild(fields);
 comments.append(ch,notice,list,form,document.getElementById('cmsg'));
 end.replaceChildren(photo,actions,msg,stats,comments);end.classList.add('result-immersive');msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');
 statsButton.onclick=function(){stats.hidden=!stats.hidden;statsButton.setAttribute('aria-expanded',String(!stats.hidden));if(!stats.hidden){stats.focus({preventScroll:true});stats.scrollIntoView({block:'start'});}};
 statsClose.onclick=function(){stats.hidden=true;statsButton.setAttribute('aria-expanded','false');statsButton.focus({preventScroll:true});photo.scrollIntoView({block:'start'});};
 again.onclick=function(){root.start(root.TOURNAMENTS.find(function(t){return t.id===root.tour.id;}));};
 function publicURL(){var url=new URL(location.href),host=url.hostname.toLowerCase();if(!/^https?:$/.test(url.protocol)||!host.includes('.')||/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||/\.(localhost|local|test|invalid)$/.test(host)||host==='[::1]')return null;url.hash='';return url.href;}
 var sharing=false;
 share.onclick=async function(){
  if(sharing)return;var url=publicURL();
  if(!url){msg.textContent='Sharing will be available when this site has a public link.';return;}
  sharing=true;
  try{if(navigator.share){await navigator.share({title:root.tour.title,text:'My champion: '+root.champ.n,url:url});msg.textContent='';}
   else if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);msg.textContent='Link copied.';}
   else msg.textContent='Copy this link: '+url;
  }catch(error){if(error.name!=='AbortError')msg.textContent='Unable to share. Copy this link: '+url;}
  finally{sharing=false;}
 };
 function fit(){
  var image=art.querySelector('.result-image');if(!image||!image.naturalWidth)return;
  var p=root.champ,settings=(root.WorldCupVSPresentation.photos[p.id]||{}),head=settings.head;
  var w=photo.clientWidth,h=photo.clientHeight,nw=image.naturalWidth,nh=image.naturalHeight;
  var scale=Math.max(w/nw,h/nh),reserved=caption.clientHeight-35;
  var position=settings.position||p.object_position||'50% 50%';var parts=position.split(/\s+/).map(parseFloat);
  var x=(w-nw*scale)*(Number.isFinite(parts[0])?parts[0]/100:.5),y=(h-nh*scale)*(Number.isFinite(parts[1])?parts[1]/100:.5);
  if((settings.b2_zoom||settings.devices)&&root.PWCPhotoDisplay){var crop=root.PWCPhotoDisplay.geometry(nw,nh,w,h,settings);scale=crop.width/nw;x=crop.x;y=crop.y;}
  else if(head){
   scale=Math.min(scale,(w-16)/(nw*head[2]),(h-reserved-24)/(nh*head[3]));
   x=w/2-(head[0]+head[2]/2)*nw*scale;
   y=h*.32-(head[1]+head[3]/2)*nh*scale;
   x=Math.max(8-head[0]*nw*scale,Math.min(w-8-(head[0]+head[2])*nw*scale,x));
   y=Math.max(12-head[1]*nh*scale,Math.min(h-reserved-12-(head[1]+head[3])*nh*scale,y));
   image.dataset.headBox=JSON.stringify([x+head[0]*nw*scale,y+head[1]*nh*scale,head[2]*nw*scale,head[3]*nh*scale]);
  }else if(settings.fit==='contain'||p.object_fit==='contain'){scale=Math.min(w/nw,(h-reserved)/nh);x=(w-nw*scale)/2;y=(h-reserved-nh*scale)/2;}
  if(root.PWCPhotoDisplay){var filled=root.PWCPhotoDisplay.geometry(nw,nh,w,h,root.PWCPhotoDisplay.gameSettings({...settings,position}));scale=filled.width/nw;x=filled.x;y=filled.y;}
  image.style.cssText='width:'+nw*scale+'px;height:'+nh*scale+'px;left:'+x+'px;top:'+y+'px;object-fit:contain;object-position:'+position;
 }
 var originalFinish=root.finish;
 root.finish=function(){
  originalFinish();stats.hidden=true;statsButton.setAttribute('aria-expanded','false');msg.textContent='';
  // The completed engine's actual champion remains the only result data source.
  var p=root.champ,source=['youtube','giphy'].includes(p.media?.type)?null:(p._localPhoto||p.img);art.textContent='';photo.querySelectorAll('.result-backdrop').forEach(function(n){n.remove();});
  var fallback=el('span','result-fallback',p.e||'\u2605');art.appendChild(fallback);
  if(source){var bg=el('img','result-backdrop');bg.alt='';bg.src=source;photo.prepend(bg);
   var image=el('img','result-image');image.alt=p.n;image.onload=function(){fallback.hidden=true;fit();};image.onerror=function(){image.hidden=true;bg.hidden=true;fallback.hidden=false;};image.src=source;art.appendChild(image);
  }
  list.textContent='';end.classList.remove('result-arrival');void end.offsetWidth;end.classList.add('result-arrival');root.scrollTo(0,0);
 };
 new ResizeObserver(fit).observe(photo);
})(window);
