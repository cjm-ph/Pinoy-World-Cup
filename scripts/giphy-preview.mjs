import {checkedGiphy} from './giphy-policy.mjs';
// Same-origin metadata redirect, not an inferred CDN filename or a stored media asset.
export function giphyPreview(media){try{if(media?.blocked)return null;const g=checkedGiphy(media);return {src:'/giphy-thumbnail?gif_id='+encodeURIComponent(g.gif_id),source:g.url};}catch{return null;}}
export const giphyPreviewUrl=media=>giphyPreview(media)?.src||null;

// Still-only surfaces never fall back to an animated photo response.
export const giphyStillUrl=media=>{const url=giphyPreviewUrl(media);return url?url+'&still=1':null;};
