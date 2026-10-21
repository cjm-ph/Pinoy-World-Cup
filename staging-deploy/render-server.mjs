import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStagingEnvironment, composeStaging } from '../server/gateway/staging-start.mjs';

export function renderConfig(env) {
  return readStagingEnvironment({...env,PWC_STAGING_PORT:env.PORT || '10000'});
}
export function serveRender({ media, publicRoot }) {
  const types={'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif'};
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/media' || url.pathname.startsWith('/admin/media/') || url.pathname==='/play-statistics' || url.pathname.startsWith('/play-statistics/')) {media.emit('request',req,res);return;}
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(url.pathname==='/healthz') {res.writeHead(200,{'Content-Type':'text/plain'});res.end(req.method==='HEAD'?undefined:'ok');return;}
      const root=await realpath(publicRoot);
      const pathname=decodeURIComponent(url.pathname);
      if(pathname.includes('\\') || pathname.includes('\0')) throw Error('invalid path');
      const path=await realpath(resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
      if(!path.startsWith(root+sep) || !types[extname(path)])throw Error('not public');
      const bytes=await readFile(path);
      res.writeHead(200,{'Content-Type':types[extname(path)]});res.end(req.method==='HEAD'?undefined:bytes);
    } catch {if(!res.headersSent)res.writeHead(404);res.end();}
  });
}
export function startRender(env=process.env) {
  const config=renderConfig(env);
  const server=serveRender({media:composeStaging(config),publicRoot:fileURLToPath(new URL('./public/',import.meta.url))});
  server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=15000;
  server.on('error',()=>{console.error('Staging server failed.');process.exitCode=1;});
  server.listen(config.port,'0.0.0.0');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {startRender();}catch {console.error('Staging configuration rejected.');process.exitCode=1;}
}
