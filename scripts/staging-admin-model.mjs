// Server payload adapter for the existing five-step creator and revision RPC.
export const STEPS = ['Basic info', 'Candidates', 'Photos', 'Preview', 'Save or publish'];
export function statusOf(t, r = t.revision) {
  if (t.visibility === 'quarantined') return 'Blocked';
  if (t.visibility === 'archived') return 'Archived';
  if (r?.state === 'submitted') return 'Pending';
  if (r?.state === 'rejected') return 'Rejected';
  if (r?.id === t.published_revision_id && t.visibility === 'public') return 'Published';
  if (r?.state === 'approved') return 'Approved';
  return r ? 'Draft' : 'Unavailable';
}
export function filterTournaments(rows, {search = '', category = '', status = ''} = {}) {
  return rows.filter(t => (!search || (t.revision?.title || t.title || t.id).toLowerCase().includes(search.toLowerCase()))
    && (!category || t.revision?.category_ids?.includes(category))
    && (!status || statusOf(t) === status));
}
export function workFromRevision(t, r) {
  return {tournament_id: t.id, base_revision_id: r.id, title: r.title, description: r.description || '',
    category_id: r.category_ids?.[0] || '', requested_size: r.requested_size || t.requested_size || 8,
    cover_participant_id: (r.participants || []).find(p => r.cover_asset_id && p.image_asset_id === r.cover_asset_id)?.id || null, cover_asset_id: r.cover_asset_id,
    cover_settings: (r.presentations||[]).find(m=>!m.participant_id&&m.context==='start')?.settings||{},
    participants: (r.participants || []).map(p => ({...p, image_asset_id: p.image_asset_id || null,
      pending_url: p.pending_url || '', presentations: Object.fromEntries((r.presentations || [])
        .filter(m => m.participant_id === p.id).map(m => [m.context, m.settings]))}))};
}
export function draftPayload(work,{allowIncomplete=false}={}) {
  const plain = s => typeof s === 'string' && !/[<>\u0000-\u0008]/.test(s);
  if (!plain(work.title) || !work.title.trim() || !plain(work.description) || !work.category_id
    || ![8,16,32].includes(Number(work.requested_size))) throw Error('Enter a title, description, category and supported candidate count.');
  if (work.participants.length > Number(work.requested_size)||(!allowIncomplete&&work.participants.length !== Number(work.requested_size))) throw Error('Candidate count must match the selected size.');
  if (work.participants.some(p => !plain(p.name) || (!allowIncomplete&&!p.name.trim()) || p.name.length > 300 || !plain(p.description || ''))) {
    throw Error('Every candidate needs a plain-text name of up to 300 characters.');
  }
  return {title: work.title.trim(), description: work.description, requested_size: Number(work.requested_size),
    category_ids: [work.category_id], cover_participant_id: work.cover_participant_id,
    participants: work.participants.map(p => ({id: p.id, entity_id: p.entity_id, kind: 'other', name: p.name.trim(),
      description: p.description || '', emoji: p.emoji || '', active: p.active !== false,
      image_asset_id: p.image_asset_id || null, pending_url: p.pending_url || '', presentations: p.presentations || {}}))};
}
export function canEditMetadata(t, uid) {
  return !!t && t.creator_id === uid && ['private','public'].includes(t.visibility)
    && ['draft','submitted','rejected','approved'].includes(t.revision?.state);
}

export function createDashboardApi(client, media, uuid = () => crypto.randomUUID()) {
  return {
    async context() {
      let timer,response;try{response=await Promise.race([client.schema('pwc41_api').rpc('admin_dashboard_context', {}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Supabase administrator lookup timed out. Retry the permission check.')),20000);})]);}finally{clearTimeout(timer);}
      const {data,error,status}=response;
      if(['PT401','PGRST301','PGRST303'].includes(error?.code))throw Error('Supabase session verification failed. Sign in again.');
      if(['PT403','42501'].includes(error?.code))throw Error('Supabase administrator access was denied. Sign in with an authorized account.');
      if(status>=500)throw Error('Supabase is temporarily unavailable. Retry the permission check.');
      if (error?.code === 'PGRST202' || error?.code === '42883') return null;
      if (error) throw Error('Dashboard data is unavailable. Check administrator access and Staging runtime.');
      if (!data || !Array.isArray(data.tournaments) || !Array.isArray(data.categories)) throw Error('Invalid dashboard response.');
      return data;
    },
    async save(work, t) {
      // Existing save_draft is owner-only. Never pretend admin membership bypasses it.
      const cached=client.auth.getSession?(await client.auth.getSession()).data.session?.user:null;
      if (t && !canEditMetadata(t, (cached||(await client.auth.getUser()).data.user)?.id)) throw Error('Only the creator can save these candidate and text changes. Photo management remains available to administrators.');
      return media.rpc('admin_media_save_draft', {req: uuid(), tid: work.tournament_id, rid: 'rev_' + uuid(),
        expected: t?.edit_version || 0, payload: draftPayload(work,{allowIncomplete:true})});
    },
    async preview(aid) {
      const target = await media.rpc('admin_media_preview_target', {aid});
      if (target?.bucket !== 'pwc41-optimized' || !/^[0-9a-f-]{36}\/asset_[0-9a-f-]{36}\.webp$/.test(target.object_key || '')) throw Error('Private preview unavailable.');
      const {data, error} = await client.storage.from(target.bucket).download(target.object_key);
      if (error || !data) throw Error('Private preview unavailable.');
      return data;
    },
    reject: (t, r, note) => media.rpc('reject', {req: uuid(), tid: t.id, rid: r.id, expected: t.edit_version, note})
  };
}
