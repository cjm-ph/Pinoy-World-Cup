-- Staging cmnomqsurdwhdbjgnsvw ONLY. SELECT-only review. Run A before 052,
-- B after 052. Do not run B before installation. Never replay 048/050.
-- A: independent Dashboard project selection is required; SQL alone does not
-- attest the selected hosted project. New tables/functions must be absent.
SELECT current_user,session_user,
 to_regclass('pwc41.play_sessions') AS sessions_before_install,
 to_regclass('pwc41.play_statistics_control') AS control_before_install,
 to_regprocedure('pwc41_api.play_statistics_start(text,uuid,text,text,text[])') AS start_before_install;
SELECT pwc41_private.purge_storage_barrier_ready() AS must_remain_false;

-- B: default enabled=false. Three tables have RLS and no direct API-role grants.
SELECT singleton,enabled,installed_at FROM pwc41.play_statistics_control;
SELECT c.relname,c.relrowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pwc41' AND c.relname IN('play_statistics_control','play_sessions','play_matches') ORDER BY 1;
SELECT r.rolname,c.relname,
 has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
 has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
 has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete
 FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE r.rolname IN('anon','authenticated','service_role') AND n.nspname='pwc41'
 AND c.relname IN('play_statistics_control','play_sessions','play_matches') ORDER BY 1,2;
-- Expected: public read anon/auth; administrator read auth only;
-- start/events service_role only. PUBLIC has no EXECUTE on these functions.
SELECT p.oid::regprocedure AS function,p.prosecdef,p.proconfig,p.proacl,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE(n.nspname='pwc41_api' AND p.proname LIKE 'play_statistics_%')
 OR(n.nspname='pwc41_private' AND p.proname LIKE 'stats_%') ORDER BY 1;
-- Expected 0: no duplicated starts/events, incomplete championship or orphan ledger.
SELECT count(*) AS invalid_sessions FROM pwc41.play_sessions g
 WHERE g.sequence<>(SELECT count(*) FROM pwc41.play_matches m WHERE m.game_id=g.id)
 OR g.sequence>cardinality(g.initial_ids)-1
 OR(g.completed_at IS NOT NULL AND (g.sequence<>cardinality(g.initial_ids)-1 OR NOT(g.champion_id=ANY(g.initial_ids))))
 OR(g.completed_at IS NULL AND g.sequence=cardinality(g.initial_ids)-1)
 OR NOT EXISTS(SELECT 1 FROM pwc41.tournament_revisions r WHERE r.id=g.revision_id AND r.tournament_id=g.tournament_id);
SELECT count(*) AS invalid_matches FROM pwc41.play_matches m JOIN pwc41.play_sessions g ON g.id=m.game_id
 WHERE NOT(m.winner_id=ANY(g.initial_ids)) OR NOT(m.loser_id=ANY(g.initial_ids)) OR m.winner_id=m.loser_id;
-- Operational totals only; do not dump guest hashes, cookies or request identifiers.
SELECT tournament_id,count(*) AS starts,count(*) FILTER(WHERE completed_at IS NOT NULL) AS completed,
 count(*) FILTER(WHERE completed_at IS NULL AND expires_at<=now()) AS expired_incomplete
 FROM pwc41.play_sessions GROUP BY 1 ORDER BY 1;
SELECT pwc41_private.purge_storage_barrier_ready() AS must_still_be_false;
