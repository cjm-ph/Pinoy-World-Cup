# Staging play statistics — prepared, not applied

Only Staging `cmnomqsurdwhdbjgnsvw`. No remote SQL, Storage mutation, commit,
push or deployment. Existing `play-statistics-plan.md` was reused. The original
photo editor, winner photo settings, Gemini prompt and migrations 041–050 are unchanged.

## Implemented contract

- Starts are accepted once per signed guest cookie + request UUID, after round
  selection. Logged-in and logged-out play use the same pseudonymous collector;
  this counts games, not distinct people. No IP, email, account ID or UA is stored.
- Server-only RPCs validate a currently public, approved revision, unique active
  candidate IDs, and 4/8/16/32 brackets. The ordered initial lineup is frozen.
  Each committed match must select one of the next pair. Only N−1 valid choices
  create a championship/completion. A client cannot directly set totals or titles.
- Game row locks and `(game_id, sequence)` uniqueness serialize event replay.
  Same event = same receipt; different winner at the same sequence = rejection.
  Batches roll back together. Global start admission uses a transaction advisory
  lock; caller 30 starts/10 minutes and total 600 starts/minute are enforced in DB.
- Partial games contribute accepted matches but never titles/completions. Expiry
  is 24 hours. Refresh retries the existing outbox; it does not resume the engine.
  Explicit Play Again creates a new start. Session storage keeps at most 4 games;
  unavailable storage, page closure, cookie expiry, or exhausted retries can lose
  events. Statistics are accepted observations, not a promise of lossless telemetry.
- Browser sends asynchronously, with bounded retries only for statistics. This
  does not add upload retries. A 10-second deadline and status note protect play.
  The existing VS presenter captures choose(), so the collector is installed
  before that capture, counting committed choices rather than animation clicks.
- HTTP uses a signed HttpOnly/Secure/SameSite cookie established before start,
  exact same-origin POST checks, 8 KiB body/5-second receive limits, 120 requests
  per minute/cookie and 16 active requests/process. Supabase writes use a server
  credential. Public reads use the publishable key. No credential is public.
- Public rankings aggregate all recorded games for this tournament, across
  revisions by immutable participant ID, but expose only current published
  candidates/images. Removed candidates' titles remain in the tournament's
  completion denominator, so displayed title percentages need not sum to 100.
  Hidden/trash tournaments cannot start, accept new events or expose rankings.
- Championship percentage = titles/completed games; match percentage = wins/
  appearances, including accepted matches in incomplete games. No denominator
  gives “—”, not a fabricated rate. Sort: titles descending, exact match rate
  descending, wins descending, immutable participant ID ascending.
- Admin-only range queries (maximum 366 days) include all revisions, day/week/
  month UTC **start cohorts**, popularity by starts (ID tie-break), and candidate
  detail. Later completion belongs to its start cohort; incomplete/expired games
  remain in completion-rate denominator. Queries run on demand with indexes,
  without a synchronous analytics request in game rendering or image processing.
- Direct table access is revoked from API roles, RLS enabled, only public aggregate
  RPC is anon-readable. Admin aggregate checks active administrator and non-anonymous
  authenticated JWT. Service writes and guest identity verification stay server-side.

## Local verification

Focused commands (from workspace root):

```text
node --test db_design/v41b_media_prep/server/test/play-statistics-sql.test.mjs db_design/v41b_media_prep/server/test/play-statistics-http.test.mjs scripts/staging-play-collector.test.mjs
node --test db_design/v41b_media_prep/server/test/play-statistics-native.test.mjs
python scripts/check_staging_play_statistics.py
```

PGlite fixture initializes only the baseline schema plus synthetic prerequisite
contracts; it does not rerun old 048/050 verification suites. Coverage: disabled
default, least privilege, title/bracket derivation, malformed/foreign/out-of-order
events, replay conflicts, atomic rollback, incomplete games, 4/8/16/32 completion,
expired games, quota, private/trash denial, rates, UTC buckets and 053 read-only SQL.
HTTP tests exercise actual local request handling and mocked Supabase responses.
Browser checks use real game/admin modules with mocked services at 1440px/390px.
Native PostgreSQL 18.4 independent sessions additionally passed simultaneous
start replay (one session row), simultaneous event replay (one match row), and
completion/unpublish lock ordering. This uses a synthetic local cluster only.
No actual hosted DB/Storage/browser deployment behavior is claimed by these tests.

Final local result: **20 Node tests PASS**, including 7 new statistics tests;
both browser scripts PASS at desktop/mobile (statistics integration and unchanged
photo editor/VS/winner regression). FAIL: 0 remaining. SKIP: hosted SQL/API/Render
validation, real traffic/load and abuse testing. The native test needed execution
outside the Windows restricted-token sandbox; no external database was contacted.

## Files and synchronization

The SHA-256 manifest lists 16 files matched between source, generated candidate
and Staging clone:

- `server/gateway/{play-statistics,http,staging-start}.mjs` (original sources in
  `db_design/v41b_media_prep/server/`). New HTTP test in `server/gateway/test/`.
- `scripts/staging-{play-collector,play-statistics}.mjs`, collector Node test,
  `staging-adapter-bootstrap.js`, `staging-media-ui.mjs`, `staging-public-content.mjs`.
- `templates/staging-play-statistics.css`, `staging-deploy/public-files.mjs`,
  `staging-deploy/render-server.mjs`, SQL 052/053, and this report.

Local-only changes: source generator `staging-deploy/prepare-render.mjs`, focused
packaging check `staging-deploy/render.test.mjs`, SQL fixture test
`db_design/v41b_media_prep/server/test/play-statistics-sql.test.mjs`, native test
`play-statistics-native.test.mjs`, and `scripts/check_staging_play_statistics.py`.
Fixture-dependent tests stay in the development workspace; runtime clone does
not acquire PGlite/PostgreSQL packages or old schema fixtures. The collector and
HTTP mock tests copied to the clone require only Node. SQL/report/tests are not
public assets and are excluded from the public allowlist.

Readiness: **GO for reviewed Staging installation/deployment**, with collection
disabled until the operator enables both gates and performs the hosted checks.
Hosted collection readiness is **not yet verified**. Permanent deletion stays
**BLOCKED**.

## Operator sequence

1. Review this report and the hash manifest. Independently select Staging
   `cmnomqsurdwhdbjgnsvw` in Dashboard. Run **053 section A only**. New statistics
   tables/functions must be absent; purge barrier must remain false. Do not repeat
   the already-passed 048/050/FK/RLS checks or rerun their migrations.
2. Review `052_staging_play_statistics_NOT_RUN.sql`. In an approved execution copy,
   immediately after `BEGIN;`, add:
   ```sql
   SET LOCAL pwc41.verified_project_ref='cmnomqsurdwhdbjgnsvw';
   SET LOCAL pwc41.play_statistics_approved='YES';
   ```
   User applies 052 once as postgres. It installs disabled. The agent does not run it.
3. Run **053 section B only**. Confirm disabled control, restricted table/function
   ACLs, zero invariant violations, and purge barrier false. Stop on mismatch.
4. User reviews/deploys synchronized Staging application files. Configure Render
   `PWC_STAGING_PLAY_STATISTICS=enabled`. Keep purge flags and code blocker unchanged.
5. After successful installation/deployment review, user may separately enable
   collection in a reviewed Staging transaction:
   ```sql
   BEGIN;
   UPDATE pwc41.play_statistics_control SET enabled=true WHERE singleton;
   COMMIT;
   ```
   Both DB and Render collection switches are necessary; neither activates purge.
6. Minimal hosted checks on an approved public test tournament: guest 4-candidate
   game completes with exactly 1 start, 3 matches, 1 completion/title; repeat the
   same captured statistics request and verify unchanged counts; start a second
   game and leave after one choice (start/match only). PC/mobile Rankings and View
   Statistics must match; admin totals/cohort/rates must reconcile. Set private or
   trash and verify anonymous ranking/event access denied; restore remains private.
   Perform mutations only under the operator's existing test-data authorization.
7. Re-run 053 B invariants after the approved test; no guest hash dump is needed.

## Failure response and remaining risks

- If 052 errors: transaction rolls back. Inspect new object presence with 053 A;
  do not blindly replay after a successful install. Fix via a reviewed follow-up
  migration if installation already succeeded.
- Disable collection with DB `enabled=false` and remove/disable the Render opt-in.
  Keep collected rows for review; no rollback deletes or historical backfill.
  Game play remains available. Buffered events can be lost during this pause.
- Cookies are pseudonymous data and require a retention/privacy policy. This
  version adds no automatic data deletion or unique-human metric. Bots can submit
  valid brackets; rate limits bound writes but do not prove a human watched a game.
- Multiple processes share DB start/event deduplication, but HTTP limits are
  process-local. Public read RPC can be called directly with the publishable key;
  hosted query timeout/load behavior and platform-level abuse controls need review
  before broad traffic. Indexes and on-demand reads are implemented; no load-test
  claim or unrestricted production rollout is made.
- New content FKs intentionally block the old purge FK inventory. Purge remains
  code-BLOCKED; any future purge implementation must explicitly handle statistics
  retention/deletion in a new migration. Do not weaken these FKs or change 050.

Local readiness and exact test outcomes are recorded in the companion test results.
Actual installation, Render deployment and end-to-end hosted validation remain the
operator's work; no live statistics are available until those steps are complete.
