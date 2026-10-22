-- Staging cmnomqsurdwhdbjgnsvw ONLY. New tables only; never replay 041-055.
-- In an approved execution COPY after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.comments_approved='YES';
-- Installs disabled. No Storage DDL and no existing content/event DML.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.comments_approved',true) IS DISTINCT FROM 'YES'
 OR to_regclass('pwc41.play_sessions') IS NULL
 OR to_regclass('pwc41.admin_tournament_trash') IS NULL
 THEN RAISE EXCEPTION 'STOP: approved Staging and installed statistics/trash required'; END IF;
 IF pwc41_private.purge_storage_barrier_ready() THEN RAISE EXCEPTION 'STOP: purge must remain blocked'; END IF;
END $$;
CREATE TABLE pwc41.comments_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,policy_reviewed boolean NOT NULL DEFAULT false,retention_days integer NOT NULL DEFAULT 90 CHECK(retention_days BETWEEN 30 AND 180));
INSERT INTO pwc41.comments_control DEFAULT VALUES;
CREATE TABLE pwc41.tournament_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tournament_id text NOT NULL REFERENCES pwc41.tournaments(id),
 author_key text NOT NULL,browser_key text NOT NULL,member_id uuid,display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 1 AND 60),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 100 AND body ~ '[^[:space:]]'),
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),hidden boolean NOT NULL DEFAULT false,
 champion_id text,champion_name text,CHECK((champion_id IS NULL)=(champion_name IS NULL)),UNIQUE(author_key,request_id)
);
CREATE INDEX comments_public_cursor ON pwc41.tournament_comments(tournament_id,created_at DESC,id DESC) WHERE NOT hidden;
CREATE INDEX comments_owner ON pwc41.tournament_comments(author_key,id);
CREATE TABLE pwc41.comment_limits(subject text PRIMARY KEY,last_post_at timestamptz,report_since timestamptz,report_count integer NOT NULL DEFAULT 0,banned_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
-- Technical replay receipts, not deletion logs. No comment ID, body, title or tid.
-- Signed operation expiry makes old operations non-insertable after receipt cleanup.
CREATE TABLE pwc41.comment_receipts(subject text NOT NULL,request_id uuid NOT NULL,operation text NOT NULL,payload_hash text NOT NULL,body_hash text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(subject,request_id));
CREATE INDEX comment_receipts_expiry ON pwc41.comment_receipts(created_at);
CREATE INDEX comment_receipts_repeat ON pwc41.comment_receipts(subject,body_hash,created_at) WHERE body_hash IS NOT NULL;
CREATE TABLE pwc41.comment_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),comment_id uuid NOT NULL,tournament_id text NOT NULL,
 reporter_key text NOT NULL,author_key text NOT NULL,author_browser_key text NOT NULL,author_member_id uuid,display_name text NOT NULL,
 original_body text NOT NULL CHECK(char_length(original_body)<=100),comment_created_at timestamptz NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','reviewed','dismissed')),
 reviewed_by uuid,reviewed_at timestamptz,note text NOT NULL DEFAULT '' CHECK(char_length(note)<=500),UNIQUE(comment_id,reporter_key)
);
CREATE INDEX comment_reports_cursor ON pwc41.comment_reports(reported_at DESC,id DESC);
CREATE INDEX comment_reports_pending ON pwc41.comment_reports(state,reported_at DESC,id DESC);
CREATE INDEX comment_reports_expiry ON pwc41.comment_reports(expires_at);
CREATE TABLE pwc41.comment_moderation(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES pwc41.comment_reports(id),
 actor_id uuid NOT NULL,action text NOT NULL,note text NOT NULL CHECK(char_length(note)<=500),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['comments_control','tournament_comments','comment_limits','comment_receipts','comment_reports','comment_moderation'] LOOP
 EXECUTE format('ALTER TABLE pwc41.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON pwc41.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP;END $$;
CREATE FUNCTION pwc41_private.comment_service(require_enabled boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE insufficient_privilege; END IF;
 IF require_enabled AND NOT EXISTS(SELECT 1 FROM pwc41.comments_control WHERE enabled AND policy_reviewed) THEN RAISE EXCEPTION 'COMMENTS_DISABLED'; END IF;
END $$;
CREATE FUNCTION pwc41_private.comment_admin(actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM pwc41_private.comment_service(false);
 PERFORM 1 FROM pwc41.admin_members WHERE user_id=actor AND active FOR SHARE;
 IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
END $$;
CREATE FUNCTION pwc41_private.comment_subject(actor uuid,guest text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF actor IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM pwc41.profiles WHERE id=actor) THEN RAISE insufficient_privilege; END IF;
  RETURN 'm:'||actor::text;
 END IF;
 IF guest IS NULL OR guest !~ '^[a-f0-9]{64}$' THEN RAISE insufficient_privilege; END IF;
 RETURN 'g:'||guest;
END $$;
CREATE FUNCTION pwc41_private.comment_public(tid text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM pwc41.tournaments t WHERE id=tid AND visibility='public' AND published_revision_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=t.id) FOR SHARE;
 IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
END $$;
CREATE FUNCTION pwc41_private.comment_row(c pwc41.tournament_comments,subject text,browser text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'body',c.body,'display_name',c.display_name,'created_at',c.created_at,'champion_name',c.champion_name,
 'mine',c.author_key=subject OR c.author_key=browser,'reported',EXISTS(SELECT 1 FROM pwc41.comment_reports r WHERE r.comment_id=c.id AND r.reporter_key=subject))
$$;
CREATE FUNCTION pwc41_api.comments_list(actor uuid,guest text,tid text,cursor_at timestamptz DEFAULT NULL,cursor_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_subject text; rows jsonb; extra boolean; wait integer; BEGIN
 PERFORM pwc41_private.comment_service();PERFORM pwc41_private.comment_public(tid);v_subject:=pwc41_private.comment_subject(actor,guest);
 IF (cursor_at IS NULL)<>(cursor_id IS NULL) THEN RAISE EXCEPTION 'INVALID_CURSOR'; END IF;
 SELECT coalesce(jsonb_agg(pwc41_private.comment_row(q,v_subject,'g:'||guest) ORDER BY q.created_at DESC,q.id DESC),'[]') INTO rows FROM
 (SELECT * FROM pwc41.tournament_comments c WHERE c.tournament_id=tid AND NOT hidden AND (cursor_at IS NULL OR (c.created_at,c.id)<(cursor_at,cursor_id)) ORDER BY created_at DESC,id DESC LIMIT 15) q;
 SELECT count(*)>15 INTO extra FROM(SELECT 1 FROM pwc41.tournament_comments c WHERE c.tournament_id=tid AND NOT hidden AND (cursor_at IS NULL OR (c.created_at,c.id)<(cursor_at,cursor_id)) LIMIT 16) q;
 SELECT greatest(0,ceil(extract(epoch FROM max(last_post_at)+interval '120 seconds'-clock_timestamp())))::integer INTO wait FROM pwc41.comment_limits WHERE comment_limits.subject IN(v_subject,'g:'||guest);
 RETURN jsonb_build_object('rows',rows,'has_more',extra,'wait_seconds',coalesce(wait,0),'next',CASE WHEN extra THEN jsonb_build_object('at',rows->14->>'created_at','id',rows->14->>'id') END);
END $$;
CREATE FUNCTION pwc41_api.comments_mutate(actor uuid,guest text,stats_caller text,operation text,req uuid,valid_until timestamptz,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  -- Only Guest's currently verified statistics cookie establishes a trustworthy
  -- completion link. Existing statistics contain no member/account binding.
  IF actor IS NULL AND stats_caller ~ '^[a-f0-9]{64}$' THEN
   SELECT g.champion_id,p.name INTO cid,cname FROM pwc41.play_sessions g
   JOIN pwc41.revision_participants p ON p.revision_id=g.revision_id AND p.participant_id=g.champion_id
   WHERE g.tournament_id=tid AND g.caller_hash=stats_caller AND g.completed_at IS NOT NULL
   AND g.sequence=cardinality(g.initial_ids)-1 AND g.champion_id=ANY(g.initial_ids)
   ORDER BY g.completed_at DESC,g.id DESC LIMIT 1;
  END IF;
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
CREATE FUNCTION pwc41_api.comments_admin(actor uuid,cursor_at timestamptz DEFAULT NULL,cursor_id uuid DEFAULT NULL,report_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;extra boolean;BEGIN
 PERFORM pwc41_private.comment_admin(actor);
 IF report_id IS NOT NULL THEN
  RETURN (SELECT to_jsonb(r)-ARRAY['reporter_key','author_key','author_browser_key']||jsonb_build_object('author_kind',CASE WHEN r.author_member_id IS NULL THEN 'Guest' ELSE 'Member' END,
   'comment_exists',EXISTS(SELECT 1 FROM pwc41.tournament_comments c WHERE c.id=r.comment_id),
   'hidden',(SELECT hidden FROM pwc41.tournament_comments c WHERE c.id=r.comment_id),
   'restricted_until',(SELECT banned_until FROM pwc41.comment_limits l WHERE l.subject=r.author_key),
   'actions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY created_at DESC),'[]') FROM pwc41.comment_moderation m WHERE m.report_id=r.id)) FROM pwc41.comment_reports r WHERE r.id=report_id);
 END IF;
 IF (cursor_at IS NULL)<>(cursor_id IS NULL) THEN RAISE EXCEPTION 'INVALID_CURSOR';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY reported_at DESC,id DESC),'[]') INTO rows FROM
 (SELECT id,comment_id,tournament_id,display_name,original_body,comment_created_at,reported_at,state,author_member_id FROM pwc41.comment_reports r WHERE cursor_at IS NULL OR (reported_at,id)<(cursor_at,cursor_id) ORDER BY reported_at DESC,id DESC LIMIT 15) q;
 SELECT count(*)>15 INTO extra FROM(SELECT 1 FROM pwc41.comment_reports WHERE cursor_at IS NULL OR (reported_at,id)<(cursor_at,cursor_id) LIMIT 16) q;
 RETURN jsonb_build_object('rows',rows,'has_more',extra,'next',CASE WHEN extra THEN jsonb_build_object('at',rows->14->>'reported_at','id',rows->14->>'id') END);
END $$;
-- Immutable evidence fields are never changed by moderation; no FK to deleted comments.
CREATE FUNCTION pwc41_private.comment_evidence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','reviewed_by','reviewed_at','note']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reviewed_by','reviewed_at','note']) THEN RAISE EXCEPTION 'report evidence immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER comment_evidence_immutable BEFORE UPDATE ON pwc41.comment_reports FOR EACH ROW EXECUTE FUNCTION pwc41_private.comment_evidence_guard();
-- Explicit operator maintenance only, limited to these NEW tables. No schedule.
CREATE FUNCTION pwc41_api.comments_maintenance(actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE n integer;BEGIN
 PERFORM pwc41_private.comment_admin(actor);
 DELETE FROM pwc41.comment_moderation WHERE report_id IN(SELECT id FROM pwc41.comment_reports WHERE expires_at<=clock_timestamp());
 DELETE FROM pwc41.comment_reports WHERE expires_at<=clock_timestamp();GET DIAGNOSTICS n=ROW_COUNT;
 DELETE FROM pwc41.comment_receipts WHERE created_at<clock_timestamp()-interval '24 hours';
 DELETE FROM pwc41.comment_limits WHERE updated_at<clock_timestamp()-interval '7 days' AND coalesce(banned_until,'-infinity')<=clock_timestamp();
 RETURN jsonb_build_object('expired_reports_removed',n);
END $$;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT x.oid::regprocedure sig FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace
 WHERE(n.nspname='pwc41_private' AND x.proname IN('comment_service','comment_admin','comment_subject','comment_public','comment_row','comment_evidence_guard'))
 OR(n.nspname='pwc41_api' AND x.proname IN('comments_list','comments_mutate','comments_admin','comments_maintenance')) LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.sig);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',p.sig);
END LOOP;END $$;
GRANT EXECUTE ON FUNCTION pwc41_api.comments_list(uuid,text,text,timestamptz,uuid),pwc41_api.comments_mutate(uuid,text,text,text,uuid,timestamptz,jsonb),pwc41_api.comments_admin(uuid,timestamptz,uuid,uuid),pwc41_api.comments_maintenance(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

