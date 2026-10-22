-- Staging cmnomqsurdwhdbjgnsvw ONLY. SELECT-only; no installation/activation.
-- A BEFORE 056: independently verify the Dashboard project. Objects must be NULL.
SELECT current_user,session_user,
 to_regclass('pwc41.tournament_comments') AS must_be_null,
 to_regclass('pwc41.comment_reports') AS must_be_null,
 to_regclass('pwc41.comments_control') AS must_be_null,
 pwc41_private.purge_storage_barrier_ready() AS must_be_false;
-- Confirm reused identity columns exist. No member schema is created by 056.
SELECT table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='pwc41' AND
 ((table_name='profiles' AND column_name IN('id','display_name'))
 OR(table_name='admin_members' AND column_name IN('user_id','active')))
 ORDER BY table_name,column_name;

-- B AFTER 056: initial enabled=false, policy_reviewed=false, retention_days=90.
SELECT * FROM pwc41.comments_control;
-- Six rows, every RLS value true and every direct API-role privilege false.
SELECT c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_direct,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS member_direct,
 has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS service_direct
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='pwc41' AND c.relname IN('comments_control','tournament_comments',
 'comment_limits','comment_receipts','comment_reports','comment_moderation') ORDER BY 1;
-- Private helpers: all false. Four API functions: ONLY service_execute true.
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS member_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE(n.nspname='pwc41_private' AND p.proname LIKE 'comment_%')
 OR(n.nspname='pwc41_api' AND p.proname LIKE 'comments_%') ORDER BY 1;
-- No original-comment FK from report evidence. The moderation -> reports FK remains.
SELECT conrelid::regclass,confrelid::regclass,pg_get_constraintdef(oid)
 FROM pg_constraint WHERE contype='f' AND conrelid IN
 ('pwc41.comment_reports'::regclass,'pwc41.comment_moderation'::regclass);
-- All NEW tables initially empty. These counts never inspect/delete old content.
SELECT (SELECT count(*) FROM pwc41.tournament_comments) AS comments,
 (SELECT count(*) FROM pwc41.comment_reports) AS reports,
 (SELECT count(*) FROM pwc41.comment_moderation) AS moderation,
 (SELECT count(*) FROM pwc41.comment_limits) AS limits,
 (SELECT count(*) FROM pwc41.comment_receipts) AS receipts;
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='pwc41' AND tablename IN
 ('tournament_comments','comment_reports','comment_receipts') ORDER BY indexname;
SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='pwc41.comment_reports'::regclass
 AND NOT tgisinternal;
SELECT pwc41_private.purge_storage_barrier_ready() AS must_still_be_false;
