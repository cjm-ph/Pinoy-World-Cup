// Passive request diagnostics: never attach a data listener or consume upload bytes.
export function uploadTrace(req,res,reference){
 const start=performance.now(),events=[],stages={};let bytes=0,current='REQUEST',closed=false;
 const elapsed=()=>Math.round(performance.now()-start);
 const state=()=>({req_aborted:!!req.aborted,req_complete:!!req.complete,req_destroyed:!!req.destroyed,bytes_consumed:bytes,buffered_bytes:req.readableLength||0,response_finished:!!res.writableFinished,response_destroyed:!!res.destroyed});
 const record=(event,code)=>{if(events.length<64)events.push({event,ms:elapsed(),stage:current,...(/^(req_|res_|socket_)/.test(event)?state():{}),...(code?{code}: {})});};
 const length=req.headers['content-length'];const contentLength=typeof length==='string'&&/^[0-9]{1,12}$/.test(length)?Number(length):null;
 const errorCode=e=>['ECONNRESET','ABORT_ERR','ERR_STREAM_PREMATURE_CLOSE','ERR_STREAM_DESTROYED','ETIMEDOUT'].includes(e?.code)?e.code:'OTHER';
 const onAborted=()=>record('req_aborted'),onEnd=()=>record('req_end'),onClose=()=>record(req.complete&&!req.aborted?'req_close_complete':'req_close_incomplete'),onError=e=>record('req_error',errorCode(e)),onTimeout=()=>record('socket_timeout');
 req.on('aborted',onAborted);req.on('end',onEnd);req.on('close',onClose);req.on('error',onError);req.socket?.on('timeout',onTimeout);
 function finish(event){if(closed)return;closed=true;record(event);req.socket?.removeListener('timeout',onTimeout);console.info(JSON.stringify({event:'media_upload_trace',reference,elapsed_ms:elapsed(),stage:current,content_length_present:length!==undefined,content_length:contentLength,...state(),stages,events,origin:'unresolved; socket close alone cannot distinguish browser from proxy'}));}
 res.once('finish',()=>finish('res_finish'));res.once('close',()=>finish(res.writableFinished?'res_close_complete':'res_close_incomplete'));res.once('error',e=>record('res_error',errorCode(e)));
 console.info(JSON.stringify({event:'media_upload_start',reference,content_length_present:length!==undefined,content_length:contentLength}));
 return {reference,disconnected(){return !!(req.aborted || (req.destroyed && !req.complete) || (res.destroyed && !res.writableFinished));},operationEnd(){if(closed)console.info(JSON.stringify({event:'media_upload_operation_end',reference,elapsed_ms:elapsed(),...state(),stages,events}));},bytes(total){bytes=total;},stage(stage){current=stage;record('stage_start');},stageEnd(stage,ms){stages[stage]=+(Number(stages[stage]||0)+ms).toFixed(2);},event:record};
}
