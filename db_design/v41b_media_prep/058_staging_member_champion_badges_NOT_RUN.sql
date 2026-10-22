-- Staging cmnomqsurdwhdbjgnsvw ONLY. AFTER 056. Never replay/edit 041-057.
-- In an approved execution COPY after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.member_badges_approved='YES';
-- No backfill. No original session/profile/match mutation except calling existing
-- validated gameplay RPCs for NEW requests. Does not enable comments or purge.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.member_badges_approved',true) IS DISTINCT FROM 'YES'
 OR to_regclass('pwc41.comments_control') IS NULL
 OR to_regprocedure('pwc41_api.play_statistics_start(text,uuid,text,text,text[])') IS NULL
 OR to_regprocedure('pwc41_api.play_statistics_events(text,uuid,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'STOP: approved Staging, installed 052/056 required';END IF;
 IF pwc41_private.purge_storage_barrier_ready() THEN RAISE EXCEPTION 'STOP: purge must remain blocked';END IF;
END $$;
-- Game ownership is server-authenticated at FIRST creation, never on replay.
-- A gap in authenticated sequence coverage permanently invalidates badge eligibility.
CREATE TABLE pwc41.play_member_links(
 game_id uuid PRIMARY KEY REFERENCES pwc41.play_sessions(id),
 member_id uuid NOT NULL REFERENCES pwc41.profiles(id),
 eligible boolean NOT NULL DEFAULT true,verified_sequence integer NOT NULL DEFAULT 0,
 verified_completed_at timestamptz,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(verified_sequence BETWEEN 0 AND 31),
 CHECK(verified_completed_at IS NULL OR eligible)
);
CREATE INDEX play_member_champion_lookup ON pwc41.play_member_links(member_id,verified_completed_at DESC,game_id DESC)
 WHERE eligible AND verified_completed_at IS NOT NULL;
ALTER TABLE pwc41.play_member_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pwc41.play_member_links FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION pwc41_api.play_statistics_member_start(caller text,req uuid,tid text,rid text,lineup text[],actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;existed boolean;BEGIN
 PERFORM pwc41_private.stats_service();
 -- Same global lock as 052; first creation + optional link are atomic.
 PERFORM pg_advisory_xact_lock(hashtextextended('play_statistics_start',0));
 SELECT EXISTS(SELECT 1 FROM pwc41.play_sessions g WHERE g.caller_hash=caller AND g.request_id=req) INTO existed;
 result:=pwc41_api.play_statistics_start(caller,req,tid,rid,lineup);
 IF NOT existed AND actor IS NOT NULL
 AND EXISTS(SELECT 1 FROM pwc41.profiles WHERE id=actor)
 AND EXISTS(SELECT 1 FROM pwc41.comments_control WHERE enabled AND policy_reviewed) THEN
  INSERT INTO pwc41.play_member_links(game_id,member_id) VALUES((result->>'game_id')::uuid,actor);
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION pwc41_api.play_statistics_member_events(caller text,gid uuid,events jsonb,actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;g pwc41.play_sessions%rowtype;link pwc41.play_member_links%rowtype;target text;covered boolean;BEGIN
 PERFORM pwc41_private.stats_service();
 SELECT tournament_id INTO target FROM pwc41.play_sessions WHERE id=gid AND caller_hash=caller;
 -- Preserve 052's lock order: tournament -> game -> optional sidecar.
 PERFORM 1 FROM pwc41.tournaments WHERE id=target FOR SHARE;
 SELECT * INTO g FROM pwc41.play_sessions WHERE id=gid AND caller_hash=caller FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege;END IF;
 result:=pwc41_api.play_statistics_events(caller,gid,events);
 IF g.completed_at IS NULL THEN
  SELECT * INTO link FROM pwc41.play_member_links WHERE game_id=gid FOR UPDATE;
  IF FOUND THEN
   covered:=coalesce(link.eligible AND actor=link.member_id AND link.verified_sequence=g.sequence
    AND EXISTS(SELECT 1 FROM pwc41.comments_control WHERE enabled AND policy_reviewed),false);
   UPDATE pwc41.play_member_links SET eligible=covered,
    verified_sequence=CASE WHEN covered THEN (result->>'sequence')::integer ELSE verified_sequence END,
    verified_completed_at=CASE WHEN covered AND (result->>'complete')::boolean
     THEN (SELECT completed_at FROM pwc41.play_sessions WHERE id=gid) END
   WHERE game_id=gid;
  END IF;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION pwc41_private.comment_champion(actor uuid,stats_caller text,tid text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',g.champion_id,'name',p.name)
 FROM pwc41.play_sessions g
 JOIN pwc41.revision_participants p ON p.revision_id=g.revision_id AND p.participant_id=g.champion_id
 WHERE g.tournament_id=tid AND g.completed_at IS NOT NULL AND g.completed_at<=statement_timestamp()
 AND g.sequence=cardinality(g.initial_ids)-1 AND g.champion_id=ANY(g.initial_ids)
 AND CASE WHEN actor IS NOT NULL THEN EXISTS(
  SELECT 1 FROM pwc41.play_member_links l WHERE l.game_id=g.id AND l.member_id=actor AND l.eligible
  AND l.verified_sequence=g.sequence AND l.verified_completed_at=g.completed_at)
 ELSE g.caller_hash=stats_caller AND stats_caller ~ '^[a-f0-9]{64}$'
  AND NOT EXISTS(SELECT 1 FROM pwc41.play_member_links l WHERE l.game_id=g.id) END
 ORDER BY g.completed_at DESC,g.id DESC LIMIT 1
$$;

-- Only replace the reviewed 056 body; unexpected versions STOP the transaction.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('pwc41_api.comments_mutate(uuid,text,text,text,uuid,timestamptz,jsonb)')
 AND proowner='postgres'::regrole AND prosecdef
 AND md5(replace(btrim(prosrc),chr(13),''))='9d44fe74d614ed032342ab3d889dcb37')
 THEN RAISE EXCEPTION 'STOP: comments_mutate differs from reviewed 056';END IF;
END $$;
CREATE OR REPLACE FUNCTION pwc41_api.comments_mutate(actor uuid,guest text,stats_caller text,operation text,req uuid,valid_until timestamptz,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE v_subject text; c pwc41.tournament_comments%rowtype;r pwc41.comment_reports%rowtype;lim pwc41.comment_limits%rowtype;receipt pwc41.comment_receipts%rowtype;browser_last timestamptz;
 tid text;txt text;name text;cid text;cname text;bh text;ph text;now_at timestamptz:=clock_timestamp();wait integer;is_admin boolean:=operation IN('review','hide','restore','ban','unban');result jsonb;
BEGIN
 PERFORM pwc41_private.comment_service(NOT is_admin);v_subject:=pwc41_private.comment_subject(actor,guest);
 IF is_admin THEN PERFORM pwc41_private.comment_admin(actor);END IF;
 IF operation NOT IN('post','delete','report','review','hide','restore','ban','unban') OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_OPERATION';END IF;
 IF operation='report' AND req IS NOT NULL THEN
  SELECT * INTO receipt FROM pwc41.comment_receipts WHERE comment_receipts.subject=v_subject AND request_id=req;
  IF FOUND THEN
   IF receipt.operation<>operation OR receipt.payload_hash<>encode(sha256(convert_to(payload::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
   RETURN jsonb_build_object('reported',true);
  END IF;
 END IF;
 IF operation='post' THEN tid:=payload->>'tid';ELSE
  IF is_admin THEN SELECT * INTO r FROM pwc41.comment_reports WHERE id=(payload->>'report_id')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_MISSING';END IF;tid:=r.tournament_id;
  ELSE SELECT * INTO c FROM pwc41.tournament_comments WHERE id=(payload->>'id')::uuid;tid:=c.tournament_id;END IF;
 END IF;
 IF operation IN('post','report') THEN PERFORM pwc41_private.comment_public(tid);END IF;
 -- Global admission + per-subject serialization span all tournaments/processes.
 IF operation IN('post','report') THEN PERFORM pg_advisory_xact_lock(hashtextextended('comments-global',0));END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('comments:'||v_subject,0));
 IF operation='delete' THEN
  SELECT * INTO c FROM pwc41.tournament_comments WHERE id=(payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('deleted',true);END IF;
  IF c.author_key<>v_subject AND c.author_key IS DISTINCT FROM 'g:'||guest THEN RAISE insufficient_privilege; END IF;
  DELETE FROM pwc41.tournament_comments WHERE id=c.id;
  RETURN jsonb_build_object('deleted',true);
 END IF;
 IF req IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED';END IF;
 ph:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');SELECT * INTO receipt FROM pwc41.comment_receipts WHERE comment_receipts.subject=v_subject AND request_id=req;
 IF FOUND THEN
  IF receipt.operation<>operation OR receipt.payload_hash<>ph THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  IF operation='post' THEN SELECT * INTO c FROM pwc41.tournament_comments WHERE author_key=v_subject AND request_id=req;RETURN CASE WHEN FOUND THEN jsonb_build_object('comment',pwc41_private.comment_row(c,v_subject),'wait_seconds',greatest(0,ceil(extract(epoch FROM c.created_at+interval '120 seconds'-now_at)))) ELSE jsonb_build_object('deleted',true) END;END IF;
  RETURN jsonb_build_object('ok',true,'reported',operation='report');
 END IF;
 IF valid_until IS NULL OR valid_until<now_at OR valid_until>now_at+interval '6 minutes' THEN RAISE EXCEPTION 'OPERATION_EXPIRED';END IF;
 INSERT INTO pwc41.comment_limits(subject) VALUES(v_subject) ON CONFLICT DO NOTHING;
 IF actor IS NOT NULL THEN INSERT INTO pwc41.comment_limits(subject) VALUES('g:'||guest) ON CONFLICT DO NOTHING;END IF;
 SELECT * INTO lim FROM pwc41.comment_limits WHERE comment_limits.subject=v_subject FOR UPDATE;
 -- Re-evaluate after lock waits; queueing must never shorten a new cooldown.
 now_at:=clock_timestamp();
 IF valid_until<now_at THEN RAISE EXCEPTION 'OPERATION_EXPIRED';END IF;
 IF operation IN('post','report') AND (lim.banned_until>now_at OR EXISTS(SELECT 1 FROM pwc41.comment_limits WHERE comment_limits.subject='g:'||guest AND banned_until>now_at)) THEN RETURN jsonb_build_object('error','COMMENT_RESTRICTED');END IF;
 IF operation IN('post','report') AND (SELECT count(*) FROM pwc41.comment_receipts WHERE created_at>now_at-interval '1 minute' AND comment_receipts.operation IN('post','report'))>=90 THEN RETURN jsonb_build_object('error','RATE_LIMITED','wait_seconds',60);END IF;
 IF operation='post' THEN
  IF (SELECT count(*) FROM(SELECT 1 FROM pwc41.tournament_comments LIMIT 50000) q)>=50000
  OR (SELECT count(*) FROM(SELECT 1 FROM pwc41.tournament_comments WHERE tournament_id=tid LIMIT 5000) q)>=5000 THEN RETURN jsonb_build_object('error','COMMENT_CAPACITY');END IF;
  SELECT last_post_at INTO browser_last FROM pwc41.comment_limits WHERE comment_limits.subject='g:'||guest;
  wait:=greatest(0,ceil(extract(epoch FROM greatest(lim.last_post_at,browser_last)+interval '120 seconds'-now_at)));
  IF wait>0 THEN RETURN jsonb_build_object('error','COOLDOWN','wait_seconds',wait);END IF;
  txt:=payload->>'body';IF txt IS NULL OR char_length(txt) NOT BETWEEN 1 AND 100 OR txt !~ '[^[:space:]]' THEN RAISE EXCEPTION 'INVALID_LENGTH';END IF;
  bh:=encode(sha256(convert_to(lower(regexp_replace(normalize(txt,NFKC),'[[:space:]]+','','g')),'UTF8')),'hex');
  IF EXISTS(SELECT 1 FROM pwc41.comment_receipts WHERE comment_receipts.subject=v_subject AND body_hash=bh AND created_at>now_at-interval '24 hours') THEN RETURN jsonb_build_object('error','REPEATED_CONTENT');END IF;
  name:='Guest';IF actor IS NOT NULL THEN SELECT coalesce(nullif(left(display_name,60),''),'Member') INTO name FROM pwc41.profiles WHERE id=actor;END IF;
  -- Authentication-bound member completions; Guest keeps verified-cookie lookup.
  SELECT badge->>'id',badge->>'name' INTO cid,cname
  FROM(SELECT pwc41_private.comment_champion(actor,stats_caller,tid) badge) q;
  INSERT INTO pwc41.tournament_comments(tournament_id,author_key,browser_key,member_id,display_name,body,request_id,champion_id,champion_name)
  VALUES(tid,v_subject,'g:'||guest,actor,name,txt,req,cid,cname) RETURNING * INTO c;
  UPDATE pwc41.comment_limits SET last_post_at=c.created_at,updated_at=c.created_at WHERE comment_limits.subject IN(v_subject,'g:'||guest);
  result:=jsonb_build_object('comment',pwc41_private.comment_row(c,v_subject),'wait_seconds',120);
 ELSIF operation='report' THEN
  SELECT * INTO c FROM pwc41.tournament_comments WHERE id=(payload->>'id')::uuid AND NOT hidden FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMMENT_MISSING';END IF;
  IF NOT EXISTS(SELECT 1 FROM pwc41.comment_reports WHERE comment_id=c.id AND reporter_key=v_subject) THEN
   IF (SELECT count(*) FROM(SELECT 1 FROM pwc41.comment_reports LIMIT 100000) q)>=100000 THEN RETURN jsonb_build_object('error','REPORT_CAPACITY');END IF;
   IF lim.report_since>now_at-interval '1 hour' AND lim.report_count>=20 THEN RETURN jsonb_build_object('error','RATE_LIMITED','wait_seconds',3600);END IF;
   INSERT INTO pwc41.comment_reports(comment_id,tournament_id,reporter_key,author_key,author_browser_key,author_member_id,display_name,original_body,comment_created_at,expires_at)
   VALUES(c.id,c.tournament_id,v_subject,c.author_key,c.browser_key,c.member_id,c.display_name,c.body,c.created_at,now_at+make_interval(days=>(SELECT retention_days FROM pwc41.comments_control)));
   UPDATE pwc41.comment_limits SET report_count=CASE WHEN report_since>now_at-interval '1 hour' THEN report_count+1 ELSE 1 END,report_since=CASE WHEN report_since>now_at-interval '1 hour' THEN report_since ELSE now_at END,updated_at=now_at WHERE comment_limits.subject=v_subject;
  END IF;
  result:=jsonb_build_object('reported',true);
 ELSE
  SELECT * INTO r FROM pwc41.comment_reports WHERE id=(payload->>'report_id')::uuid FOR UPDATE;
  IF char_length(coalesce(payload->>'note',''))>500 THEN RAISE EXCEPTION 'NOTE_TOO_LONG';END IF;
  IF operation IN('hide','restore') THEN UPDATE pwc41.tournament_comments SET hidden=(operation='hide') WHERE id=r.comment_id;
  ELSIF operation='review' THEN
   IF payload->>'state' NOT IN('reviewed','dismissed') OR payload->>'state' IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE pwc41.comment_reports SET state=payload->>'state',reviewed_by=actor,reviewed_at=now_at,note=coalesce(payload->>'note','') WHERE id=r.id;
  ELSE
   IF operation='ban' AND ((payload->>'hours')::integer NOT BETWEEN 1 AND 720 OR payload->>'hours' IS NULL) THEN RAISE EXCEPTION 'INVALID_RESTRICTION';END IF;
   INSERT INTO pwc41.comment_limits(subject,banned_until) VALUES(r.author_key,CASE WHEN operation='ban' THEN now_at+make_interval(hours=>(payload->>'hours')::integer) END)
   ON CONFLICT(subject) DO UPDATE SET banned_until=excluded.banned_until,updated_at=now_at;
   INSERT INTO pwc41.comment_limits(subject,banned_until) VALUES(r.author_browser_key,CASE WHEN operation='ban' THEN now_at+make_interval(hours=>(payload->>'hours')::integer) END)
   ON CONFLICT(subject) DO UPDATE SET banned_until=excluded.banned_until,updated_at=now_at;
  END IF;
  INSERT INTO pwc41.comment_moderation(report_id,actor_id,action,note) VALUES(r.id,actor,operation,coalesce(payload->>'note',''));
  result:=jsonb_build_object('ok',true);
 END IF;
 INSERT INTO pwc41.comment_receipts(subject,request_id,operation,payload_hash,body_hash) VALUES(v_subject,req,operation,ph,bh);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION pwc41_private.comment_champion(uuid,text,text),pwc41_api.play_statistics_member_start(text,uuid,text,text,text[],uuid),pwc41_api.play_statistics_member_events(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION pwc41_private.comment_champion(uuid,text,text) OWNER TO postgres;
ALTER FUNCTION pwc41_api.play_statistics_member_start(text,uuid,text,text,text[],uuid) OWNER TO postgres;
ALTER FUNCTION pwc41_api.play_statistics_member_events(text,uuid,jsonb,uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION pwc41_api.play_statistics_member_start(text,uuid,text,text,text[],uuid),pwc41_api.play_statistics_member_events(text,uuid,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
