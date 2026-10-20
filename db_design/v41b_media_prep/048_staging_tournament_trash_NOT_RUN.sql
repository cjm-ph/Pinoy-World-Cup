-- NOT_RUN. STAGING ONLY cmnomqsurdwhdbjgnsvw. No physical deletion.
-- Requires installed 041-046. Independently verify project in Dashboard.
-- In an execution COPY immediately after BEGIN add:
-- SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
-- SET LOCAL pwc41.tournament_management_approved='YES';
-- This file is preparation only. Do not execute without user approval.
-- FIRST run section A of 049 and review installed definitions/ACLs. Unknown
-- transition bodies STOP here; never overwrite installed transition automatically.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 OR current_setting('pwc41.verified_project_ref',true) IS DISTINCT FROM 'cmnomqsurdwhdbjgnsvw'
 OR current_setting('pwc41.tournament_management_approved',true) IS DISTINCT FROM 'YES'
 THEN RAISE EXCEPTION 'STOP: independently verified Staging and approval required'; END IF;
 IF to_regprocedure('pwc41_private.require_admin_media_access()') IS NULL
 OR to_regprocedure('pwc41_private.transition(uuid,text,text,bigint,text,text,boolean)') IS NULL
 OR to_regprocedure('pwc41_api.admin_media_apply_photo(uuid,text,text,text,bigint,text,jsonb,text)') IS NULL
 THEN RAISE EXCEPTION 'STOP: installed Staging prerequisites required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
 WHERE p.oid=to_regprocedure('pwc41_private.transition(uuid,text,text,bigint,text,text,boolean)')
 AND md5(replace(btrim(p.prosrc),chr(13),'')) IN
 ('be3a10197267e6e6854c8f103b862a50','875a693ebd94984a1143ac33bcf346eb','1b0b41f2d7bb8af19d9601388edcfd38')
 AND pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND l.lanname='plpgsql'
 AND p.prokind='f' AND p.provolatile='v' AND p.prorettype='jsonb'::regtype
 AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'STOP: unknown installed transition definition/configuration; review 049 section A'; END IF;
END $guard$;

-- Existing archived content is NOT automatically considered trash.
CREATE TABLE pwc41.admin_tournament_trash (
 tournament_id text PRIMARY KEY REFERENCES pwc41.tournaments(id),
 trashed_at timestamptz NOT NULL,
 trashed_by uuid NOT NULL REFERENCES pwc41.profiles(id),
 restore_pending boolean NOT NULL DEFAULT false
);
ALTER TABLE pwc41.admin_tournament_trash ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pwc41.admin_tournament_trash FROM PUBLIC,anon,authenticated,service_role;

-- Enforce at the common write boundary, including legacy publish/rollback RPCs.
-- A plain legacy unpublish cannot escape archived/quarantined into private and
-- subsequently publish. Only the authorized restore transaction sets the marker.
CREATE FUNCTION pwc41_private.tournament_publication_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fence$
DECLARE trash_exists boolean; restoring boolean;
BEGIN
 SELECT true,d.restore_pending INTO trash_exists,restoring
 FROM pwc41.admin_tournament_trash d WHERE d.tournament_id=NEW.id;
 IF TG_OP='UPDATE' THEN
  IF OLD.visibility IN ('archived','quarantined') AND NEW.visibility IS DISTINCT FROM OLD.visibility THEN
   IF NOT (OLD.visibility='archived' AND NEW.visibility='private' AND coalesce(restoring,false))
   THEN RAISE EXCEPTION 'archived/quarantined visibility change forbidden; authorized private restoration required'; END IF;
  END IF;
 END IF;
 IF coalesce(trash_exists,false) AND NEW.visibility<>'archived'
 AND NOT (NEW.visibility='private' AND coalesce(restoring,false))
 THEN RAISE EXCEPTION 'trash publication/visibility escape forbidden'; END IF;
 RETURN NEW;
END $fence$;
ALTER FUNCTION pwc41_private.tournament_publication_fence() OWNER TO postgres;
REVOKE ALL ON FUNCTION pwc41_private.tournament_publication_fence() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tournament_publication_fence BEFORE INSERT OR UPDATE ON pwc41.tournaments
FOR EACH ROW EXECUTE FUNCTION pwc41_private.tournament_publication_fence();
ALTER TABLE pwc41.tournaments ENABLE ALWAYS TRIGGER tournament_publication_fence;

CREATE FUNCTION pwc41_api.admin_tournament_management_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 PERFORM pwc41_private.require_admin_media_access();
 RETURN jsonb_build_object('version','048','permanent_delete_enabled',false,
 'trash',(SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',t.id,'title',coalesce(r.title,t.id),'visibility',t.visibility,
 'edit_version',t.edit_version,'trashed_at',d.trashed_at) ORDER BY d.trashed_at DESC,t.id),'[]'::jsonb)
 FROM pwc41.admin_tournament_trash d JOIN pwc41.tournaments t ON t.id=d.tournament_id
 LEFT JOIN pwc41.tournament_revisions r ON r.id=coalesce(t.draft_revision_id,t.published_revision_id) AND r.tournament_id=t.id));
END $fn$;

CREATE FUNCTION pwc41_api.admin_tournament_manage(req uuid,tid text,expected bigint,action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u uuid; t pwc41.tournaments%rowtype; payload jsonb; cached jsonb; result jsonb; rid text;
BEGIN
 PERFORM pwc41_private.require_admin_media_access();
 u:=auth.uid();
 -- Serialize active membership revocation with this transaction.
 PERFORM 1 FROM pwc41.admin_members WHERE user_id=u AND active FOR SHARE;
 IF NOT FOUND THEN RAISE insufficient_privilege USING message='admin required'; END IF;
 IF req IS NULL OR action NOT IN ('publish','unpublish','trash','restore') OR action IS NULL
 THEN RAISE EXCEPTION 'invalid management operation'; END IF;
 payload:=jsonb_build_object('tid',tid,'expected',expected,'action',action);
 cached:=pwc41_private.request_lock(req,'admin_tournament_manage',payload);
 IF cached IS NOT NULL THEN RETURN cached; END IF;
 SELECT * INTO t FROM pwc41.tournaments WHERE id=tid FOR UPDATE;
 IF NOT FOUND OR expected IS DISTINCT FROM t.edit_version THEN RAISE EXCEPTION 'missing tournament/stale edit_version'; END IF;
 IF action='restore' THEN
  IF t.visibility<>'archived' OR NOT EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid)
  THEN RAISE EXCEPTION 'trash entry required'; END IF;
  UPDATE pwc41.admin_tournament_trash SET restore_pending=true WHERE tournament_id=tid;
  UPDATE pwc41.tournaments SET visibility='private',edit_version=edit_version+1 WHERE id=tid RETURNING * INTO t;
  DELETE FROM pwc41.admin_tournament_trash WHERE tournament_id=tid;
 ELSIF action='trash' THEN
  IF t.visibility NOT IN ('private','public') OR EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid)
  THEN RAISE EXCEPTION 'editable tournament required'; END IF;
  INSERT INTO pwc41.admin_tournament_trash(tournament_id,trashed_at,trashed_by) VALUES(tid,clock_timestamp(),u);
  UPDATE pwc41.tournaments SET visibility='archived',edit_version=edit_version+1 WHERE id=tid RETURNING * INTO t;
 ELSE
  IF t.visibility NOT IN ('private','public') OR EXISTS(SELECT 1 FROM pwc41.admin_tournament_trash WHERE tournament_id=tid)
  THEN RAISE EXCEPTION 'editable tournament required'; END IF;
  IF action='publish' THEN
   -- Prefer current approved work; fall back only to an approved existing publication.
   -- Do not silently fall back if the selected approved revision fails media checks.
   SELECT r.id INTO rid FROM pwc41.tournament_revisions r
   WHERE r.tournament_id=tid AND r.state='approved'
   AND r.id IN (t.draft_revision_id,t.published_revision_id)
   ORDER BY (r.id=t.draft_revision_id) DESC,r.id LIMIT 1;
   IF rid IS NULL THEN RAISE EXCEPTION 'approved revision required before publication'; END IF;
  ELSE
   rid:=coalesce(t.published_revision_id,t.draft_revision_id);
  END IF;
  result:=pwc41_private.transition(gen_random_uuid(),tid,rid,expected,action,NULL,false);
  RETURN pwc41_private.finish_request(req,'admin_tournament_manage',payload,result,tid,rid);
 END IF;
 result:=jsonb_build_object('tournament_id',tid,'visibility',t.visibility,'edit_version',t.edit_version);
 RETURN pwc41_private.finish_request(req,'admin_tournament_manage',payload,result,tid,NULL);
END $fn$;
ALTER FUNCTION pwc41_api.admin_tournament_management_context() OWNER TO postgres;
ALTER FUNCTION pwc41_api.admin_tournament_manage(uuid,text,bigint,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION pwc41_api.admin_tournament_management_context(),pwc41_api.admin_tournament_manage(uuid,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pwc41_api.admin_tournament_management_context(),pwc41_api.admin_tournament_manage(uuid,text,bigint,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
