-- NOT_RUN. Staging cmnomqsurdwhdbjgnsvw only. No RPC execution or data mutation.
-- A before 050; B only after approved installation. Select sections separately.
-- SECTION A: resolve actual schema, FK actions, guards, grants and outside references.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
SELECT current_user,session_user,current_database(),current_setting('server_version'),
 'Independently verify the Staging project in Dashboard; this output cannot prove it' AS note;
SELECT c.oid::regclass AS relation,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname IN ('pwc41','storage') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.oid::regclass::text,a.attnum;
SELECT c.conrelid::regclass AS referencing_table,c.confrelid::regclass AS referenced_table,
 c.conname,c.confdeltype,c.confupdtype,c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c WHERE c.contype='f' AND c.confrelid IN
 (SELECT t.oid FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='pwc41')
ORDER BY c.conrelid::regclass::text,c.conname;
SELECT g.tgrelid::regclass AS relation,g.tgname,g.tgenabled,pg_get_triggerdef(g.oid),
 md5(replace(btrim(p.prosrc),chr(13),'')) AS body_md5,pg_get_functiondef(p.oid),p.proacl
FROM pg_trigger g JOIN pg_proc p ON p.oid=g.tgfoid WHERE NOT g.tgisinternal
AND (g.tgrelid IN(SELECT t.oid FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='pwc41') OR g.tgrelid='storage.objects'::regclass)
ORDER BY g.tgrelid::regclass::text,g.tgname;
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl,
 pg_get_functiondef(p.oid) AS installed_definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('pwc41_api','pwc41_private') AND p.prokind='f'
AND (p.prosrc ~* 'media_assets|storage.objects|tournament_revisions|command_requests|audit_logs|transition|set_config')
ORDER BY p.oid::regprocedure::text;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname IN ('pwc41','storage') ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,c.relname,r.rolname,has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS any_direct_write
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname IN ('pwc41','storage') AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY n.nspname,c.relname,r.rolname;
SELECT to_regclass('pwc41.tournament_purge_jobs') AS existing_purge_installation;
SELECT to_jsonb(b) AS purge_bucket_configuration FROM storage.buckets b WHERE b.id='pwc41-optimized';
-- Existing installation => STOP, this first-install migration must not be rerun.
-- Review unknown results/statistics/comments/external JSON and Storage ownership
-- contracts before considering enablement. Absence of an FK does NOT prove safety.
COMMIT;

-- SECTION B: after 050; capability remains disabled until separately reviewed.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='20s';
-- This version intentionally cannot activate, even with all flags true.
SELECT pwc41_private.purge_storage_barrier_ready() AS storage_barrier_ready_must_be_false;
SELECT NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='storage.objects'::regclass AND tgname='tournament_purge_storage_write_fence') AS no_internal_storage_purge_trigger;
SELECT enabled,external_references_reviewed,storage_contract_reviewed,inventory_signature,
 pwc41_private.purge_inventory_signature() AS current_inventory_signature
FROM pwc41.tournament_purge_control;
SELECT c.relname,c.relrowsecurity,r.rolname,
 NOT has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS direct_access_revoked
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='pwc41' AND c.relname LIKE 'tournament_purge_%' AND c.relkind='r'
AND r.rolname IN ('anon','authenticated','service_role');
SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,
 r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
WHERE ((n.nspname='pwc41_api' AND p.proname LIKE 'admin_tournament_purge_%') OR (n.nspname='pwc41_private' AND p.proname LIKE 'purge_%'))
AND r.rolname IN ('anon','authenticated','service_role') ORDER BY p.oid::regprocedure::text,r.rolname;
SELECT g.tgrelid::regclass,g.tgname,g.tgenabled,pg_get_triggerdef(g.oid),pg_get_functiondef(g.tgfoid)
FROM pg_trigger g WHERE NOT g.tgisinternal AND g.tgname IN ('purge_content_fence','tournament_purge_storage_write_fence','purge_audit_append_only');
SELECT count(*) FILTER(WHERE state='complete') AS completed,count(*) FILTER(WHERE state<>'complete') AS incomplete
FROM pwc41.tournament_purge_jobs;
SELECT NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_jobs j JOIN pwc41.tournaments t ON t.id=j.tournament_id WHERE j.state='complete') AS completed_targets_absent,
 NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_jobs j JOIN pwc41.tournaments t ON t.id=j.tournament_id WHERE j.state<>'complete' AND t.visibility<>'archived') AS pending_targets_locked,
 NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_objects o JOIN pwc41.tournament_purge_jobs j ON j.id=o.job_id JOIN storage.objects s ON s.bucket_id=o.bucket_id AND s.name=o.object_key WHERE j.state='complete') AS completed_storage_metadata_absent;
-- Old 048 contract must still report permanent_delete_enabled=false in its definition.
SELECT pg_get_functiondef('pwc41_api.admin_tournament_management_context()'::regprocedure);
COMMIT;
