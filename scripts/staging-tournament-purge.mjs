// User-confirmed single tournament only. No service credential in the browser.
export function createTournamentPurge(client,{fetchImpl=fetch}={}){
 async function request(body){
  const {data,error}=await client.auth.getSession();if(error||!data?.session?.access_token)throw Error('Sign in again before permanently deleting.');
  const response=await fetchImpl('/admin/media/tournament-purge',{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error('Permanent deletion could not continue. Refresh status before retrying. The tournament may remain locked.');
  return response.json();
 }
 return {
  async capability(){
   let jobs=[];try{
    const {data,error}=await client.schema('pwc41_api').rpc('admin_tournament_purge_capability',{});
    if(error||!Array.isArray(data?.jobs))return {enabled:false,jobs};jobs=data.jobs;
    if(data.enabled!==true)return {enabled:false,jobs};
    const server=await request();return {enabled:server?.enabled===true,jobs};
   }catch{return {enabled:false,jobs};}
  },
  async erase(t,confirmation,onProgress=()=>{}){
   if(confirmation!==(t.title||t.id))throw Error('Enter the exact tournament name to confirm.');
   const requestId=crypto.randomUUID();let result;
   // Continue successful steps, never retry failed/uncertain requests automatically.
   // A bounded session can be resumed explicitly using the same immutable target ID.
   for(let step=0;step<20;step++){
    result=await request({requestId,tid:t.id,expected:t.edit_version,confirmation});
    if(result?.tournament_id!==t.id||!result.job_id||!['pending','failed','complete'].includes(result.state))throw Error('Invalid permanent deletion result. Refresh status.');
    onProgress(result);
    if(result.state==='complete')return result;
    if(result.state==='failed')throw Error('Permanent deletion paused after an error. Refresh status and retry explicitly.');
   }
   return result; // Continue is explicit after the bounded 20-step session.
  }
 };
}
