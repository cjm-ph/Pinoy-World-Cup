import { createServer } from 'node:http';
// No listener starts on import. Deployment must explicitly supply authenticated adapters.
export function createMediaServer(gateway) {
  const server = createServer(async (req,res) => {
    try {
      const u=new URL(req.url,'http://localhost');
      if (u.pathname==='/admin/media/upload' && req.method==='POST') {
        if (!req.headers.authorization?.startsWith('Bearer ')) throw Error('authentication required');
        const value=await gateway.upload({ token:req.headers.authorization.slice(7),
          tid:u.searchParams.get('tid'), requestId:u.searchParams.get('request'),
          assetId:u.searchParams.get('asset'), body:req });
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
    } catch {
      // Fail closed; never disclose tokens, paths, decoder errors or service response bodies.
      if (!res.headersSent) res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end('{"error":"media request rejected"}');
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=15000;
  return server;
}
