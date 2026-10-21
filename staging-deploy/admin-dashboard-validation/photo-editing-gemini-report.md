# Staging photo editing and candidate prompt preparation

Status: READY for user deployment and live verification. No SQL execution, remote data changes, commit, push or deployment. SQL 050 and permanent deletion's false barrier are unchanged.

## Cause and changes

The reusable photo editor explicitly disabled candidate Fit buttons and coerced existing candidate settings through gameSettings(), which forced Fill. Candidate zoom already supported 1–2.5x, but the coercion made editing/reopening inconsistent. Cover editing used its stored settings directly. Both use existing settings-only admin_media_photo_draft and upload+settings admin_media_apply_photo paths. Installed 046 accepts desktop/mobile fit, position and b2_zoom, so no DB change or re-upload is necessary.

The editor now reads original settings, enables Fit for candidates, preserves independent device zoom/drag, and gives both types the same aspect-ratio-based Auto fit reset. New candidate uploads retain their prior default Fill; existing settings are never automatically reset. Zoom's existing 1–2.5 limits are unchanged. Two device panels remain, labelled Desktop display/Mobile display; there are no separate VS/winner editor panels. The existing private playable tournament preview is retained.

The user explicitly authorized reflecting saved Fit/Fill in actual Staging VS/winner displays. Only photo-display.js gameSettings is changed: it honors stored modes for the exact Staging project configuration; other configurations retain the previous forced-Fill policy. The actual VS/result renderer files, layouts, aspect ratios and stored data are unchanged. Older explicitly saved contain settings will now be honored in Staging; missing fit still defaults to cover. This is an intentional visible behavior change. Saving settings creates a draft; current published content stays unchanged until the normal publication workflow succeeds.

Gemini prompt generation now prioritizes Philippine local recognition, search interest, passionate fandom participation and cultural influence over global rankings. It requires a consistent title-specific candidate type, no invented local ranking, exact counts and no duplicate/uncertain candidates. Korean uses "후보 8개" rather than a person-only unit. Existing copy/fallback, homepage-only manual Gemini opening and bulk paste remain; no AI API calls were added.

## Files

Runtime files (same paths in original, render-source and Staging clone):
- scripts/photo-card-editor.mjs
- scripts/photo-display.js
- scripts/staging-admin-i18n.mjs
- scripts/creator-gemini-support.mjs

Node tests, also synchronized to the clone:
- scripts/photo-display.test.mjs
- scripts/creator-gemini-support.test.mjs

Local browser tests (source fixtures only, not runtime/public assets):
- scripts/check_staging_photo_editing.py (new focused test)
- scripts/check_staging_gemini_support.py (field/count assertions updated)
- scripts/check_photo_cards_staging.py (old disabled-Fit expectations corrected; full 33-upload mock sequence not repeated)

This report is synchronized for review. All runtime files are already in the public allowlist; packaging/server changes are unnecessary.

## Validation

- 14 Node tests passed: 9 display/geometry/Staging-only isolation, 5 prompt generation/context/count/type/evidence tests.
- Focused mocked browser test passed at 1440x900 and 390x844: same asset/participant preservation, zero uploads while saving candidate settings, desktop/mobile Fit/zoom/drag, equal VS/result stored settings, reopen/cancel, independent Auto fit, cover settings save and no horizontal overflow.
- The focused test loads actual vs_immersive_test.js/result_immersive_test.js with their CSS and confirms saved Fit, zoom and position/geometry on PC/mobile. Backend/image data are mocked; this is not a live Render/DB persistence claim.
- Gemini browser test passed: all four metadata fields update the generated prompt, EN/KO count units, clipboard success/fallback, manual Gemini homepage opening and exact 16-name paste. External traffic is intercepted.
- 2 selected upload/replacement Gateway tests passed; existing tournament-management mock test passed publication/private/trash/private restore and disabled permanent delete. No old DB/FK/RLS suite ran.
- One first browser attempt failed because the mobile sidebar was closed (test fixed to open navigation). A later transient login wait failed; rerun with error capture passed, and the final expanded browser test passed after Auto fit assertions. No product change was made to mask either test setup/timing issue.

## Next development inventory (investigation only)

Implemented: administrator Auth/server authority, catalog/search/categories, ownership-aware text/candidate drafts, 8/16/32 creation, manual Gemini helper, photo upload/replacement/framing, creator direct publication plus independent review paths, private/public transitions, previous-approved-publication restore, trash/private restore, and server-recorded recent content activity.

Explicitly unavailable in the current UI/API: total-play aggregates, member counts/directory/restrictions, global comment moderation, blocking RPC, delegated staff/Owner capability, saved workspace settings. Permanent deletion is separately code-blocked. The settings page's generic independent-review text should eventually distinguish creator-admin direct publication; this review does not change policy.

| Priority | Candidate | Impact / difficulty | Prerequisite |
| --- | --- | --- | --- |
| 1 | Real play-count aggregates and clear metric scope | High / medium-high | Define actual play events, guest/idempotency rules, authoritative aggregate/read RPC; avoid invented numbers |
| 2 | Comment moderation and member directory | High / high | Confirm underlying data/references, least-privilege RPC/RLS, privacy/retention and moderation audit; design separately |
| 3 | Blocking/restriction workflow | High / high | Explicit policy and dedicated server transitions, public access enforcement and recovery tests |
| 4 | Delegated staff permissions | High / very high | Separate Owner authority model, directory, least privilege and revoke/audit behavior |
| 5 | Persisted workspace settings/policy wording | Medium / medium | Define allowed settings and admin write contract; policy wording must match installed behavior |
| Blocked | Permanent deletion activation | High / very high | Official physical-write drain/exclusion contract covering every writer; no false-barrier bypass |

## User next steps

Review the listed runtime changes, then user-controlled commit/push/deployment if desired. No SQL is needed. On Staging, edit one existing candidate and one cover without uploading: save independent PC/mobile Fit/Fill/zoom/drag, reopen, then publish through the existing workflow and inspect one real VS and champion display per device. Confirm private/trash items stay excluded and permanent delete stays disabled. Physical photos and existing published revisions must remain intact. Live verification remains pending.
