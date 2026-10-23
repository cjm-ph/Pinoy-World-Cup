import {readHomepage} from './homepage-read-api.mjs';
import {createCoverPicker,publicImageUrl} from './homepage-cover-model.mjs';
export function installHomepage(root,{read=readHomepage,random=Math.random}={}) {
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const tabs=$('homeTabs'),grid=$('grid'),search=$('homeSearch'),empty=$('homeEmpty');
 let sort='popular',period='month',rows=[],offset=0,total=0,loading=false,failed=false,generation=0;
 const pick=createCoverPicker(random),registry=new Map(root.TOURNAMENTS.map(t=>[t.id,t]));
 const periods=el('div',undefined,'home-periods'),status=el('p',undefined,'home-read-status'),retry=el('button','Retry','home-tab'),more=el('button','Load more','home-tab');
 periods.setAttribute('role','group');periods.setAttribute('aria-label','Popularity period');status.setAttribute('role','status');
 retry.type=more.type='button';retry.hidden=more.hidden=true;tabs.replaceChildren();tabs.setAttribute('aria-label','World Cup order');
 tabs.after(periods);grid.before(status,retry);grid.after(more);
 const controls=[];
 for(const value of ['popular','latest']){const button=el('button',value==='popular'?'Popular':'Latest','home-tab');button.type='button';button.onclick=()=>{if(sort!==value){sort=value;void load(true);}};tabs.append(button);controls.push([button,()=>sort===value]);}
 for(const value of ['today','week','month']){const button=el('button',value[0].toUpperCase()+value.slice(1),'home-tab');button.type='button';button.onclick=()=>{if(period!==value){period=value;void load(true);}};periods.append(button);controls.push([button,()=>period===value]);}
 function controlsState(){for(const [button,selected] of controls)button.setAttribute('aria-pressed',String(selected()));periods.hidden=sort==='latest';}
 function render(){
  grid.replaceChildren();const query=search.value.trim().toLowerCase();
  for(const row of rows){const tournament=registry.get(row.tournament_id);
   // Never splice an API revision into an older in-memory game roster.
   if(!tournament||tournament._statistics_revision_id!==row.revision_id||!tournament.title.toLowerCase().includes(query))continue;
   const card=el('article',undefined,'home-card');card.dataset.tournamentId=tournament.id;
   const media=el('button',undefined,'home-photo');media.type='button';media.setAttribute('aria-label','Choose a round for '+tournament.title);media.onclick=()=>root.start(tournament);
   const pair=pick(row);
   for(let index=0;index<2;index++){
    const candidate=pair[index],half=el('span',undefined,'home-photo-half');half.dataset.participantId=candidate?.participant_id||'';
    const fallback=el('span','Image unavailable','home-pair-fallback');half.append(fallback);
    const src=publicImageUrl(candidate?.image_asset_id);
    if(src){const image=el('img');image.alt='Candidate '+(index+1)+' in '+tournament.title;image.loading='lazy';image.onload=()=>{fallback.hidden=true;};image.onerror=()=>{image.remove();fallback.hidden=false;};image.src=src;half.append(image);}
    media.append(half);
   }
   const badge=el('span',String(tournament.category||'others').toUpperCase(),'home-badge');media.append(badge);card.append(media);
   const body=el('div',undefined,'home-card-body'),line=el('div',undefined,'home-title-row'),title=el('button',tournament.title,'home-title'),details=el('button','Details','home-details');title.type=details.type='button';title.onclick=()=>root.start(tournament);
   details.setAttribute('aria-label','Details for '+tournament.title+' - coming soon');details.onclick=event=>{event.stopPropagation();$('homeDetailsTitle').textContent=tournament.title;$('homeDetailsDialog').showModal();};
   line.append(title,details);body.append(line);card.append(body);grid.append(card);
  }
  empty.hidden=loading||failed||grid.children.length>0;
  empty.textContent='No World Cups found.';more.hidden=loading||failed||offset>=total;retry.hidden=!failed;
  status.textContent=failed?'World Cups could not be loaded. Retry to refresh the list.':loading?'Loading World Cups…':rows.some(r=>!registry.has(r.tournament_id)||registry.get(r.tournament_id)._statistics_revision_id!==r.revision_id)?'Published content changed. Refresh the page to load the latest World Cups.':'';
  status.hidden=!status.textContent;
 }
 async function load(reset){
  if(loading&&!reset)return;
  const token=++generation,selectedSort=sort,selectedPeriod=period;
  if(reset){rows=[];offset=0;total=0;}loading=true;failed=false;controlsState();render();
  try{
   do {
    const result=await read({sort:selectedSort,period:selectedPeriod,limit:50,offset});
    if(token!==generation)return;
    if(!Number.isSafeInteger(result.total)||result.total<0||result.offset!==offset||result.items.some(r=>!r||typeof r.tournament_id!=='string'||typeof r.revision_id!=='string'||!Array.isArray(r.candidates)))throw Error('Invalid homepage response');
    if(result.total>10050)throw Error('Catalogue exceeds supported pagination');
    total=result.total;
    for(const row of result.items){if(!rows.some(r=>r.tournament_id===row.tournament_id)){rows.push(row);pick(row);}}
    offset+=result.items.length;
    if(!result.items.length&&offset<total)throw Error('Incomplete homepage response');
    // Search walks remaining server pages, preserving their order; no per-candidate requests.
   }while(search.value.trim()&&offset<total);
  }catch{if(token===generation){failed=true;rows=[];}}
  finally{if(token===generation){loading=false;render();}}
 }
 root.buildGrid=render;
 search.oninput=()=>{render();if(search.value.trim()&&!loading&&!failed&&offset<total)void load(false);};
 retry.onclick=()=>void load(true);more.onclick=()=>void load(false);
 $('heroStart').onclick=()=>$('homeCatalogue').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
 $('homeDetailsClose').onclick=()=>$('homeDetailsDialog').close();$('homeBrand').onclick=event=>{event.preventDefault();root.goHome();};
 void load(true);
}
