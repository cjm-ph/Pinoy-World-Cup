// No upload, Storage or physical deletion calls.
export function managementActions(t,available){
 const editable=available&&['private','public'].includes(t.visibility);
 return {trash:editable,unpublish:editable&&t.visibility==='public',publish:editable&&t.visibility==='private'&&!!(t.published_revision_id||t.revision?.state==='approved')};
}
export function createTournamentManagement(client,uuid=()=>crypto.randomUUID()){
 const call=(name,args)=>client.schema('pwc41_api').rpc(name,args);
 return {
  async load(){const {data,error}=await call('admin_tournament_management_context',{});
   if(['PGRST202','42883'].includes(error?.code))return {available:false,trash:[]};
   if(error||data?.version!=='048'||!Array.isArray(data.trash)||data.permanent_delete_enabled!==false)throw Error('Tournament management unavailable. Refresh administrator data.');
   return {available:true,trash:data.trash};
  },
  async change(t,action){
   if(!['publish','unpublish','trash','restore'].includes(action))throw Error('Permanent deletion is unavailable. Existing data is preserved.');
   const {data,error}=await call('admin_tournament_manage',{req:uuid(),tid:t.id,expected:t.edit_version,action});
   if(error)throw Error('Tournament operation failed. Refresh administrator data before trying again.');
   if(data?.tournament_id!==t.id||!['private','public','archived'].includes(data.visibility))throw Error('Invalid tournament management response. Refresh administrator data.');
   if(data.visibility!==({publish:'public',unpublish:'private',trash:'archived',restore:'private'})[action])throw Error('Invalid tournament management response. Refresh administrator data.');
   return data;
  }
 };
}
