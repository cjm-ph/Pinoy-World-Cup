-- Staging cmnomqsurdwhdbjgnsvw ONLY. Follow-up to installed 052; never replay 052.
-- In an approved execution COPY immediately after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.championship_rate_approved='YES';
-- Read-only 055 A before applying; 055 B afterwards. No content/event DML.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.championship_rate_approved',true) IS DISTINCT FROM 'YES'
 THEN RAISE EXCEPTION 'STOP: approved Staging postgres execution required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('pwc41_private.stats_candidates(text,text,timestamp with time zone,timestamp with time zone)')
 AND md5(replace(btrim(prosrc),chr(13),''))='618649f224c4d95051fc5400b2b31cbb')
 THEN RAISE EXCEPTION 'STOP: installed stats_candidates differs from reviewed 052'; END IF;
 IF pwc41_private.purge_storage_barrier_ready() THEN RAISE EXCEPTION 'STOP: purge must remain blocked'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.play_sessions g WHERE
 cardinality(g.initial_ids) NOT IN(4,8,16,32)
 OR cardinality(g.initial_ids)<>(SELECT count(DISTINCT v) FROM unnest(g.initial_ids) v)
 OR (g.completed_at IS NULL)<>(g.champion_id IS NULL)
 OR (g.completed_at IS NOT NULL AND (NOT(g.champion_id=ANY(g.initial_ids)) OR g.sequence<>cardinality(g.initial_ids)-1
 OR g.sequence<>(SELECT count(*) FROM pwc41.play_matches m WHERE m.game_id=g.id))))
 THEN RAISE EXCEPTION 'STOP: session invariants require review'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION pwc41_private.stats_candidates(tid text,rid text,since_at timestamptz,until_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH games AS(SELECT * FROM pwc41.play_sessions g WHERE g.tournament_id=tid AND g.started_at>=since_at AND g.started_at<until_at),
 participants AS(SELECT DISTINCT ON(p.participant_id) p.participant_id,p.name,p.image_asset_id FROM pwc41.revision_participants p JOIN pwc41.tournament_revisions r ON r.id=p.revision_id
 WHERE r.tournament_id=tid AND p.active AND (rid IS NULL OR r.id=rid) ORDER BY p.participant_id,r.version DESC),
 totals AS(SELECT p.*,(SELECT count(*) FROM games g WHERE g.champion_id=p.participant_id) titles,
 (SELECT count(*) FROM pwc41.play_matches m JOIN games g ON g.id=m.game_id WHERE p.participant_id IN(m.winner_id,m.loser_id)) appearances,
 (SELECT count(*) FROM pwc41.play_matches m JOIN games g ON g.id=m.game_id WHERE m.winner_id=p.participant_id) wins,
 (SELECT count(*) FROM games WHERE completed_at IS NOT NULL) completions,
 (SELECT count(*) FROM games g WHERE g.completed_at IS NOT NULL AND p.participant_id=ANY(g.initial_ids)) completed_participations FROM participants p),
 scored AS(SELECT *,CASE WHEN completed_participations>0 THEN round(titles*100.0/completed_participations,2) END championship_rate,
 CASE WHEN appearances>0 THEN round(wins*100.0/appearances,2) END win_rate FROM totals)
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY titles DESC,CASE WHEN appearances>0 THEN wins::numeric/appearances ELSE -1 END DESC,wins DESC,participant_id),'[]'::jsonb) FROM scored s
$$;
-- CREATE OR REPLACE retains the existing owner/ACL; no new grants or roles.
NOTIFY pgrst,'reload schema';
COMMIT;
