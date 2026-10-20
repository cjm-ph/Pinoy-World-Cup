import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { descriptor, limits } from './gateway.mjs';
export function createDecoder({ worker = new URL('./image-child.mjs',import.meta.url), timeoutMs = 10000, maxActive = 4 } = {}) {
  let active=0;
  return { decode(bytes,onProgress=()=>{}) {
    if (!Buffer.isBuffer(bytes) || bytes.length>limits.input) return Promise.reject(Error('invalid decoder input'));
    if (active>=maxActive) return Promise.reject(Error('decoder capacity'));
    active++;
    return new Promise((resolve,reject)=>{
      let done=false;let child;let timer;
      const settle=(error,result)=>{
        if(done)return;done=true;clearTimeout(timer);active--;child?.kill();
        error?reject(error):resolve(result);
      };
      try {
        child=fork(fileURLToPath(worker),[],{env:{},execArgv:['--max-old-space-size=128'],
          serialization:'advanced',stdio:['ignore','ignore','ignore','ipc']});
        timer=setTimeout(()=>settle(Error('decoder timeout')),timeoutMs);
        child.on('message',result=>{
          if(['IMAGE_RESIZE','IMAGE_ENCODE','IMAGE_VALIDATE'].includes(result?.progress)){onProgress(result.progress);return;}
          try { if(result?.error)throw Error(result.error);descriptor(result);settle(null,result); }
          catch(error){settle(error);}
        });
        child.once('error',error=>settle(error));
        child.once('exit',()=>settle(Error('decoder unavailable or crashed')));
        child.send(bytes,error=>{if(error)settle(error);});
      } catch(error) { settle(error); }
    });
  } };
}
export const decoder=createDecoder();
