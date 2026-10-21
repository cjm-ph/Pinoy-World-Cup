# Tournament permanent deletion: disabled installation READY, activation BLOCKED

Staging only: cmnomqsurdwhdbjgnsvw. No remote SQL, real Storage deletion, data mutation, commit, push, deployment, ownership change or service setting change was performed.

## Storage writer investigation after successful Staging installation/deployment

Decision: BLOCKED. SQL 050 is already installed and the staging-render deployment is Live (operator-confirmed). No production feature, SQL or upload behavior was changed in this follow-up. Only this report changes; the runtime/test deployment hashes are rechecked.

### Repository paths traced

| Path | Actual behavior | Remaining boundary |
| --- | --- | --- |
| scripts/staging-media-api.mjs: mutation/uploadStream/upload | Raw photo bytes to Render /admin/media/upload; user bearer; final JSON; XHR 120s. No signed Storage upload token creation or automatic retry in this path. | Browser completion is not Storage completion. |
| server/gateway.mjs: upload; adapters.mjs: request/create | Bounded body, auth/admin, DB admission, decode, admin_media_begin, server-only service-key POST to /storage/v1/object/{bucket}/{key}, x-upsert=false, read/hash, auth recheck, admin_media_finish, release. Adapter abort deadline 15s. | Abort is a local request result, not an acknowledged remote write cancellation. |
| 043: admin_media_begin/admin_media_abandon/admin_media_expire_empty | Durable reservations; reserved/pending blocks purge. Abandon can mark an empty unreferenced reservation failed; 24h recovery likewise checks metadata absence. | Failed state/metadata absence does not prove physical writer termination. The current process may have stopped waiting while upstream continues. |
| Gateway replace; 045 admin_media_replace/photo-draft functions | Replace by creating/copying DB draft references to a verified immutable asset; no overwrite of the existing physical image. | Uploaded new asset uses the same write path above. |
| Gateway requestDeletion; 021 admin_media_request_delete | Validates owner/admin/references and records deletion_requested, physical_delete=false. | No normal physical-delete worker found in this path. |
| tournament-purge.mjs | Validated exact key; official Storage DELETE, NoSuchKey check, acknowledgement then DB finalizer, shared references and immutable audit retained. | Currently inaccessible because installed barrier returns false. Absence at time T cannot stop a write at T+1. |
| 020 member Storage fences | Restrictive anon/authenticated insert/update/delete fences deny writes to pwc41-optimized in the reviewed local SQL. | Service credentials bypass RLS; no live policy re-verification was repeated. |

No signed-upload issuer, TUS client or S3 uploader was found in the active Staging upload modules. This does not establish that no signed tokens were ever issued externally. The legacy scripts/modules/admin.js has direct overwrite uploads for a different project/bucket; it is excluded from the Staging public allowlist and admin_staging.html, was inspected locally only, and is not a Staging writer or something to modify. scripts/staging-admin-model.mjs uses Storage download, not upload. No Production endpoint was contacted.

### Concrete unresolved race

An admitted upload reserves asset A and dispatches a service-key Storage POST. At 15 seconds the local request can time out; abandon sees no storage.objects metadata and marks A failed. A future purge could now pass the existing reserved/pending check. A delete/absence check could finish before the earlier physical POST commits or before failed metadata cleanup removes its bytes. Thus even the repository's current standard writer is sufficient to prevent a safe activation claim; an external writer need not be assumed to demonstrate the gap.

### Official supported features and limits

- Standard create-only/409 handling prevents overwriting an existing object. Deleting that object removes the collision protection; it is not a permanent tombstone/fence.
- Signed upload URLs carry upload authority for two hours without another login. No repository issuance found; current issued-token inventory is unknown. A documented per-path revocation-and-drain contract was not found in the reviewed API references. Waiting for expiration is not proof that an earlier accepted operation has ended.
- TUS provides individual upload URLs, resumability and a DELETE endpoint. That is not evidence of cancelling every standard/signed/S3 upload to a path. Its 24h URL lifetime and per-upload concurrency rules do not establish a universal write barrier.
- S3 generated access keys bypass RLS and can perform all operations across buckets. Removing an app admission entry or adding an app row lock cannot fence such a credential. Whether Staging has issued these credentials is not known from source.
- The current official uploader source calls backend.uploadObject before completeUpload; completion explicitly continues after client disconnect and failure cleanup is queued. This is upstream master evidence, not proof of the exact hosted Staging version. No public path-level freeze/drain operation covering all these writers was found in the reviewed docs; this is a verification limit, not a claim that Supabase can never offer one.

### Tests in this follow-up

Only the existing targeted test `server opt-in cannot override the database physical Storage barrier` was run: 1 pass, no Storage invocation. No old installation/FK/RLS or full upload suites were repeated because executable code is unchanged. Prior 17 purge and 7 upload regression results remain prior evidence, not newly executed tests. No physical Storage race was tested against Supabase, and no synthetic timeout model is presented as proof of backend semantics.

Official evidence:
- https://supabase.com/docs/reference/python/storage-from-createsigneduploadurl
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- https://supabase.github.io/storage/ (individual TUS DELETE endpoint)
- https://supabase.com/docs/guides/storage/s3/authentication
- https://raw.githubusercontent.com/supabase/storage/master/src/storage/uploader.ts

## Historical installation error and correction

The old 050 issued CREATE TRIGGER on storage.objects followed by ALTER TABLE storage.objects ENABLE ALWAYS TRIGGER tournament_purge_storage_write_fence. The ALTER requires table ownership; ordinary TRIGGER grants do not provide it. A heap-only nonsuperuser/nonowner role reproduces SQLSTATE 42501 (must be owner). The remote error text is consistent with this ALTER; the complete remote error position was not supplied. Both internal-table DDL statements and the metadata write-fence function have been removed. No managed Storage ownership, grants, policies or schema are changed by updated 050.

The operator confirmed rollback (no purge jobs/control/Storage trigger), all 26 content FK contracts, three guard MD5 values, installed 048 private restoration with active-admin validation, and a private non-versioned bucket. Those investigations need not be repeated. Existing 041-049 files remain unchanged; do not replay 048 to reconcile the older clone copy.

## Hard activation blocker

Removing the metadata trigger is NOT a proven safe replacement. The new private purge_storage_barrier_ready() returns literal false. Capability reports enabled=false and STORAGE_WRITE_BARRIER_UNIMPLEMENTED. Begin and every service-side operation reject through purge_require_enabled; purge_authorized also requires this barrier. Control flags, inventory sign-off and Render environment opt-in cannot activate this version. Changing this helper to true is NOT an approved enablement procedure.

The existing Gateway acquires a DB admission lease, reserves an asset, sends a Storage API create, verifies it, and finalizes the DB asset. Purge DB row fences prevent new reservations/revision updates after a job begins, and pending reservations block begin. However, the Gateway process-local limit is not a distributed exclusion lock. An expired lease, an already-dispatched request, another instance, direct service/S3/signed upload paths or a delayed backend write may outlive a DB state transition. Deleting through the official Storage API and observing NoSuchKey at one instant does not cancel a later physical write. The existing upload and replacement implementation is deliberately unchanged.

A safe future replacement needs a reviewed durable barrier covering every physical writer, including distributed in-flight ownership and completion/drain semantics plus alternate API paths. An arbitrary waiting period or repeated absence check cannot prove this. A follow-up reviewed implementation and migration are required; flags alone are insufficient. Until then permanent deletion is BLOCKED, including disposable live deletion tests.

## Preserved implementation

The inactive state machine retains administrator/exact-title/immutable-ID/version validation, trash-only eligibility, durable leases/object receipts, reference protection, explicit resume without automatic retries, transactional DB finalization, minimal immutable audit and job/object tombstones. Shared target-owned assets block the whole operation before file deletion; borrowed external assets and shared entities remain intact. No Storage-table SQL deletion exists. Server deletion still uses the Storage API and explicit absence confirmation before acknowledgement/finalization. These paths are unreachable against the shipped DB barrier.

Historical content audit is replaced by minimal actor/target/event receipts during an authorized finalization. Actor UUIDs, immutable IDs and object paths remain potentially personal data requiring a retention policy. Unknown outside non-FK/JSON references still block activation review.

## Tests and limits

- 17 focused Node tests pass: state machine/mocked Storage, UI module/static contract and isolated PGlite SQL integration.
- The integration reproduces the ownership error as a nonsuperuser role with TRIGGER privilege, resets to PGlite bootstrap postgres, then installs updated 050 without managed Storage DDL. It asserts zero internal purge triggers, false capability and begin rejection even after all control flags are set true.
- ONLY inside the disposable in-memory SQL fixture, the blocker is replaced with true to test retained deletion/retry/audit/FK/mutation behavior. No physical Storage writer exists there. This fixture override must never be copied into a deployment or used as an activation command.
- The same integration covers existing publish/unpublish/trash/private restore, approved-parent/draft-child revisions, shared references, nested-trigger rollback and explicit resume. Existing FK/MD5 guards run as installation checks; no separate old verification suites were rerun.
- 7 selected Gateway/HTTP regressions pass: normal upload authority, bounded receive, tournament-owner path, replacement as a new draft, unpublish denial and final JSON/no early response.
- No native concurrent PostgreSQL or real Supabase Storage test ran. PGlite bootstrap postgres is a superuser and cannot be demoted; the installation test is not a full simulation of Supabase postgres privileges. Static checks reject Storage DDL/ownership changes; only schema reads remain.

Evidence: tournament-purge-final-tests.txt (17 tests), tournament-purge-upload-regression.txt (7 tests), tournament-purge-sha256.json.

## Changed files in this correction

1. db_design/v41b_media_prep/050_staging_tournament_purge_NOT_RUN.sql
2. db_design/v41b_media_prep/051_staging_tournament_purge_verify_READONLY_NOT_RUN.sql
3. db_design/v41b_media_prep/server/test/tournament-purge-sql.test.mjs
4. db_design/v41b_media_prep/server/test/tournament-purge.test.mjs
5. scripts/staging-tournament-purge.test.mjs
6. This report and test/hash evidence listed above.

Server/client runtime code was reviewed and requires no change: the existing capability/begin RPC gate is reused. Only updated 050 and 051 need synchronization to the deployment candidate and Staging Git clone. Source/candidate/clone hashes for all eight existing deployment/review files are checked together; tests are source-only, not public deployment assets.

## Current user sequence (050 is already installed)

1. Keep the installed barrier false, DB flags false and Render purge opt-in disabled. Do not reapply 050, 048 or earlier FK/RLS checks. The operator confirms 050 installation and deployment passed and existing trash/private restore remain normal.
2. Without sending any secrets, establish a writer inventory from Staging settings and deployment ownership: all service-role credential consumers, S3 credentials/integrations, Edge Functions/automation, signed-upload issuers and any resumable sessions. The repository alone cannot prove these are absent. No setting changes are authorized or performed here.
3. Obtain an official provider-supported contract for draining/cancelling already accepted writes to the target path, including uncertain standard uploads and physical/orphan version cleanup. If no such guarantee is available, permanent deletion remains BLOCKED; an expiring lease, token expiry or repeated HEAD/GET is not a substitute.
4. Only if every writer and late completion can be covered should a follow-up migration and distributed worker design be implemented and reviewed. It must freeze target mutations, deny new writes, durably account for every dispatch, refuse to clear ambiguous writes merely on timeout, confirm remote terminal states, delete/verify all exclusive physical objects and then finalize DB cleanup. Any ambiguous operation must keep the target locked indefinitely for explicit investigation.
5. A separately approved isolated end-to-end test must precede activation. Do not replace the barrier with true or use the fixture override. There is no new runtime file or SQL to deploy/apply from this investigation.

Official references:
- https://www.postgresql.org/docs/current/sql-altertable.html (ownership for ALTER TABLE)
- https://supabase.com/docs/guides/storage/schema/design (managed schema is read-only; metadata is not the physical object)
- https://supabase.com/docs/guides/storage/management/delete-objects (Storage API deletion)
