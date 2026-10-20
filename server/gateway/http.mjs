import {randomUUID} from 'node:crypto';
import {uploadTrace} from './upload-trace.mjs';
import {diagnostics} from './media-errors.mjs';
import { createServer } from 'node:http';
// No listener starts on import. Deployment must explicitly supply authenticated adapters.
export function createMediaServer(gateway) {
  const server = createServer(async (req,res) => {
    let reference;
    try {
      const u=new URL(req.url,'http://localhost');
      if (u.pathname==='/admin/media/upload' && req.method==='POST') {
        if (!req.headers.authorization?.startsWith('Bearer ')) throw Error('authentication required');
        reference=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(u.searchParams.get('request')||'')?u.searchParams.get('request'):randomUUID();
        const trace=uploadTrace(req,res,reference);res.setHeader('X-PWC-Upload-Reference',reference);
        const streaming=req.headers.accept==='application/x-ndjson';
        const emit=value=>{if(!res.destroyed)res.write(JSON.stringify({...value,reference})+'\n');};
        if(streaming){res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();}
        let value;try{value=await gateway.upload({ token:req.headers.authorization.slice(7),
          tid:u.searchParams.get('tid'), requestId:u.searchParams.get('request'),
          assetId:u.searchParams.get('asset'), body:req,trace,onProgress:streaming?stage=>emit({type:'progress',stage}):undefined });
        }catch(error){if(!streaming)throw error;console.warn(JSON.stringify({event:'media_request_failed',...diagnostics(error),reference}));emit({type:'error',diagnostic:{...diagnostics(error),reference}});res.end();return;}
        if(streaming){emit({type:'result',data:{...value,reference}});res.end();return;}
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));
      } else if (u.pathname==='/admin/media/delete-request' && req.method==='POST') {
        if (!req.headers.authorization?.startsWith('Bearer ')) throw Error('authentication required');
        const value=await gateway.requestDeletion({token:req.headers.authorization.slice(7),
          tid:u.searchParams.get('tid'),assetId:u.searchParams.get('asset'),requestId:u.searchParams.get('request')});
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));
      } else if (['/admin/media/replace','/admin/media/submit'].includes(u.pathname) && req.method==='POST') {
        if (!req.headers.authorization?.startsWith('Bearer ')) throw Error('authentication required');
        const args={token:req.headers.authorization.slice(7),tid:u.searchParams.get('tid'),
          requestId:u.searchParams.get('request'),revisionId:u.searchParams.get('revision'),
          expectedVersion:Number(u.searchParams.get('expected')),assetId:u.searchParams.get('asset'),
          slot:u.searchParams.get('slot'),ack:u.searchParams.get('ack')==='true'};
        if (!/^(0|[1-9][0-9]*)$/.test(u.searchParams.get('expected') ?? '')) throw Error('version required');
        const value=await (u.pathname.endsWith('/replace')?gateway.replace(args):gateway.submit(args));
        res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));
      } else if (u.pathname==='/media' && ['GET','HEAD'].includes(req.method)) {
        const out=await gateway.publicImage({assetId:u.searchParams.get('asset'),method:req.method,range:req.headers.range});
        res.writeHead(200,out.headers);res.end(out.body);
      } else { res.writeHead(404,{'Cache-Control':'no-store'});res.end(); }
    } catch(error) {
      const diagnostic={...diagnostics(error),reference:reference||randomUUID()};
      console.error(JSON.stringify({event:'media_request_failed',...diagnostic}));
      // Fail closed; never disclose tokens, paths, decoder errors or service response bodies.
      if (!res.headersSent) res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:'media request rejected',diagnostic}));
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=15000;
  return server;
}
