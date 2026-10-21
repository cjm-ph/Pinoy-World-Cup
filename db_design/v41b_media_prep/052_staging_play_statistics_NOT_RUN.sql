-- First install only. Staging cmnomqsurdwhdbjgnsvw. Does not modify 041-050.
-- In an approved execution copy, after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.play_statistics_approved='YES';
-- Installs DISABLED. No historical events are fabricated. No Storage changes.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.play_statistics_approved',true) IS DISTINCT FROM 'YES'
 OR to_regclass('pwc41.admin_tournament_trash') IS NULL
 OR to_regprocedure('pwc41_private.purge_storage_barrier_ready()') IS NULL
 THEN RAISE EXCEPTION 'STOP: approved Staging and installed 048/050 required'; END IF;
 IF pwc41_private.purge_storage_barrier_ready() THEN RAISE EXCEPTION 'STOP: purge must remain blocked'; END IF;
END $$;
CREATE TABLE pwc41.play_statistics_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO pwc41.play_statistics_control DEFAULT VALUES;
CREATE TABLE pwc41.play_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),caller_hash text NOT NULL CHECK(caller_hash ~ '^[a-f0-9]{64}$'),request_id uuid NOT NULL,
 tournament_id text NOT NULL REFERENCES pwc41.tournaments(id),revision_id text NOT NULL REFERENCES pwc41.tournament_revisions(id),
 initial_ids text[] NOT NULL CHECK(cardinality(initial_ids) IN(4,8,16,32)),current_ids text[] NOT NULL,next_ids text[] NOT NULL DEFAULT '{}',
 match_index integer NOT NULL DEFAULT 1,sequence integer NOT NULL DEFAULT 0,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours',
 completed_at timestamptz,champion_id text,UNIQUE(caller_hash,request_id),
 CHECK((completed_at IS NULL)=(champion_id IS NULL))
);
CREATE TABLE pwc41.play_matches(
 game_id uuid NOT NULL REFERENCES pwc41.play_sessions(id),sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 31),
 winner_id text NOT NULL,loser_id text NOT NULL CHECK(winner_id<>loser_id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(game_id,sequence)
);
CREATE INDEX play_sessions_tournament_date ON pwc41.play_sessions(tournament_id,started_at);
CREATE INDEX play_sessions_revision ON pwc41.play_sessions(revision_id,completed_at);
CREATE INDEX play_sessions_started ON pwc41.play_sessions(started_at);
CREATE INDEX play_sessions_caller ON pwc41.play_sessions(caller_hash,started_at);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['play_statistics_control','play_sessions','play_matches'] LOOP
 EXECUTE format('ALTER TABLE pwc41.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON pwc41.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP; END $$;
CREATE FUNCTION pwc41_private.stats_service() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE insufficient_privilege; END IF;
 IF NOT EXISTS(SELECT 1 FROM pwc41.play_statistics_control WHERE enabled) THEN RAISE EXCEPTION 'statistics disabled'; END IF;
END $$;
CREATE FUNCTION pwc41_private.stats_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
 OR coalesce((auth.jwt()->>'is_anonymous')::boolean,true)
 OR NOT EXISTS(SELECT 1 FROM pwc41.admin_members WHERE user_id=auth.uid() AND active)
 THEN RAISE insufficient_privilege; END IF;
END $$;
CREATE FUNCTION pwc41_api.play_statistics_start(caller text,req uuid,tid text,rid text,lineup text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g pwc41.play_sessions%rowtype; t pwc41.tournaments%rowtype;
BEGIN
 PERFORM pwc41_private.stats_service();
 IF caller IS NULL OR caller !~ '^[a-f0-9]{64}$' OR req IS NULL OR tid IS NULL OR rid IS NULL
 OR lineup IS NULL OR cardinality(lineup) NOT IN(4,8,16,32) OR array_ndims(lineup)<>1
 OR array_lower(lineup,1)<>1 OR EXISTS(SELECT 1 FROM unnest(lineup) v WHERE v IS NULL)
 OR (SELECT count(DISTINCT v) FROM unnest(lineup) v)<>cardinality(lineup) THEN RAISE EXCEPTION 'invalid start'; END IF;
 -- Global/caller admission and unique-start serialization are DB-wide, not process-local.
 PERFORM pg_advisory_xact_lock(hashtextextended('play_statistics_start',0));
 SELECT * INTO g FROM pwc41.play_sessions WHERE caller_hash=caller AND request_id=req;
 IF FOUND THEN
  IF g.tournament_id<>tid OR g.revision_id<>rid OR g.initial_ids<>lineup THEN RAISE EXCEPTION 'start conflict'; END IF;
  RETURN jsonb_build_object('game_id',g.id,'sequence',g.sequence,'complete',g.completed_at IS NOT NULL);
 END IF;
 SELECT * INTO t FROM pwc41.tournaments WHERE id=tid AND visibility='public' AND published_revision_id=rid FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid)
 OR NOT EXISTS(SELECT 1 FROM pwc41.tournament_revisions WHERE id=rid AND tournament_id=tid AND state='approved')
 OR EXISTS(SELECT 1 FROM unnest(lineup) v WHERE NOT EXISTS(SELECT 1 FROM pwc41.revision_participants p WHERE p.revision_id=rid AND p.participant_id=v AND p.active)) THEN RAISE EXCEPTION 'public lineup unavailable'; END IF;
 IF (SELECT count(*) FROM pwc41.play_sessions WHERE caller_hash=caller AND started_at>clock_timestamp()-interval '10 minutes')>=30
 OR (SELECT count(*) FROM pwc41.play_sessions WHERE started_at>clock_timestamp()-interval '1 minute')>=600 THEN RAISE EXCEPTION 'statistics rate limited'; END IF;
 INSERT INTO pwc41.play_sessions(caller_hash,request_id,tournament_id,revision_id,initial_ids,current_ids) VALUES(caller,req,tid,rid,lineup,lineup) RETURNING * INTO g;
 RETURN jsonb_build_object('game_id',g.id,'sequence',0,'complete',false);
END $$;
CREATE FUNCTION pwc41_api.play_statistics_events(caller text,gid uuid,events jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g pwc41.play_sessions%rowtype; e jsonb; seq integer; win text; lose text; previous text; tid text;
BEGIN
 PERFORM pwc41_private.stats_service();
 IF events IS NULL OR jsonb_typeof(events)<>'array' OR jsonb_array_length(events) NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'invalid events'; END IF;
 SELECT tournament_id INTO tid FROM pwc41.play_sessions WHERE id=gid AND caller_hash=caller;
 -- Same order as content management: tournament, then game. No content writes.
 PERFORM 1 FROM pwc41.tournaments WHERE id=tid AND visibility='public' FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid) THEN RAISE EXCEPTION 'tournament unavailable'; END IF;
 SELECT * INTO g FROM pwc41.play_sessions WHERE id=gid AND caller_hash=caller FOR UPDATE;
 IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(events) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid match'; END IF;
  IF NOT(e ?& ARRAY['seq','winner']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN('seq','winner'))
  OR jsonb_typeof(e->'seq') IS DISTINCT FROM 'number' OR e->>'seq' !~ '^[0-9]{1,2}$' OR jsonb_typeof(e->'winner') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid match'; END IF;
  seq:=(e->>'seq')::integer;win:=e->>'winner';
  SELECT winner_id INTO previous FROM pwc41.play_matches WHERE game_id=gid AND sequence=seq;
  IF FOUND THEN IF previous<>win THEN RAISE EXCEPTION 'event conflict'; END IF;CONTINUE;END IF;
  IF g.completed_at IS NOT NULL OR g.expires_at<=clock_timestamp() OR seq<>g.sequence+1
  OR win NOT IN(g.current_ids[g.match_index],g.current_ids[g.match_index+1]) THEN RAISE EXCEPTION 'invalid bracket progression'; END IF;
  lose:=CASE WHEN win=g.current_ids[g.match_index] THEN g.current_ids[g.match_index+1] ELSE g.current_ids[g.match_index] END;
  INSERT INTO pwc41.play_matches(game_id,sequence,winner_id,loser_id) VALUES(gid,seq,win,lose);
  g.sequence:=seq;g.next_ids:=array_append(g.next_ids,win);g.match_index:=g.match_index+2;
  IF g.match_index>cardinality(g.current_ids) THEN
   IF cardinality(g.next_ids)=1 THEN g.champion_id:=win;g.completed_at:=clock_timestamp();
   ELSE g.current_ids:=g.next_ids;g.next_ids:='{}';g.match_index:=1;END IF;
  END IF;
 END LOOP;
 UPDATE pwc41.play_sessions SET current_ids=g.current_ids,next_ids=g.next_ids,match_index=g.match_index,sequence=g.sequence,champion_id=g.champion_id,completed_at=g.completed_at WHERE id=gid;
 RETURN jsonb_build_object('game_id',gid,'sequence',g.sequence,'complete',g.completed_at IS NOT NULL);
END $$;
CREATE FUNCTION pwc41_private.stats_candidates(tid text,rid text,since_at timestamptz,until_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH games AS(SELECT * FROM pwc41.play_sessions g WHERE g.tournament_id=tid AND g.started_at>=since_at AND g.started_at<until_at),
 participants AS(SELECT DISTINCT ON(p.participant_id) p.participant_id,p.name,p.image_asset_id FROM pwc41.revision_participants p JOIN pwc41.tournament_revisions r ON r.id=p.revision_id
 WHERE r.tournament_id=tid AND p.active AND (rid IS NULL OR r.id=rid) ORDER BY p.participant_id,r.version DESC),
 totals AS(SELECT p.*,(SELECT count(*) FROM games g WHERE g.champion_id=p.participant_id) titles,
 (SELECT count(*) FROM pwc41.play_matches m JOIN games g ON g.id=m.game_id WHERE p.participant_id IN(m.winner_id,m.loser_id)) appearances,
 (SELECT count(*) FROM pwc41.play_matches m JOIN games g ON g.id=m.game_id WHERE m.winner_id=p.participant_id) wins,
 (SELECT count(*) FROM games WHERE completed_at IS NOT NULL) completions FROM participants p),
 scored AS(SELECT *,CASE WHEN completions>0 THEN round(titles*100.0/completions,2) END championship_rate,
 CASE WHEN appearances>0 THEN round(wins*100.0/appearances,2) END win_rate FROM totals)
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY titles DESC,CASE WHEN appearances>0 THEN wins::numeric/appearances ELSE -1 END DESC,wins DESC,participant_id),'[]'::jsonb) FROM scored s
$$;
CREATE FUNCTION pwc41_api.play_statistics_public(tid text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE rid text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pwc41.play_statistics_control WHERE enabled) THEN RAISE EXCEPTION 'statistics disabled';END IF;
 SELECT published_revision_id INTO rid FROM pwc41.tournaments t WHERE id=tid AND visibility='public' AND NOT EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=t.id);
 IF rid IS NULL THEN RAISE insufficient_privilege; END IF;
 RETURN jsonb_build_object('tournament_id',tid,'revision_id',rid,'scope','all recorded games; current published candidates',
 'started',(SELECT count(*) FROM pwc41.play_sessions WHERE tournament_id=tid),
 'completed',(SELECT count(*) FROM pwc41.play_sessions WHERE tournament_id=tid AND completed_at IS NOT NULL),
 'candidates',pwc41_private.stats_candidates(tid,rid,'-infinity','infinity'));
END $$;
CREATE FUNCTION pwc41_api.play_statistics_admin(since_at timestamptz,until_at timestamptz,bucket text,tid text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM pwc41_private.stats_admin();
 IF since_at IS NULL OR until_at IS NULL OR until_at<=since_at OR until_at-since_at>interval '366 days' OR bucket NOT IN('day','week','month') OR bucket IS NULL THEN RAISE EXCEPTION 'invalid statistics interval';END IF;
 RETURN jsonb_build_object('enabled',(SELECT enabled FROM pwc41.play_statistics_control),'collection_since',(SELECT installed_at FROM pwc41.play_statistics_control),
 'started',(SELECT count(*) FROM pwc41.play_sessions WHERE started_at>=since_at AND started_at<until_at AND (tid IS NULL OR tournament_id=tid)),
 'completed',(SELECT count(*) FROM pwc41.play_sessions WHERE started_at>=since_at AND started_at<until_at AND completed_at IS NOT NULL AND (tid IS NULL OR tournament_id=tid)),
 'series',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.period),'[]') FROM(SELECT date_trunc(bucket,started_at AT TIME ZONE 'UTC') period,count(*) started,count(*) FILTER(WHERE completed_at IS NOT NULL) completed FROM pwc41.play_sessions WHERE started_at>=since_at AND started_at<until_at AND (tid IS NULL OR tournament_id=tid) GROUP BY 1) s),
 'popular',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.started DESC,s.tournament_id),'[]') FROM(SELECT g.tournament_id,coalesce(max(r.title),g.tournament_id) title,count(*) started,count(*) FILTER(WHERE g.completed_at IS NOT NULL) completed FROM pwc41.play_sessions g JOIN pwc41.tournament_revisions r ON r.id=g.revision_id WHERE g.started_at>=since_at AND g.started_at<until_at AND (tid IS NULL OR g.tournament_id=tid) GROUP BY g.tournament_id ORDER BY count(*) DESC,g.tournament_id LIMIT 100) s),
 'candidates',CASE WHEN tid IS NOT NULL THEN pwc41_private.stats_candidates(tid,NULL,since_at,until_at) ELSE '[]'::jsonb END);
END $$;
DO $$ DECLARE p record; BEGIN FOR p IN SELECT x.oid::regprocedure sig FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace WHERE (n.nspname='pwc41_private' AND x.proname LIKE 'stats_%') OR(n.nspname='pwc41_api' AND x.proname LIKE 'play_statistics_%') LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.sig);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',p.sig);
END LOOP;END $$;
GRANT EXECUTE ON FUNCTION pwc41_api.play_statistics_start(text,uuid,text,text,text[]),pwc41_api.play_statistics_events(text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION pwc41_api.play_statistics_public(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION pwc41_api.play_statistics_admin(timestamptz,timestamptz,text,text) TO authenticated;
GRANT USAGE ON SCHEMA pwc41_api TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
