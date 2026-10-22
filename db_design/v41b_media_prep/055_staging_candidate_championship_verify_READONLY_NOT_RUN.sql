-- Staging only. A before 054, B after 054. SELECT-only, no original-row mutations.
-- A: independently select cmnomqsurdwhdbjgnsvw in Dashboard.
-- Expected before: 618649f224c4d95051fc5400b2b31cbb. STOP on mismatch.
SELECT current_user,session_user,md5(replace(btrim(prosrc),chr(13),'')) AS helper_md5,
 proowner::regrole,proacl,prosecdef,provolatile,proconfig
 FROM pg_proc WHERE oid=to_regprocedure('pwc41_private.stats_candidates(text,text,timestamptz,timestamptz)');
SELECT count(*) AS sessions,count(*) FILTER(WHERE completed_at IS NOT NULL) AS completions,
 count(champion_id) AS titles,(SELECT count(*) FROM pwc41.play_matches) AS matches
 FROM pwc41.play_sessions;
SELECT pwc41_private.purge_storage_barrier_ready() AS must_remain_false;

-- B: helper_changed must be true, even when no games/candidates exist.
SELECT md5(replace(btrim(prosrc),chr(13),''))='de9029a63e322370724525a40b97d4bd' AS helper_changed
 FROM pg_proc WHERE oid='pwc41_private.stats_candidates(text,text,timestamptz,timestamptz)'::regprocedure;
-- B: expected mismatches=0. All-time administrator candidate scope; uses retained
-- immutable initial lineups, never counts rounds as completed participations.
WITH actual AS(
 SELECT t.id AS tid,p FROM pwc41.tournaments t
 CROSS JOIN LATERAL jsonb_array_elements(pwc41_private.stats_candidates(t.id,NULL,'-infinity','infinity')) p
), expected AS(
 SELECT a.*,(SELECT count(*) FROM pwc41.play_sessions g WHERE g.tournament_id=a.tid
 AND g.completed_at IS NOT NULL AND a.p->>'participant_id'=ANY(g.initial_ids)) n FROM actual a
)
SELECT count(*) AS mismatches FROM expected
 WHERE (p->>'completed_participations')::bigint IS DISTINCT FROM n
 OR (p->>'championship_rate')::numeric IS DISTINCT FROM
 CASE WHEN n>0 THEN round((p->>'titles')::numeric*100/n,2) END;
-- Same snapshot counts as A unless real users played between the two reads.
SELECT count(*) AS sessions,count(*) FILTER(WHERE completed_at IS NOT NULL) AS completions,
 count(champion_id) AS titles,(SELECT count(*) FROM pwc41.play_matches) AS matches
 FROM pwc41.play_sessions;
-- ACLs must retain 052: private helper not executable by API roles;
-- public reader anon/authenticated, admin reader authenticated only.
SELECT p.oid::regprocedure,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p WHERE p.oid IN(
 'pwc41_private.stats_candidates(text,text,timestamptz,timestamptz)'::regprocedure,
 'pwc41_api.play_statistics_public(text)'::regprocedure,
 'pwc41_api.play_statistics_admin(timestamptz,timestamptz,text,text)'::regprocedure);
SELECT pwc41_private.purge_storage_barrier_ready() AS must_still_be_false;
