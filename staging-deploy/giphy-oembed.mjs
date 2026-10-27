// Keyless registered oEmbed metadata only. Image bytes go directly from provider to browser.
const idPattern=/^[A-Za-z0-9]{5,64}$/;
export function checkedGiphyPhoto(data,id){
 if(typeof data?.url!=='string'||data.url.length>2048||!idPattern.test(id)||data?.provider_name!=='GIPHY'||data.type!=='photo')throw Error('GIPHY preview unavailable');
 const url=new URL(data.url);const parts=url.pathname.split('/').filter(Boolean);
 if(url.protocol!=='https:'||!/^media(?:[0-9]{1,2})?\.giphy\.com$/.test(url.hostname)||url.username||url.password||url.port||url.hash||url.search||parts[0]!=='media'||parts.at(-2)!==id||!/^[-a-zA-Z0-9_]+\.(gif|png|webp|jpe?g)$/.test(parts.at(-1))||!Number.isInteger(data.width)||data.width<1||data.width>8192||!Number.isInteger(data.height)||data.height<1||data.height>8192)throw Error('GIPHY preview unavailable');
 return url.href;
}
// Public-page metadata is not a versioned API; any shape/identity drift fails closed.
export function checkedGiphyStill(html,id){
 const urls=new Set();
 const walk=value=>{if(!value||typeof value!=='object')return;
  if(value.id===id&&value.type==='gif'&&value.images?.original_still){const still=value.images.original_still;urls.add(checkedGiphyPhoto({provider_name:'GIPHY',type:'photo',url:still.url,width:Number(still.width),height:Number(still.height)},id));}
  for(const v of Object.values(value))walk(v);
 };
 for(const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/gs)){
  let payload;try{payload=JSON.parse(match[1])[1];}catch{continue;}if(typeof payload!=='string')continue;
  for(const line of payload.split('\n')){const colon=line.indexOf(':');let value;try{value=JSON.parse(line.slice(colon+1));}catch{continue;}walk(value);}
 }
 if(urls.size!==1)throw Error('Official still metadata unavailable');return [...urls][0];
}
export function createGiphyPreviewRoute({fetchImpl=fetch,now=()=>Date.now(),ttl=3600000,maxEntries=256}={}){
 const cache=new Map();let active=0;
 async function lookup(id,still){const key=(still?'still:':'photo:')+id;const hit=cache.get(key);if(hit&&hit.until>now())return hit.promise;
  if(active>=16)throw Error('Preview busy');if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
  const record={until:now()+ttl};active++;
  record.promise=(async()=>{try{const url=new URL(still?'https://giphy.com/gifs/'+id:'https://giphy.com/services/oembed');if(!still)url.searchParams.set('url','https://giphy.com/gifs/'+id);
   const r=await fetchImpl(url,{redirect:'error',credentials:'omit',headers:{Accept:still?'text/html':'application/json'},signal:AbortSignal.timeout(5000)});
   if(!r.ok||!r.headers.get('content-type')?.includes(still?'text/html':'application/json'))throw Error('Preview unavailable');
   const reader=r.body.getReader(),chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>(still?1048576:32768))throw Error('Metadata limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const text=new TextDecoder().decode(bytes);return still?checkedGiphyStill(text,id):checkedGiphyPhoto(JSON.parse(text),id);
  }catch(error){record.until=now()+60000;throw error;}finally{active--;}})();cache.set(key,record);return record.promise;
 }
 return async(req,res,url)=>{res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const id=url.searchParams.get('gif_id');const still=url.searchParams.get('still')==='1';if([...url.searchParams].length!==(still?2:1)||!idPattern.test(id||'')){res.writeHead(400,{'Cache-Control':'no-store'});res.end();return;}
  try{const target=await lookup(id,still);res.writeHead(302,{Location:target,'Cache-Control':'public, max-age=3600'});res.end();}catch{res.writeHead(502,{'Cache-Control':'no-store'});res.end();}
 };
}
