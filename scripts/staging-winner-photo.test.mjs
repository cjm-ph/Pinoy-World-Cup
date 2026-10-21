import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const bridge=readFileSync(new URL('./adapter_presentation_bridge_v2.js',import.meta.url),'utf8');
function fixture(staging){
 const vs={devices:{desktop:{fit:'contain',b2_zoom:1.4,position:'20% 30%'},mobile:{fit:'cover',b2_zoom:1.2,position:'70% 80%'}}};
 const result={fit:'cover',b2_zoom:2.5,position:'0% 0%'};
 const view={vsPhotos:{p:vs},resultPhotos:{p:result},representatives:{}};
 const root={PinoyAdapterV2:{viewModel:view},WorldCupVSPresentation:{photos:{}},buildGrid(){},start(){},show(){},addEventListener(){}};
 if(staging)root.PWC_STAGING={supabaseUrl:'https://cmnomqsurdwhdbjgnsvw.supabase.co'};
 const document={querySelectorAll:()=>[],getElementById:id=>id==='roundSelection'?{open:false}:{addEventListener(){}}};
 vm.runInNewContext(bridge,{window:root,document});return {root,view,vs,result};
}
test('Staging winner uses exactly the VS settings; separate result data stays untouched',()=>{
 const {root,view,vs,result}=fixture(true),before=JSON.stringify(view);
 root.show('play');root.show('end');
 assert.deepEqual(JSON.parse(JSON.stringify(root.WorldCupVSPresentation.photos.p)),vs);
 assert.equal(JSON.stringify(view),before);assert.equal(view.resultPhotos.p,result);
 root.WorldCupVSPresentation.photos.p.devices.desktop.b2_zoom=2;
 assert.equal(vs.devices.desktop.b2_zoom,1.4);
 root.show('play');assert.equal(root.WorldCupVSPresentation.photos.p.devices.desktop.b2_zoom,1.4);
});
test('non-Staging bridge retains its existing independent winner display',()=>{
 const {root,result}=fixture(false);root.show('end');
 assert.deepEqual(JSON.parse(JSON.stringify(root.WorldCupVSPresentation.photos.p)),result);
});
test('admin preview and resize use VS settings; candidate editing has no winner-only control',()=>{
 const ui=readFileSync(new URL('./staging-media-ui.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/game\.round\[0\]\??\.presentations\?\.result/);
 assert.match(ui,/game\.round\[0\]\.presentations\?\.vs/);
 const editor=readFileSync(new URL('./photo-card-editor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(editor,/winner.*preview|resultRatio|context.*result/i);
});
