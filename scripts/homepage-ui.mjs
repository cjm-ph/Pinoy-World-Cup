import {createCatalogueTools,decorateMemberBrand} from './member-ui-v21.mjs';
import {giphyPreview,giphyStillUrl} from './giphy-preview.mjs';
import {readHomepage} from './homepage-read-api.mjs';
import {createCoverPicker,publicImageUrl} from './homepage-cover-model.mjs';
import {publicContentType} from './member-page-policy.mjs';
export function installHomepage(root,{read=readHomepage,random=Math.random}={}) {
 decorateMemberBrand(document.querySelector('.home-header'));
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const tabs=$('homeTabs'),grid=$('grid'),search=$('homeSearch'),empty=$('homeEmpty');
 let sort='popular',period='month',contentType='all',rows=[],offset=0,total=0,loading=false,failed=false,generation=0,visibleLimit=18;
 const catalogueCache=new Map();
 const registry=new Map(root.TOURNAMENTS.map(t=>[t.id,t])),pick=createCoverPicker(random,{source:p=>p?.previewSource});
 const contentTypes=new Map([...registry].map(([id,t])=>[id,publicContentType(t)]));
 const coverRow=row=>({...row,candidates:(row.candidates||[]).map(p=>{const preview=giphyPreview(registry.get(row.tournament_id)?.items.find(i=>i.id===p.participant_id)?.media);return {...p,previewSource:(preview?giphyStillUrl(registry.get(row.tournament_id)?.items.find(i=>i.id===p.participant_id)?.media):null)||publicImageUrl(p.image_asset_id),giphySource:preview?.source};})});
 // Reuse this visit's cached card pair; never draw another popup candidate or mutate covers.
 root.PWCHomepageStartCover=id=>{
  const row=rows.find(r=>r.tournament_id===id),tournament=registry.get(id);
  if(!row||tournament?._statistics_revision_id!==row.revision_id)return null;
  const sources=pick(coverRow(row)).map(p=>p?.previewSource).filter(Boolean);
  return {source:sources[0]||'',fallbackSources:sources.slice(1),fit:'contain',position:'50% 50%'};
 };
 const periods=el('div',undefined,'home-periods'),types=el('div',undefined,'home-periods'),status=el('p',undefined,'home-read-status'),retry=el('button','Retry','home-tab'),more=el('button','MORE','home-more');
 types.setAttribute('role','group');types.setAttribute('aria-label','Content type');
 periods.setAttribute('role','group');periods.setAttribute('aria-label','Popularity period');status.setAttribute('role','status');
 retry.type=more.type='button';retry.hidden=more.hidden=true;tabs.replaceChildren();tabs.setAttribute('aria-label','World Cup order');
 tabs.after(types,periods);grid.before(status,retry);grid.after(more);

 const menu=$('homeMemberMenu'),toggle=$('homeMenuToggle');
 if(toggle)toggle.onclick=()=>{const open=!menu.hasAttribute('data-open');menu.toggleAttribute('data-open',open);toggle.setAttribute('aria-expanded',String(open));};
 const closeMenu=()=>{menu?.removeAttribute('data-open');toggle?.setAttribute('aria-expanded','false');};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu?.hasAttribute('data-open')){closeMenu();toggle?.focus();}});
 for(const [id,label] of [['homeMake','Create World Cup'],['homeMine','My World Cups']])if($(id))$(id).onclick=()=>{const nav=document.querySelector('[data-member-creator]');const target=nav&&!nav.hidden?[...nav.querySelectorAll('button')].find(b=>b.textContent===label):null;if(target){closeMenu();target.click();}else{$('memberStatus').textContent='Sign in with Google to '+(id==='homeMake'?'make a cup.':'view your cups.');menu?.setAttribute('data-open','');toggle?.setAttribute('aria-expanded','true');$('memberGoogle')?.focus();}};
 if($('homeNavHome'))$('homeNavHome').onclick=e=>{e.preventDefault();closeMenu();root.goHome();};
 document.title='STAGING — FaveCrown';
 const tools=createCatalogueTools({search,isActive:()=>!document.body.classList.contains('member-workspace-open'),onChange:s=>{sort=s.sort;period=s.period;contentType=s.type;void load(true);}});$('homeCatalogue').replaceChildren(tools.root);
 function controlsState(){tools.draw();}
 function matches(row){const t=registry.get(row.tournament_id),query=search.value.trim().toLowerCase();return t&&t._statistics_revision_id===row.revision_id&&(contentType==='all'||contentTypes.get(t.id)===contentType)&&(!query||[t.title,...(t.items||[]).map(p=>p.name||'')].some(name=>name.toLowerCase().includes(query)));}
 function render(){
  grid.replaceChildren();const query=search.value.trim().toLowerCase();
  let matched=0;for(const row of rows){const tournament=registry.get(row.tournament_id);
   // Never splice an API revision into an older in-memory game roster.
   if(!matches(row))continue;
   if(++matched>visibleLimit)continue;
   const card=el('article',undefined,'home-card');card.dataset.tournamentId=tournament.id;
   const upper=el('button',undefined,'home-card-upper');upper.type='button';upper.setAttribute('aria-label','Choose a round for '+tournament.title);upper.onclick=()=>root.start(tournament);card.append(upper);
   const media=el('span',undefined,'home-photo');media.dataset.coverMode='automatic-pair';
   const pair=pick(coverRow(row));
   for(let index=0;index<2;index++){
    const candidate=pair[index],half=el('span',undefined,'home-photo-half');half.dataset.participantId=candidate?.participant_id||'';
    const fallback=el('span','Image unavailable','home-pair-fallback');half.append(fallback);
    const src=candidate?.previewSource;
    if(src){const image=el('img');image.alt='Candidate '+(index+1)+' in '+tournament.title;image.loading='lazy';image.onload=()=>{fallback.hidden=true;};image.onerror=()=>{if(!half.isConnected)return;pick.failed(row,candidate.participant_id);render();};image.src=src;half.append(image);}
    media.append(half);
   }
   const badge=el('span',String(tournament.category||'others').toUpperCase(),'home-badge');media.append(badge);upper.append(media);
   const heading=el('span',undefined,'home-card-body'),title=el('span',tournament.title,'home-title');heading.append(title);if(tournament.short_description?.trim())heading.append(el('span',tournament.short_description,'home-short-description'));upper.append(heading);
   const body=el('div',undefined,'home-card-body home-actions-body'),line=el('div',undefined,'home-title-row'),details=el('button','Details','home-details');details.type='button';
   details.setAttribute('aria-label','Details for '+tournament.title);details.onclick=event=>{event.stopPropagation();$('homeDetailsTitle').textContent=tournament.title;let body=$('homeDetailsBody');if(!body){body=el('div');body.id='homeDetailsBody';$('homeDetailsTitle').after(body);}body.textContent=tournament.sub?.trim()||'No description available.';$('homeDetailsDialog').showModal();};
   const startButton=el('button',undefined,'home-start');startButton.type='button';startButton.setAttribute('aria-label','Start '+tournament.title);const icon=el('b','▷');icon.setAttribute('aria-hidden','true');startButton.append(icon,el('span','PLAY'));startButton.onclick=()=>root.start(tournament);body.append(startButton);
   line.append(details);body.append(line);for(const [index,p] of pair.entries())if(p.giphySource){const link=el('a','View on GIPHY '+(index+1),'home-giphy-source');link.href=p.giphySource;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}card.append(body);grid.append(card);
  }
  empty.hidden=loading||failed||grid.children.length>0;
  empty.textContent=search.value.trim()?'No search results found.':'No World Cups found.';more.hidden=loading||failed||(matched<=visibleLimit&&offset>=total);retry.hidden=!failed;
  status.textContent=failed?'World Cups could not be loaded. Retry to refresh the list.':loading?'Loading World Cups…':rows.some(r=>!registry.has(r.tournament_id)||registry.get(r.tournament_id)._statistics_revision_id!==r.revision_id)?'Published content changed. Refresh the page to load the latest World Cups.':'';
  status.hidden=!status.textContent;
 }
 async function load(reset){
  if(loading&&!reset)return;
  const token=++generation,selectedSort=sort,selectedPeriod=period;
  if(reset)visibleLimit=18;loading=true;failed=false;controlsState();render();
  try{
   const key=selectedSort==='latest'?'latest':selectedSort+':'+selectedPeriod;
   const cached=catalogueCache.get(key);rows=cached?.rows||[];offset=rows.length;total=cached?.total??1;
   const ordered=[...rows],seen=new Set(rows.map(r=>r.tournament_id));let cursor=offset;
   while(cursor<total&&ordered.filter(matches).length<visibleLimit){
    const limit=cursor===0?18:9;
    const result=await read({sort:selectedSort,period:selectedPeriod,limit,offset:cursor});
    if(token!==generation)return;
    if(!Number.isSafeInteger(result.total)||result.total<0||result.offset!==cursor||result.items.some(r=>!r||typeof r.tournament_id!=='string'||typeof r.revision_id!=='string'||!Array.isArray(r.candidates)))throw Error('Invalid homepage response');
    if(result.total>10050)throw Error('Catalogue exceeds supported pagination');
    if(cursor&&result.total!==total)throw Error('Changed catalogue; retry');
    total=result.total;
    for(const row of result.items){if(seen.has(row.tournament_id))throw Error('Changed catalogue; retry');seen.add(row.tournament_id);ordered.push(row);}
    cursor+=result.items.length;
    if(!result.items.length&&cursor<total)throw Error('Incomplete homepage response');
   }
   offset=cursor;rows=ordered;catalogueCache.set(key,{rows,total});
  }catch{if(token===generation){failed=true;rows=[];}}
  finally{if(token===generation){loading=false;render();}}
 }
 root.buildGrid=render;
 let searchTimer;search.oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void load(true),200);};
 retry.onclick=()=>{catalogueCache.delete(sort==='latest'?'latest':sort+':'+period);void load(true);};more.onclick=()=>{visibleLimit+=9;void load(false);};
 if($('heroStart'))$('heroStart').onclick=()=>$('homeCatalogue').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
 $('homeDetailsClose').onclick=()=>$('homeDetailsDialog').close();$('homeBrand').onclick=event=>{event.preventDefault();root.goHome();};
 void load(true);
}
