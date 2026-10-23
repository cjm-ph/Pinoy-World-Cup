// Server credential never leaves this adapter; construction does not contact Supabase.
export function createMixedMediaAdapters({url,publishableKey,serviceKey,fetchImpl=fetch}){
 if(url!=='https://cmnomqsurdwhdbjgnsvw.supabase.co')throw Error('Staging required');
 async function request(path,token,key,options={}){const response=await fetchImpl(url+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:'Bearer '+token,...options.headers}});if(!response.ok)throw Error('Mixed-media contract or Storage unavailable');return response;}
 async function rpc(name,args,token=serviceKey,key=serviceKey){const r=await request('/rest/v1/rpc/'+name,token,key,{method:'POST',headers:{'Content-Type':'application/json','Content-Profile':'pwc41_api'},body:JSON.stringify(args)});return r.status===204?null:r.json();}
 function path(key){if(!/^[0-9a-f-]{36}\/source_[0-9a-f-]{36}\.webp$/.test(key||''))throw Error('Invalid animation path');return '/storage/v1/object/pwc41-animated/'+key;}
 return {
  capability:(token,tid)=>rpc('admin_mixed_media_capability',{tid},token,publishableKey),
  reserve:({actor,tid,sourceId,descriptor})=>rpc('mixed_media_reserve',{actor,tid,sid:sourceId,source_descriptor:descriptor}),
  finish:({actor,sourceId})=>rpc('mixed_media_finish',{actor,sid:sourceId}),
  publicTarget:sid=>rpc('public_animation_target',{sid}),
  async create(key,bytes){await request(path(key),serviceKey,serviceKey,{method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:bytes});},
  async read(key){const r=await request(path(key),serviceKey,serviceKey);const chunks=[];let n=0;for await(const b of r.body){n+=b.length;if(n>10485760)throw Error('Animation too large');chunks.push(Buffer.from(b));}return Buffer.concat(chunks);}
 };
}
