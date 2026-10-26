import {createCreatorPage} from './creator-page-ui.mjs';
import {createMemberCreatorModel} from './member-creator-model.mjs';
import {createMemberRepository} from './member-creator-api.mjs';
import {workFromRevision,resolveOthersCategory,statusOf} from './staging-admin-model.mjs';
import {classifyMediaUrl} from './media-url-policy.mjs';
// Existing shared Creator; all persistence uses owner-enforcing DB RPCs. No admin fallback.
export function installMemberCreator({account,client,repository=client?createMemberRepository(client):null}={}){
 if(account.querySelector('[data-member-creator]'))return account.__memberCreator;
 const model=createMemberCreatorModel({repository}),box=document.createElement('section');box.dataset.memberCreator='';
 const status=document.createElement('p');status.setAttribute('role','status');const panel=document.createElement('div');panel.hidden=true;
 const shadow=panel.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');style.rel='stylesheet';style.href='/templates/member-creator.css';shadow.append(style,content);
 let context=null,work=null,selected=null,identity=null,epoch=0;
 const run=async fn=>{const at=epoch;try{await fn();}catch(e){if(at===epoch)status.textContent=e.message||'Member operation refused.';}};
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>run(fn);return b;};
 const load=async()=>{const at=epoch,x=await model.context();if(at!==epoch)throw Error('Member session changed.');context=x;return x;};
 const capture=()=>{if(!work)return;work.title=content.querySelector('#workTitle')?.value??work.title;work.description=content.querySelector('#workDescription')?.value??work.description;};
 const denied=()=>{throw Error('New member photo/YouTube acquisition is not connected. No upload occurred.');};
 const save=async()=>{capture();const at=epoch,out=await model.save(work,selected);await load();if(at!==epoch)return;selected=context.tournaments.find(t=>t.id===work.tournament_id);if(selected?.revision?.id!==out.revision_id)throw Error('Saved revision must be reloaded before continuing.');work={...workFromRevision(selected,selected.revision),creator_id:identity.id};render();status.textContent='Draft saved and reloaded from the server. Public content stays unchanged.';};
 const render=()=>{
  const photos=document.createElement('div');panel.hidden=false;
  content.replaceChildren(createCreatorPage({work,categories:context.categories,photos,jobs:new Map(),busy:false,notice:'Member publication and revisions require administrator review. New photo/YouTube acquisition is not connected.',capture,onChange:capture,
   onResize:n=>{capture();if(n<work.participants.length)throw Error('Remove candidates first.');work.requested_size=n;render();},
   onAdd:()=>{capture();work.participants.push({id:'participant_'+crypto.randomUUID(),entity_id:'entity_'+crypto.randomUUID(),name:'',presentations:{}});render();},
   onRemove:id=>{capture();work.participants=work.participants.filter(p=>p.id!==id);render();},
   onMove:(id,d)=>{capture();const i=work.participants.findIndex(p=>p.id===id),j=i+d;if(j>=0&&j<work.participants.length)[work.participants[i],work.participants[j]]=[work.participants[j],work.participants[i]];render();},
   onFiles:async()=>{status.textContent='Member photo acquisition is not connected. No file uploaded.';},onRetry:denied,
   onYouTube:(url,start,end,id)=>{capture();const value=classifyMediaUrl(url);if(value.provider!=='giphy')denied();let p=work.participants.find(p=>p.id===id);if(!p){if(work.participants.length>=work.requested_size)throw Error('Candidate capacity reached.');p={id:'participant_'+crypto.randomUUID(),entity_id:'entity_'+crypto.randomUUID(),name:'',presentations:{}};work.participants.push(p);}p.media=value.source;work.giphy_contract=true;render();status.textContent='GIPHY URL added locally; save required. DB OFF still blocks publication.';},
   onSave:()=>run(save),onPublish:()=>run(async()=>{await save();await model.submit(selected);await load();status.textContent='Submitted for administrator review. Not published.';}),onError:message=>status.textContent=message}));
  const publish=[...content.querySelectorAll('button')].find(b=>b.textContent==='Publish now');publish.textContent='Submit for administrator review';
  content.querySelector('#creatorFiles').disabled=true;
  for(const b of content.querySelectorAll('button'))if(b.textContent==='Apply names')b.disabled=true;
 };
 const create=button('Create World Cup',async()=>{await load();selected=null;work=model.newDraft();const cat=resolveOthersCategory(context.categories);work.category_id=cat.id;work.category_error=cat.error;render();status.textContent='New draft. Save to keep it.';});
 const mine=button('My World Cups',async()=>{await load();panel.hidden=false;content.replaceChildren();for(const t of context.tournaments){const row=document.createElement('p');row.textContent=(t.revision?.title||t.id)+' ? '+statusOf(t);row.append(button('Edit',()=>{selected=t;work={...workFromRevision(t,t.revision),creator_id:identity.id};render();}));content.append(row);}status.textContent='Your server-owned World Cups loaded.';});
 const close=button('Close Creator',()=>{content.replaceChildren();panel.hidden=true;work=null;status.textContent='';});
 box.append(create,mine,close,status,panel);account.append(box);
 const handle={setIdentity(user){model.setIdentity(user);identity=user;epoch++;context=null;work=null;selected=null;content.replaceChildren();panel.hidden=true;status.textContent=user?'':'Sign in with Google to create and manage your World Cups.';},model};account.__memberCreator=handle;return handle;
}
