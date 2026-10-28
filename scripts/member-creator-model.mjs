// Member orchestration only. No administrator catalog/publish/purge fallback.
export function createMemberCreatorModel({repository=null,uuid=()=>crypto.randomUUID()}={}){
 let user=null,version=0,busy=false;
 const requireUser=()=>{if(!user)throw Error('Sign in with Google and complete your member profile first.');return user;};
 const own=t=>{const u=requireUser();if(!t||t.creator_id!==u.id)throw Error('Only your own World Cups can be managed.');return t;};
 const execute=async(method,...args)=>{requireUser();if(busy)throw Error('A member operation is already running.');if(typeof repository?.[method]!=='function')throw Error('Member server contracts are not connected. Nothing was saved or published.');const at=version;busy=true;try{const result=await repository[method](...args);if(at!==version)throw Error('Member session changed. Reload your World Cups.');return result;}finally{busy=false;}};
 return {
  setIdentity(value){user=value?.id?{id:value.id}:null;version++;},
  get ready(){return !!user;},get connected(){return !!repository;},
  newDraft(){const u=requireUser();return {creator_id:u.id,tournament_id:'tournament_'+uuid(),title:'',description:'',category_id:'',category_error:'Member category/catalog contract is not connected.',requested_size:8,participants:[]};},
  async context(){const u=requireUser(),x=await execute('context');if(!Array.isArray(x?.tournaments)||x.tournaments.some(t=>t.creator_id!==u.id))throw Error('Invalid member-owned catalog.');return x;},
  async list(){const u=requireUser(),rows=await execute('list');if(!Array.isArray(rows)||rows.some(t=>t.creator_id!==u.id))throw Error('Invalid member-owned catalog.');return rows;},
  async save(work,t=null){requireUser();if(t){own(t);if(t.revision?.state==='submitted')throw Error('This submission is under review and cannot be changed.');}if(work.creator_id!==user.id)throw Error('Draft owner changed.');return execute('save',work,t);},
  async submit(t){own(t);return execute('submit',t);},
  async unpublish(t){own(t);return execute('unpublish',t);},
  async trash(t){own(t);return execute('trash',t);}
 };
}
