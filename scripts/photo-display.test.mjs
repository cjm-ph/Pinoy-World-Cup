import test from 'node:test';
import assert from 'node:assert/strict';
import './photo-display.js';
const display=globalThis.PWCPhotoDisplay;

test('desktop/mobile branches resolve independently and old flat settings remain compatible',()=>{
 const legacy={position:'25% 75%',b2_zoom:1.4};
 assert.deepEqual(display.normalize(legacy,'desktop'),display.normalize(legacy,'mobile'));
 const settings={...legacy,devices:{desktop:{position:'10% 20%',b2_zoom:1.8},mobile:{position:'70% 80%',b2_zoom:1.2}}};
 assert.equal(display.normalize(settings,'desktop').b2_zoom,1.8);assert.equal(display.normalize(settings,'mobile').b2_zoom,1.2);
 settings.devices.desktop.position='5% 5%';assert.equal(display.normalize(settings,'mobile').position,'70% 80%');
 const image={style:{}};display.apply(image,settings,'mobile');assert.equal(image.style.transform,'scale(1.2)');
 const g=display.geometry(800,1600,194,788,settings,'mobile');assert.ok(Math.abs(g.x-(194-g.width)*.7)<.00001);
});
test('portrait, landscape and square fit without distortion and share framing geometry',()=>{
 for(const [nw,nh] of [[800,1600],[1600,800],[1000,1000]])for(const [w,h] of [[698,816],[194,788]]){
  const g=display.geometry(nw,nh,w,h,{position:'25% 75%',b2_zoom:1.8});
  assert.ok(Math.abs(g.width/g.height-nw/nh)<1e-8);
  assert.ok(g.width>=w&&g.height>=h);
  assert.ok(Math.abs(g.x-(w-g.width)*.25)<1e-8);
 }
});
test('automatic reset clears zoom and clamps externally supplied framing safely',()=>{
 const image={style:{}};display.apply(image,{b2_zoom:2,position:'10% 90%'});
 assert.equal(image.style.transform,'scale(2)');display.apply(image,{});
 assert.equal(image.style.transform,'none');assert.equal(image.style.objectPosition,'50% 50%');
 assert.equal(display.normalize({b2_zoom:200}).b2_zoom,2.5);
});
test('preview ratios match the current VS viewport layout without advertisements',()=>{
 assert.equal(display.gameRatio(1440,900),698/816);
 assert.equal(display.gameRatio(390,844),194/788);
});

test('winner preview ratios follow the real result CSS on desktop and mobile',()=>{
 assert.equal(globalThis.PWCPhotoDisplay.resultRatio(1440,900),580/630);
 assert.equal(globalThis.PWCPhotoDisplay.resultRatio(390,844),390/(844*.76));
});

test('cover preview uses the same filled start-frame dimensions as the public round picker',()=>{
 assert.equal(display.coverRatio(1440,900),620/342);
 assert.equal(display.coverRatio(390,844),366/(844*.32));
});

test('Fit contains the entire poster; Fill covers the frame; modes remain independent',()=>{
 const cfg={devices:{desktop:{fit:'contain',position:'50% 50%',b2_zoom:1},mobile:{fit:'cover',position:'20% 70%',b2_zoom:1.2}}};
 const fit=display.geometry(800,1600,600,400,cfg,'desktop');assert.equal(fit.width,200);assert.equal(fit.height,400);assert.equal(fit.x,200);
 const fill=display.geometry(800,1600,194,788,cfg,'mobile');assert.ok(fill.width>=194&&fill.height>=788);
 const image={style:{}};display.apply(image,cfg,'desktop');assert.equal(image.style.objectFit,'contain');display.apply(image,cfg,'mobile');assert.equal(image.style.objectFit,'cover');
 assert.equal(display.automatic(800,1600).fit,'contain');assert.equal(display.automatic(1600,900).fit,'cover');assert.equal(display.automatic(1000,1000).fit,'cover');
 assert.equal(display.normalize({fit:'contain'},'desktop').fit,'contain');
});


test('game Fill covers identical mobile/desktop frames for portrait landscape poster and preserves saved data',()=>{
 const saved={fit:'contain',devices:{desktop:{fit:'contain',position:'20% 30%',b2_zoom:1.8},mobile:{fit:'contain',position:'70% 80%',b2_zoom:1.2}}},before=JSON.stringify(saved),policy=display.gameSettings(saved);
 for(const device of ['desktop','mobile'])for(const [nw,nh] of [[800,1600],[1600,800],[700,1000]]){
  const [w,h]=device==='mobile'?[194,788]:[698,816],g=display.geometry(nw,nh,w,h,policy,device);
  assert.ok(g.width>=w-1e-6&&g.height>=h-1e-6);assert.ok(g.x<=1e-6&&g.y<=1e-6);assert.ok(g.x+g.width>=w-1e-6&&g.y+g.height>=h-1e-6);
  assert.equal(display.normalize(policy,device).position,saved.devices[device].position);assert.equal(display.normalize(policy,device).b2_zoom,saved.devices[device].b2_zoom);
 }
 assert.equal(JSON.stringify(saved),before);policy.devices.desktop.position='0% 0%';assert.equal(policy.devices.mobile.position,'70% 80%');
});

test('only Staging honors saved independent Fit/Fill; default framing and other sites keep Fill',()=>{
 const previous=globalThis.PWC_STAGING;
 const saved={devices:{desktop:{fit:'contain',position:'20% 30%',b2_zoom:1.4},mobile:{fit:'cover',position:'70% 80%',b2_zoom:1.2}}},before=JSON.stringify(saved);
 try{
  globalThis.PWC_STAGING={supabaseUrl:'https://cmnomqsurdwhdbjgnsvw.supabase.co'};
  const policy=display.gameSettings(saved);
  assert.equal(display.normalize(policy,'desktop').fit,'contain');
  assert.equal(display.normalize(policy,'mobile').fit,'cover');
  assert.equal(display.normalize(display.gameSettings({}),'desktop').fit,'cover');
  assert.equal(JSON.stringify(saved),before);
  policy.devices.desktop.position='0% 0%';assert.equal(saved.devices.desktop.position,'20% 30%');
  globalThis.PWC_STAGING={supabaseUrl:'https://other.invalid'};
  assert.equal(display.normalize(display.gameSettings(saved),'desktop').fit,'cover');
 }finally{globalThis.PWC_STAGING=previous;}
});
