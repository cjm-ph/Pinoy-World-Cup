import { pathToFileURL } from 'node:url';
import { createGateway } from './gateway.mjs';
import { supabaseAdapters } from './adapters.mjs';
import { createDecoder } from './decoder.mjs';
import { createMediaServer } from './http.mjs';
import { createUploadProbe } from './upload-probe.mjs';
import {createPurgeAdapters,createPurgeController,createPurgeHttp} from './tournament-purge.mjs';
import {createStatisticsAdapters,createStatisticsHttp} from './play-statistics.mjs';
import {createCommentAdapters,createCommentHttp} from './comments.mjs';

export function readStagingEnvironment(env) {
  if (env.PWC_STAGING_SUPABASE_URL !== 'https://cmnomqsurdwhdbjgnsvw.supabase.co') throw Error('Staging URL required.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.PWC_STAGING_PUBLISHABLE_KEY || '')) throw Error('Staging publishable key required.');
  if (!env.PWC_STAGING_SERVICE_KEY || /\s/.test(env.PWC_STAGING_SERVICE_KEY)) throw Error('Server credential required.');
  const port=Number(env.PWC_STAGING_PORT || '8080');
  if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('Invalid gateway port.');
  return {url:env.PWC_STAGING_SUPABASE_URL,publishableKey:env.PWC_STAGING_PUBLISHABLE_KEY,serviceKey:env.PWC_STAGING_SERVICE_KEY,port,comments:env.PWC_STAGING_COMMENTS==='enabled',playStatistics:env.PWC_STAGING_PLAY_STATISTICS==='enabled',uploadProbe:env.PWC_STAGING_UPLOAD_PROBE==='temporary-enabled',tournamentPurge:env.PWC_STAGING_TOURNAMENT_PURGE==='reviewed-enabled'};
}
export function composeStaging(config) {
  const adapters=supabaseAdapters(config);
  const purgeHttp=config.tournamentPurge===true?createPurgeHttp(createPurgeController({auth:adapters.auth,...createPurgeAdapters(config),enabled:true})):undefined;
  const statisticsHttp=createStatisticsHttp({rpc:createStatisticsAdapters(config),auth:adapters.auth,memberBadges:config.comments===true,secret:config.serviceKey,enabled:config.playStatistics===true});
  const commentsHttp=createCommentHttp({...createCommentAdapters(config),auth:adapters.auth,secret:config.serviceKey,enabled:config.comments===true});
  return createMediaServer(createGateway({...adapters,decoder:createDecoder()}),{uploadProbe:config.uploadProbe===true?createUploadProbe(adapters):undefined,purgeHttp,statisticsHttp,commentsHttp});
}
// Imports and configuration tests do not start a listener or contact Supabase.
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const config=readStagingEnvironment(process.env);
    const server=composeStaging(config);
    server.on('error',()=>{console.error('Staging gateway could not listen.');process.exitCode=1;});
    server.listen(config.port,'127.0.0.1');
    for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close());
  } catch { console.error('Staging gateway configuration rejected.');process.exitCode=1; }
}
