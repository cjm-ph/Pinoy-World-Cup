import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function createMediaDecodeBudget(staticDecoder,animationDecoder){
 let active=0;
 const wrap=decoder=>({async decode(...args){if(active>=2)throw Error('decoder capacity');active++;try{return await decoder.decode(...args);}finally{active--;}}});
 return {static:wrap(staticDecoder),animation:wrap(animationDecoder)};
}
export function createAnimationDecoder(){let active=false;return {decode(bytes){
 if(active||!Buffer.isBuffer(bytes)||bytes.length>10485760)return Promise.reject(Error('Animation capacity or input limit exceeded'));
 active=true;return new Promise((resolve,reject)=>{let done=false;let child;try{child=fork(fileURLToPath(new URL('./animation-child.mjs',import.meta.url)),[],{env:{},execArgv:['--max-old-space-size=128'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});}catch{active=false;reject(Error('Animation decoder unavailable'));return;}
 const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);active=false;child.kill();error?reject(error):resolve(result);};
 const timer=setTimeout(()=>finish(Error('Animation decode timed out')),10000);
 child.once('error',()=>finish(Error('Animation decoder unavailable')));child.once('exit',()=>finish(Error('Animation decoder stopped')));
 child.once('message',result=>{if(result?.error||!result?.bytes||result.bytes.length>10485760||!result.poster||result.frames<2)finish(Error('Animation processing rejected'));else finish(null,result);});child.send(bytes,error=>{if(error)finish(Error('Animation decoder unavailable'));});
 });}};}
