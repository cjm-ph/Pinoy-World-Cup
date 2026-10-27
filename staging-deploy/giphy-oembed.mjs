// Keyless registered oEmbed metadata only. Image bytes go directly from provider to browser.
const idPattern=/^[A-Za-z0-9]{5,64}$/;
export function checkedGiphyPhoto(data,id){
 if(typeof data?.url!=='string'||data.url.length>2048||!idPattern.test(id)||data?.provider_name!=='GIPHY'||data.type!=='photo')throw Error('GIPHY preview unavailable');
 const url=new URL(data.url);const parts=url.pathname.split('/').filter(Boolean);
 if(url.protocol!=='https:'||!/^media(?:[0-9]{1,2})?\.giphy\.com$/.test(url.hostname)||url.username||url.password||url.port||url.hash||url.search||parts[0]!=='media'||parts.at(-2)!==id||!/^[-a-zA-Z0-9_]+\.(gif|png|webp|jpe?g)$/.test(parts.at(-1))||!Number.isInteger(data.width)||data.width<1||data.width>8192||!Number.isInteger(data.height)||data.height<1||data.height>8192)throw Error('GIPHY preview unavailable');
 return url.href;
}
export function createGiphyPreviewRoute({fetchImpl=fetch,now=()=>Date.now(),ttl=3600000,maxEntries=256}={}){
 const cache=new Map();let active=0;
 async function lookup(id){const hit=cache.get(id);if(hit&&hit.until>now())return hit.promise;
  if(active>=16)throw Error('Preview busy');if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
  const record={until:now()+ttl};active++;
  record.promise=(async()=>{try{const url=new URL('https://giphy.com/services/oembed');url.searchParams.set('url','https://giphy.com/gifs/'+id);
   const r=await fetchImpl(url,{redirect:'error',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
   if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Preview unavailable');
   const reader=r.body.getReader(),chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>32768)throw Error('Metadata limit');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return checkedGiphyPhoto(JSON.parse(new TextDecoder().decode(bytes)),id);
  }catch(error){record.until=now()+60000;throw error;}finally{active--;}})();cache.set(id,record);return record.promise;
 }
 return async(req,res,url)=>{res.setHeader('X-Content-Type-Options','nosniff');if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const id=url.searchParams.get('gif_id');if([...url.searchParams].length!==1||!idPattern.test(id||'')){res.writeHead(400,{'Cache-Control':'no-store'});res.end();return;}
  try{const target=await lookup(id);res.writeHead(302,{Location:target,'Cache-Control':'public, max-age=3600'});res.end();}catch{res.writeHead(502,{'Cache-Control':'no-store'});res.end();}
 };
}
