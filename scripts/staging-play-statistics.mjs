import {createPlayCollector} from './staging-play-collector.mjs';
import {installPublicStatisticsUI,installAdminStatisticsUI} from './staging-statistics-ui.mjs';
import {getMemberClient} from './staging-member-auth.mjs';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
export function installPlayCollection(root=window){
 if(root.PWC_STAGING?.supabaseUrl!=='https://cmnomqsurdwhdbjgnsvw.supabase.co')return;
 if(root.__stagingPlayCollector)return root.__stagingPlayCollector;
 const note=node('p');note.className='play-statistics-status';note.setAttribute('role','status');document.getElementById('play')?.append(note);
 let identity=null,auth,collector,identityEpoch=0,authReady=Promise.resolve();
 const setIdentity=session=>{identity=session?.user?.id||null;collector?.identityChanged(identity);};
 try{auth=getMemberClient().auth;auth.onAuthStateChange((_event,session)=>{identityEpoch++;setIdentity(session);});
  const at=identityEpoch;authReady=auth.getSession().then(({data,error})=>{if(!error&&at===identityEpoch)setIdentity(data.session);}).catch(()=>{});
 }catch{/* Auth readiness never blocks a game. Unknown identity stays Guest. */}
 collector=createPlayCollector({onStatus:text=>note.textContent=text,getIdentity:()=>identity,
  getToken:async owner=>{await authReady;if(!auth||identity!==owner)return null;const {data,error}=await auth.getSession();return !error&&identity===owner&&data.session?.user?.id===owner?data.session.access_token:null;}});collector.resume();
 const show=root.show;root.show=function(id){const result=show.apply(this,arguments);if(id==='play')try{
  const cup=root.PinoyAdapterV2?.viewModel?.tournaments.find(t=>t.id===root.tour.id);
  collector.start(root.tour.id,cup?._statistics_revision_id,root.cur.map(p=>p.id));
 }catch{note.textContent='Statistics unavailable; gameplay is unaffected.';}return result;};
 // Install before the VS presenter captures choose(). Only committed choices count.
 const choose=root.choose;root.choose=function(side){try{collector.match(root.cur[root.i+side].id);}catch{/* Never interrupt selection. */}return choose.apply(this,arguments);};
 root.__stagingPlayCollector=collector;return collector;
}
export function installPublicStatistics(root=window){return installPublicStatisticsUI(root,()=>installPlayCollection(root));}
export const installAdminStatistics=installAdminStatisticsUI;
