-- Staging cmnomqsurdwhdbjgnsvw ONLY. SELECT-only. No activation/backfill.
-- A AFTER 056/057-B, BEFORE 058. Independently verify Dashboard project.
-- reviewed_056=true; must_be_null=NULL; purge=false. Save stats hashes/counts.
SELECT md5(replace(btrim(prosrc),chr(13),''))='9d44fe74d614ed032342ab3d889dcb37' AS reviewed_056
 FROM pg_proc WHERE oid=to_regprocedure('pwc41_api.comments_mutate(uuid,text,text,text,uuid,timestamptz,jsonb)');
SELECT to_regclass('pwc41.play_member_links') AS must_be_null,
 pwc41_private.purge_storage_barrier_ready() AS must_be_false;
SELECT oid::regprocedure,md5(replace(btrim(prosrc),chr(13),'')) AS original_hash,proacl
 FROM pg_proc WHERE oid IN(
 'pwc41_api.play_statistics_start(text,uuid,text,text,text[])'::regprocedure,
 'pwc41_api.play_statistics_events(text,uuid,jsonb)'::regprocedure,
 'pwc41_private.stats_candidates(text,text,timestamptz,timestamptz)'::regprocedure);
SELECT count(*) AS sessions,count(completed_at) AS completions,
 (SELECT count(*) FROM pwc41.play_matches) AS matches FROM pwc41.play_sessions;

-- B AFTER 058. Initial links=0: no historical accounts are inferred.
SELECT md5(replace(btrim(prosrc),chr(13),''))='813c3758396bd5b2bf2dcb8ef78fce95' AS helper_updated
 FROM pg_proc WHERE oid='pwc41_api.comments_mutate(uuid,text,text,text,uuid,timestamptz,jsonb)'::regprocedure;
SELECT count(*) AS initial_links FROM pwc41.play_member_links;
SELECT c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_direct,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS member_direct,
 has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS service_direct
 FROM pg_class c WHERE c.oid='pwc41.play_member_links'::regclass;
-- API wrappers service=true ONLY; private helper all false.
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p WHERE p.oid IN(
 'pwc41_api.play_statistics_member_start(text,uuid,text,text,text[],uuid)'::regprocedure,
 'pwc41_api.play_statistics_member_events(text,uuid,jsonb,uuid)'::regprocedure,
 'pwc41_private.comment_champion(uuid,text,text)'::regprocedure);
-- Must match A. Counts can increase only if real users play between reads.
SELECT oid::regprocedure,md5(replace(btrim(prosrc),chr(13),'')) AS original_hash,proacl
 FROM pg_proc WHERE oid IN(
 'pwc41_api.play_statistics_start(text,uuid,text,text,text[])'::regprocedure,
 'pwc41_api.play_statistics_events(text,uuid,jsonb)'::regprocedure,
 'pwc41_private.stats_candidates(text,text,timestamptz,timestamptz)'::regprocedure);
SELECT count(*) AS sessions,count(completed_at) AS completions,
 (SELECT count(*) FROM pwc41.play_matches) AS matches FROM pwc41.play_sessions;
-- Always zero. No member IDs or cookie hashes exposed by this verification.
SELECT count(*) AS invalid_verified_links FROM pwc41.play_member_links l
 JOIN pwc41.play_sessions g ON g.id=l.game_id
 WHERE l.verified_completed_at IS NOT NULL AND
 (NOT l.eligible OR g.completed_at IS DISTINCT FROM l.verified_completed_at
 OR l.verified_sequence<>g.sequence OR g.sequence<>cardinality(g.initial_ids)-1
 OR g.champion_id IS NULL OR NOT(g.champion_id=ANY(g.initial_ids)));
SELECT * FROM pwc41.comments_control;
SELECT pwc41_private.purge_storage_barrier_ready() AS must_still_be_false;
