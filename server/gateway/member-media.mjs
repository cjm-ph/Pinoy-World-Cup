import {supabaseAdapters} from './adapters.mjs';
import {createMixedMediaAdapters} from './mixed-media-adapters.mjs';
import {createGateway,digest} from './gateway.mjs';
import {createMixedMediaService,createMixedMediaHttp} from './mixed-media.mjs';

// Separate member-only RPC namespace; no grant or fallback to administrator authority.
export function createMemberMedia(config,{decoder,fetchImpl=config.fetchImpl||fetch}={}){
 const map={admin_media_assert_owner:'member_media_owner_v45',admin_media_acquire:'member_media_acquire_v45',admin_media_begin:'member_media_begin_v45',admin_media_finish:'member_media_finish_v45',admin_media_release:'member_media_release_v45',admin_media_abandon:'member_media_abandon_v45',admin_mixed_media_capability:'member_media_capability_v45',mixed_media_reserve:'member_source_reserve_v45',mixed_media_finish:'member_source_finish_v45'};
 const scopedFetch=(input,options)=>{const url=new URL(input);const name=url.pathname.split('/').at(-1);if(url.pathname.startsWith('/rest/v1/rpc/')&&map[name])url.pathname='/rest/v1/rpc/'+map[name];return fetchImpl(url.href,options);};
 const options={...config,fetchImpl:scopedFetch},base=supabaseAdapters(options),sources=createMixedMediaAdapters(options);
 const gateway=createGateway({...base,decoder});
 const mixed=createMixedMediaHttp(createMixedMediaService({...base,gateway,sources,apiKey:config.youtubeKey,fetchImpl:scopedFetch}));
 async function rpc(name,args,token){const r=await scopedFetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Profile':'pwc41_api'},body:JSON.stringify(args)});if(!r.ok)throw Error('Member permission refused');return r.json();}
 return async(req,res,url)=>{try{
  if(!req.headers.authorization?.startsWith('Bearer ')||(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host))throw Error('Member authentication required');
  const token=req.headers.authorization.slice(7),tid=url.searchParams.get('tid');
  if(url.pathname==='/member/media/youtube'&&req.method==='POST'){const target=new URL(url);target.pathname='/admin/media/youtube';await mixed(req,res,target);return;}
  if(url.pathname==='/member/media/upload'&&req.method==='POST'){const out=await gateway.upload({token,tid,requestId:url.searchParams.get('request'),assetId:url.searchParams.get('asset'),body:req});res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(out));return;}
  if(url.pathname==='/member/media/preview'&&req.method==='GET'){await base.auth.verify(token);const aid=url.searchParams.get('asset'),target=await rpc('member_media_preview_v45',{tid,aid},token);const bytes=await base.storage.read(target.bucket,target.object_key);if(digest(bytes)!==target.sha256)throw Error('Integrity failure');const again=await rpc('member_media_preview_v45',{tid,aid},token);if(again.object_key!==target.object_key||again.sha256!==target.sha256)throw Error('Permission changed');res.writeHead(200,{'Content-Type':'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;}
  res.writeHead(404);res.end();
 }catch{if(!res.headersSent)res.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Member media unavailable; existing media preserved.'}));}};
}
