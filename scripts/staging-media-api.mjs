export const STAGING_URL = 'https://cmnomqsurdwhdbjgnsvw.supabase.co';
export function createMediaApi({ client, gatewayOrigin, pageOrigin, fetchImpl = fetch, uuid = () => crypto.randomUUID() }) {
  if (gatewayOrigin !== pageOrigin || !/^https?:\/\//.test(pageOrigin)) throw Error('Use the same-origin Staging media gateway.');
  const rpc = async (name, args) => {
    const { data, error } = await client.schema('pwc41_api').rpc(name, args);
    if (error) {
      // Only known diagnostic codes may leave this boundary; never message/details/hint.
      const code = /^(PGRST[0-9]{3}|[0-9]{5})$/.test(error.code || '') ? error.code : 'RPC_FAILED';
      throw Error(`Request rejected: ${name}${name === 'list_published' ? ' ['+code+']' : ''}. Check your permissions and current revision.`);
    }
    return data;
  };
  const table = async (name, columns) => {
    const { data, error } = await client.schema('pwc41').from(name).select(columns);
    if (error) throw Error('Content unavailable. Check Staging access settings.');
    return data;
  };
  async function mutation(path, args, body) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Error('Sign in to continue.');
    const url = new URL(path, gatewayOrigin);
    for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { method:'POST', redirect:'error', cache:'no-store',
      headers:{ Authorization:`Bearer ${data.session.access_token}` }, body });
    if (!response.ok) throw Error('Media request rejected. Access may be disabled, or the revision may have changed.');
    return response.json();
  }
  return {
    rpc, table,
    authorize: tid => rpc('admin_media_assert_owner', { tid }),
    published: () => rpc('list_published', {}),
    revision: rid => rpc('get_revision', { rid }),
    upload: (tid, file) => mutation('/admin/media/upload', { tid, request:uuid(), asset:'asset_'+uuid() }, file),
    replace: (t, asset, slot) => mutation('/admin/media/replace', { tid:t.id, asset, slot,
      request:uuid(), revision:'rev_'+uuid(), expected:t.edit_version }),
    submit: (t, rid) => mutation('/admin/media/submit', { tid:t.id, request:uuid(), revision:rid, expected:t.edit_version, ack:true }),
    rights: (aid, evidence) => rpc('review_media', { req:uuid(), aid, status:'verified', evidence }),
    transition: (name, t, rid) => {
      if (!['approve','publish','rollback'].includes(name)) throw Error('Unsupported action.');
      return rpc(name, { req:uuid(), tid:t.id, rid, expected:t.edit_version });
    },
    mediaUrl: aid => {
      if (!/^asset_[0-9a-f-]{36}$/.test(aid)) throw Error('Invalid image reference.');
      return gatewayOrigin+'/media?asset='+encodeURIComponent(aid);
    }
  };
}
// Work on copies: preserve the previous local image and never overwrite Storage objects.
export function publishedItem(p, previous, mediaUrl) {
  const fallback = previous?._localPhoto || previous?.img || '';
  return { ...previous, id:p.id, person_id:p.entity_id, n:p.name, e:p.emoji || '',
    description:p.description, active:p.active, _localPhoto:undefined,
    img:p.image_asset_id ? mediaUrl(p.image_asset_id) : fallback, _imageFallback:fallback };
}
