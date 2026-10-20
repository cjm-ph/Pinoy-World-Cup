-- NOT_RUN. STAGING cmnomqsurdwhdbjgnsvw only; independently verify Dashboard.
-- SECTION A: run BEFORE 048. Catalog reads only, no RPC execution or claims.
-- SECTION B below: run ONLY AFTER approved 048 committed. Select sections separately.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_user,session_user,current_database(),current_setting('server_version') AS server_version,
 'Dashboard project verification required; database name does not prove project reference' AS note;
WITH expected(signature) AS (VALUES
 ('pwc41_private.transition(uuid,text,text,bigint,text,text,boolean)'),
 ('pwc41_private.require_admin_media_access()'),
 ('pwc41_private.is_public_revision(text)'),
 ('pwc41_private.read_revision(text)'),
 ('pwc41_private.read_tournament(text)'),
 ('pwc41_api.publish(uuid,text,text,bigint)'),
 ('pwc41_api.rollback(uuid,text,text,bigint)'),
 ('pwc41_api.unpublish(uuid,text,text,bigint)'),
 ('pwc41_api.admin_publish_own(uuid,text,text,bigint)'),
 ('pwc41_api.admin_review_publish(uuid,text,text,bigint)'),
 ('pwc41_api.list_published()'),
 ('pwc41_api.public_media_target(text)'))
SELECT e.signature,p.oid IS NOT NULL AS present,
 pg_get_userbyid(p.proowner) AS owner,l.lanname,p.prosecdef,p.proconfig,p.proacl,
 md5(replace(btrim(p.prosrc),chr(13),'')) AS body_md5,
 CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END AS installed_definition,
 (SELECT jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE'))
 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')) AS effective_execute,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
LEFT JOIN pg_language l ON l.oid=p.prolang ORDER BY e.signature;
SELECT 'known_transition_body' AS check_name,
 md5(replace(btrim(p.prosrc),chr(13),'')) IN
 ('be3a10197267e6e6854c8f103b862a50','875a693ebd94984a1143ac33bcf346eb','1b0b41f2d7bb8af19d9601388edcfd38') AS known_body,
 'Known local definition, not proof of historical migration or all prerequisite safety' AS note
FROM pg_proc p WHERE p.oid=to_regprocedure('pwc41_private.transition(uuid,text,text,bigint,text,text,boolean)');
-- Find additional/overloaded visibility-writing or publication functions for review.
SELECT p.oid::regprocedure AS signature,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) AS installed_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('pwc41_api','pwc41_private') AND p.prokind='f'
AND (p.prosrc ~* 'transition[[:space:]]*\(' OR p.prosrc ~* 'visibility|published_revision_id')
ORDER BY p.oid::regprocedure::text;
SELECT r.rolname,
 has_table_privilege(r.oid,'pwc41.tournaments','INSERT,UPDATE,DELETE,TRUNCATE') AS any_direct_write,
 has_any_column_privilege(r.oid,'pwc41.tournaments','INSERT,UPDATE') AS any_column_write
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');
SELECT g.tgname,g.tgenabled,pg_get_triggerdef(g.oid) AS definition,
 pg_get_functiondef(g.tgfoid) AS installed_function
FROM pg_trigger g WHERE g.tgrelid='pwc41.tournaments'::regclass AND NOT g.tgisinternal;
SELECT to_regclass('pwc41.admin_tournament_trash') AS existing_trash_table,
 to_regprocedure('pwc41_api.admin_tournament_manage(uuid,text,bigint,text)') AS existing_management_rpc;
-- Before first 048 these should be NULL. If installed already, STOP: this is not a patch.
COMMIT;

-- SECTION B: AFTER 048 ONLY. Do not include this section in a pre-048 execution.
-- NOT_RUN. Manually verify Staging cmnomqsurdwhdbjgnsvw before running.
-- After approved 048 only. No application RPC calls, writes or fixture creation.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT 'management_functions' AS check_name,
 to_regprocedure('pwc41_api.admin_tournament_management_context()') IS NOT NULL
 AND to_regprocedure('pwc41_api.admin_tournament_manage(uuid,text,bigint,text)') IS NOT NULL AS pass;
SELECT 'trash_rls' AS check_name,c.relrowsecurity AS pass
 FROM pg_class c WHERE c.oid=to_regclass('pwc41.admin_tournament_trash');
SELECT 'rpc_execute_acl' AS check_name,p.oid::regprocedure AS item,r.rolname,
 has_function_privilege(r.oid,p.oid,'EXECUTE')=(r.rolname='authenticated') AS pass
 FROM pg_proc p CROSS JOIN pg_roles r
 WHERE p.oid IN (to_regprocedure('pwc41_api.admin_tournament_management_context()'),to_regprocedure('pwc41_api.admin_tournament_manage(uuid,text,bigint,text)'))
 AND r.rolname IN ('anon','authenticated','service_role');
SELECT 'trash_direct_table_acl' AS check_name,r.rolname,
 NOT has_table_privilege(r.oid,'pwc41.admin_tournament_trash','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS pass
 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');
SELECT 'trash_visibility_invariant' AS check_name,
 NOT EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash d JOIN pwc41.tournaments t ON t.id=d.tournament_id WHERE t.visibility<>'archived' OR d.restore_pending) AS pass;
SELECT 'no_public_execute' AS check_name,p.oid::regprocedure AS item,
 NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS pass
 FROM pg_proc p WHERE p.oid IN(to_regprocedure('pwc41_api.admin_tournament_management_context()'),to_regprocedure('pwc41_api.admin_tournament_manage(uuid,text,bigint,text)'));
SELECT 'publication_fence_enabled' AS check_name,
 EXISTS(SELECT 1 FROM pg_trigger g WHERE g.tgrelid='pwc41.tournaments'::regclass
 AND g.tgname='tournament_publication_fence' AND g.tgenabled='A' AND NOT g.tgisinternal
 AND g.tgfoid=to_regprocedure('pwc41_private.tournament_publication_fence()')) AS pass;
SELECT pg_get_triggerdef(g.oid) AS fence_definition,pg_get_functiondef(g.tgfoid) AS fence_function
 FROM pg_trigger g WHERE g.tgrelid='pwc41.tournaments'::regclass AND g.tgname='tournament_publication_fence';
SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,p.proacl,
 NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
 AND has_function_privilege(r.oid,p.oid,'EXECUTE')) AS no_client_execute
 FROM pg_proc p WHERE p.oid=to_regprocedure('pwc41_private.tournament_publication_fence()');
-- Current existing definitions are retained for reviewer comparison; not migration history.
SELECT pg_get_functiondef('pwc41_private.is_public_revision(text)'::regprocedure) AS public_guard;
COMMIT;
