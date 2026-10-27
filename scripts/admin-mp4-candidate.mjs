import {mediaTimeRange} from './candidate-media-policy.mjs';
import {imgurProvenance,checkedMp4} from './mp4-source-contract.mjs';
// Registration is supplied by an authoritative service or an explicit local fixture.
// No network, persistence fallback, feature activation or ambient browser hook.
export async function registerAdminMp4Candidate({work,candidateId,url,register,enabled=false,expectedVersion,createCandidate,startSeconds=0,endSeconds=null}) {
 const range=mediaTimeRange(startSeconds,endSeconds),source=imgurProvenance(url);
 if(!enabled||typeof register!=='function')throw Error('Imgur registration is not enabled. Existing candidates are unchanged.');
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw Error('Current edit version is required.');
 if(work.giphy_contract||work.participants.some(p=>p.media?.type==='giphy'))throw Error('Mixed GIPHY/MP4 save unsupported.');
 const before=JSON.stringify(work);
 let slot=candidateId?work.participants.find(p=>p.id===candidateId):work.participants.find(p=>!p.name?.trim()&&!p.image_asset_id&&!p.media);
 if(!slot&&!candidateId&&work.participants.length<work.requested_size&&typeof createCandidate==='function')slot=createCandidate();
 if(!slot?.id)throw Error('Candidate changed. Reopen its media URL.');
 const result=await register({tournament_id:work.tournament_id,expected_version:expectedVersion,source:structuredClone(source),candidate_id:slot.id});
 // Only confirmed ready registration may change the draft. Server still checks ownership,
 // job/source/bytes/poster binding and rights at save/publication; these checks do not replace it.
 const media=checkedMp4(result?.media);
 if(result?.technical_state!=='ready'||!result.asset_id||media.poster_asset_id!==result.asset_id||JSON.stringify(media.source)!==JSON.stringify(source))throw Error('MP4 registration was not confirmed.');
 if(JSON.stringify(work)!==before)throw Error('Draft changed during registration. Retry from the current draft.');
 if(!work.participants.includes(slot))work.participants.push(slot);
 slot.media={...media,...range};slot.image_asset_id=result.asset_id;work.mp4_contract=true;
 return slot;
}
