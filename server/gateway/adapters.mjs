import { randomUUID } from 'node:crypto';
const ref = 'cmnomqsurdwhdbjgnsvw';
// Construction is side-effect free. Calling these methods contacts staging and needs approval.
export function supabaseAdapters({ url, publishableKey, serviceKey, fetchImpl = fetch }) {
  if (url !== `https://${ref}.supabase.co` || !publishableKey || !serviceKey) throw Error('staging configuration required');
  async function request(path, token, key, options = {}) {
    const response = await fetchImpl(url + path, { ...options, redirect:'error',
      signal: AbortSignal.timeout(15000),
      headers: { apikey:key, Authorization:`Bearer ${token}`, ...options.headers } });
    return response;
  }
  async function rpc(name, args, token, key) {
    const r = await request(`/rest/v1/rpc/${name}`, token, key, { method:'POST',
      headers: { 'Content-Type':'application/json', 'Content-Profile':'pwc41_api' }, body:JSON.stringify(args) });
    if (!r.ok) throw Error(`RPC ${name} rejected (${r.status})`); // never echo remote body/tokens
    return r.json();
  }
  function objectPath(bucket, key) {
    if (bucket !== 'pwc41-optimized' || !/^[0-9a-f-]{36}\/asset_[0-9a-f-]{36}\.webp$/.test(key)) throw Error('unsafe object path');
    return `/storage/v1/object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  return {
    auth: { async verify(token) {
      if (typeof token !== 'string' || token.length > 8192) throw Error('invalid token');
      const r = await request('/auth/v1/user',token,publishableKey);
      if (!r.ok) throw Error('authentication rejected');
      const u = await r.json();
      return { id:u.id, isAnonymous:u.is_anonymous === false ? false : true };
    } },
    db: {
      assertAdminOwner: (token, actorId, tid) => rpc('admin_media_assert_owner',{ tid },token,publishableKey)
        .then(id => { if (id !== actorId) throw Error('identity mismatch'); }),
      begin: (token, x) => rpc('admin_media_begin',{ req:x.requestId,tid:x.tid,aid:x.assetId,sha:x.sha,bytes:x.bytes,w:x.w,h:x.h },token,publishableKey),
      finish: x => rpc('admin_media_finish',{ actor:x.actorId,req:x.requestId,aid:x.assetId },serviceKey,serviceKey),
      requestDeletion: (token,x) => rpc('admin_media_request_delete',{req:x.requestId,tid:x.tid,aid:x.assetId},token,publishableKey),
      replace: (token,x) => rpc('admin_media_replace',{req:x.requestId,tid:x.tid,aid:x.assetId,new_rid:x.revisionId,expected:x.expectedVersion,slot:x.slot},token,publishableKey),
      submit: (token,x) => rpc('admin_media_submit',{req:x.requestId,tid:x.tid,rid:x.revisionId,expected:x.expectedVersion,ack:x.ack},token,publishableKey),
      publicTarget: aid => rpc('public_media_target',{aid},serviceKey,serviceKey)
    },
    admission: { async acquire(actorId,{token,tid}) {
      const lease=await rpc('admin_media_acquire',{lease:randomUUID(),tid},token,publishableKey);
      let released=false;
      return async()=>{if(!released){await rpc('admin_media_release',{lease},token,publishableKey);released=true;}};
    } },
    storage: {
      async create(bucket,key,bytes) {
        const r = await request(objectPath(bucket,key),serviceKey,serviceKey,{method:'POST',
          headers:{'Content-Type':'image/webp','x-upsert':'false'},body:bytes});
        if (r.ok) return true;
        // Storage may report duplicate objects as 400 or 409. No success is inferred:
        // the gateway reads and hashes the actual object for either code.
        if ([400,409].includes(r.status)) return false;
        throw Error('storage create rejected');
      },
      async read(bucket,key) {
        const r = await request(objectPath(bucket,key),serviceKey,serviceKey);
        if (!r.ok) throw Error('storage read rejected');
        const chunks=[];let n=0;
        for await (const chunk of r.body) {
          n+=chunk.length;
          if (n>1048576) throw Error('stored object too large');
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks,n);
      }
    }
  };
}
// Single-process test/development limiter. Production must inject a distributed equivalent.
export function localAdmission({ now = Date.now } = {}) {
  const entries = new Map();
  return { async acquire(id) {
    const t=now();const item=entries.get(id) ?? { times:[],active:0 };
    for (const [key,value] of entries) {
      if (value.active===0 && (value.times.at(-1) ?? 0)<=t-60000) entries.delete(key);
    }
    if (!entries.has(id) && entries.size>=10000) throw Error('limiter capacity');
    item.times=item.times.filter(x=>x>t-60000);
    if (item.times.length>=10 || item.active>=2) throw Error('rate limited');
    item.times.push(t);item.active++;entries.set(id,item);
    let done=false;return () => { if (!done) { item.active--;done=true; } };
  } };
}
