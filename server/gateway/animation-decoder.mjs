import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {codedError,animationCodes} from './mixed-media-diagnostics.mjs';
export function createMediaDecodeBudget(staticDecoder,animationDecoder){
 let active=0;
 const wrap=decoder=>({async decode(...args){if(active>=2)throw codedError('CAPACITY','decoder capacity');active++;try{return await decoder.decode(...args);}finally{active--;}}});
 return {static:wrap(staticDecoder),animation:wrap(animationDecoder)};
}
export const animationWorkerTimeoutMs=30000;
export function createAnimationDecoder({spawnWorker=fork,timeoutMs=animationWorkerTimeoutMs}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>animationWorkerTimeoutMs)throw new RangeError('Invalid animation worker timeout');
 let active=false;return {decode(bytes){
 if(active||!Buffer.isBuffer(bytes)||bytes.length>10485760)return Promise.reject(codedError(active?'CAPACITY':'INPUT_LIMIT','Animation capacity or input limit exceeded'));
 active=true;return new Promise((resolve,reject)=>{let done=false;let child;try{child=spawnWorker(fileURLToPath(new URL('./animation-child.mjs',import.meta.url)),[],{env:{},execArgv:['--max-old-space-size=128'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});}catch{active=false;reject(codedError('WORKER_UNAVAILABLE','Animation decoder unavailable'));return;}
 const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);active=false;child.kill();error?reject(error):resolve(result);};
 const timer=setTimeout(()=>finish(codedError('TIMEOUT','Animation decode timed out')),timeoutMs);
 child.once('error',()=>finish(codedError('WORKER_UNAVAILABLE','Animation decoder unavailable')));child.once('exit',()=>finish(codedError('WORKER_EXIT','Animation decoder stopped')));
 child.once('message',result=>{
  if(result?.kind==='static'){
   if(result.error||result.sourceFormat!=='gif'||result.frames!==1||!Buffer.isBuffer(result.poster)||result.poster.length>15728640||!Number.isInteger(result.width)||!Number.isInteger(result.height)||result.width<1||result.height<1||result.width>12000||result.height>12000||result.width*result.height>24000000)finish(codedError('DECODE_REJECTED'));else finish(null,result);
   return;
  }
  if(result?.error||!result?.bytes||result.bytes.length>10485760||!result.poster||result.frames<2)finish(codedError(animationCodes.has(result?.error)?result.error:result?.bytes?.length>10485760?'OUTPUT_LIMIT':'DECODE_REJECTED','Animation processing rejected'));else finish(null,result);
 });child.send(bytes,error=>{if(error)finish(codedError('WORKER_UNAVAILABLE','Animation decoder unavailable'));});
 });}};}
