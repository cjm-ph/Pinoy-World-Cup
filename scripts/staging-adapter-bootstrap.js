/* Sequential initialization after async repository preparation; test page only. */
(function(root){
'use strict';
const state={status:'loading',error:null,repository:null,viewModel:null};
root.PinoyAdapterV2=state;
const layout=document.querySelector('.layout'),status=document.getElementById('adapterStatus'),retry=document.getElementById('adapterRetry');
function script(path){return new Promise((resolve,reject)=>{
 const node=document.createElement('script');node.src=path;node.async=false;let done=false;
 function finish(error){if(done)return;done=true;clearTimeout(timer);root.removeEventListener('error',runtime);node.onload=node.onerror=null;if(error)reject(error);else resolve();}
 function runtime(event){if(event.filename===node.src)finish(Object.assign(Error('Content component initialization failed.'),{code:'COMPONENT_INIT_FAILED'}));}
 const timer=setTimeout(()=>{node.remove();finish(Object.assign(Error('Content component timed out.'),{code:'RESOURCE_TIMEOUT'}));},15000);
 root.addEventListener('error',runtime);
 node.onload=()=>finish();node.onerror=()=>finish(Object.assign(Error('Unable to load local content component.'),{code:'RESOURCE_LOAD_FAILED'}));
 document.body.appendChild(node);
});}
async function initialize(){
 try{
  const local=location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const options=local&&root.PinoyAdapterTestOptions?root.PinoyAdapterTestOptions:{};
  let repository=options.repository;
  if(!repository){
   let bundle=options.bundle;
   if(!bundle){await script('content_contract/v2/static_content_snapshot.js');bundle=root.PinoyStaticContentSnapshotV2;delete root.PinoyStaticContentSnapshotV2;}
   repository=root.PinoyStaticContentRepositoryV2.create(bundle);
  }
  let view=await root.PinoyContentViewAdapterV2.prepare(repository);
  await import('./photo-display.js');
  const staging=await import("./staging-public-content.mjs");
  view=await staging.prepareStagingView(view);
  state.repository=repository;state.viewModel=view;
  root.WorldCupData=view.tournaments;root.WorldCupHomeConfig=view.homeConfig;
  await script('scripts/modules/ranking.js');await script('scripts/modules/selection.js');
  await script('scripts/modules/data-loader.js');await script('scripts/modules/engine.js');
  staging.installTextRenderBoundary(root);
  await script('scripts/vs_round_selection_test.js');await script('scripts/home_card_ordering.js');
  await script('scripts/adapter_home_ordering_v2.js');await script('scripts/home_quality.js');
  (await import('./homepage-ui.mjs')).installHomepage(root);
  root.WorldCupVSPhotoSettings={byName:{}};
  try{const stats=await import('./staging-play-statistics.mjs');stats.installPlayCollection(root);}catch{console.warn('Play statistics unavailable.');}
  await script('scripts/vs_immersive_test.js');
  // Mutate the existing overrides object: the approved VS module closes over it.
  for(const [id,settings] of Object.entries(view.vsPhotos))root.WorldCupVSPresentation.photos[id]=JSON.parse(JSON.stringify(settings));
  await script('scripts/adapter_carousel_v2.js');await script('scripts/result_immersive_test.js');
  await script('scripts/adapter_presentation_bridge_v2.js');
  (await import('./mixed-media-game.mjs')).installMixedMediaGame(root);
  await script('scripts/integrated_navigation_test.js');
  // Optional collector failure must not prevent existing content/game startup.
  try{const stats=await import('./staging-play-statistics.mjs');stats.installPublicStatistics(root);}catch{console.warn('Play statistics unavailable.');}
  try{const comments=await import('./staging-comments.mjs');comments.installPublicComments(root);}catch{console.warn('Comments unavailable.');}
  layout.removeAttribute('style');layout.inert=false;
  status.hidden=true;state.status='ready';document.documentElement.dataset.contentState='ready';
  root.dispatchEvent(new CustomEvent('pinoy-content-ready'));
 }catch(error){
  state.status='error';state.error={code:error.code||'INITIALIZATION_FAILED'};
  document.documentElement.dataset.contentState='error';
  status.textContent='World Cups could not be loaded. Please try again.';retry.hidden=false;
 }
 return state.status;
}
retry.onclick=()=>location.reload();
root.PinoyAdapterReady=initialize();
})(window);
