import {normalizeAnimation} from './animation-core.mjs';
import {animationCodes} from './mixed-media-diagnostics.mjs';
process.once('message',async bytes=>{try{process.send(await normalizeAnimation(bytes,{allowSingleGif:true}));}catch(error){process.send({error:animationCodes.has(error?.diagnosticCode)?error.diagnosticCode:'DECODE_REJECTED'});}});
