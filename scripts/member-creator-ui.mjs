import {createCreatorPage} from './creator-page-ui.mjs';
import {createMemberCreatorModel} from './member-creator-model.mjs';
// Shared Creator component; no admin authorization, media acquisition or direct-publication API.
export function installMemberCreator({account,repository=null}={}){
 if(account.querySelector('[data-member-creator]'))return account.__memberCreator;
 const model=createMemberCreatorModel({repository}),box=document.createElement('section');box.dataset.memberCreator='';
 const status=document.createElement('p');status.setAttribute('role','status');const panel=document.createElement('div');panel.hidden=true;
 const shadow=panel.attachShadow({mode:'open'}),style=document.createElement('link'),content=document.createElement('div');style.rel='stylesheet';style.href='/templates/member-creator.css';shadow.append(style,content);
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{try{await action();}catch{status.textContent=model.ready?'Member server contracts are not connected. Nothing was saved or published.':'Sign in with Google and complete your member profile first.';}};return b;};
 const unavailable=()=>{throw Error('Member media contracts are not connected.');};
 const create=button('Create World Cup',()=>{
  const work=model.newDraft();panel.hidden=false;
  const render=()=>{const photos=document.createElement('div');content.replaceChildren(createCreatorPage({work,categories:[],photos,jobs:new Map(),busy:false,notice:'Local draft only. Member catalog, media uploads and save/submit adapters are not connected.',capture:()=>{work.title=content.querySelector('#workTitle')?.value||work.title;work.description=content.querySelector('#workDescription')?.value||work.description;},onChange(){work.title=content.querySelector('#workTitle')?.value||'';work.description=content.querySelector('#workDescription')?.value||'';},onResize:n=>{work.requested_size=n;render();},onAdd:()=>{work.participants.push({id:'participant_'+crypto.randomUUID(),entity_id:'entity_'+crypto.randomUUID(),name:'',presentations:{}});render();},onRemove:id=>{work.participants=work.participants.filter(p=>p.id!==id);render();},onMove:(id,d)=>{const i=work.participants.findIndex(p=>p.id===id),j=i+d;if(j>=0&&j<work.participants.length)[work.participants[i],work.participants[j]]=[work.participants[j],work.participants[i]];render();},onFiles:async()=>{status.textContent='Member photo acquisition is not connected. No file was uploaded.';},onYouTube:unavailable,onRetry:unavailable,onSave:unavailable,onPublish:unavailable,onError:()=>{status.textContent='Member media/save contracts are not connected. Nothing was saved or published.';}}));
   const publish=[...content.querySelectorAll('button')].find(b=>b.textContent==='Publish now');publish.textContent='Submit for administrator review';publish.disabled=true;
   const save=[...content.querySelectorAll('button')].find(b=>b.textContent==='Save privately');save.disabled=true;
   // Source-acquisition endpoints are administrator-only/unqualified for members.
   content.querySelector('#creatorFiles').disabled=true;
   for(const b of content.querySelectorAll('button'))if(['Add media URL','Apply names'].includes(b.textContent))b.disabled=true;
  };render();status.textContent='Local Creator draft. Not saved to the server.';
 });
 const mine=button('My World Cups',async()=>{const rows=await model.list();panel.hidden=false;content.replaceChildren();for(const t of rows){const p=document.createElement('p');p.textContent=t.title||t.id;content.append(p);}status.textContent='Your World Cups loaded.';});
 const close=button('Close Creator',()=>{content.replaceChildren();panel.hidden=true;status.textContent='';});
 box.append(create,mine,close,status,panel);account.append(box);
 const handle={setIdentity(user){model.setIdentity(user);content.replaceChildren();panel.hidden=true;status.textContent=user?'':'Sign in with Google to create and manage your World Cups.';},model};account.__memberCreator=handle;return handle;
}
