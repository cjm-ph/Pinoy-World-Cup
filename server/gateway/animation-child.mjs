import {normalizeAnimation} from './animation-core.mjs';
process.once('message',async bytes=>{try{process.send(await normalizeAnimation(bytes));}catch{process.send({error:'Animation rejected by frame, timing or processing limits'});}});
