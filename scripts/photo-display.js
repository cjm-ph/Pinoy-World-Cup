// Shared by administrator previews, VS cards, winner cards and cover presentation.
(function(root){
 'use strict';
 function normalize(s){
  s=s||{};const p=String(s.position||'50% 50%').match(/^([\d.]+)% ([\d.]+)%$/);
  return {fit:'cover',position:p?Math.max(0,Math.min(100,+p[1]))+'% '+Math.max(0,Math.min(100,+p[2]))+'%':'50% 50%',b2_zoom:Math.max(1,Math.min(2.5,Number(s.b2_zoom)||1))};
 }
 function apply(image,settings){
  const s=normalize(settings);image.style.objectFit='cover';image.style.objectPosition=s.position;
  image.style.transformOrigin=s.position;image.style.transform=s.b2_zoom===1?'none':'scale('+s.b2_zoom+')';
 }
 function geometry(nw,nh,w,h,settings){
  const s=normalize(settings),p=s.position.split(' ').map(parseFloat),scale=Math.max(w/nw,h/nh)*s.b2_zoom;
  return {width:nw*scale,height:nh*scale,x:(w-nw*scale)*p[0]/100,y:(h-nh*scale)*p[1]/100};
 }
 function gameRatio(width,height){return width>=768?((Math.min(width,1540)-44)/2)/Math.max(1,height-84):((width-2)/2)/Math.max(1,height-56);}
 root.PWCPhotoDisplay={normalize,apply,geometry,gameRatio};
})(globalThis);
