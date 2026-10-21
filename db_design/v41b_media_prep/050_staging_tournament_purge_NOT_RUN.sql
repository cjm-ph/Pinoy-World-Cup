-- NOT_RUN. Follow-up to installed 048. NEVER rerun/modify 041-048.
-- Staging cmnomqsurdwhdbjgnsvw ONLY. No live execution by the agent.
-- FIRST review 051 section A. In an approved execution COPY after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.tournament_purge_approved='YES';
-- Installs DISABLED and code-BLOCKED. Flags/Render opt-in cannot activate this version.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.tournament_purge_approved',true) IS DISTINCT FROM 'YES'
 OR to_regclass('pwc41.admin_tournament_trash') IS NULL
 OR to_regprocedure('pwc41_private.tournament_publication_fence()') IS NULL
 THEN RAISE EXCEPTION 'STOP: verified Staging, approval and installed 048 required'; END IF;
END $guard$;

CREATE TABLE pwc41.tournament_purge_control(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 external_references_reviewed boolean NOT NULL DEFAULT false,
 storage_contract_reviewed boolean NOT NULL DEFAULT false,
 inventory_signature text
);
INSERT INTO pwc41.tournament_purge_control DEFAULT VALUES;
-- Deliberately no FK to content being erased. IDs are retained as audit tombstones.
CREATE TABLE pwc41.tournament_purge_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tournament_id text NOT NULL UNIQUE,
 request_id uuid NOT NULL UNIQUE,requested_by uuid NOT NULL,title_sha256 text NOT NULL,
 expected_version bigint NOT NULL,entity_ids text[] NOT NULL DEFAULT '{}',
 state text NOT NULL CHECK(state IN ('pending','running','failed','finalizing','complete')),
 lease_token uuid,lease_until timestamptz,last_error text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz
);
CREATE TABLE pwc41.tournament_purge_objects(
 job_id uuid NOT NULL REFERENCES pwc41.tournament_purge_jobs(id),asset_id text NOT NULL,
 bucket_id text NOT NULL CHECK(bucket_id='pwc41-optimized'),object_key text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','deleted')),
 PRIMARY KEY(job_id,asset_id),UNIQUE(job_id,bucket_id,object_key)
);
CREATE TABLE pwc41.tournament_purge_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES pwc41.tournament_purge_jobs(id),
 tournament_id text NOT NULL,actor_id uuid,event text NOT NULL,
 source_audit_id bigint,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $tables$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['tournament_purge_control','tournament_purge_jobs','tournament_purge_objects','tournament_purge_audit'] LOOP
  EXECUTE format('ALTER TABLE pwc41.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('REVOKE ALL ON pwc41.%I FROM PUBLIC,anon,authenticated,service_role',r);
 END LOOP;
END $tables$;
REVOKE ALL ON SEQUENCE pwc41.tournament_purge_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER purge_audit_append_only BEFORE UPDATE OR DELETE ON pwc41.tournament_purge_audit
 FOR EACH ROW EXECUTE FUNCTION pwc41_private.append_only();

CREATE FUNCTION pwc41_private.purge_inventory_signature() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(coalesce(string_agg(s,'|' ORDER BY s),'')) FROM (
  SELECT c.oid::regclass::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull AS s
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname IN ('pwc41','storage') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT conrelid::regclass::text||':'||pg_get_constraintdef(oid) FROM pg_constraint
  WHERE contype='f' AND confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pwc41')
  UNION ALL SELECT tgrelid::regclass::text||':'||pg_get_triggerdef(oid)||':'||pg_get_functiondef(tgfoid)
  FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pwc41') OR (NOT tgisinternal AND tgrelid='storage.objects'::regclass)
 ) q
$$;
CREATE FUNCTION pwc41_private.purge_require_enabled() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT pwc41_private.purge_storage_barrier_ready() THEN
  RAISE EXCEPTION 'purge blocked: physical Storage write barrier not implemented';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_control WHERE singleton AND enabled AND external_references_reviewed AND storage_contract_reviewed
 AND inventory_signature=pwc41_private.purge_inventory_signature())
 THEN RAISE EXCEPTION 'purge disabled or inventory changed'; END IF;
END $$;
-- No DDL/DML/ownership or privilege changes on Supabase-managed Storage tables.
-- App row fences cannot cancel a previously dispatched physical Storage write.
-- This installation is deliberately non-activatable until a separately reviewed
-- implementation establishes a distributed write barrier covering ALL writers.
-- No control flag or Render environment setting may override this code blocker.
CREATE FUNCTION pwc41_private.purge_storage_barrier_ready() RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$ SELECT false $$;
CREATE FUNCTION pwc41_private.purge_service_admin(actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE insufficient_privilege; END IF;
 PERFORM 1 FROM pwc41.admin_members WHERE user_id=actor AND active FOR SHARE;
 IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
 IF NOT EXISTS(SELECT 1 FROM pwc41.admin_media_control WHERE singleton AND enabled) THEN RAISE insufficient_privilege; END IF;
 PERFORM pwc41_private.purge_require_enabled();
END $$;
CREATE FUNCTION pwc41_private.purge_authorized(tid text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.role()='service_role' AND pwc41_private.purge_storage_barrier_ready() AND EXISTS(SELECT 1 FROM pwc41.tournament_purge_jobs j
 WHERE j.tournament_id=tid AND j.state='finalizing'
 AND j.id::text=current_setting('pwc41.purge_job',true)
 AND j.lease_token::text=current_setting('pwc41.purge_token',true)
 AND j.lease_until>clock_timestamp())
$$;

-- Applies to BOTH old and new references. Serializes content mutation against begin.
CREATE FUNCTION pwc41_private.purge_content_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d jsonb; x jsonb; tids text[]:='{}'; v text; asset text; k text;
BEGIN
 IF current_setting('transaction_isolation')='read committed'
 AND NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_control WHERE enabled)
 AND NOT EXISTS(SELECT 1 FROM pwc41.tournament_purge_jobs) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 FOR d IN SELECT CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END
 UNION ALL SELECT CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END LOOP
  v:=d->>'tournament_id'; IF TG_TABLE_NAME='tournaments' THEN v:=d->>'id'; END IF;
  IF v IS NOT NULL THEN tids:=array_append(tids,v); END IF;
  FOR k IN SELECT unnest(ARRAY['revision_id','parent_revision_id']) LOOP
   SELECT r.tournament_id INTO v FROM pwc41.tournament_revisions r WHERE r.id=d->>k;
   IF v IS NOT NULL THEN tids:=array_append(tids,v); END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['asset_id','image_asset_id','local_asset_id','remote_asset_id','cover_asset_id'] LOOP
   asset:=d->>k;
   SELECT a.tournament_id INTO v FROM pwc41.media_assets a WHERE a.id=asset;
   IF v IS NOT NULL THEN tids:=array_append(tids,v); END IF;
  END LOOP;
  IF TG_TABLE_NAME IN ('command_requests','import_batches','media_assets') THEN
   FOR v IN SELECT j.tournament_id FROM pwc41.tournament_purge_jobs j WHERE j.state<>'complete'
    AND (d::text LIKE '%'||j.tournament_id||'%' OR EXISTS(SELECT 1 FROM pwc41.tournament_purge_objects o WHERE o.job_id=j.id AND (d::text LIKE '%'||o.asset_id||'%' OR d::text LIKE '%'||o.object_key||'%'))) LOOP
    tids:=array_append(tids,v);
   END LOOP;
  END IF;
 END LOOP;
 FOR v IN SELECT DISTINCT unnest(tids) ORDER BY 1 LOOP
  PERFORM 1 FROM pwc41.tournaments WHERE id=v FOR UPDATE;
  IF EXISTS(SELECT 1 FROM pwc41.tournament_purge_jobs j WHERE j.tournament_id=v AND (j.state<>'complete' OR TG_TABLE_NAME='tournaments'))
  AND NOT (coalesce(pwc41_private.purge_authorized(v),false) AND (
   TG_OP='DELETE' OR (TG_TABLE_NAME='tournaments' AND TG_OP='UPDATE'
    AND to_jsonb(NEW)->>'draft_revision_id' IS NULL AND to_jsonb(NEW)->>'published_revision_id' IS NULL
    AND (to_jsonb(NEW)-ARRAY['draft_revision_id','published_revision_id'])=(to_jsonb(OLD)-ARRAY['draft_revision_id','published_revision_id']))))
  THEN RAISE EXCEPTION 'tournament deletion in progress'; END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $fences$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['tournaments','admin_tournament_trash','tournament_revisions','revision_categories','revision_participants','participants','media_presentations','media_assets','featured_entries','admin_media_jobs','admin_media_delete_requests','admin_media_usage_exemptions','command_requests','import_batches','audit_logs'] LOOP
  EXECUTE format('CREATE TRIGGER purge_content_fence BEFORE INSERT OR UPDATE OR DELETE ON pwc41.%I FOR EACH ROW EXECUTE FUNCTION pwc41_private.purge_content_fence()',r);
  EXECUTE format('ALTER TABLE pwc41.%I ENABLE ALWAYS TRIGGER purge_content_fence',r);
 END LOOP;
END $fences$;

-- Match FK columns/actions, not names or referencing tables alone. Missing,
-- added, unvalidated or deferred constraints require review before installation.
-- All content FKs in the reviewed baseline are immediate NO ACTION constraints.
CREATE FUNCTION pwc41_private.purge_check_foreign_keys() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(
 WITH expected(src,cols,dst,refs) AS (VALUES
 ('media_assets','tournament_id','tournaments','id'),
 ('tournament_revisions','tournament_id','tournaments','id'),
 ('tournament_revisions','parent_revision_id,tournament_id','tournament_revisions','id,tournament_id'),
 ('tournament_revisions','cover_asset_id','media_assets','id'),
 ('tournaments','draft_revision_id,id','tournament_revisions','id,tournament_id'),
 ('tournaments','published_revision_id,id','tournament_revisions','id,tournament_id'),
 ('revision_categories','revision_id','tournament_revisions','id'),
 ('participants','tournament_id','tournaments','id'),('participants','entity_id','entities','id'),
 ('revision_participants','revision_id,tournament_id','tournament_revisions','id,tournament_id'),
 ('revision_participants','tournament_id,participant_id,entity_id','participants','tournament_id,id,entity_id'),
 ('revision_participants','image_asset_id','media_assets','id'),
 ('revision_participants','local_asset_id','media_assets','id'),
 ('revision_participants','remote_asset_id','media_assets','id'),
 ('media_presentations','revision_id','tournament_revisions','id'),
 ('media_presentations','revision_id,participant_id','revision_participants','revision_id,participant_id'),
 ('media_presentations','asset_id','media_assets','id'),
 ('featured_entries','tournament_id','tournaments','id'),
 ('audit_logs','tournament_id','tournaments','id'),('audit_logs','revision_id','tournament_revisions','id'),
 ('audit_logs','asset_id','media_assets','id'),
 ('admin_media_jobs','tournament_id','tournaments','id'),('admin_media_jobs','asset_id','media_assets','id'),
 ('admin_media_delete_requests','asset_id','media_assets','id'),
 ('admin_media_usage_exemptions','asset_id','media_assets','id'),
 ('admin_tournament_trash','tournament_id','tournaments','id')
 ), actual AS (
 SELECT n.nspname,cl.relname AS src,
  (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num) AS cols,
  d.relname AS dst,
  (SELECT string_agg(a.attname,',' ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num) AS refs,
  c.confdeltype,c.confupdtype,c.confmatchtype,c.condeferrable,c.convalidated
 FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
 JOIN pg_class d ON d.oid=c.confrelid JOIN pg_namespace dn ON dn.oid=d.relnamespace
 WHERE c.contype='f' AND dn.nspname='pwc41' AND d.relname IN
 ('tournaments','tournament_revisions','revision_categories','revision_participants','participants','entities','media_presentations','media_assets','featured_entries','audit_logs','command_requests','admin_media_jobs','admin_media_delete_requests','admin_media_usage_exemptions','admin_tournament_trash')
 )
 SELECT 1 FROM actual a WHERE a.nspname<>'pwc41' OR a.confdeltype<>'a' OR a.confupdtype<>'a'
 OR a.confmatchtype<>'s' OR a.condeferrable OR NOT a.convalidated
 OR NOT EXISTS(SELECT 1 FROM expected e WHERE (e.src,e.cols,e.dst,e.refs)=(a.src,a.cols,a.dst,a.refs))
 UNION ALL SELECT 1 FROM expected e WHERE NOT EXISTS(SELECT 1 FROM actual a WHERE a.nspname='pwc41' AND (e.src,e.cols,e.dst,e.refs)=(a.src,a.cols,a.dst,a.refs))
 ) THEN RAISE EXCEPTION 'STOP: content FK contract differs; compare 051 section A before installing/enabling purge'; END IF;
END $$;
DO $fk_contract$ BEGIN PERFORM pwc41_private.purge_check_foreign_keys(); END $fk_contract$;

CREATE FUNCTION pwc41_private.purge_check_references(tid text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pwc41_private.purge_check_foreign_keys();
 IF EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='pwc41-optimized' AND (b.public OR coalesce(to_jsonb(b)->>'versioning_status','DISABLED')<>'DISABLED'))
 OR NOT EXISTS(SELECT 1 FROM storage.buckets b WHERE b.id='pwc41-optimized')
 THEN RAISE EXCEPTION 'private non-versioned purge bucket required'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.media_assets a WHERE a.tournament_id=tid AND (a.upload_state='reserved' OR a.technical_state='pending'))
 THEN RAISE EXCEPTION 'unfinished upload blocks purge'; END IF;
 -- Unknown referencing tables are never ignored, even after an inventory sign-off.
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f'
 AND c.confrelid IN('pwc41.tournaments'::regclass,'pwc41.tournament_revisions'::regclass,'pwc41.media_assets'::regclass,'pwc41.participants'::regclass,'pwc41.entities'::regclass)
 AND c.conrelid NOT IN('pwc41.tournaments'::regclass,'pwc41.tournament_revisions'::regclass,'pwc41.revision_categories'::regclass,'pwc41.revision_participants'::regclass,'pwc41.participants'::regclass,'pwc41.media_presentations'::regclass,'pwc41.media_assets'::regclass,'pwc41.featured_entries'::regclass,'pwc41.audit_logs'::regclass,'pwc41.admin_media_jobs'::regclass,'pwc41.admin_media_delete_requests'::regclass,'pwc41.admin_media_usage_exemptions'::regclass,'pwc41.admin_tournament_trash'::regclass))
 THEN RAISE EXCEPTION 'unknown content foreign key blocks purge'; END IF;
 -- Owned asset shared externally cannot be deleted or detached from its non-null FK.
 IF EXISTS(SELECT 1 FROM pwc41.media_assets a WHERE a.tournament_id=tid AND (
 EXISTS(SELECT 1 FROM pwc41.tournament_revisions r WHERE r.tournament_id<>tid AND r.cover_asset_id=a.id)
 OR EXISTS(SELECT 1 FROM pwc41.revision_participants p WHERE p.tournament_id<>tid AND a.id IN(p.image_asset_id,p.local_asset_id,p.remote_asset_id))
 OR EXISTS(SELECT 1 FROM pwc41.media_presentations m JOIN pwc41.tournament_revisions r ON r.id=m.revision_id WHERE r.tournament_id<>tid AND m.asset_id=a.id)
 OR EXISTS(SELECT 1 FROM pwc41.admin_media_jobs j WHERE j.tournament_id<>tid AND j.asset_id=a.id)
 OR EXISTS(SELECT 1 FROM pwc41.audit_logs l WHERE l.tournament_id IS DISTINCT FROM tid AND l.asset_id=a.id)
 OR EXISTS(SELECT 1 FROM pwc41.media_assets other WHERE other.id<>a.id AND other.bucket_id=a.bucket_id AND other.object_key=a.object_key)))
 THEN RAISE EXCEPTION 'shared owned asset blocks purge'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.audit_logs l JOIN pwc41.tournament_revisions r ON r.id=l.revision_id WHERE r.tournament_id=tid AND l.tournament_id IS NOT NULL AND l.tournament_id<>tid)
 THEN RAISE EXCEPTION 'cross-tournament audit reference blocks purge'; END IF;
 -- Conservative JSON reference checks: false positives stop rather than erase data.
 IF EXISTS(SELECT 1 FROM pwc41.import_batches b WHERE b.id_map::text LIKE '%'||tid||'%' OR b.detail::text LIKE '%'||tid||'%')
 OR EXISTS(SELECT 1 FROM pwc41.command_requests c WHERE coalesce(c.payload->>'tid',c.result->>'tournament_id','')<>tid
 AND (c.payload::text LIKE '%'||tid||'%' OR c.result::text LIKE '%'||tid||'%'))
 THEN RAISE EXCEPTION 'external JSON reference blocks purge'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.media_assets a JOIN pwc41.import_batches b ON b.id_map::text LIKE '%'||a.id||'%' OR b.detail::text LIKE '%'||a.object_key||'%' WHERE a.tournament_id=tid)
 OR EXISTS(SELECT 1 FROM pwc41.media_assets a JOIN pwc41.command_requests c ON c.payload::text LIKE '%'||a.id||'%' OR c.result::text LIKE '%'||a.id||'%'
 WHERE a.tournament_id=tid AND coalesce(c.payload->>'tid',c.result->>'tournament_id','')<>tid
 AND (coalesce(c.payload->>'tid',c.result->>'tournament_id') IS NOT NULL
 OR coalesce(c.payload->>'aid',c.result->>'asset_id','')<>a.id
 OR c.operation NOT IN ('reserve_upload','finalize_upload','admin_media_begin','admin_media_finish','admin_media_abandon','admin_media_request_delete','review_media')))
 THEN RAISE EXCEPTION 'external asset JSON reference blocks purge'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.media_assets own JOIN pwc41.media_assets other
 ON other.source_records::text LIKE '%'||own.id||'%' OR other.source_urls::text LIKE '%'||own.object_key||'%'
 WHERE own.tournament_id=tid AND other.tournament_id<>tid)
 THEN RAISE EXCEPTION 'external source record blocks purge'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.media_assets a WHERE a.tournament_id=tid
 AND (a.bucket_id<>'pwc41-optimized' OR a.object_key<>a.owner_id::text||'/'||a.id||'.webp'
 OR a.id !~ '^asset_[0-9a-f-]{36}$')) THEN RAISE EXCEPTION 'unsafe purge object path'; END IF;
END $$;

CREATE FUNCTION pwc41_private.purge_result(jid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('job_id',j.id,'tournament_id',j.tournament_id,'state',j.state,'error_code',j.last_error,
 'remaining',(SELECT count(*) FROM pwc41.tournament_purge_objects o WHERE o.job_id=j.id AND o.state<>'deleted'))
 FROM pwc41.tournament_purge_jobs j WHERE j.id=jid
$$;
CREATE FUNCTION pwc41_api.admin_tournament_purge_capability() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pwc41_private.require_admin_media_access();
 RETURN jsonb_build_object('blocked_reason',CASE WHEN NOT pwc41_private.purge_storage_barrier_ready() THEN 'STORAGE_WRITE_BARRIER_UNIMPLEMENTED' END,
 'enabled',pwc41_private.purge_storage_barrier_ready() AND EXISTS(SELECT 1 FROM pwc41.tournament_purge_control WHERE singleton AND enabled AND external_references_reviewed AND storage_contract_reviewed AND inventory_signature=pwc41_private.purge_inventory_signature()),
 'jobs',(SELECT coalesce(jsonb_agg(pwc41_private.purge_result(j.id)),'[]'::jsonb) FROM pwc41.tournament_purge_jobs j WHERE j.state<>'complete'));
END $$;
CREATE FUNCTION pwc41_api.admin_tournament_purge_begin(req uuid,tid text,expected bigint,confirmation text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t pwc41.tournaments%rowtype; j pwc41.tournament_purge_jobs%rowtype; title text; u uuid;
BEGIN
 PERFORM pwc41_private.require_admin_media_access();PERFORM pwc41_private.purge_require_enabled();u:=auth.uid();
 PERFORM 1 FROM pwc41.admin_members WHERE user_id=u AND active FOR SHARE;IF NOT FOUND THEN RAISE insufficient_privilege; END IF;
 IF req IS NULL OR tid IS NULL OR confirmation IS NULL THEN RAISE EXCEPTION 'exact confirmation required'; END IF;
 SELECT * INTO t FROM pwc41.tournaments WHERE id=tid FOR UPDATE;
 SELECT * INTO j FROM pwc41.tournament_purge_jobs WHERE tournament_id=tid FOR UPDATE;
 IF j.id IS NOT NULL THEN
  IF j.state='complete' THEN RETURN pwc41_private.purge_result(j.id); END IF;
  IF j.title_sha256<>encode(sha256(convert_to(confirmation,'UTF8')),'hex') THEN RAISE EXCEPTION 'confirmation mismatch'; END IF;
  RETURN pwc41_private.purge_result(j.id);
 END IF;
 IF t.id IS NULL OR t.visibility<>'archived' OR t.edit_version IS DISTINCT FROM expected
 OR NOT EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid AND NOT restore_pending)
 THEN RAISE EXCEPTION 'exact trash tournament/version required'; END IF;
 SELECT r.title INTO title FROM pwc41.tournament_revisions r WHERE r.id=coalesce(t.draft_revision_id,t.published_revision_id) AND r.tournament_id=tid;
 IF confirmation IS DISTINCT FROM coalesce(title,tid) THEN RAISE EXCEPTION 'confirmation mismatch'; END IF;
 -- Advance the row version without changing the public edit_version. A writer
 -- holding an older REPEATABLE READ snapshot must serialize-fail after waiting
 -- on this row, rather than miss the newly created deletion job in its snapshot.
 UPDATE pwc41.tournaments SET edit_version=edit_version WHERE id=tid;
 PERFORM pwc41_private.purge_check_references(tid);
 PERFORM 1 FROM pwc41.media_assets WHERE tournament_id=tid ORDER BY id FOR UPDATE;
 INSERT INTO pwc41.tournament_purge_jobs(tournament_id,request_id,requested_by,title_sha256,expected_version,entity_ids,state)
 VALUES(tid,req,u,encode(sha256(convert_to(confirmation,'UTF8')),'hex'),expected,
 ARRAY(SELECT DISTINCT entity_id FROM pwc41.participants WHERE tournament_id=tid),'pending') RETURNING * INTO j;
 INSERT INTO pwc41.tournament_purge_objects(job_id,asset_id,bucket_id,object_key)
 SELECT j.id,a.id,a.bucket_id,a.object_key FROM pwc41.media_assets a WHERE a.tournament_id=tid;
 INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(j.id,tid,u,'requested');
 RETURN pwc41_private.purge_result(j.id);
END $$;

-- Every service operation rechecks the acting administrator. No browser service key.
CREATE FUNCTION pwc41_api.admin_tournament_purge_claim(jid uuid,actor uuid,worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j pwc41.tournament_purge_jobs%rowtype; result jsonb; target text;
BEGIN
 PERFORM pwc41_private.purge_service_admin(actor);
 SELECT tournament_id INTO target FROM pwc41.tournament_purge_jobs WHERE id=jid;
 PERFORM 1 FROM pwc41.tournaments WHERE id=target FOR UPDATE;
 SELECT * INTO j FROM pwc41.tournament_purge_jobs WHERE id=jid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'purge job missing'; END IF;
 IF j.state='complete' THEN RETURN pwc41_private.purge_result(jid); END IF;
 IF j.lease_until>clock_timestamp() AND j.lease_token IS DISTINCT FROM worker THEN RAISE EXCEPTION 'purge busy'; END IF;
 PERFORM 1 FROM pwc41.tournaments WHERE id=j.tournament_id AND visibility='archived' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'trash target missing'; END IF;
 BEGIN
  PERFORM pwc41_private.purge_check_references(j.tournament_id);
 EXCEPTION WHEN OTHERS THEN
  UPDATE pwc41.tournament_purge_jobs SET state='failed',last_error='REFERENCE_RECHECK_FAILED',lease_token=NULL,lease_until=NULL WHERE id=jid;
  INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(jid,j.tournament_id,actor,'reference_recheck_failed');
  RETURN pwc41_private.purge_result(jid);
 END;
 UPDATE pwc41.tournament_purge_jobs SET state='running',lease_token=worker,lease_until=clock_timestamp()+interval '120 seconds',last_error=NULL WHERE id=jid;
 result:=pwc41_private.purge_result(jid);
 RETURN result||jsonb_build_object('objects',(SELECT coalesce(jsonb_agg(jsonb_build_object('asset_id',o.asset_id,'bucket',o.bucket_id,'key',o.object_key)),'[]'::jsonb)
 FROM (SELECT * FROM pwc41.tournament_purge_objects WHERE job_id=jid AND state='pending' ORDER BY asset_id LIMIT 1) o));
END $$;
CREATE FUNCTION pwc41_api.admin_tournament_purge_ack(jid uuid,actor uuid,worker uuid,aid text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid text;
BEGIN
 PERFORM pwc41_private.purge_service_admin(actor);
 SELECT tournament_id INTO tid FROM pwc41.tournament_purge_jobs WHERE id=jid AND state='running' AND lease_token=worker AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'purge lease lost'; END IF;
 -- Storage API verification is performed by trusted server before this acknowledgement.
 UPDATE pwc41.tournament_purge_objects SET state='deleted' WHERE job_id=jid AND asset_id=aid;
 IF NOT FOUND THEN RAISE EXCEPTION 'purge object mismatch'; END IF;
 INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(jid,tid,actor,'object_absence_verified');
 RETURN pwc41_private.purge_result(jid);
END $$;
CREATE FUNCTION pwc41_api.admin_tournament_purge_fail(jid uuid,actor uuid,worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid text;
BEGIN
 PERFORM pwc41_private.purge_service_admin(actor);
 UPDATE pwc41.tournament_purge_jobs SET state='failed',last_error='STORAGE_OR_SERVER_FAILED',lease_until=NULL,lease_token=NULL
 WHERE id=jid AND state='running' AND lease_token=worker RETURNING tournament_id INTO tid;
 IF FOUND THEN INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(jid,tid,actor,'attempt_failed'); END IF;
 RETURN pwc41_private.purge_result(jid);
END $$;

-- Preserve immutable-content/audit protections except this exact leased finalizer.
DO $known$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('pwc41_private.frozen_revision_guard()') AND md5(replace(btrim(prosrc),chr(13),''))='a161ebfce1b8898c2a7291fe35619724') THEN RAISE EXCEPTION 'STOP: unknown installed frozen_revision_guard; review 051'; END IF; END $known$;
CREATE OR REPLACE FUNCTION pwc41_private.frozen_revision_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rid text;state text;
begin
 IF TG_OP='DELETE' AND coalesce(pwc41_private.purge_authorized((SELECT r.tournament_id FROM pwc41.tournament_revisions r WHERE r.id=OLD.revision_id)),false) THEN RETURN OLD; END IF;

 if tg_op='DELETE' then rid:=old.revision_id;else rid:=new.revision_id;end if;
 if tg_op='UPDATE' and old.revision_id is distinct from new.revision_id then raise exception 'revision retarget forbidden';end if;
 select r.state into state from pwc41.tournament_revisions r where r.id=rid for update;
 if state is distinct from 'draft' then raise exception 'fixed revision content';end if;
 if tg_table_name='media_presentations' and tg_op<>'DELETE' then
  perform pwc41_private.check_settings(new.settings);
  if new.participant_id is not null and not exists(select 1 from pwc41.revision_participants p where p.revision_id=new.revision_id and p.participant_id=new.participant_id and p.image_asset_id is not distinct from new.asset_id) then raise exception 'presentation/participant asset mismatch';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
DO $known$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('pwc41_private.revision_content_guard()') AND md5(replace(btrim(prosrc),chr(13),''))='32e78b048be50190922bdc07c946f85d') THEN RAISE EXCEPTION 'STOP: unknown installed revision_content_guard; review 051'; END IF; END $known$;
CREATE OR REPLACE FUNCTION pwc41_private.revision_content_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 IF TG_OP='DELETE' AND coalesce(pwc41_private.purge_authorized(OLD.tournament_id),false) THEN RETURN OLD; END IF;

 if tg_op='DELETE' then raise exception 'retained revision deletion forbidden';end if;
 if old.state<>'draft' and (to_jsonb(new)-array['state','submitted_by','submitted_at','reviewed_by','reviewed_at','review_note'])
 is distinct from (to_jsonb(old)-array['state','submitted_by','submitted_at','reviewed_by','reviewed_at','review_note']) then raise exception 'fixed revision content';end if;
 return new;
end $$;
DO $known$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('pwc41_private.append_only()') AND md5(replace(btrim(prosrc),chr(13),''))='954c4210824f2380132ce2f34163438c') THEN RAISE EXCEPTION 'STOP: unknown installed append_only; review 051'; END IF; END $known$;
CREATE OR REPLACE FUNCTION pwc41_private.append_only() returns trigger language plpgsql set search_path='' as $$begin
 IF TG_TABLE_SCHEMA='pwc41' AND TG_TABLE_NAME='audit_logs' AND TG_OP='DELETE' AND coalesce(pwc41_private.purge_authorized(coalesce(to_jsonb(OLD)->>'tournament_id',(SELECT r.tournament_id FROM pwc41.tournament_revisions r WHERE r.id=to_jsonb(OLD)->>'revision_id'),(SELECT a.tournament_id FROM pwc41.media_assets a WHERE a.id=to_jsonb(OLD)->>'asset_id'))),false) THEN RETURN OLD; END IF;
 raise exception 'audit is append-only';end $$;

CREATE FUNCTION pwc41_api.admin_tournament_purge_finish(jid uuid,actor uuid,worker uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j pwc41.tournament_purge_jobs%rowtype; aids text[]; rids text[]; eid text; target text;
BEGIN
 PERFORM pwc41_private.purge_service_admin(actor);
 SELECT tournament_id INTO target FROM pwc41.tournament_purge_jobs WHERE id=jid;
 PERFORM 1 FROM pwc41.tournaments WHERE id=target FOR UPDATE;
 SELECT * INTO j FROM pwc41.tournament_purge_jobs WHERE id=jid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'purge job missing'; END IF;
 IF j.state='complete' THEN RETURN pwc41_private.purge_result(jid); END IF;
 IF j.lease_token IS DISTINCT FROM worker OR j.lease_until<=clock_timestamp() OR j.lease_until IS NULL THEN RAISE EXCEPTION 'purge lease lost'; END IF;
 IF EXISTS(SELECT 1 FROM pwc41.tournament_purge_objects WHERE job_id=jid AND state<>'deleted') THEN
  UPDATE pwc41.tournament_purge_jobs SET state='pending',lease_token=NULL,lease_until=NULL WHERE id=jid;
  RETURN pwc41_private.purge_result(jid);
 END IF;
 BEGIN
  PERFORM 1 FROM pwc41.tournaments WHERE id=j.tournament_id AND visibility='archived' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trash target missing'; END IF;
  PERFORM pwc41_private.purge_check_references(j.tournament_id);
  -- Both service verification AND metadata absence are required. A 2xx DELETE alone is insufficient.
  IF EXISTS(SELECT 1 FROM pwc41.tournament_purge_objects o JOIN storage.objects s ON s.bucket_id=o.bucket_id AND s.name=o.object_key WHERE o.job_id=jid)
  THEN RAISE EXCEPTION 'storage metadata still present'; END IF;
  UPDATE pwc41.tournament_purge_jobs SET state='finalizing' WHERE id=jid;
  PERFORM set_config('pwc41.purge_job',jid::text,true);PERFORM set_config('pwc41.purge_token',worker::text,true);
  aids:=ARRAY(SELECT id FROM pwc41.media_assets WHERE tournament_id=j.tournament_id);
  rids:=ARRAY(SELECT id FROM pwc41.tournament_revisions WHERE tournament_id=j.tournament_id);
  -- Retain accountability without titles, text, notes, URLs, source records or payloads.
  INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event,source_audit_id,created_at)
  SELECT jid,j.tournament_id,l.actor_id,'prior_content_event',l.id,l.created_at FROM pwc41.audit_logs l
  WHERE l.tournament_id=j.tournament_id OR l.revision_id=ANY(rids) OR l.asset_id=ANY(aids);
  DELETE FROM pwc41.command_requests c WHERE EXISTS(SELECT 1 FROM pwc41.audit_logs l WHERE l.actor_id=c.actor_id AND l.request_id=c.request_id AND (l.tournament_id=j.tournament_id OR l.revision_id=ANY(rids) OR l.asset_id=ANY(aids)))
   OR payload->>'tid'=j.tournament_id OR result->>'tournament_id'=j.tournament_id
   OR payload->>'aid'=ANY(aids) OR result->>'asset_id'=ANY(aids);
  DELETE FROM pwc41.audit_logs WHERE tournament_id=j.tournament_id OR revision_id=ANY(rids) OR asset_id=ANY(aids);
  DELETE FROM pwc41.admin_media_delete_requests WHERE asset_id=ANY(aids);
  DELETE FROM pwc41.admin_media_usage_exemptions WHERE asset_id=ANY(aids);
  DELETE FROM pwc41.admin_media_jobs WHERE tournament_id=j.tournament_id OR asset_id=ANY(aids);
  DELETE FROM pwc41.media_presentations WHERE revision_id=ANY(rids);
  DELETE FROM pwc41.revision_categories WHERE revision_id=ANY(rids);
  DELETE FROM pwc41.revision_participants WHERE tournament_id=j.tournament_id;
  UPDATE pwc41.tournaments SET draft_revision_id=NULL,published_revision_id=NULL WHERE id=j.tournament_id;
  DELETE FROM pwc41.tournament_revisions WHERE tournament_id=j.tournament_id;
  DELETE FROM pwc41.participants WHERE tournament_id=j.tournament_id;
  DELETE FROM pwc41.featured_entries WHERE tournament_id=j.tournament_id;
  DELETE FROM pwc41.media_assets WHERE tournament_id=j.tournament_id;
  DELETE FROM pwc41.admin_tournament_trash WHERE tournament_id=j.tournament_id;
  DELETE FROM pwc41.tournaments WHERE id=j.tournament_id;
  IF EXISTS(SELECT 1 FROM pwc41.tournaments WHERE id=j.tournament_id) THEN
   RAISE EXCEPTION 'Tournament deletion was not completed';
  END IF;
  FOREACH eid IN ARRAY j.entity_ids LOOP
   DELETE FROM pwc41.entities e WHERE e.id=eid
   AND NOT EXISTS(SELECT 1 FROM pwc41.participants p WHERE p.entity_id=e.id)
   AND NOT EXISTS(SELECT 1 FROM pwc41.revision_participants p WHERE p.entity_id=e.id);
  END LOOP;
  UPDATE pwc41.tournament_purge_jobs SET state='complete',completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,last_error=NULL,entity_ids='{}',title_sha256='' WHERE id=jid;
  INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(jid,j.tournament_id,actor,'completed');
 EXCEPTION WHEN OTHERS THEN
  -- The entire content deletion block rolls back. Earlier Storage acknowledgements remain.
  UPDATE pwc41.tournament_purge_jobs SET state='failed',last_error='DATABASE_FINALIZE_FAILED',lease_token=NULL,lease_until=NULL WHERE id=jid;
  INSERT INTO pwc41.tournament_purge_audit(job_id,tournament_id,actor_id,event) VALUES(jid,j.tournament_id,actor,'database_finalize_failed');
 END;
 RETURN pwc41_private.purge_result(jid);
END $$;

-- Do not change 048's deliberate permanent_delete_enabled=false contract.
-- The browser reads this separate capability only after the original context.
DO $acl$ DECLARE p record; BEGIN
 FOR p IN SELECT x.oid::regprocedure AS sig FROM pg_proc x JOIN pg_namespace n ON n.oid=x.pronamespace
 WHERE (n.nspname='pwc41_private' AND x.proname LIKE 'purge_%')
 OR (n.nspname='pwc41_api' AND x.proname LIKE 'admin_tournament_purge_%') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.sig);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',p.sig);
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION pwc41_api.admin_tournament_purge_capability(),pwc41_api.admin_tournament_purge_begin(uuid,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION pwc41_api.admin_tournament_purge_claim(uuid,uuid,uuid),pwc41_api.admin_tournament_purge_ack(uuid,uuid,uuid,text),pwc41_api.admin_tournament_purge_fail(uuid,uuid,uuid),pwc41_api.admin_tournament_purge_finish(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
