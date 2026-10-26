// Administrator profile directory only. Never provisions Auth/profile records.
export function createMemberDirectoryApi(client) {
  return async (page=0) => {
    if (!Number.isSafeInteger(page) || page<0 || page>10000) throw Error('Invalid member page.');
    const r=await client.schema('pwc41_api').rpc('admin_member_directory_v1',{p_offset:page*25});
    if(r.error) throw Error('Member directory unavailable. Verify the reviewed directory RPC and administrator access.');
    const d=r.data;
    if(!d || !Array.isArray(d.rows) || d.rows.length>25 || typeof d.has_more!=='boolean'
      || d.rows.some(x=>typeof x.id!=='string' || typeof x.display_name!=='string'
        || typeof x.administrator!=='boolean')) throw Error('Invalid member directory response.');
    return d;
  };
}

export function installMemberDirectory({client,container,document:doc=globalThis.document}) {
  const load=createMemberDirectoryApi(client);
  let generation=0,page=0,busy=false;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const reset=()=>{generation++;busy=false;page=0;container.replaceChildren();};
  async function enter(target=0) {
    if(busy)return;
    busy=true;const at=++generation;
    container.replaceChildren(node('p','Loading member profiles...'));
    try {
      const data=await load(target);if(at!==generation)return;
      page=target;const list=node('div');
      list.append(node('p','Site profiles only. Auth accounts without a site profile are not included.'));
      if(!data.rows.length)list.append(node('p','No site profiles on this page.'));
      for(const member of data.rows) {
        const row=node('article');row.className='card';row.dataset.i18nSkip='';
        row.append(node('strong',member.display_name || 'Member'),node('p',member.id),
          node('small',member.administrator?'Administrator profile':'Member profile'));
        list.append(row);
      }
      const prev=node('button','Previous'),next=node('button','Next');
      prev.className=next.className='btn';prev.disabled=page===0;next.disabled=!data.has_more;
      prev.onclick=()=>void enter(page-1);next.onclick=()=>void enter(page+1);
      list.append(prev,next);container.replaceChildren(list);
    } catch {
      if(at!==generation)return;
      const retry=node('button','Retry');retry.className='btn';retry.onclick=()=>void enter(target);
      container.replaceChildren(node('p','Member directory unavailable. No member data was changed.'),retry);
    } finally {if(at===generation)busy=false;}
  }
  return {enter,reset};
}
