import {normalizeAnimation} from './animation-core.mjs';
import {animationCodes} from './mixed-media-diagnostics.mjs';
process.once('message',async bytes=>{
 const onPhase=progress=>{if(process.connected)process.send({progress});};
 try{const result=await normalizeAnimation(bytes,{allowSingleGif:true,onPhase});onPhase('RESULT_IPC');process.send(result);}
 catch(error){process.send({error:animationCodes.has(error?.diagnosticCode)?error.diagnosticCode:'DECODE_REJECTED'});}
});
