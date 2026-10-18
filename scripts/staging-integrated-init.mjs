// Preserve the approved sequential adapter initialization before attaching administration.
const ready=await window.PinoyAdapterReady;
if(ready==='ready') await import('./staging-media-ui.mjs');
else document.getElementById('stagingStatus').textContent='UI initialization failed. Refresh before managing photos.';
