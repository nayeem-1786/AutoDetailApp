# Smart Details — 13-Item Roadmap (Post-Money-Unify Rollback)

> **Source of truth** for the active bug-and-feature roadmap captured 2026-05-15
> immediately after the Money-Unify-3 + Unify-4 rollback. This document is the
> working contract between you and CC sessions. Each session reads the relevant
> item before starting, and **this document is updated at the end of each session
> to reflect reality** (decisions made, scope changes, files touched, items closed).
>
> If a session changes scope or surfaces new findings, update this doc as the
> first step before moving on. The document is wrong only if it doesn't match
> what's been built.

**Document version:** v3.8 (2026-05-19, evening) — Items 1, 6, 12, 15a, 15b, 15c completed; 15d deferred; 15e scoped; **Item 15f COMPLETE (all sub-layers + Phase 1 Layers 8a + 8b + 8c + 8d + 8d-bis + 8e + 8f done — Phase 1 closed on `10f7cffb`)**; **Item 15g COMPLETE (all 5 layers done)**. **v3.8 adds**: 2026-05-19 JSONB fix cluster — `ai.txt` P0 fix (`1b96405f`, merge `feef903d`) and coupon-enforcement P1 fix (`a55335de`, merge `17ebbd48`) both shipped today + cross-consumer drift resolved via new shared helper `src/lib/utils/coupon-enforcement.ts`. Companion audit `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md` on branch `audit/voice-poll-and-coupon-enforcement` (`83bfae64`). New follow-ups surfaced today: migration LIKE-pattern recurring failure (manual force-fix needed twice — homepage-settings + coupon-enforcement), SemVer / version tracking not implemented, voice-calls-poll cron P2 fix scoped, QBO P1 batch deferred pending QuickBooks reconnection plan. **v3.7 adds (carried forward)**: Roadmap Snapshot summary (13-item status table + roll-up) and Out-of-Scope Workstreams section covering SMS AI v2, Next.js security upgrade, original triage, infra hardening, codebase JSONB audit, and process improvements shipped 2026-05-18 → 2026-05-19.
**Last session updated:** 2026-05-17 — **Item 15f Phase 1 Layer 8f landed — Phase 1 COMPLETE — Item 15f COMPLETE**: Tests-only session, zero production code changes. Three deliverables: **(1)** new end-to-end integration test file `src/lib/appointments/__tests__/edit-flow.integration.test.ts` (14 cases) joins load → drain → save and pins cross-layer invariants — source=appointment + source=job (Option G4) happy paths, source=job null appointment_id refusal, modifier-only edits, combined service+modifier edits, all-services-removed save block, bogus UUID 404, parameterized status-guard lockstep (`completed`/`cancelled`/`no_show`), drain↔cascade pricing parity for mobile_fee synthesis. **(2)** Extended `pos-workspace-products-gating.test.tsx` with the missing Layer 8d gates — barcode-scanner short-circuit (captures `onScan` callback via hoisted mock; verifies edit-mode never hits the barcode-lookup API) + global-search filteredProducts (ProductGrid never mounts in edit mode). +3 cases. **(3)** New `docs/dev/PHASE_1_TEST_COVERAGE.md` — per-surface × test-type coverage matrix (50+ rows across all Phase 1 layers), 9 documented intentional gaps (G1-G9) with rationale, file-to-test mapping for future maintenance, hand-off notes. **Layer 4 ESLint regression verified**: rule at `'error'` (eslint.config.mjs:76), zero `eslint-disable services/no-bespoke-pricing` comments in `src/`, both new/modified test files lint clean. +17 tests net new. **1503/1503 vitest pass** (was 1486 at Layer 8e). typecheck 0 new errors on touched files (2 pre-existing unrelated test errors persist); ESLint 0 errors / 98 warnings unchanged baseline; production build compiled clean. **Phase 1 is now CLOSED.** Item 15f's overall scope (engine + hook + booking/voice/SMS migrations + ESLint rule + edit-via-POS pivot for operator surfaces) is complete.

**Earlier 2026-05-17** — **Item 15f Phase 1 Layer 8e landed (dead modal deletion + Layer 3a-i revert + appointment time precision fix)**: Two atomic deliverables in one session. **Deliverable 1 (planned cleanup)**: deleted `<EditServicesModal>` (Item 15a's bespoke modal) and `<EditServicesDialog>` (Layer 3a-i's POS Jobs-card dialog) — both unreachable since Layer 8d routes their triggers to POS edit mode. Deleted their orphan test files. Removed imports + mounts + dead state from Admin Appointment dialog and POS Jobs card. Pruned the only sanctioned `eslint-disable services/no-bespoke-pricing` comment (it lived inside the deleted modal). Grep confirms ZERO references to either component name remain in `src/`. **Deliverable 2 (UAT-driven fix)**: Walk-in path was writing `scheduled_start_time` at HH:MM:SS (seconds-precision via `Intl.DateTimeFormat(... second: '2-digit' ...)`), breaking the Admin Appointment dialog's HTML5 `<input type="time">` step=60 validator. Mini-audit confirmed walk-in was the only broken creation path (online booking, voice agent, quote convert, reschedule routes all already write minute-precision). Three fixes: (a) walk-in path now writes `HH:MM:00`; (b) Admin dialog adds local `toTimeInputValue` helper that truncates to HH:MM for the HTML5 input (defense-in-depth against future drift); (c) one-time backfill migration `20260518000000_truncate_appointment_scheduled_times_to_minute.sql` (idempotent `date_trunc('minute', ...)` with WHERE filter on seconds <> 0). `actual_start_time` / `actual_end_time` intake-precision untouched. +4 tests net new. 1486/1486 vitest pass (was 1500 at Layer 8d-bis; -14 from deleted test files, +4 new). Layer 8f (Phase 1 comprehensive tests) was the next sequential session — landed same day.

**Earlier 2026-05-17** — **Item 15f Phase 1 Layer 8d-bis landed (UAT fix-up)**: Four targeted fixes from Layer 8d UAT. **Fix 1 (CRITICAL, Option G4)**: Jobs-card deep-link `id` flipped from APPOINTMENT_UUID to JOB_UUID — Layer 8d's appointment UUID 404'd the jobs/checkout-items endpoint. checkout-items now returns `appointment_id`; drain resolves `ticket.sourceId` from response.appointment_id for source=job (the invariant "sourceId is always appt UUID" preserved — change is WHERE it gets populated). **Fix 2 (CRITICAL)**: Register tab favorite/quick-add grid was the missed 4th product-add surface; gate now extended (3→4 surfaces). Product favorites get `opacity-40 cursor-not-allowed` in edit mode + toast on click; service favorites unaffected. **Fix 3 (Audit Finding #5)**: `no_show` added to terminal-status refusal list in both load endpoint AND cascade module — lockstep. **Fix 4 (cosmetic)**: Admin Appointment dialog "Edit in POS" button restyled to match the admin shell's "Open POS" header pattern (`MonitorSmartphone` icon, bordered button) and promoted to top-right of dialog (`absolute right-12 top-4`); in-Services text link removed. +5 new test cases + existing edit-services-deep-link rewrite. 1500/1500 vitest pass. Layer 8e (delete dead modals) is next sequential session.

**Earlier 2026-05-17** — **Item 15f Phase 1 Layer 8d landed**: Jobs-card Services tile + Admin Appointment "Edit Services" button (previously disabled in Layer 4) both route to `/pos?source=...&id=<APPOINTMENT_UUID>&returnTo=...`. Critical: `id` is appointment UUID even for source=job since Layer 8c's Save POSTs to `/api/pos/appointments/[id]/services` unconditionally. *(Layer 8d-bis later flipped this for source=job — see entry above.)* Jobs page gains `?jobId=<id>` query-param hop so returnTo lands on the specific job detail. Layer 8c polish: Products tab disabled in edit mode (3 gates: tab button, global search, barcode scan) — cascade endpoint doesn't accept products, so adding them in edit mode would silently drop on save. *(Layer 8d-bis added the 4th gate.)* EditModeBanner label revamped from UUID prefix to "Editing Appointment: {customer} — {scheduled date}" with 4-tier fallback hierarchy via exported `buildEditLabel`. Banner data plumbing: new `TicketState.editSourceScheduledDate` field, optional `scheduledDate` param on `ENTER_EDIT_MODE`, both load endpoints (appointments/[id]/load + jobs/[id]/checkout-items) widened with `scheduled_date`. +16 tests across 4 new/modified files. 1492/1492 vitest pass.

**Earlier 2026-05-17** — **Item 15f Phase 1 Layer 8c landed (combined backend + frontend)**: cascade endpoint Zod widened with 6 optional `.optional().nullable()` modifier fields (coupon/loyalty/manual triples) using three-state encoding (omitted→preserve, null→clear, value→write); superRefine mirrors `appointments_manual_discount_coherent` DB CHECK. Service-edit helper writes modifier columns conditionally (services-only payload still preserves per Layer 15g-iii); `anyModifierEdit` short-circuits the legacy `discount_amount` fallback so clearing all modifiers writes 0. Audit log `field` flips to `'services_and_modifiers'` with before/after diff when any modifier touched. Frontend: new `editInitialSnapshot` TicketState field + `MARK_EDIT_INITIAL_STATE` reducer action stamped by drain as final dispatch (post-coupon-revalidate, so cart doesn't flash dirty on hydration). `<EditModeBanner>` amber pill at top of Sale workspace surfaces "Editing Appointment #XXX" + "Unsaved changes" badge. `<TicketActions>` editMode branch renders [Cancel | Save Changes] (no Hold, no Checkout); Save POSTs services + 6 modifier fields to cascade endpoint with manual discount percent-resolved client-side via `resolveManualDiscountAmount`; Cancel shows confirmation when dirty. F2 keyboard shortcut gated on `!editMode`. **Modifier UI (coupon/loyalty/manual) stays visible + editable in edit mode** per LOYALTY_REVERSIBILITY_AUDIT — corrects original audit §7's incorrect "suppress loyalty" recommendation. Pre-transaction edits don't touch `customers.loyalty_points_balance` / `loyalty_ledger` / `coupons.use_count`. +36 tests across 4 new/modified files. 1476/1476 vitest pass.
**Total items:** 8 active + 6 done + 1 closed (Items 1, 6, 12, 15a, 15b, 15c done; Item 5 closed: NFC already enabled per Stripe support)

---

## Roadmap Snapshot (2026-05-19)

One-screen status summary across the 13-item feature scope plus the out-of-scope workstreams shipped 2026-05-18 → 2026-05-19. Authoritative item detail still lives in the per-item sections below.

### 13-Item Status Table

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | POS Customer Search → Create Smart Prefill | ✅ done | Shipped 2026-05-15 (`6b0413dd`). |
| 2 | Tip on Full-Payment Stripe Payment Link | ⚪ not started | Tip cluster (with 3 + 4). |
| 3 | Receipt Tip Display Audit + Fixes | ⚪ not started | Tip cluster. |
| 4 | Cash Tip Capture + Tip Splitting + Tip Reporting | ⚪ not started | Tip cluster. |
| 6 | Deposit / Paid-in-Full Label Unification | ✅ done | Shipped 2026-05-15. |
| 7 | Job Timer with Pause + Reason Modal | ⚪ not started | — |
| 8 | Assign Customer to Walk-In Ticket Post-Completion | ⚪ not started | — |
| 9 | BT Scanner Intermittent Failures | ⚪ not started | — |
| 10 | Swipe-to-Delete on Inventory Counts (iPad) | ⚪ not started | — |
| 11 | Keypad / Scan-Each Toggle for Inventory Counts | ⚪ not started | — |
| 12 | Appointments in POS Footer + Edit Appointment from POS | ✅ done | Shipped 2026-05-15. |
| 13 | Detailer Mobile Link (Full Mobile Workflow) | ⚪ not started | Largest greenfield build; revisit ROI before scheduling. |
| 14 | Intake Control Panel + Per-Vehicle Zones + Photo Approval | ⚪ not started | Second-largest greenfield. |
| 15a | Edit Services in Admin Appointment Dialog (cascade to job) | ✅ done | Shipped 2026-05-16 (`8726053d`); bespoke modal deleted Layer 8e — canonical surface is now POS edit-via-deep-link. |
| 15b | Cancel Appointment from POS Appointments Tab | ✅ done | Shipped 2026-05-16. |
| 15c | "Change Time" Affordance on Jobs Card | ✅ done | Shipped 2026-05-16. |
| 15d | "Today's Tickets" Combined View | ⏸ deferred | Re-evaluate after 15e ships. |
| 15e | POS Appointments Modal: Full Capability Parity with Admin | ⚪ not started | Unblocks 15d. Next surface-feature work. |
| 15f | Service Picker Engine: canonical resolver + hook + migration | ✅ done | Phase 1 complete 2026-05-17 (`10f7cffb`). All layers + Phase 1 sub-layers 8a–8f shipped. 221 reducer tests + comprehensive coverage in Layer 8f. |
| 15g | Lifecycle Persistence: Discount / Coupon / Loyalty across Quote → Job → Txn | ✅ done | All 5 sub-layers complete 2026-05-17; unblocked Phase 1 of 15f. |

### Roll-up

- **Done (9):** 1, 6, 12, 15a, 15b, 15c, 15f, 15g — and prior closure of Item 5 (NFC already enabled per Stripe support).
- **In progress (0):** 15f's Layer 8f was the last in-flight sub-layer; closed 2026-05-17.
- **Deferred (1):** 15d (gated on 15e).
- **Not started (10):** 2, 3, 4, 7, 8, 9, 10, 11, 13, 14, 15e.
- **Blocked (0):** nothing currently blocked.

---

## Out-of-Scope Workstreams (Infrastructure, Security, AI Agents)

Workstreams active between 2026-05-17 → 2026-05-19 that do not map to any item in the 13-item table. Same status conventions; same per-row note discipline.

### Workstream A — SMS AI v2 (6-layer rollout)

Motivated by the autoreply audit (2026-05-19 `a0814a90`) which surfaced an intermittent toggle + stale-response bug visible in the Nayeem Khan / May 18 production conversation. V2 replaces the single-shot auto-responder with a tool-using Anthropic agent that reuses the 14 voice-agent endpoints catalogued in the design audit.

| Sub-item | Status | Notes |
|---|---|---|
| Audit + design (autoreply audit + v2 design) | ✅ done | Shipped 2026-05-18, commits `a0814a90` + `66a8996e`. 7 design questions answered. |
| Layer 1+2: Foundation (helpers, tools, prompt, flags) | ✅ done | Shipped 2026-05-18, merged `0147c3c5` (Layer 1+2 base `aed37e7f` + system-prompt refactor `135b2944`). 119 new tests, feature flag defaults disabled. |
| Layer 3: Agent runner (tool loop, prompt caching, timeouts) | ⚪ not started | Next session. ~2–3hr CC work. |
| Layer 4: Twilio webhook integration + feature flag routing | ⚪ not started | Must re-check `is_ai_enabled` at outbound-send time (mid-conversation operator toggle protection). |
| Layer 5: Cutover (delete specialty pivot block, delete `staff_notification_inbound_specialty` template) | ⚪ not started | Closes the Ferrari-loop bug visible in production conversation Nayeem Khan / May 18. |
| Layer 6: Tests + observability | ⚪ not started | Final layer. |

### Workstream B — Next.js Security Upgrade

| Sub-item | Status | Notes |
|---|---|---|
| Phase 1 audit + restore-point tag | ✅ done | Shipped 2026-05-18 (`bb74702f`). Audit doc at `docs/dev/NEXTJS_15.5.18_UPGRADE_AUDIT.md`. Tag `pre-nextjs-15.5.18-upgrade` at SHA `d3d3f6d6`. Risk rating MEDIUM. Three actionable findings: `images.remotePatterns` wildcard, dead `skipTrailingSlashRedirect`, React `19.2.3 → 19.2.6` piggyback. |
| Phase 2: Actual 15.3.3 → 15.5.18 upgrade | ⚪ not started | Closes CVE-2025-66478 (CVSS 10.0 RCE) + 22 other CVEs. Half-day CC work per audit estimate. |
| Phase 3: Production deploy + monitoring | ⚪ not started | Post-Phase-2. ~1.5–2h plus 30-min monitoring window. |

### Workstream C — Original Triage (from 2026-05-18 morning)

| Sub-item | Status | Notes |
|---|---|---|
| Fix #1: Anthropic API key rotation | ✅ done | Rotated 2026-05-18 morning. PM2 restart with `--update-env` required after sourcing `.env.local`. |
| Fix #2: Google Places cron 502s | ✅ done | Resolved 2026-05-18 night. Two-part fix: (1) `82cbcffe` normalized double-encoded `google_place_id` (B + C hardening); (2) `9a9e4a02` / merge `3da3183e` fixed the underlying `JSON.stringify`-into-JSONB write-path bug in the homepage-settings PUT route — the true root cause (not the Place ID itself; the old ID `ChIJf7qNDhW1woAROX-FX8CScGE` was canonical all along). Cron verified end-to-end: rating 4.9, count 38, reviews fetched 5. |
| Fix #3: ElevenLabs intermittent timeouts | ⚪ not started | `voice-calls-poll` cron occasionally times out 10s connecting to `api.elevenlabs.io`. Audit-only session pending. |

### Workstream D — Infrastructure Hardening

| Sub-item | Status | Notes |
|---|---|---|
| Deploy script hardening (4 guards) | ✅ done | Shipped 2026-05-18 at `/usr/local/bin/deploy-smartdetails`. Guard 1: unset `NODE_ENV` at script top. Guard 2: reject `.env.local` with `NODE_ENV=` line. Guard 3: explicit `--include=dev` on `npm ci`. Guard 4: devDep sanity check pre-build. |
| Credential rotation (Stripe, Supabase service role, Twilio) | ✅ done | Shipped 2026-05-18 alongside security cleanup. PM2 logs flushed (had been dumping env to disk). Twilio rotated in both `.env.local` AND Supabase Auth provider settings per memory rule. |
| `CRON_SECRET` placeholder cleanup | ✅ done | Commented out 2026-05-18 night on both VPS and MBP `.env.local`. Variable was unused in source (zero grep hits). Kept commented as reserved-but-unused for future drip campaigns. |
| Supabase CLI sync repair | ✅ done | Repaired Session 1B 2026-04-25. 229/229 migrations tracked. `supabase db push --linked` works cleanly. `DB_SCHEMA.md` regenerated to 3,177 lines / 107 tables. Going forward: ALL schema changes via `supabase migration new`, never SQL Editor. |
| Twilio SMS restore via verified backup Campaign | ✅ done | Restored 2026-05-04. `.env.local` updated. End-to-end delivery confirmed. |
| BillionMail self-host setup | ✅ done | Hosted on VPS `31.220.60.157`. 11 mailboxes across `stickerchimp.com` + `121mediasolutions.com`. Outbound via Mailgun SMTP. Admin at `https://31.220.60.157:5679/MSObNpSX`. |

### Workstream E — Codebase JSONB Audit + Fixes

| Sub-item | Status | Notes |
|---|---|---|
| Homepage settings JSONB double-encoding fix | ✅ done | Shipped 2026-05-18 (`9a9e4a02`, merge `3da3183e`). 15 new tests. Backfill migration `20260518225000`. Migration's strict LIKE pattern did not normalize the original row in practice — manual UPDATE was used; pattern issue logged but not urgent (data is clean). |
| Admin PUT routes JSONB anti-pattern audit | ✅ done | Shipped 2026-05-18 evening on branch `audit/admin-put-jsonb-encoding` (`cf7aaa90`). Doc at `docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md`. Findings: 5 confirmed-broken (1 P0 customer-facing `ai.txt`, 4 P1 QBO module + shared `lib/qbo/` writer), 4 safe, 2 out-of-scope flags (`voice-calls-poll` cron, coupon-enforcement admin page). |
| P0 fix: `ai.txt` JSONB write + migration + regression test | ✅ done | Shipped 2026-05-19 (`1b96405f`, merge `feef903d`). 16 new tests across admin PATCH route + public `/ai.txt` defensive read. Migration `20260519035517_normalize_ai_txt_content_double_encoding.sql` (idempotent backfill — was no-op since the production row was clean). Production UAT verified: `curl /ai.txt` serves clean directives, Save round-trip in admin tab preserved len=394 (no corruption). |
| P1 fix: coupon-enforcement JSONB write + cross-consumer drift | ✅ done | Shipped 2026-05-19 (`a55335de`, merge `17ebbd48`). New shared helper `src/lib/utils/coupon-enforcement.ts` (canonical reader; +78 LOC). 3 consumer sites refactored — admin form (`src/app/admin/settings/coupon-enforcement/page.tsx`), `validate/route.ts`, and `promotions/available/route.ts` (the latter was the cross-consumer drift source — previously silently treated `'"hard"'` as no-op enum). 24 new tests (`+24 new`, baseline 1670 → 1694). Migration `20260519042312_normalize_coupon_type_enforcement_double_encoding.sql` ran but did not match due to LIKE-pattern issue (same as homepage-settings); row force-fixed with direct SQL using a length-based guard. Production UAT: hard mode now persists across reload (was the user-visible bug — see audit §2). |
| P1 fix: QBO module coordinated migration (4 routes + 2 lib modules + migration + tests) | ⏸ deferred | Must be coordinated — half-migrated state would break QBO entirely. Self-consistent today (write `JSON.stringify`, read strip-regex). **Not in active use; QBO disconnected from Smart Details at this time. Deferred until reconnection planned.** |
| P2 fix: `voice-calls-poll` cron JSONB write + migration | ⚪ not started | Audit completed 2026-05-19 on branch `audit/voice-poll-and-coupon-enforcement` (`83bfae64`). Doc at `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md`. Confirmed self-consistent in production today (write `JSON.stringify(now)` paired with `JSON.parse` on read; both halves work end-to-end because the value is a doubly-encoded ISO timestamp string that `JSON.parse` happens to unwrap cleanly). Sole reader/writer is the cron itself. Becomes acute only if a refactor unilaterally drops one half. Fix sketch in audit §1.7 — mirror the ai.txt pattern with defensive read shim. ~30–45 min effort. |
| Migration LIKE-pattern fix — homepage-settings + coupon-enforcement + ai.txt | ⚪ not started | Recurring issue across 3 migrations: the LIKE pattern ``'"\"%\""'`` written by CC fails to match production rows that visibly should match. Manual force-fix via direct UPDATE bypassing the LIKE has been required twice (homepage-settings 2026-05-18 night, coupon-enforcement 2026-05-19 evening). Tests pass against fixtures but production matching fails. Root cause unknown — possibly fixture vs production encoding difference, possibly PostgreSQL `LIKE` escaping behavior between Supabase hosted vs CLI-applied. Audit to determine root cause + update migration template. ~1hr investigation. Should land before the next similar JSONB backfill (e.g., voice-calls-poll P2). |

### Workstream F — Process Improvements

| Sub-item | Status | Notes |
|---|---|---|
| CC session-end discipline | 🟡 in progress | Per `CLAUDE.md`: update `CHANGELOG` → commit conventional prefix → push → `rm -rf .next` → print "Session complete." UPDATE 2026-05-19: also update `ROADMAP-13-ITEMS.md` when a roadmap item moves. |
| Pre-existing typecheck residue cleanup (29 errors in legacy test files) | ⚪ not started | 27 pre-existing on `main` (`quote-service.modifiers.test.ts`, `catalog-browser-custom-routing.test.tsx`) + 2 CC-introduced during SMS AI v2 Layer 1+2 (`vi.fn` arity + `sendSmsMock` type). Cleanup tied to Layer 3 start. |
| Codebase sweep: dev/prod shared-DB testing pattern | ⏸ deferred | Per 2026-05-18 night learning: when fixing write-path bugs, test from dev only until prod is deployed — shared DB means prod's broken code wins races against local SQL fixes. Worth a `CLAUDE.md` note. |
| SemVer / version tracking implementation | ⚪ not started | Surfaced 2026-05-19. Smart Details ships without version tracking (`pm2 status` shows version `N/A`). Cannot correlate deploys, changelog entries, or production state with specific releases. Implement SemVer in `package.json`, add git tagging discipline, optionally adopt `standard-version` or `release-please` for automated bump + tag + changelog. Display version in admin footer + deploy script output. Half-day work. |
| Migration template hardening (anti-pattern documentation) | ⚪ not started | Surfaced 2026-05-19. Companion to the Workstream E LIKE-pattern root-cause investigation. Once root cause known, document a canonical "JSONB string defensive backfill" migration template that uses length-based guards alongside (or instead of) LIKE patterns. Add to `CLAUDE.md` as a standing reference so future similar fixes don't recreate the issue. Tracked here (F) for the documentation half; the investigation half lives in Workstream E. |

---

## Suggested Next Move

Two JSONB P1 fixes shipped today (`ai.txt` + coupon-enforcement). Remaining out-of-scope work:

**Track 1 — Feature roadmap continuation:** 15e (POS appointment-modal parity) is next; unblocks 15d. Then the tip cluster (2 / 3 / 4) since they share infrastructure. Items 7–11 are independent small/medium fixes. 13 and 14 are the largest greenfield builds — best saved for last.

**Track 2 — Out-of-scope workstreams:**
- SMS AI v2 Layer 3 (agent runner) is the highest-leverage non-feature work — directly closes the active Ferrari-loop production bug once Layers 4–5 ship.
- `voice-calls-poll` cron P2 fix is small (~30–45min) and self-consistent today; defer to convenient slot.
- QBO P1 batch deferred pending QuickBooks reconnection plan.
- Next.js Phase 2 (security upgrade) is half-day; CVE-2025-66478 is CVSS 10.0 RCE but no evidence of active exploitation.
- Original triage Fix #3 (ElevenLabs timeouts) audit-only session pending.
- Migration `LIKE`-pattern root-cause investigation + template hardening (~1hr) before the next similar fix, to avoid a third force-fix.
- SemVer + version tracking implementation (half-day, new follow-up surfaced 2026-05-19).

Track 2 should generally run before Track 1 resumes — security + reliability foundation first.

---

## How to read this document

Each item below has the following structure:

- **Status:** `not started`, `in progress`, `blocked`, `done`, `deferred`
- **Severity:** S0 (revenue-affecting), S1 (customer-experience), S2 (operator-experience), S3 (nice-to-have)
- **Effort:** estimated CC sessions
- **Wave:** which logical grouping it belongs to (1–5)
- **Depends on:** what must be completed first
- **Problem statement:** the bug or feature need in 1-3 sentences
- **Acceptance criteria:** what "done" looks like
- **Out of scope:** what we deliberately don't do in this session
- **Files likely affected:** rough inventory (CC verifies in-session)
- **Session plan:** sub-prompts for each session if multi-session
- **Notes / decisions log:** running record of design decisions per item

After every CC session, update the **Status**, **Notes**, and **Files likely affected** sections.

---

## Wave 1 — Quick Wins

Small, contained, low-risk sessions. Good momentum builders post-rollback.

### Item 1 — POS Customer Search → Create with Smart Prefill

- **Status:** done (2026-05-15)
- **Severity:** S2
- **Effort:** 1 small session (~45-60 min) — actual: 1 session
- **Wave:** 1
- **Depends on:** none

**Problem statement:**
When searching for a customer in the POS via the Find Customer modal and no
matches are returned, clicking "New Customer" opens a blank form. The user
has to retype the same value they just searched. The input may be a phone
number, name, or email — the new customer form should receive that value
in the appropriate field automatically.

**Acceptance criteria:**
- When the Find Customer search returns no results AND the user clicks
  "New Customer," the New Customer modal opens with the search query
  pre-populated in the correct field.
- Smart routing logic:
  - All digits (with optional `()`, `-`, `space`, `+`): drops into **Mobile**
    (formatted to `(XXX) XXX-XXXX`)
  - Contains `@`: drops into **Email**
  - Otherwise: drops into **First Name** (single-word) or **First Name + Last Name**
    (multi-word, split on first space)
- If the search input was just whitespace, no prefill (treated as empty).
- Existing flow (with-results, Guest button, etc.) remains unchanged.

**Out of scope:**
- Backend changes — pure client-side prefill via component state.
- Customer-type defaults (Enthusiast / Professional stay as-is — operator picks).
- SMS Consent default (stays unselected — operator confirms).
- Any change to the search algorithm itself (only how results-not-found case routes).

**Files likely affected:**
- `src/lib/search/customer-create-routing.ts` (new — pure `routeSearchInput` helper)
- `src/lib/search/__tests__/customer-create-routing.test.ts` (new — 24 unit tests)
- `src/app/pos/components/customer-lookup.tsx` (onCreateNew signature extended to pass trimmed query up)
- `src/app/pos/components/customer-create-dialog.tsx` (new `initialQuery` prop + prefill-once effect)
- `src/app/pos/components/ticket-panel.tsx` (POS register-tab wiring — local prefill state + initialQuery pass)
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` (POS quote-builder wiring — same pattern)
- `src/app/pos/jobs/components/job-detail.tsx` (Change Customer lookup — comment-only; relies on arity-relaxed callback compatibility)
- `src/app/pos/components/__tests__/customer-create-dialog.test.tsx` (6 dialog prefill tests added; helper extended to accept `initialQuery`)
- `docs/dev/FILE_TREE.md` (new helper + test paths registered)

**Session plan:**
- Single session.
- Prompt: read the two modal components, identify the state passing from
  Find Customer to New Customer, add the routing helper, wire it through.
- Manual UAT checklist:
  - Enter `3105551212` → no results → New Customer → verify Mobile filled
  - Enter `john@example.com` → no results → New Customer → verify Email filled
  - Enter `Tom` → no results → New Customer → verify First Name filled
  - Enter `Tom Jones` → no results → New Customer → verify First Name=Tom, Last Name=Jones
  - Enter empty → New Customer → verify nothing prefilled

**Notes / decisions log:**
- 2026-05-15 — Session 1 (this session):
  - **Helper location:** `src/lib/search/customer-create-routing.ts` (not `src/lib/utils/` as the prompt suggested). Reason: `src/lib/search/customer-search.ts` already exists as a server-side Supabase executor and reuses primitives from `src/lib/search/tokenize.ts` — the routing helper sits naturally alongside.
  - **Phone-shape detection:** reused existing `isPhoneQuery(query, minDigits)` from `tokenize.ts` per Rule 11 (component reuse). Called with `minDigits=7` and an additional explicit upper bound of 15 digits to match the spec.
  - **International phone shapes** (`+44 20 1234 5678`, 12 digits, doesn't match US 10/11): preserved verbatim in the Mobile field. The `formatPhoneInput` helper used by the input's onChange would mangle non-US input (caps at 10 digits, US-only `(XXX) XXX-XXXX` shape). Operator can correct or convert to E.164 manually. This is the deliberate interpretation of the spec line "pass through `normalizePhone()` for international shapes" — `normalizePhone()` itself returns `null` for non-US, which would discard the value entirely.
  - **Re-apply guard:** the create dialog applies the prefill exactly once per `open=true` transition via a `prefillAppliedRef`. Reset on `open=false`. Prevents operator edits from being overwritten if the parent re-renders with the same `initialQuery`.
  - **`job-detail.tsx`** "Change Customer" lookup ignores the new query argument and continues to error-toast on New Customer — that path doesn't expose creation locally. The `(searchQuery: string) => void` signature is satisfied by the existing `() => { ... }` callback (TS arity-relaxation).
  - **Test surface:** 24 unit tests on the pure helper + 6 integration tests on the dialog. All routing branches, plus 7-digit minimum, 16-digit rejection, international preserve, multi-word join, whitespace handling.
  - **Verification:** `npm run typecheck` shows 7 errors but all in pre-existing in-progress work (Item 6 `receipt-composer.test.ts`, Item 12 `appointments/page.tsx`) — none in files this session touched. `npm run lint` shows 90 warnings (0 errors) — all pre-existing baseline. `npm run build` fails at the Item 12 missing `reschedule-appointment-dialog` import — not from this session's changes. All 110 tests across `src/lib/search` + `src/app/pos/components/__tests__` pass.
  - **Commit scope:** staged only files this session touched (helper, tests, modal components, docs). The in-progress receipt-composer + POS appointments files were left on the working tree for their respective sessions.

---

### Item 6 — Deposit / Paid-in-Full Label Unification

- **Status:** done
- **Severity:** S2
- **Effort:** 1 small session (~45-60 min)
- **Wave:** 1
- **Depends on:** none

**Problem statement:**
On receipts, current labels are "Deposit (Online)" and "Deposit (In-Store)" —
adds receipt length and makes a distinction that isn't operationally useful.
We want unified "Deposit" label except when the deposit equals or exceeds the
total (including tip), in which case the label flips to "Paid In Full."

**Acceptance criteria:**
- Anywhere a receipt currently shows "Deposit (Online)" or "Deposit (In-Store),"
  the new label shows just "Deposit."
- When the deposit amount ≥ ticket total (subtotal + tax + tip), the label
  shows "Paid In Full" instead of "Deposit."
- Applies consistently across all 4 receipt surfaces:
  - Thermal printer receipt
  - Email receipt (PDF)
  - Email receipt (HTML)
  - SMS receipt link (HTML)
  - Browser-printed copy
- No change to the underlying data — deposit storage and reconciliation are
  unchanged, only display.

**Out of scope:**
- Changing internal logic that distinguishes online vs in-store deposits
  (kept for accounting purposes if needed later).
- Adding the "Paid In Full" status to anywhere outside receipts (POS UI,
  jobs view, etc.) — receipts only.

**Files likely affected (actual, post-session):**
- `src/lib/data/receipt-composer.ts` — added `formatDepositLabel` helper +
  `RECEIPT_VOCAB.DEPOSIT` / `PAID_IN_FULL` constants (replaced
  `DEPOSIT_ONLINE` / `DEPOSIT_IN_STORE`); rewired `buildSuggestedPaymentLabel`
  and `buildSuggestedLabelForPayment` to accept `ticketTotalCents` and resolve
  via the helper; extended `buildCombinedPaymentLabel`'s `isMetaPrimary` to
  recognize the new labels.
- `src/app/pos/lib/receipt-template.ts` — computed `ticketTotalCents`
  (subtotal+tax+tip) once per receipt for both thermal (line 728) and HTML
  (line 1133) renderers; threaded into payment-row label builder calls.
- `src/app/(public)/receipt/[token]/page.tsx` — same threading on the public
  receipt page (line 397).
- `src/lib/data/__tests__/receipt-composer.test.ts` — 7-case
  `formatDepositLabel` suite + updates to existing label-assertion tests; 4
  new threshold cases on `buildSuggestedLabelForPayment` (UAT scenarios
  B/C/D, plus default-zero back-compat).
- `src/lib/data/__tests__/__fixtures__/receipt-baselines/` — regenerated
  10 fixtures (HTML + thermal for scenarios 03, 04, 05, 08, 12) via
  `npx tsx scripts/capture-receipt-baselines.ts`.

**Session plan:**
- Single session.
- Audit first: identify all sites rendering the current deposit labels.
- Refactor to a shared `formatDepositLabel(depositAmount, totalAmount)` helper.
- Apply to all surfaces.
- UAT checklist:
  - $230 deposit on $552 ticket → "Deposit $230.00"
  - $552 deposit on $552 ticket → "Paid In Full $552.00"
  - $552 deposit on $460 ticket + $92 tip = $552 total → "Paid In Full"
  - Test all 4 receipt surfaces show consistent output

**Notes / decisions log:**
- Confirmed 2026-05-15: no need to distinguish online vs in-store deposits
  on the customer-facing receipt.
- 2026-05-15 (session): helper landed in `src/lib/data/receipt-composer.ts`
  (existing receipt-shaping module — Component-Reuse Rule 11). Signature is
  `formatDepositLabel({ depositCents, totalCents })`, defensive on edge
  cases: zero deposit → "Deposit" (never flips to Paid In Full on a
  zero-dollar row); zero total → "Deposit" (no comparison basis).
- 2026-05-15 (session): `total` for the threshold is `subtotal + tax + tip`
  per spec — discount is intentionally NOT subtracted. Confirmed across all
  3 render sites (thermal, HTML, public page).
- 2026-05-15 (session): the composer's internal `suggested_*` fields on
  `RenderedPaymentLine` keep using the default-zero threshold (always
  "Deposit") because `composeReceiptPaymentLines` doesn't have the totals.
  Renderers all use `buildSuggestedLabelForPayment` (the separate helper)
  which DOES receive `ticketTotalCents` — and they're the only consumers
  that face the customer.
- 2026-05-15 (session): all 4 surfaces share `buildSuggestedLabelForPayment`,
  so the threshold flip is consistent across thermal print, email HTML
  receipt, SMS receipt link, browser-print, and the public token URL. No
  separate PDF code path exists — email receipts are HTML.
- 2026-05-15 (session): legacy meta-primary label list in
  `buildCombinedPaymentLabel` updated to `DEPOSIT | PAID_IN_FULL |
  PAY_LINK_ONLINE`. `PAID_IN_FULL` (payment-row primary) is intentionally
  distinct from `PAID_IN_FULL_INDICATOR` ("Paid in Full ✓", the balance-zero
  banner below the payment block) — different surfaces, different
  capitalization.
- 2026-05-15 (session): 1024/1024 vitest tests pass post-change. 10 receipt
  fixtures regenerated and byte-equality tests re-pass. Typecheck + lint +
  build clean (0 errors; lint warnings are pre-existing Money-Unify
  baseline, not in code I touched).

---

### Item 12 — Appointments in POS Footer + Edit Appointment from POS

- **Status:** done
- **Severity:** S1
- **Effort:** 1 medium session (~2 hours) — actual: 1 session
- **Wave:** 1
- **Depends on:** none

**Problem statement:**
Today, appointments are editable only from the Admin Appointments page. Staff
need to reschedule customer appointments from the POS surface they're working in.
A prior plan was discussed to add "Appointments" to the POS footer menu.
If implemented, this resolves the need to edit appointments from the Jobs card.

**Acceptance criteria:**
- New "Appointments" menu item in POS footer alongside existing entries.
- Clicking opens a calendar/list view of upcoming appointments (today and
  tomorrow at minimum; configurable date range).
- Each appointment is editable in-line:
  - Date and time can be changed
  - Detailer assignment can be changed (no schedule revalidation per your spec)
  - Customer cannot be changed (separate concern, Item 8)
- Customer notification on reschedule: NOT triggered from this path (operator
  manages communication directly).
- Editing closes the modal and refreshes the appointments list.

**Out of scope:**
- Schedule conflict detection — operator verifies before rescheduling.
- Customer SMS/email notification — by design, this path doesn't notify.
- Appointment creation — already exists elsewhere; this is edit-only.
- Mobile zone changes for mobile appointments — defer to Item 13 work.

**Files likely affected (actual after session):**
- `src/app/pos/components/bottom-nav.tsx` — added Appointments tab as the
  5th primary tab (`CalendarDays` icon, between Jobs and More).
- `src/app/pos/appointments/page.tsx` — new POS route, renders the view in
  a Suspense boundary.
- `src/app/pos/components/appointments/appointments-view.tsx` — date-filtered
  list with Today / Today+Tomorrow / Next 7 Days presets + custom range,
  grouped by date with status pill, click-to-edit. Excludes cancelled
  appointments server-side.
- `src/app/pos/components/appointments/reschedule-appointment-dialog.tsx` —
  modal-from-row-click for date/time/detailer edit. Inline amber notice
  reminding operator that the customer is NOT auto-notified.
- `src/app/pos/components/appointments/types.ts` — local
  `PosAppointment` and `PosStaff` shapes.
- `src/app/api/pos/appointments/route.ts` — new `GET` returning
  appointments in a date range, joined with customer/vehicle/employee/services.
  Permission: `appointments.view_today`. Range capped at 31 days.
- `src/app/api/pos/appointments/[id]/reschedule/route.ts` — new `PATCH`.
  Updates ONLY `scheduled_date`, `scheduled_start_time`,
  `scheduled_end_time`, `employee_id`. Permission: `appointments.reschedule`.
  Mirrors admin's overlap check (BUFFER_MINUTES buffer, 409 on conflict).
  Syncs `jobs.assigned_staff_id` when detailer changes — same direction as
  `/api/pos/jobs/[id]/reschedule`.
- `src/app/api/pos/appointments/__tests__/list.test.ts` — 7 cases.
- `src/app/api/pos/appointments/[id]/reschedule/__tests__/reschedule.test.ts`
  — 10 cases including notification-suppression invariants.
- `docs/dev/FILE_TREE.md`, `docs/dev/ROADMAP-13-ITEMS.md`,
  `docs/CHANGELOG.md` — doc updates.

**Notes / decisions log:**
- 2026-05-15: confirmed no need to edit from Jobs card if Appointments is in
  POS footer. Earlier "Jobs card edit" approach abandoned.
- 2026-05-15: customer notification deliberately NOT triggered from this
  rescheduling path.
- 2026-05-15 (session): `conversation_search` tool unavailable in this
  environment, so no prior chat plan was recovered. Designed within-spec.
- 2026-05-15 (session): **Inline edit vs modal** decision: chose
  **modal-from-row-click**. Rationale — POS list rows are space-constrained
  on iPad and inline editing 4 fields per row hurts scannability. Modal
  also matches the existing admin `AppointmentDetailDialog` interaction
  pattern, which staff already know.
- 2026-05-15 (session): **Component-reuse decision (Rule 11)**: chose NOT to
  reuse `AppointmentDetailDialog` from
  `src/app/admin/appointments/components/`. That dialog has ~12 cross-cutting
  concerns out of scope here (status changes, mobile-zone editor,
  mobile-fee mismatch banner, status-transition matrix, cancellation flow,
  notes editing). Building a focused 4-field reschedule dialog (~150 LOC)
  is cleaner than gating off most of the admin dialog's surface. Reused:
  `Dialog`/`DialogHeader`/`DialogContent`/etc. primitives, `FormField`,
  `Input`, `Select`, `Button`, `Spinner`, `EmptyState`,
  `cleanVehicleDescription`, `formatTime`, `getTodayPst`, `ROLE_LABELS`,
  `APPOINTMENT_STATUS_LABELS`, `posFetch`, `addMinutesToTime`,
  `APPOINTMENT.BUFFER_MINUTES`, and the existing `/api/pos/staff/available`
  endpoint for the detailer dropdown.
- 2026-05-15 (session): **Notification-suppression mechanism**: chose
  option (b) — a dedicated POS endpoint that does NOT call `fireWebhook`.
  The admin `PATCH /api/appointments/[id]` fires `appointment_rescheduled`
  to n8n on date/time change, which downstream handlers may use to message
  the customer. The new POS endpoint never fires it, so this surface is
  notification-free by construction (not by feature flag). Audit log row
  records `notification_suppressed: true` in `details` for traceability.
  Tested via 3 spy mocks (`sendSms`, `sendEmail`, `fireWebhook`) — 0 calls
  verified across both date/time and detailer-only updates.
- 2026-05-15 (session): **Permission decision**: gated read view on
  `appointments.view_today` (matches the admin minimum) and reschedule on
  `appointments.reschedule` (granted to cashier+admin+super_admin by
  default; detailer denied by default — matches existing role config). No
  new permission keys introduced.
- 2026-05-15 (session): **Cancelled appointments excluded** from the list
  server-side. Completed appointments are returned for visibility but the
  reschedule endpoint rejects them (400) — they appear but aren't editable.
- 2026-05-15 (session): **Overlap check**: kept the same logic as the admin
  endpoint (BUFFER_MINUTES added to end time, 409 on conflict). The roadmap
  said "no schedule revalidation," but the admin endpoint does this
  defense-in-depth check too — removing it would let the POS PATCH succeed
  while the admin PATCH would have failed for the same input. That asymmetry
  is a bug in waiting; keeping the check matches the admin's contract and
  the operator can adjust the time if a conflict surfaces.
- 2026-05-15 (session): all gates green — typecheck clean, lint 0 errors
  (my files contributed 0 new warnings; one `Button` unused-import warning
  was caught and removed during the session), vitest 1024/1024 (17 new),
  build clean.
- 2026-05-15 (audit): produced `docs/dev/LIFECYCLE_AUDIT_2026-05-15.md` —
  read-only end-to-end documentation of the Quote → Appointment → Job
  lifecycle, all POS + Admin surfaces that touch each stage, permissions,
  and a gap inventory. Input for deciding whether to merge the Jobs and
  Appointments POS surfaces (future Roadmap Item 15, not yet drafted) vs.
  fill cross-surface gaps in the existing two-tab model. **No code or
  schema changes were made in this audit.** Next steps to be determined
  by review of the audit doc before any further planning.
- 2026-05-15 (post-audit): full Jobs+Appointments merge (originally
  drafted as Item 15) replaced by **Wave 1.5** (Items 15a-d) — four
  minimal interventions that close most §10 friction gaps at substantially
  lower cost. Item 15d is framed as a low-risk prototype that doubles as a
  permanent solution if it satisfies operator friction. See Decisions
  superseded table for the trace.

---

## Wave 1.5 — Item 12 Follow-ups (4 Minimal Interventions)

Sourced from the lifecycle audit completed 2026-05-15
(`docs/dev/LIFECYCLE_AUDIT_2026-05-15.md`). Audit findings revealed that a
full Jobs+Appointments merge (originally drafted as Item 15) is not warranted
— the 4 interventions below close most §10 friction gaps at substantially
lower cost. Item 15 (full merge) is recorded in the Decisions Superseded
section.

### Item 15a — Edit Services in Admin Appointment Dialog (with cascade to job)

- **Status:** done (2026-05-16)
- **Severity:** S1
- **Effort:** 1 session (~2 hours) — actual: 1 session
- **Wave:** 1.5
- **Depends on:** none

**Problem statement:**
The Admin Appointment dialog currently shows services read-only. Operators can't
add or remove services after an appointment is booked. If a job has been created
from the appointment (1:1 link via `jobs.appointment_id`), changes must cascade
to `jobs.services` (JSONB snapshot) so the detailer sees the up-to-date service
list at intake. Closes audit gaps §10 #1 and #11.

**Acceptance criteria:**
- Admin Appointment dialog gets an "Edit Services" control that opens a service
  picker (reuse existing service-picker component from the ticket creation flow).
- Adding a service: creates an `appointment_services` row.
- Removing a service: deletes the corresponding `appointment_services` row (or
  soft-deletes if the schema supports it — verify in-session).
- If a job exists linked to this appointment (`jobs.appointment_id` is set):
  the `jobs.services` JSONB is synced to match the new `appointment_services` rows.
- Price recalculation: appointment total updates; if a deposit was paid, the
  balance owed updates (no payment collected immediately, per user spec — option a).
- Permission gate: `appointments.edit_services` (new permission key, or reuse
  existing `appointments.reschedule` — pick after audit in-session).
- No customer SMS/email triggered from this path (consistent with Item 12 pattern).

**Out of scope:**
- Mid-job add-on flow (already handled by Flag-an-Issue — audit §4 confirms).
- Sending the customer a new pay-link for the price delta (deliberately out
  of scope per user answer Q1).
- Editing services on completed/cancelled appointments.
- Editing services on quotes (separate concern; already editable via quote
  ticket creation flow per audit §3).

**Files likely affected:**
- `src/lib/appointments/edit-services.ts` (new — pure helpers: Zod body schema,
  `buildJobServicesJsonb()`, `computeTotalsForServiceEdit()`)
- `src/lib/appointments/__tests__/edit-services.test.ts` (new — 18 unit tests)
- `src/app/api/admin/appointments/[id]/services/route.ts` (new — PUT cascade
  endpoint with manual rollback)
- `src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts` (new —
  17 cascade integration tests)
- `src/app/api/admin/services/active/route.ts` (new — session-authed GET that
  mirrors `/api/pos/services` for admin pickers)
- `src/components/appointments/edit-services-modal.tsx` (new — picker modal,
  search + toggle + total + save)
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx`
  (modified — Edit affordance + modal render + optimistic services-override
  state)
- `src/app/admin/appointments/page.tsx` (modified — `onServicesUpdated`
  callback refetches list + stats)
- `docs/dev/FILE_TREE.md` (registered new helper, modal, and endpoint files)

**Notes / decisions log:**
- 2026-05-15: source = lifecycle audit §11.2 intervention #1.
- 2026-05-15: user answered Q1 = option (a): no immediate payment; balance
  updates and is collected at job completion.
- 2026-05-16 — Session 1 (this session):
  - **Permission decision:** reused existing `appointments.reschedule`
    rather than introducing a new `appointments.edit_services` key.
    Rationale: same role distribution (admin/cashier/super_admin yes;
    detailer no), service editing is conceptually a "scope mutation"
    adjacent to reschedule, no DB migration required, and consistent
    with the precedent set by Item 12's POS reschedule endpoint.
  - **Cascade transactional model:** Supabase JS exposes no first-class
    multi-statement transaction. Followed the manual rollback pattern
    from `/api/pos/jobs/route.ts:381-453` (walk-in creation). Three
    failure-injection unit tests assert rollback restores the original
    `appointment_services` rows (preserving ids) and the original
    `appointments.subtotal`/`total_amount` values.
  - **`jobs.services` JSONB rebuild on cascade** uses
    `buildJobServicesJsonb()` which mirrors the shape produced by
    `/api/pos/jobs/populate/route.ts:128-142` (synthetic
    `{ id: null, name, price, is_mobile_fee: true }` mobile row when
    the appointment is mobile + surcharge > 0). Tested.
  - **Totals model:** `subtotal = sum(prices) + mobile_surcharge`,
    `total = subtotal − discount + tax`. Tax + discount pass through
    unchanged from the current appointment row (tax is 0 for
    booking-flow appointments today; discount may be non-zero from
    coupon redemption).
  - **Service picker component decision:** the POS Jobs card has an
    inline "Edit Services" modal (`job-detail.tsx:1920-2005`) that
    writes only `jobs.services` JSONB. Extracting it into a shared
    component would have refactored the Jobs flow mid-session and
    risked regressions. Built a parallel admin-only picker
    (`src/components/appointments/edit-services-modal.tsx`) that
    targets the new cascade endpoint. Tech debt acknowledged: a
    future cleanup session should consolidate both call sites under
    the new endpoint so the JSONB-only path is retired. Out of scope
    here per acceptance criteria.
  - **Notification suppression invariant:** 3 spy mocks (sendSms /
    sendEmail / fireWebhook) assert 0 calls on the success path. Audit
    log records `notification_suppressed: true`. Mirrors Item 12 +
    Item 15b precedent.
  - **Out-of-scope guards:** the API rejects edits on `completed` or
    `cancelled` appointments with 400; the UI hides the Edit
    affordance for those statuses. Unknown / inactive service ids
    rejected with 400 (no DB writes occur).
  - **Verification:** typecheck clean, lint 0 errors, all 1088 tests
    pass (35 new from this session), build clean.
  - **Collision-prevention:** ran concurrently with Items 15b and 15c.
    File overlap was zero by design except for ROADMAP /
    CHANGELOG / FILE_TREE / `appointment-detail-dialog.tsx` (which
    only 15a touched). Staged my files explicitly and pulled
    --rebase before commit.

---

### Item 15b — Cancel Appointment from POS Appointments Tab + "This Month" Filter

- **Status:** done (2026-05-16)
- **Severity:** S2
- **Effort:** 1 session (~1.5 hours) — actual: 1 session
- **Wave:** 1.5
- **Depends on:** none (extends Item 12 surface)

**Problem statement:**
The POS Appointments tab (shipped in Item 12) supports reschedule but not cancel.
Cashiers needing to cancel an appointment must switch to Admin Appointments.
Additionally, the date-range filter is missing a "This Month" option. Closes
audit gap §10 #4.

**Acceptance criteria:**
- POS Appointments row gets a "Cancel" action (icon button or modal-from-row-click).
- Cancel opens a confirmation modal with reason field (required) and "Notify
  customer" checkbox (default off, consistent with Item 12 no-notification pattern).
- On confirm: calls existing `/api/appointments/[id]/cancel` endpoint.
- Permission gate: `appointments.cancel` (existing — admin and super_admin only
  per audit §9.1; do NOT grant to cashier without explicit user approval).
- Date-range filter dropdown adds "This Month" option (between "Next 7 Days"
  and "Custom").
- "This Month" = appointments from today through end of current calendar month.

**Out of scope:**
- Cancellation fee waiving (existing `appointments.waive_fee` permission gates
  that on the Admin side; not exposed in POS).
- Bulk cancellation.
- Refund initiation on cancel (existing cancellation flow handles refund logic).

**Files likely affected (actual, post-session):**
- `src/app/api/pos/appointments/[id]/cancel/route.ts` (new) — POS-specific
  cancel endpoint mirroring the Item 12 reschedule pattern (HMAC POS auth +
  `checkPosPermission('appointments.cancel')`). Body
  `{ cancellation_reason, notify_customer? }`. When `notify_customer=false`
  (the default): skip both `sendCancellationNotifications` AND
  `fireWebhook('appointment_cancelled')` so no SMS/email/webhook fires.
  When `true`: fire both, matching admin parity. Audit row records
  `notification_suppressed: !notify_customer` + `source: 'pos'`.
- `src/app/api/pos/appointments/[id]/cancel/__tests__/cancel.test.ts` (new)
  — 9 cases covering: 401 unauth, 403 permission denied (cashier role
  default), 400 missing/empty reason, 404 missing appointment, 400 terminal
  states (cancelled/completed), the headline suppression invariant
  (notify=false → 0 SMS, 0 email, 0 webhook, 0 cancellation-notification
  calls), notify=true firing path, and reason whitespace trim.
- `src/app/pos/components/appointments/cancel-appointment-dialog.tsx` (new)
  — confirmation modal mirroring the reschedule dialog architecture. Required
  reason textarea + "Notify customer" checkbox (default OFF). Amber-notice
  swaps copy depending on the checkbox state so the operator sees the
  notification semantics explicitly before confirming.
- `src/app/pos/components/appointments/__tests__/appointments-view.test.tsx`
  (new) — 4 RTL cases: "This Month" button position, filter date math
  (mid-May 2026 → end_date=2026-05-31), Cancel icon visible with permission,
  Cancel icon HIDDEN (not just disabled) without permission.
- `src/app/pos/components/appointments/appointments-view.tsx` — added the
  "This Month" filter button between "Next 7 Days" and the Custom From/To
  inputs (PST end-of-month math via local helper), the per-row Trash icon
  permission-gated by `usePosPermission('appointments.cancel')`, and the
  cancel-dialog mounting. The whole-row reschedule click is unchanged — the
  Trash icon is a separate sibling button so it doesn't bubble.

**Notes / decisions log:**
- 2026-05-15: source = lifecycle audit §11.2 intervention #2 + user request
  for "This Month" filter from Item 12 testing.
- 2026-05-15: cashier role lacks `appointments.cancel` per audit §9.1 — the
  button will be hidden for cashiers unless user explicitly grants the permission.
- 2026-05-16 (session): **endpoint decision** — built a NEW
  `/api/pos/appointments/[id]/cancel` endpoint instead of extending the
  existing admin `/api/appointments/[id]/cancel`. Rationale: matches the
  Item 12 reschedule pattern (HMAC POS auth, narrower scope, no waitlist
  branch, no cancellation-fee branch). Admin endpoint stays unchanged so
  the admin notification default ("notify on") is preserved verbatim.
- 2026-05-16 (session): **notification suppression mechanism** — explicit
  branch on `notify_customer` (default false). When false, BOTH the direct
  `sendCancellationNotifications` call AND the `appointment_cancelled`
  webhook are skipped. Skipping the webhook too is intentional: downstream
  n8n flows on that event may also notify the customer, so honoring
  "notify_customer=false" requires not firing the webhook either. Mirrors
  the Item 12 "by construction, no webhook fired" pattern.
- 2026-05-16 (session): **waitlist auto-notify** intentionally NOT mirrored
  from admin. Waitlist notification (fan-out to OTHER customers waiting
  for an opening) is its own customer-contact side-channel — kept off the
  POS cancel surface to preserve the strict "no auto-notification from
  POS" invariant. Admin cancel continues to handle waitlist auto-notify.
- 2026-05-16 (session): **cancellation fee** intentionally NOT exposed.
  `appointments.waive_fee` is admin-only per audit §9.1; this session
  explicitly avoids surfacing fee math on the POS path.
- 2026-05-16 (session): **cashier role default unchanged**. Cashier still
  lacks `appointments.cancel`. UI hides the Trash icon for cashier
  (RTL test asserts this). Endpoint returns 403 to cashier (test asserts
  this). Granting cashier the permission is out of scope per spec.
- 2026-05-16 (session): **collision-prevention**: ROADMAP/CHANGELOG/
  appointment-detail-dialog/FILE_TREE were being modified by concurrent
  Item 15a + 15c sessions. Stashed their working-tree edits before
  applying mine, committed only my files explicitly, then will restore
  the stashes for those sessions to resume.

---

### Item 15c — "Change Time" Affordance on Jobs Card

- **Status:** done (2026-05-16)
- **Severity:** S1
- **Effort:** 1 session (~1.5 hours) — actual: 1 session
- **Wave:** 1.5
- **Depends on:** none

**Problem statement:**
The Jobs card cannot edit appointment date/time. Operators must switch to POS
Appointments tab or Admin Appointments to reschedule. Audit §7.3 confirms this
gap. Closes audit gap §10 #10 (and partially reduces §2/§3 friction).

**Acceptance criteria:**
- Jobs card gets a "Change Time" or similar affordance (button or inline edit on
  the scheduled-time field).
- Click opens the SAME reschedule dialog used by the POS Appointments tab
  (component reuse — Rule 11).
- Reschedule edits the underlying appointment, syncs detailer back to job
  (existing behavior).
- Permission gate: `appointments.reschedule` (existing).
- Available statuses: `scheduled`, `intake`, `in_progress` (same as POS
  Appointments tab; explicitly rejects `completed` per audit §10 #3).
- No customer notification (consistent with Item 12 pattern).

**Out of scope:**
- Changing detailer from the Jobs card (already supported per audit §7.2; this
  session does not modify that flow).
- Changing services from the Jobs card (already supported via Edit Services
  modal per audit §7.2; this session does not modify that flow).
- Cancelling the appointment from the Jobs card (Jobs card has "Cancel Job"
  which is a different concern per audit §10 #12).

**Files likely affected (actual after session):**
- `src/app/pos/jobs/components/job-detail.tsx` — added `ChangeTimeButton`
  import and placed it in the Timing tile header (top-right of the time
  fields it edits). No other Jobs-card logic touched.
- `src/app/pos/jobs/components/change-time-button.tsx` — new ~120 LOC thin
  wrapper. Hides itself on permission/appt-id/status guards; on click
  fetches the single appointment + bookable staff in parallel and renders
  the reused `<RescheduleAppointmentDialog>` (unmodified).
- `src/app/api/pos/appointments/[id]/route.ts` — new `GET` returning a
  single joined `PosAppointment`. Same select shape as the list endpoint.
  Permission: `appointments.view_today`.
- `src/app/pos/jobs/components/__tests__/change-time-button.test.tsx` —
  11 cases (3 status-visible, 4 status-hidden, 1 permission-hidden,
  1 no-appointment-hidden, 1 happy-path open, 1 fetch-error toast).
- `src/app/api/pos/appointments/[id]/__tests__/get.test.ts` — 4 cases
  (401/403/404/200).
- `docs/dev/FILE_TREE.md`, `docs/dev/ROADMAP-13-ITEMS.md`,
  `docs/CHANGELOG.md` — doc updates.

**Notes / decisions log:**
- 2026-05-15: source = lifecycle audit §11.2 intervention #3.
- 2026-05-15: explicit instruction to REUSE the POS Appointments tab's
  reschedule dialog — Rule 11.
- 2026-05-16 (session): **Placement decision**: Timing tile header
  (top-right). Edit control sits next to the time fields; mirrors the
  pencil-icon affordance on the adjacent Notes tile. Rejected footer
  action bar (status-flow actions live there) and inline-on-time-row
  (no single "scheduled_time" row in the current Timing tile, which
  shows 6 timestamps).
- 2026-05-16 (session): **Reuse strategy**: the reschedule dialog file is
  **unmodified**. `<ChangeTimeButton>` is a thin wrapper that does three
  things: gate, fetch, render. Considered extending `GET /api/pos/jobs/[id]`
  to inline the full appointment join — rejected as a higher-risk change
  that would ripple through `JobDetailData` and Jobs-card rendering.
- 2026-05-16 (session): **Status guards** — RESCHEDULABLE_STATUSES =
  {`scheduled`, `intake`, `in_progress`}. `pending_approval`, `completed`,
  `closed`, `cancelled` all hide the button. Mirrors `DRAGGABLE_STATUSES`
  in the timeline reschedule route + the POS Appointments reschedule
  endpoint's own 400 guard for completed/cancelled.
- 2026-05-16 (session): **Permission guard** — `appointments.reschedule`
  via `usePosPermission`. Same key the POS Appointments tab uses; granted
  to cashier+admin+super_admin by default; detailer denied. **No new
  permission keys.**
- 2026-05-16 (session): **Notification suppression inherited** from
  Item 12's `PATCH /api/pos/appointments/[id]/reschedule` endpoint (no
  webhook fire; audit row records `notification_suppressed: true`). The
  3-spy invariant from Item 12's `reschedule.test.ts` continues to
  protect this path; no new spy test added since the entry point
  introduces no new notification touchpoints.
- 2026-05-16 (session): **Concurrency note** — ran alongside Items 15a/15b.
  Only Item 15c files staged for this commit; parallel-session work left
  on the working tree. Doc edits experienced repeated revert collisions
  with parallel sessions editing the same file — re-applied minimum
  Item 15c block edits + ledger row immediately before commit.
- 2026-05-16 (session): all gates green — typecheck clean, lint 0 errors
  (0 new warnings from this session's files), vitest 1067/1067 (15 new:
  11 component + 4 endpoint), build clean.

---

### Item 15d — "Today's Tickets" Combined View

- **Status:** deferred — re-evaluate after Item 15e ships
- **Severity:** S2
- **Effort:** 1-2 sessions (~3-4 hours)
- **Wave:** 1.5
- **Depends on:** 15a, 15b, 15c helpful but not strictly required

**Problem statement:**
Operators have no single view showing all of today's work regardless of stage.
They check POS Quotes for outstanding quotes, POS Jobs for in-progress/scheduled,
POS Appointments for upcoming-but-no-job-yet, POS Transactions for
completed/refunded. Cross-surface mental model is the highest-friction
observation in the audit (§10 #8). This intervention serves as a low-risk
prototype for what a full Tickets merge would feel like — per the audit, "if
after shipping it you still want a merger, you'll have real operational data
on whether it's worth it."

**Acceptance criteria:**
- New view (location TBD in-session — could be a new POS tab, or absorbed into
  existing Jobs surface as an "All" filter).
- Lists for today's date:
  - Quotes (pending / sent, not yet converted)
  - Appointments (booked, no job yet)
  - Jobs (any status — scheduled, intake, in-progress, completed)
  - Transactions (completed today)
- Each row shows a clear stage discriminator (badge, icon, or column).
- Row click opens the appropriate edit surface for that entity (quote → quote
  editor; appointment → appointment dialog; job → job card; transaction →
  receipt).
- Filters: stage (all/quote/appointment/job/transaction), detailer, date.
- Default filter: today, all stages.
- Read-only at this stage — clicking a row navigates to the existing edit
  surface (this view doesn't replace edits, only consolidates discovery).

**Out of scope:**
- Inline editing in the combined view (clicking a row goes to existing edit
  surfaces).
- Merging the underlying entities or DB tables.
- Renaming Jobs/Appointments/Quotes to "Tickets" globally.
- Multi-day views (today only — date filter can override).
- Permissions remapping for the merged view (use union of existing permissions
  per stage; if a user can't view quotes, quotes don't appear for them).

**Files likely affected:**
- New combined view component (likely under POS or admin pos area)
- Query layer to fetch quotes + appointments + jobs + transactions for a date range
- Existing edit surfaces (no changes; just navigate to them)
- Tests for the multi-entity query + stage filtering

**Notes / decisions log:**
- 2026-05-15: source = lifecycle audit §11.2 intervention #4.
- 2026-05-15: explicitly framed as "low-risk prototype" for a future full
  Tickets merge — if this satisfies operator friction, the full merge is
  permanently deferred.
- 2026-05-15: read-only navigation; rows link out to existing edit surfaces.

---

### Item 15e — POS Appointments Modal: Full Capability Parity with Admin

- **Status:** not started
- **Severity:** S1
- **Effort:** 2-3 sessions
- **Wave:** 1.5
- **Depends on:** Item 15f (service picker engine + hook must exist first)

**Problem statement:**
The POS Appointments modal (shipped in Item 12) only supports reschedule
(date/time/detailer). Operators must switch to Admin > Appointments to
edit status, assigned detailer, start/end times, job notes, internal notes,
or toggle mobile service. This creates surface-toggling friction for daily
operator work that should happen in POS. The audit (§8.3) framed POS as
"iPad-fast operator use" with a deliberately narrow modal — operator feedback
revealed that framing was wrong; the full edit set is needed at POS.

**Acceptance criteria:**
- POS Appointments modal mirrors Admin Appointment dialog's field set:
  - Status (edit, gated on `appointments.update_status`)
  - Assigned detailer (edit, existing in Item 12)
  - Date (edit, existing in Item 12)
  - Start AND end times (edit; mirrors Admin behavior exactly — verify in-session)
  - Job notes (edit, gated on `appointments.add_notes`)
  - Internal notes (edit, gated on `appointments.add_notes`)
  - Mobile service toggle (opens existing mobile-zone modal with mandatory
    address + zone selection — use EXACT same flow/code as Admin)
  - Service editing (uses Item 15f's `useServicePicker` hook — NOT a bespoke picker)
- **Notification behavior** (per Q1 = a): all POS edits default notify-off
  with a "Notify customer" checkbox per save (matches Item 12 pattern).
- **Permission gating** (per Q2 = yes): mirror Admin's per-field permission
  gating exactly. Cashier without `appointments.reschedule` sees date/time
  read-only; cashier with `appointments.update_status` can edit status; etc.
- **Mobile service toggle** (per Q3): when clicked, opens the EXACT same
  modal Admin uses (expects mandatory mobile address + zone selection).
  Use the same code path — no duplication.
- **End time editing** (per Q4): follow exactly what Admin > Appointments
  does. Verify in-session.
- **Service editing** (per Q5 + Item 15f): uses the canonical `useServicePicker`
  hook (Layer 3a migration). The 2-pane catalog browser + selected-services
  list UX matches POS Register / Quote Builder muscle memory.

**Out of scope:**
- Tickets-view merger (deferred per audit §11.2; see Decisions Superseded).
- Building a new service picker (use Item 15f's canonical engine).
- Changing the mobile-zone modal (reuse existing).
- Cancel from POS Appointments — Item 15b already shipped.

**Files likely affected:**
- POS Appointments modal component (the surface shipped in Item 12)
- Mobile-zone modal (read-only reference; reused)
- Item 15f's `src/lib/services/use-service-picker.ts` hook (consumed)
- New permission-gated field components or extension of existing
- Tests for per-field permission gating, notify-off invariant, end-time edit

**Notes / decisions log:**
- 2026-05-16: User feedback after Item 12 UAT — modal too narrow for daily
  operator work. Required parity with Admin Appointment dialog.
- 2026-05-16: User Q1 = a (notify-off default + per-save checkbox).
- 2026-05-16: User Q2 = yes (mirror Admin permission gating per field).
- 2026-05-16: User Q3 = use exact mobile-zone modal flow (no duplication).
- 2026-05-16: User Q4 = match Admin end-time behavior exactly (verify in-session).
- 2026-05-16: User Q5 = include service edit, BUT picker must be fixed first
  (Item 15f Layer 3a migrates this surface to the canonical hook).
- 2026-05-16: Depends on Item 15f Layers 1+2+3a to land first — POS Appointments
  modal is one of the Layer 3a migration targets.

---

### Item 15f — Service Picker Engine: Canonical Resolver + Hook + Migration

- **Status:** **COMPLETE (2026-05-17)** — All sub-layers done: Layers 1+2+3a-restructured+3c+3d+3e+4 (engine + hook + booking/voice/SMS migrations + ESLint rule); Phase 1 Layers 8a + 8b + 8c + 8d + 8d-bis + 8e + 8f (edit-via-POS pivot for operator surfaces). Item 15f closed.
- **Severity:** S1 (architectural correctness; existing customer-money bug in 2 surfaces — Layer 1 ships the foundation, Layer 3a fixes the bugs)
- **Effort:** 5.5-7 sessions (~11-16 hours total, layered) — Layer 3e adds ~0.5-1 session
- **Wave:** 1.5
- **Depends on:** none — must land before Item 15e

**Problem statement:**
Service-pricing is computed inconsistently across the app. The shared
`<CatalogBrowser>` + `<ServicePricingPicker>` stack handles 4 of 6
`pricing_model` values correctly (`vehicle_size`, `specialty`, `scope`,
`per_unit`) plus a `flat` workaround. The `custom` pricing_model is silently
unsupported everywhere. Worse, two operator surfaces (Jobs card Edit Services
modal at `job-detail.tsx:583-587` and Item 15a's `<EditServicesModal>` at
`src/components/appointments/edit-services-modal.tsx:73`) ship their own
bespoke `getServicePrice` / `resolveServicePrice` functions that mishandle
multiple pricing patterns — including silent revenue leak on tiered services
(e.g., 1-Year Ceramic Shield's per-size_class pricing is ignored on
non-sedan vehicles when added via the Jobs card).

The structural fix is to extract a canonical price-resolution engine into
a shared library, expose it via a `useServicePicker` hook, migrate the
broken operator surfaces to consume the hook, share the engine with the
Booking Wizard (customer-facing), and enforce no-bespoke-pricing via ESLint.

**Acceptance criteria — Layered Scope:**

**Layer 1 — Extract canonical engine + create hook (refactor only, zero behavior change):**
- New directory `src/lib/services/` with:
  - `picker-engine.ts` — canonical functions: `resolveServicePrice`,
    `resolveServicePriceWithSale`, `getServicePriceRange`, `routeServiceTap`
    (routing logic from `<CatalogBrowser>` extracted here).
  - `use-service-picker.ts` — `useServicePicker(options)` hook returning
    `{ CatalogPane, ActiveDialog, selectedServiceIds, reset }`.
  - `index.ts` — public surface.
- `src/app/pos/utils/pricing.ts` becomes a thin re-export for backward compat.
  Deprecation comment notes the new canonical location.
- All existing surfaces remain unchanged. Zero regressions. All existing
  tests pass unmodified.
- New picker-engine tests exhaustively cover all 6 pricing_model values
  (including `custom` as "not yet handled — Layer 2").

**Layer 2 — Add `custom` UX (per Q1 = a):**
- `useServicePicker` recognizes `pricing_model === 'custom'`.
- Renders a prompt for operator to enter final price ("Staff assessment —
  enter custom amount" based on `custom_starting_price` as starting reference).
- Synthesizes a ServicePricing row with the entered amount.

**Layer 3a — RESTRUCTURED as Phase 1 (edit-via-POS pattern) per audit findings:**

Layer 3a's original "extract <CatalogBrowser> + <ServicePricingPicker> into a
shared <EditServicesDialog> component" approach was attempted at commit
`98dfdea6` (Jobs card only — Admin migration deferred when POS-context
blocker surfaced). Real-world UAT revealed four independent failures:
(1) <CatalogBrowser> has hard POS-context dependencies (useTicket,
usePosPermission) that crash outside POS; (2) the new dialog missing the
service-vehicle compatibility warning that the POS Quote/Register flow has;
(3) the new dialog's custom-pricing add path is broken (Flood Damage
unaddable); (4) DESPITE the canonical engine, the migrated Jobs-card
modal STILL writes wrong prices to `jobs.services` JSONB.

Root cause: `<CatalogBrowser>` is not a standalone component — it's the
visible surface of a larger orchestrated POS ecosystem (ticket state,
permissions, compatibility checks, custom pricing routing, sale banners,
canonical price resolution). Extracting its UI without its surrounding
context produces broken behavior.

Per `docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md`, the architectural
pivot is **edit-via-POS** — instead of extracting catalog UI into other
surfaces, ROUTE the ticket BACK to the POS Sale tab for editing. This is
the existing quote-edit pattern applied to appointments and jobs. The
operator clicks "Edit Services" on Jobs card / Admin Appointment dialog
and is navigated to `/pos?source=...&id=...&returnTo=...`. POS loads
the existing ticket, operator edits in the FULL POS UX (with all
safeguards: compatibility warning, custom pricing, sale banners, canonical
engine, etc.), clicks "Save Changes," ticket persists back to the original
record, operator returns to source surface.

This pivot DEPENDS on **Item 15g (lifecycle persistence)** landing FIRST.
Without 15g, every edit-via-POS round-trip silently re-zeroes discount /
coupon / loyalty on the underlying record.

**Phase 1 Sub-Layers (sequential):**

- **Layer 8a — Backend cascade endpoint extraction — DONE 2026-05-17:**
  Item 15a's 442-line cascade body extracted into auth-agnostic helper
  `src/lib/appointments/service-edit.ts` exposing
  `editAppointmentServices(supabase, { appointmentId, body, actor, source, ipAddress })`.
  - Admin route (`src/app/api/admin/appointments/[id]/services/route.ts`)
    refactored to thin 84-line wrapper (auth via `getEmployeeFromSession`
    + `requirePermission('appointments.reschedule')` unchanged from Item 15a;
    builds actor, calls helper with `source: 'admin'`, catches
    `ServiceEditError` to map → HTTP). **API contract preserved** — all 21
    existing route tests pass unmodified.
  - New POS-authed sibling
    `src/app/api/pos/appointments/[id]/services/route.ts` with
    `authenticatePosRequest` + `checkPosPermission('pos.jobs.manage')`
    (per audit §6; the existing key granted to admin/detailer/super_admin
    and denied to cashier). Same helper call with `source: 'pos'`.
    Server-side only this layer — Layer 8b wires frontend deep-link drain.
  - Modifier preservation contract (Item 15g Layer 15g-iii) preserved
    inside the helper: per-modifier columns READ + canonical combined
    `discount_amount` WRITTEN; per-modifier columns themselves NEVER
    touched by the cascade.
  - Manual rollback pattern preserved (Supabase JS has no first-class
    transaction wrapper); helper exposes a small
    `rollbackAppointmentServices` for the totals + jobs-sync rollback
    steps.
  - Structured `ServiceEditError` with `code` + `httpStatus` (`INVALID_INPUT`
    / `NOT_FOUND` / `INVALID_STATUS` / `UNKNOWN_SERVICE` / `INACTIVE_SERVICE` /
    `CASCADE_FAILED`) — both routes catch and map to NextResponse.
  - Tests: +33 new across 2 new files. `service-edit.test.ts` (+15) pins
    structured error contract / source threading / return shape / modifier
    preservation invariant. `pos services route.test.ts` (+18) covers POS
    auth (401/403), validation parity with admin, cascade parity, audit
    source tagging, notification suppression, idempotency. Existing admin
    tests (21) pass unmodified.
  - Verification: typecheck 0 new errors; ESLint 0 errors on touched files;
    vitest 1395/1395 passing; production build compiled successfully.
  - Effort: ~1.5 sessions actual.

- **Layer 8b — Frontend state extensions — DONE 2026-05-17:**
  Extended `<TicketContext>` with `source: TicketSource` ('new' |
  'appointment' | 'job'), `sourceId: string | null`, `returnTo: string | null`,
  `editMode: boolean`. New reducer actions: `ENTER_EDIT_MODE` (atomic
  hydrate + stamp 4 fields) and `EXIT_EDIT_MODE` (clears 4 fields,
  preserves cart). State-leak guards inside the reducer:
  - `initialTicketState` defaults the 4 fields so `CLEAR_TICKET`
    (F1 / "New Sale") auto-resets them.
  - `RESTORE_TICKET` (sessionStorage path) explicitly strips edit-mode
    even when the persisted payload carried `editMode: true` — re-entering
    edit mode requires a fresh deep-link drain. Defends against page
    refresh losing the deep-link URL but session storage surfacing a
    stale `editMode: true` with a sourceId the operator can no longer
    save back to (audit §8.3 gotcha #5).
  - **Endpoint shape decision: Option B**. `source=appointment` →
    new `GET /api/pos/appointments/[id]/load` (sibling of
    `GET /api/pos/jobs/[id]/checkout-items`, gates on `pos.jobs.manage`
    for save-symmetry). `source=job` → reuses existing
    `GET /api/pos/jobs/[id]/checkout-items` (already returns a richer
    TicketState-shaped payload). The two endpoints diverge on
    `prior_payments` (jobs has it; appointments doesn't) and permission
    key (jobs gates on `pos.jobs.view`; appointments gates on
    `pos.jobs.manage`); the drain consumes the union with safe defaults
    for missing fields. Option A (parallel `jobs/[id]/load`) would have
    duplicated `checkout-items` — rejected.
  - Deep-link drain at `src/app/pos/hooks/use-edit-mode-drain.ts`,
    mounted on `<PosWorkspace>`. Reads `window.location.search` on mount,
    validates `source ∈ {'appointment','job'}` + UUID-shaped `id` +
    same-origin `returnTo`. Open-redirect defense rejects absolute URLs,
    protocol-relative (`//evil.com`), dangerous schemes (`javascript:` /
    `data:` / `vbscript:` / `file:` / `about:`), backslash legacy bypass
    (`\\evil.com`), non-leading-slash, empty strings. On success
    dispatches `ENTER_EDIT_MODE` then follow-up `SET_LOYALTY_REDEEM` /
    `APPLY_MANUAL_DISCOUNT` / coupon-revalidate-then-`SET_COUPON` —
    identical pattern to `pos/jobs/page.tsx:handleCheckout` lines 185-217
    (Item 15g Layer 15g-iii modifier contract). Strips deep-link params
    from URL via `history.replaceState` after drain so re-renders don't
    re-drain over operator edits. Re-fetches on every mount.
  - Status guard on `GET /api/pos/appointments/[id]/load` refuses
    completed/cancelled — matches the PUT cascade guard so the operator
    can't drain into a state the save would reject.
  - **Tests** (+45 across 3 new files):
    - `src/app/pos/context/__tests__/ticket-reducer-edit-mode.test.ts`
      (+13): default state, ENTER/EXIT_EDIT_MODE, CLEAR_TICKET clears
      edit-mode, RESTORE_TICKET strips edit-mode from persisted payload,
      modifier propagation parity with Layer 15g-iii.
    - `src/app/pos/hooks/__tests__/use-edit-mode-drain.test.ts` (+22):
      `isUuid` + `isSafeInternalPath` (5 attack-class rejections + happy
      paths); `buildTicketStateFromLoad` (item mapping, is_addon naming,
      deposit + prior-payments math, modifier columns zeroed);
      `runEditModeDrain` (endpoint selection by source, dispatch sequence,
      label fallback "Manual discount", coupon revalidate failure
      non-fatal); error paths (403/404/network/malformed payload all
      return ok:false without dispatching).
    - `src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts`
      (+10): 401, 403, 404, 400 on completed/cancelled, happy-path
      shape, modifier-column nulls, mobile_fee synthesis, deposit
      lookup, deposit=0 when payment_type=pay_on_site.
  - Collateral typecheck-edits: `ticket-actions.test.tsx` (4 default
    fields in mock + setTicket helper); `pos/jobs/page.tsx:handleCheckout`
    (4 placeholder fields in newTicket literal — RESTORE_TICKET strips
    them inside the reducer regardless).
  - **No UI changes.** The Sale-tab still shows "Checkout" — Layer 8c
    branches off `ticket.editMode`. Jobs-card and Admin-dialog
    affordances are Layer 8d.
  - Verification: typecheck 0 new errors on touched files (2 pre-existing
    unrelated test-file errors persist); ESLint 0 errors (98 warnings =
    unchanged baseline); vitest 1440/1440 (was 1395 prior); production
    build compiled successfully.
  - Effort: ~1 session actual.

- **Layer 8c — POS Sale-tab edit-mode UX + modifier-editable cascade — DONE 2026-05-17:**
  Combined backend + frontend session. Spec corrected mid-scope by
  `docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md`: pre-transaction
  modifier edits are snapshot-only (no `customers.loyalty_points_balance`
  write, no `loyalty_ledger` row, no `coupons.use_count` change), so
  modifier UI stays **visible + editable** in edit mode. Corrects the
  original Quote→POS audit §7's "suppress loyalty redemption UI"
  recommendation which was based on an incorrect premise.

  **Backend cascade extension** (`src/lib/appointments/edit-services.ts`
  + `src/lib/appointments/service-edit.ts`):
    - Six new optional `.optional().nullable()` Zod fields on
      `editServicesBodySchema`: `coupon_code`, `coupon_discount`,
      `loyalty_points_to_redeem`, `loyalty_discount`,
      `manual_discount_value`, `manual_discount_label`. Three-state
      encoding: omitted=preserve, null=clear, value=write.
    - `superRefine` mirrors `appointments_manual_discount_coherent` DB
      CHECK — value/label must travel together.
    - Effective-value resolution: payload overrides (incl. null) win;
      omitted falls back to appointment's existing column. Layer 15g-iii
      preservation contract preserved (services-only payload doesn't
      touch modifier columns).
    - `anyModifierEdit` short-circuits the legacy `discount_amount`
      fallback in `computeTotalsForServiceEdit` so clearing all modifiers
      correctly writes 0 instead of resurrecting the pre-edit combined
      column.
    - Schema mapping: payload `loyalty_points_to_redeem` → column
      `loyalty_points_redeemed`; `null` → `0` for NOT NULL DEFAULT 0
      loyalty columns.
    - Audit log: `details.field` flips to `'services_and_modifiers'` + adds
      `modifiers_before` / `modifiers_after` slices when any modifier touched.

  **Frontend edit-mode UX**:
    - New `TicketState.editInitialSnapshot: string | null` for dirty
      detection. `serializeTicketEditSlice(state)` helper exported from
      `ticket-reducer.ts`.
    - New `MARK_EDIT_INITIAL_STATE` reducer action; drain emits it as
      final dispatch (post-coupon-revalidate) so cart doesn't flash dirty
      on hydration. No-op outside edit mode.
    - `<EditModeBanner>` (`src/app/pos/components/edit-mode-banner.tsx`):
      amber pill at top of Sale workspace; "Editing Appointment #XXX" or
      "Editing Job #XXX" using first 8 chars of UUID; "Unsaved changes"
      badge when serialized state ≠ snapshot. Returns null outside edit mode.
    - `<TicketActions>` editMode branch: action bar renders [Cancel | Save
      Changes] only. Save POSTs to
      `/api/pos/appointments/${ticket.sourceId}/services` with
      `services[]` (filtered to itemType==='service') + 6 modifier fields.
      Manual discount client-resolved (percent → dollar) via canonical
      `resolveManualDiscountAmount` from `@/lib/quotes/manual-discount`.
      On success: EXIT_EDIT_MODE + CLEAR_TICKET + `router.push(returnTo)`.
      On dirty Cancel: confirmation modal ("Discard unsaved changes?").
    - F2 keyboard shortcut in `pos-shell.tsx` gated on `!editMode` so the
      Checkout overlay can't open accidentally during an edit.
    - All other Sale-tab UI (CouponInput, LoyaltyPanel, manual discount
      form, customer/vehicle, catalog, mobile picker) stays unchanged.

  **Known limitation — flagged for Layer 8d**: Save Changes currently POSTs
  to `/api/pos/appointments/${sourceId}/services` unconditionally. For
  source=job, this targets the appointment derived from `job.appointment_id`
  — but the drain only sets `sourceId` to the job UUID. Either:
  (a) Layer 8d's source-side affordance resolves job → appointment when
  building the deep-link URL, so `sourceId` is the appointment id, OR
  (b) Layer 8c's save handler does the job→appointment lookup before
  POST. Picked (a) by default (smaller surface change, route handlers
  stay clean); user/Layer 8d to confirm.

  **Tests (+36 across 4 new/modified files):**
    - `service-edit.test.ts` (+11 from 8c): coupon write/clear, loyalty
      write/null→0, manual coherence rejection, services-only no-regression,
      audit field flip + before/after diff.
    - `ticket-reducer-edit-mode.test.ts` (+5 from 8c): `editInitialSnapshot`
      default, MARK action stamp/no-op/snapshot-content/frozen-at-MARK.
    - `use-edit-mode-drain.test.ts` (+2 from 8c): MARK fires LAST always,
      MARK fires AFTER SET_COUPON.
    - new `ticket-actions-edit-mode.test.tsx` (+12): button swap, Save POST
      payload + success/error paths, clean/dirty Cancel UX.
    - new `edit-mode-banner.test.tsx` (+6): no-render-outside-editMode,
      labels, dirty/clean states, pre-MARK suppression.

  **Verification:** typecheck 0 new errors on touched files (2 pre-existing
  unrelated test errors persist); ESLint 0 errors / 98 warnings unchanged
  baseline; vitest 1476/1476 (was 1440 at Layer 8b; +36 net new);
  production build compiled successfully. Effort: ~1.5 sessions actual.

- **Layer 8d — Source-side affordances + Layer 8c polish — DONE 2026-05-17:**
  Replaces both source-side service-edit triggers with deep-link routes
  into POS edit mode, plus two Layer 8c UAT polish fixes (Products tab
  disabled in edit mode, banner label revamp).

  **Jobs card** (`src/app/pos/jobs/components/job-detail.tsx`): Services
  tile's `handleOpenEditServices` now `router.push`-es to
  `/pos?source=job&id=<APPOINTMENT_UUID>&returnTo=/pos/jobs?jobId=<JOB_UUID>`.
  Critical invariant — `id` is the **appointment** UUID, not the job
  UUID, because Layer 8c's Save POSTs to
  `/api/pos/appointments/${sourceId}/services` unconditionally. Legacy
  pre-Phase-0a walk-ins (`appointment_id IS NULL`) get a refusal toast.
  Dead `<EditServicesDialog>` mount stays inert — Layer 8e deletes it.

  **Jobs page** (`src/app/pos/jobs/page.tsx`): new `?jobId=<id>`
  query-param hop opens the detail view on mount so returnTo lands on
  the specific job. Param stripped via `history.replaceState` after
  open (mirrors drain's URL-cleanup pattern). Audit §7.1's "lands back
  on /pos/jobs/[id]; card auto-refreshes" UX now matches reality.

  **Admin Appointment dialog**
  (`src/app/admin/appointments/components/appointment-detail-dialog.tsx`):
  Layer 4's disabled state removed; button now
  `router.push('/pos?source=appointment&id=<uuid>&returnTo=/admin/appointments')`.
  Dead `<EditServicesModal>` mount stays inert — Layer 8e deletes it.
  Test file `edit-services-disabled.test.tsx` rewritten for the enabled
  + navigate contract.

  **Products tab disabled in edit mode**
  (`src/app/pos/components/pos-workspace.tsx`): three defense-in-depth
  gates — tab button (cursor-not-allowed + aria-disabled + toast on
  click), `filteredProducts` useMemo (returns `[]` so global search
  doesn't render product cards), `handleBarcodeScan` (toast block).
  Rationale: cascade endpoint's Zod accepts services only; products
  attach at transaction commit, not edit time. UI block instead of
  silent drop.

  **EditModeBanner label revamp**
  (`src/app/pos/components/edit-mode-banner.tsx`): Layer 8c's
  "Editing Appointment #aaaaaaaa" UUID prefix replaced with
  "Editing Appointment: Jane Doe — Sat, May 16" via new exported
  `buildEditLabel` helper. 4-tier fallback hierarchy: customer+date →
  customer-only → date-only → UUID-prefix safety net. PST date
  formatting via `Intl.DateTimeFormat`. Interim label — proper A-XXXXX
  appointment numbering deferred to post-Phase-1 engine-unification.

  **Banner data plumbing**: new `TicketState.editSourceScheduledDate`
  field; optional `scheduledDate` param on `ENTER_EDIT_MODE`; both load
  endpoints (`/api/pos/appointments/[id]/load` +
  `/api/pos/jobs/[id]/checkout-items`) SELECT widened to include
  `scheduled_date`; drain threads it into the dispatch payload.

  **Tests** (+16 across 4 new/modified files):
    - `edit-services-disabled.test.tsx` (rewritten +3): enabled state,
      navigation URL, modal-not-mounted on click.
    - new `edit-services-deep-link.test.ts` (+4): pure URL contract —
      source=job, APPOINTMENT id (not job), encoded returnTo, three-
      param query string structure.
    - new `pos-workspace-products-gating.test.tsx` (+3): tab
      interactive when editMode=false; disabled when true; click
      surfaces toast + does not switch tab.
    - `edit-mode-banner.test.tsx` (+8 → total 14): customer+date label
      for appointment + job, 4-tier fallback hierarchy, `buildEditLabel`
      pure-function tests, last_name="" edge case.

  Collateral typecheck-edits to `TicketState` fixtures across 5 files
  for the new `editSourceScheduledDate` field.

  **Verification:** typecheck 0 new errors on touched files (2
  pre-existing unrelated test errors persist); ESLint 0 errors / 98
  warnings unchanged baseline; vitest 1492/1492 (was 1476 at Layer 8c;
  +16 net new); production build compiled successfully. Effort:
  ~1 session actual.

- **Layer 8d-bis — UAT fix-up — DONE 2026-05-17:** Four targeted fixes
  from Layer 8d UAT, plus Audit Finding #5 from the appointment + job
  status flow audit (read-only doc shipped earlier same day).

  **Fix 1 — Jobs card edit flow (Option G4)**
  (`src/app/pos/jobs/components/job-detail.tsx`,
  `src/app/api/pos/jobs/[id]/checkout-items/route.ts`,
  `src/app/pos/hooks/use-edit-mode-drain.ts`):
  Layer 8d shipped `id=<APPOINTMENT_UUID>` for source=job. The drain
  calls `/api/pos/jobs/${id}/checkout-items`, which expects a JOB UUID
  — 404'd on every Jobs-card edit attempt. **Architectural decision
  (Option G4)**: URL `id` is now the JOB UUID. The checkout-items
  endpoint adds `appointment_id` to its response. The drain hook reads
  `data.appointment_id` and uses it as `ticket.sourceId` (since Layer
  8c's Save POSTs to `/api/pos/appointments/${sourceId}/services`).
  Critical invariant preserved: `sourceId` is ALWAYS an appointment
  UUID — the change is where it gets populated (response field for
  source=job; URL `id` for source=appointment). Drain refuses (no
  dispatch, "Failed to load record for edit" toast) when source=job
  and response.appointment_id is null — defense in depth over the
  click-site guard.

  **Fix 2 — Register tab favorite product-add gate (4th surface)**
  (`src/app/pos/components/register-tab.tsx`):
  Layer 8d gated 3 product-add surfaces (Products tab, global search,
  barcode scanner). The Register tab favorite/quick-add grid was the
  missed 4th. `handleTapFavorite` now rejects `ticket.editMode &&
  fav.type === 'product'` clicks with the same toast text as the other
  3 gates. Visual treatment matches the disabled Products tab —
  product favorites get `opacity-40 cursor-not-allowed` +
  `aria-disabled` + a `title` tooltip in edit mode. Service / custom
  amount / surcharge / customer-lookup favorites unaffected.

  **Fix 3 — `no_show` refusal (Audit Finding #5)**
  (`src/app/api/pos/appointments/[id]/load/route.ts`,
  `src/lib/appointments/service-edit.ts`):
  Per the status flow audit §6.4, `no_show` is terminal — customer
  didn't arrive, no service is being delivered. Both the load endpoint
  and the cascade module now refuse `['completed', 'cancelled',
  'no_show']` in lockstep. Load-success implies save-success on status.

  **Fix 4 — "Edit in POS" button restyle**
  (`src/app/admin/appointments/components/appointment-detail-dialog.tsx`):
  Layer 8d shipped an in-Services text link. User requested a button
  matching the admin shell's "Open POS" header pattern, positioned
  top-right of the dialog. Button now absolute `right-12 top-4` inside
  `DialogHeader` (left of the close X at `right-4`); same icon
  (`MonitorSmartphone`), same classes
  (`flex items-center gap-2 rounded-md border border-gray-200 px-3
  py-1.5 text-sm font-medium text-gray-700 transition-colors
  hover:bg-gray-100`) as `admin-shell.tsx:949-960`. Text: "Edit in
  POS". In-Services text link removed (single entry point). Click
  navigation unchanged.

  **Tests** (+5 new cases, plus contract flip for the existing
  edit-services-deep-link test):
    - new `register-tab-favorites-gating.test.tsx` (+4 cases): non-
      edit-mode adds, edit-mode rejects + toast, edit-mode disabled
      styling, service favorites unaffected.
    - `use-edit-mode-drain.test.ts` (+2 cases): source=job sourceId
      comes from response.appointment_id (not URL); source=job +
      null appointment_id refuses the drain.
    - `edit-services-deep-link.test.ts` (rewritten): URL contract
      flips to `id=JOB_UUID`; no APPT_UUID in URL.
    - `pos/appointments/[id]/load/route.test.ts` (+1): 400 on
      no_show.
    - `pos/appointments/[id]/services/route.test.ts` (+1): 400 on
      no_show.
    - `lib/appointments/service-edit.test.ts` (+1): INVALID_STATUS
      400 on no_show.
    - `edit-services-disabled.test.tsx`: re-pinned to find button by
      "Edit in POS" label.

  **Verification:** typecheck 0 new errors on touched files (the
  pre-existing `quote-service.modifiers.test.ts` errors persist —
  confirmed unchanged via `git stash` on clean main); ESLint 0 errors
  / 98 warnings unchanged baseline; vitest 1500/1500 (was 1492 at
  Layer 8d; +8 net new); production build compiled in 14s. Effort:
  ~1 session actual.

  **Deferred (out of scope, tracked):**
    - Test 4 (banner format) — A-XXXXX appointment numbering scheme
      deferred to post-Phase-1 engine-unification. Layer 8d's
      customer+date fallback is the interim.
    - Test 6 (10 legacy jobs with `appointment_id IS NULL`) —
      graceful refusal toast covers them at the click handler. Full
      backfill is a separate Item 16 candidate.
    - 5 other status-flow audit follow-ups (dead `pending_approval`
      enum, admin appointment cancel NOT cascading to job, generic
      PATCH `/api/appointments/[id]` accepting any status, generic
      PATCH `/api/pos/jobs/[id]` accepting `closed` directly, post-
      complete-pre-checkout job-side guard) — all documented in
      audit §7.4; none affect F1 / Phase 1.

- **Layer 8e — Revert Layer 3a-i + appointment time precision — DONE 2026-05-17:**
  Two deliverables in one atomic commit.

  **Deliverable 1 — Dead modal deletion:**

    - Deleted `<EditServicesModal>` (`src/components/appointments/edit-services-modal.tsx`)
      and its orphan test `edit-services-modal-custom.test.tsx`. Item 15a's
      bespoke modal — unreachable since Layer 8d routed the Admin "Edit
      in POS" button to POS edit mode. The known display-bug in the modal's
      "Selected" per_unit total (2026-05-16 notes entry) dies with the file.
    - Deleted `<EditServicesDialog>` (`src/lib/services/edit-services-dialog.tsx`)
      and its orphan test `edit-services-dialog.test.tsx`. Layer 3a-i's
      POS Jobs-card dialog — unreachable since Layer 8d routed the Jobs
      card pencil to POS edit mode.
    - Removed imports + mounts from `appointment-detail-dialog.tsx` and
      `job-detail.tsx`. Cleaned up dead state (`editingServices`,
      `servicesOverride`, `onServicesUpdated` prop on the admin dialog;
      `showEditServices`, `editSelectedServices`, three `handleEditService*`
      functions on the Jobs card).
    - Updated `src/app/admin/appointments/page.tsx` to drop the
      `onServicesUpdated` prop pass.
    - Removed `EditServicesDialog` barrel export from `src/lib/services/index.ts`.
    - The sanctioned `// eslint-disable-next-line services/no-bespoke-pricing`
      comment lived inside the deleted modal — gone with the file. Grep
      confirms ZERO `eslint-disable.*services/no-bespoke-pricing` comments
      in `src/`.
    - `edit-services-disabled.test.tsx` updated: removed the modal mock
      + the "does NOT mount the legacy modal" test case (premise gone).

  **Deliverable 2 — Appointment time precision (bundled per UAT finding):**

  User reported the Admin Appointment dialog rejected the time input on
  some rows ("Please enter a valid value. The two nearest valid values are...").
  Mini-audit found the walk-in path (`/api/pos/jobs/route.ts:351-359`)
  was the only creation path writing seconds-precision (HH:MM:SS) via
  `Intl.DateTimeFormat(... second: '2-digit' ...)`. HTML5 `<input type="time">`
  step=60 rejects values with non-zero seconds. Other paths (online booking,
  voice agent, quote convert, reschedule routes, timeline drag) all already
  wrote HH:MM or HH:MM:00 via existing helpers.

    - **Data layer:** walk-in formatter changed to minute precision
      (`hour: '2-digit', minute: '2-digit'` + `:00` appended); comment
      block updated to document the new invariant.
    - **UI layer:** added `toTimeInputValue` helper in
      `appointment-detail-dialog.tsx` (same shape as POS reschedule
      dialog's existing helper) and wired into `reset()` for both
      `scheduled_start_time` and `scheduled_end_time`. Defense-in-depth
      against any future creator-path slip.
    - **Backfill migration:** `supabase/migrations/20260518000000_truncate_appointment_scheduled_times_to_minute.sql`
      — idempotent UPDATE truncating existing rows. WHERE filters to
      seconds <> 0; expected 5-10 affected rows per user's pre-session
      SQL data.
    - **NOT touched** (intake / receipt / audit precision must keep
      seconds): `jobs.actual_start_time`, `jobs.actual_end_time`,
      `transactions.created_at`, receipts, audit log timestamps.

  **Tests** (+4 net new cases):
    - `walk-in-modifier-persistence.test.ts` (+1): walk-in writes
      `scheduled_*_time` matching `/^\d{2}:\d{2}:00$/`; explicit
      assertion on the "00" seconds segment.
    - new `time-input-truncation.test.tsx` (+3): Admin dialog truncates
      `17:19:11` → `17:19`; minute-precise input passes through
      unchanged; `14:00:00` → `14:00`.

  **Verification:** typecheck 0 new errors on touched files (pre-existing
  `quote-service.modifiers.test.ts` + `catalog-browser-custom-routing.test.tsx`
  errors persist, confirmed unchanged via `git stash` on clean main);
  ESLint 0 errors / 98 warnings unchanged baseline; vitest 1486/1486
  passing (was 1500 at Layer 8d-bis; net -14 = -4 from deleted
  `edit-services-modal-custom.test.tsx` -13 from deleted
  `edit-services-dialog.test.tsx` -1 from removed legacy-modal-not-mounted
  case +4 new); production build compiled clean in 30s.

  **Effort:** ~1 session actual.

- **Layer 8f — Comprehensive test coverage — DONE 2026-05-17:**
  Tests-only session, zero production code changes. Pins the cross-layer
  joins across Layers 8a-8e via a new integration test file, fills two
  narrow Layer 8d gating gaps surfaced during the coverage audit, and
  publishes a per-surface coverage matrix doc.

  **Deliverable 1 — End-to-end integration test file:**
  `src/lib/appointments/__tests__/edit-flow.integration.test.ts` (+14 cases)
  joins the load → drain → save pipeline:
    - source=appointment happy path — load endpoint response feeds
      `buildTicketStateFromLoad`, `runEditModeDrain` dispatches
      `ENTER_EDIT_MODE` with `sourceId === URL.id`, cascade save preserves
      the contract.
    - source=job (Option G4) — `ticket.sourceId` resolves from
      `response.appointment_id` (NOT the URL `id` which is the JOB UUID).
      Pins the critical Layer 8d-bis invariant.
    - source=job + null appointment_id — drain refuses (defense in depth).
    - Modifier-only edit — coupon added / cleared, totals recompute.
    - Combined edit (services + modifiers) — atomic write; canonical
      combined discount = `coupon + loyalty + manual`.
    - All-services-removed save blocked (INVALID_INPUT).
    - Bogus UUID 404 propagation (load 404 + cascade NOT_FOUND).
    - Status guard lockstep — parameterized across `completed` /
      `cancelled` / `no_show` so a future drift surfaces immediately.
    - Drain↔cascade pricing parity (mobile_fee synthesis).

  **Deliverable 2 — Layer 8d gating gaps filled:**
  `src/app/pos/components/__tests__/pos-workspace-products-gating.test.tsx`
  extended with 3 new cases. The original Layer 8d tested the Products tab
  gate but stubbed the other two product-add surfaces — both now pinned:
    - Barcode-scanner gate — captures `onScan` callback via hoisted mock;
      edit-mode short-circuits with `toast.info` and never hits the API.
    - Global-search filteredProducts gate — `<ProductGrid>` never mounts
      when `editMode=true`, even with catalog populated.
  The 4th surface (Register-tab favorite-grid, Layer 8d-bis) was already
  tested in `register-tab-favorites-gating.test.tsx`.

  **Deliverable 3 — Coverage matrix doc:**
  `docs/dev/PHASE_1_TEST_COVERAGE.md` — per-surface × test-type matrix
  (50+ rows organized by Phase 1 layer), 9 documented intentional gaps
  (G1-G9: heavy provider deps, OCC scoped out, deferred banner numbering,
  etc.) each with rationale, file-to-test mapping for future maintenance,
  hand-off notes.

  **Layer 4 ESLint regression verified:**
    - Rule at `'error'` level (`eslint.config.mjs:76`).
    - Zero `eslint-disable.*services/no-bespoke-pricing` comments in `src/`
      (baseline preserved from Layer 8e).
    - Both new/modified test files lint clean (`npx eslint` returns empty).

  **Verification:**
    - typecheck: 0 new errors on touched files. Pre-existing
      `quote-service.modifiers.test.ts` + `catalog-browser-custom-routing.test.tsx`
      errors persist — unchanged from Layer 8e baseline.
    - ESLint: 0 errors / 98 warnings — unchanged baseline.
    - Vitest: **1503/1503** (was 1486 at Layer 8e; +17 net new = +14
      integration + +3 workspace gating).
    - Production build: compiled clean.

  **Effort:** ~0.75 sessions actual (as estimated).

  **Phase 1 final state:** All 7 sub-layers (8a + 8b + 8c + 8d + 8d-bis
  + 8e + 8f) shipped. Item 15f COMPLETE. The full edit-via-POS
  architectural pivot from `QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` is now
  in production with cross-layer contract enforcement via tests + ESLint.

**Phase 1 total: ~5.5 sessions, ~12-14 hours.** Phase 1 is sequential
within itself (each layer builds on previous). Phase 1 layers cannot start
until Item 15g sub-layers 15g-i + 15g-ii land.

**Permissions:** No new keys. Reuse `appointments.reschedule` for admin
edits and `pos.jobs.manage` for POS edits.

**Item 15a status under this restructure:** Item 15a's `<EditServicesModal>`
gets deleted at Layer 8e. Item 15a's cascade endpoint and helpers STAY —
they're the persistence layer that Phase 1 routes call.


**Layer 3c — Booking Wizard price-math migration (NOT UI) — DONE 2026-05-16:**
- `src/components/booking/step-service-select.tsx` replaces its inline
  per-pricing_model price switch (lines 282, 951, 1307, 1394, 1404, 1440,
  1482) with imports of `resolveServicePrice` /
  `resolveServicePriceWithSale` from the canonical engine.
- Bespoke customer-facing UI of the wizard is preserved — only price
  calculations route through the shared resolver.
- Synthesizes ephemeral `ServicePricing` rows for `flat` / `per_unit`
  (which have no `service_pricing` row in the catalog) to feed the engine;
  mirrors `routeServiceTap`'s `quick-add-synthetic-flat` pattern.
- Adds missing `custom` branch in `computePrice` — pre-fix the wizard
  returned 0 for `pricing_model === 'custom'`, blocking Flood Damage from
  booking; now returns `service.custom_starting_price` (until Layer 15g-ii
  exposes operator-prompted final price on this path).
- Wizard-local `isVehicleSizeOffered(tier, sc)` provides column-presence
  check (for hiding unconfigured customer sizes from the size grid) — a
  metadata query, not a price computation, since the engine doesn't expose
  null-vs-set semantics for per-size columns.
- Deletes bespoke `getVehicleSizePrice(tier, sc)` (no longer needed),
  unused `<PricingSelector>` `saleStatus` prop + `SaleStatusInfo`
  interface, and all `getTierSaleInfo` call sites in PricingSelector /
  getServicePriceDisplay / ScopeTierCard. `ScopeTierCard` now takes
  `resolved: ResolvedPrice` instead of `saleInfo: TierSaleInfo | null`;
  its "From $X" floor iterates `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` with
  the engine + `isVehicleSizeOffered` filter.
- New test file `src/components/booking/__tests__/step-service-select.test.tsx`
  (27 cases) pins all 6 `pricing_model` values: flat $175 / vehicle_size
  row-based pattern (exotic $450 NOT sedan, classic $725) / vehicle_size
  column-based pattern (exotic/classic per-size columns) / scope
  (non-vehicle_size_aware returns tier.price) / per_unit ($150 × 3 = $450,
  sale path) / specialty (Aircraft $800, Boat $600, Motorcycle $200) /
  custom (Flood Damage = $475). Exports added: `computePrice` +
  `getServicePriceDisplay` from `step-service-select.tsx` to enable
  testing.

**Layer 3d — Server-side helper migration (voice agent + SMS auto-responder) — DONE 2026-05-16:**
- `src/lib/services/service-resolver.ts` is a 4th bespoke pricing implementation
  discovered during Layer 1 verification. It exports `resolveServiceByName`
  (legitimate name-lookup, KEEP) and `resolvePrice` (parallel implementation
  of price math, REPLACE).
- `resolvePrice` has multiple bugs:
  - Missing `exotic` and `classic` size_class cases — both fall through to
    sedan column, silently mis-pricing exotic/classic vehicles in customer-facing
    voice and SMS flows.
  - `per_unit` services return single-unit price ignoring quantity (voice
    agent quotes $150 for Scratch Repair regardless of count).
  - `specialty` services return first tier instead of matching the vehicle's
    `specialty_tier` (wrong price for aircraft / boat / RV tiers).
  - `custom` services return $0 silently (`pricing.length === 0` fallthrough).
- Rewrite `resolvePrice` as a thin wrapper around `resolveServicePriceWithSale`
  from the canonical engine, mapping its output to the existing `ResolvedPrice`
  return shape so the 3 importers (`send-quote-sms/route.ts`,
  `webhooks/twilio/inbound/route.ts`, `voice-post-call.ts`) need no code changes.
- `resolveServiceByName` keeps its existing signature — it's a legitimate
  name-resolution concern, separate from pricing.
- Add tests covering: exotic Ferrari + 1-Year Ceramic Shield = $725 (not $425);
  specialty service correctly resolves vehicle's `specialty_tier`; per_unit
  service multiplied by quantity correctly; custom service uses
  `custom_starting_price` as the surfaced price (until Layer 2's prompt UX
  is exposed via this path).

**Layer 3e — Wire `<CustomPriceDialog>` into shared `<CatalogBrowser>` ecosystem (system-wide custom-pricing fix) — DONE 2026-05-17:**

UAT against shipped Layer 3c (customer-facing booking wizard) passed. UAT
against `<CatalogBrowser>` in POS revealed that the "Add to Ticket" button
is **disabled for `pricing_model === 'custom'` services across all 4 native
consumers**: POS New Quote builder, POS New Sale (Register), Item 15a's
`<EditServicesModal>` (Admin appointment edit), and Layer 3a-i's
`<EditServicesDialog>` (Jobs card edit, currently shipped). Trying to add
Flood Damage / Mold Extraction (`pricing_model: 'custom'`,
`custom_starting_price: 475.00`) results in a greyed-out button — operator
cannot add the service.

Root cause: Layer 2 (commit `3195c38c`) shipped `<CustomPriceDialog>` and
wired it into the `useServicePicker` hook. The hook is only mounted on
surfaces migrated through Layer 3a-i (Jobs card). The 4 native
`<CatalogBrowser>` consumers call `<CatalogBrowser>` (and its child
`<ServiceDetailDialog>` / `<ServicePricingPicker>`) directly and never go
through the hook, so they don't get Layer 2's `custom`-pricing UX.

Layer 3e wires `<CustomPriceDialog>` into the shared catalog browser ecosystem
so all 4 native consumers benefit without each having to mount the hook.
Likely insertion point: the shared ancestor of the 4 consumers — either
`<ServiceDetailDialog>` (the intermediate "Add to Ticket" dialog) or
`<CatalogBrowser>` itself, whichever is the natural ancestor across all
4 surfaces. Routing logic reuses `routeServiceTap` from `picker-engine.ts`
(already returns `open-custom-price-dialog` for `pricing_model === 'custom'`).

- Identify the right insertion point — likely `<ServiceDetailDialog>` or
  `<CatalogBrowser>`, whichever is the shared ancestor of all 4 consumers.
- Wire the existing `<CustomPriceDialog>` + `buildCustomPricing` helper from
  `src/lib/services/custom-price-dialog.tsx` into that insertion point.
- Route `pricing_model === 'custom'` taps through `<CustomPriceDialog>` and
  emit the synthesized `ServicePricing` row via the existing callback path
  (`onAddService` for the quote builder; `dispatch({ type: 'ADD_SERVICE', ... })`
  for the Sale tab).
- New tests pin the routing: `pricing_model === 'custom'` opens the dialog;
  confirm emits the synthesized row; cancel emits nothing; "Add to Ticket"
  is no longer disabled for Flood Damage / Mold Extraction.

**Effort: ~0.5-1 session.** Sequencing: parallel with Item 15g Layer 15g-ii
(no file overlap — 3e touches POS catalog UI; 15g-ii touches quotes /
appointments persistence). BOTH Layer 3e AND Layer 15g-ii must land before
Phase 1 (Layers 8a-8f) can start.

**Layer 3b — PERMANENTLY MOOT.** The original plan (migrate the 4 working
POS surfaces — POS Register, Quote Builder, Flag-an-Issue, Catalog Panel —
to the `useServicePicker` hook) becomes moot under the edit-via-POS pivot
(Phase 1). These surfaces ARE the canonical surface that other records
route INTO for service editing. No migration needed; they already work
correctly via `<CatalogBrowser>` + `<ServicePricingPicker>` directly.
ESLint enforcement (Layer 4) is the real drift-prevention mechanism for
any future code that might attempt to re-build a parallel picker.


**Layer 4 — ESLint enforcement — DONE 2026-05-17:**
- `eslint-rules/services-no-bespoke-pricing.js` registered in
  `eslint.config.mjs` under the `services` plugin namespace, severity
  `'error'`. Three smoking-gun signals:
  - **Signal 1**: function-name pattern (`resolveServicePrice` /
    `resolvePrice` / `getServicePrice` / `computeServicePrice` defined
    outside `src/lib/services/`).
  - **Signal 2**: `switch (X.pricing_model)` doing money math without
    calling the canonical engine. Refined to exclude string/JSX-returning
    display dispatches, classifier switches setting non-price flags, and
    label generators wrapping prices in `formatCurrency` — only flags
    when at least one case body reads a money property in a numeric-
    output context (not comparison, not formatter argument).
  - **Signal 3**: direct `vehicle_size_*_price` reads in arithmetic /
    return contexts (column-presence `!= null` checks remain allowed for
    customer-facing display gating like the wizard's
    `isVehicleSizeOffered`).
- Engine files (`src/lib/services/**`) and test files
  (`**/__tests__/**`, `**/*.test.{ts,tsx,js,jsx}`) are exempt.
- The ONLY sanctioned in-source disable comment is on Item 15a's
  dead-code `resolveServicePrice` inside `<EditServicesModal>`
  (scheduled for deletion in Phase 1 Layer 8e).
- 19 RuleTester cases in
  `eslint-rules/__tests__/services-no-bespoke-pricing.test.js` (10
  valid + 9 invalid pinning each signal's positive + negative paths).
- **4 bespoke-pricer migrations** caught by initial rule enforcement
  (under-scoped in Layers 3c–3e); all wrapped around
  `resolveServicePriceWithSale` per Layer 3d's pattern:
  1. `src/app/api/book/_pricing.ts` (extracted from `route.ts` because
     Next.js route files only permit GET/POST/etc. exports) —
     `computeExpectedPrice` server-side booking-price validator.
  2. `src/components/booking/booking-wizard.tsx:reconstructConfig` —
     deep-link / back-navigation config reconstruction.
  3. `src/components/public/service-card.tsx:getStartingPrice` —
     public service catalog "From $X" display.
  4. `src/app/api/voice-agent/services/route.ts` — voice-agent catalog
     response pricing array builder; SELECT widened to fetch full
     ServicePricing.
- **Item 15a's Admin Appointment "Edit Services" trigger disabled** —
  the modal is mounted-but-unreachable until Phase 1 Layer 8e deletes
  it; carries the single sanctioned eslint-disable comment.

**Out of scope:**
- Layer 3b (4 working POS surfaces migration to the hook).
- Schema rationalization of Pattern A vs Pattern B vehicle-size storage.
  Both patterns work correctly through `resolveServicePrice`; consolidation
  is a separate future item if needed.
- Changing the Booking Wizard's bespoke UI (only its math routes through
  the canonical resolver).
- Service-category management UI (per CLAUDE.md Rule 14, that's an admin-UI
  responsibility, not a picker concern).

**Files likely affected:**
- New: `src/lib/services/picker-engine.ts`, `use-service-picker.ts`, `index.ts`
- New: `src/lib/services/__tests__/picker-engine.test.ts`,
  `use-service-picker.test.tsx`
- Modified: `src/app/pos/utils/pricing.ts` (becomes re-export shim)
- Modified (Layer 3a): `src/app/pos/jobs/components/job-detail.tsx`
- Modified (Layer 3a): `src/components/appointments/edit-services-modal.tsx`
  (deleted) + Admin Appointment dialog integration point
- Modified (Layer 3c): `src/components/booking/step-service-select.tsx`
  (math-only changes)
- Modified (Layer 3d): `src/lib/services/service-resolver.ts`
  (rewrite `resolvePrice` as thin wrapper around canonical
  `resolveServicePriceWithSale`; keep `resolveServiceByName` unchanged)
- New (Layer 3d): `src/lib/services/__tests__/service-resolver.test.ts`
  (test the bug fixes: exotic/classic size_classes, per_unit quantity,
  specialty tier matching, custom service starting price)
- Modified (Layer 3e): `src/app/pos/components/catalog-browser.tsx` (or
  whichever shared ancestor owns the "Add to Ticket" routing for custom
  services across the 4 native consumers)
- Modified (Layer 3e): `src/app/pos/components/service-detail-dialog.tsx`
  (if it's the intermediate dialog that gates "Add to Ticket" — confirm
  insertion point during the session)
- New (Layer 3e): `src/lib/services/__tests__/custom-pricing-routing.test.tsx`
  (or extend existing `<CatalogBrowser>` / `<ServiceDetailDialog>` test
  files — pin that `pricing_model === 'custom'` taps now open
  `<CustomPriceDialog>` instead of leaving the Add button disabled)
- New (Layer 4): `eslint-rules/services-no-bespoke-pricing.js`
- Modified (Layer 4): `eslint.config.mjs` to register the rule

**Notes / decisions log:**
- 2026-05-16: User Q1 (custom UX) = a (operator prompt for final price).
- 2026-05-16: User Q2 (sequencing) = a (incremental layer landings).
- 2026-05-16: User Q3 (deploy) = II (hold Wave 1.5 until Item 15f Layers
  1+2+3a+3c+4 land; single batch deploy).
- 2026-05-16: User Q4 (unification pattern) = hook (not compound component,
  not literal component merge).
- 2026-05-16: User Q5 (migration scope) = i+ (fix broken surfaces + share
  engine with Booking Wizard; defer 4 working POS surfaces).
- 2026-05-16: Hook location = `src/lib/services/` as new shared-lib directory
  (mirrors Money-Unify-1's `src/lib/money/` pattern).
- 2026-05-16: Layer 1 stays pure refactor (does NOT fix the Item 15a bug
  inline); Item 15a fix lands in Layer 3a.
- 2026-05-16: ESLint scaffolding deferred to Layer 4 (no rule scaffolding
  in Layer 1).
- Reference: `<ServicePricingPicker>` audit conducted 2026-05-16 (in chat,
  not committed as a doc — see CC session output of that date).
- 2026-05-16 (Layer 1 — pure refactor session): shipped the foundation.
  New files: `src/lib/services/picker-engine.ts` (engine math +
  `routeServiceTap` pure-function extraction of `<CatalogBrowser>`'s tap
  routing tree, byte-identical to lines 333-419 / 446-488 of
  `catalog-browser.tsx`), `src/lib/services/use-service-picker.ts` (hook
  wrapping `<CatalogBrowser>` + `<ServicePricingPicker>` — `.ts` extension
  honored via `React.createElement` so the file lives alongside the other
  `src/lib/services/` pure modules), `src/lib/services/index.ts` (public
  barrel). Modified: `src/app/pos/utils/pricing.ts` becomes a thin
  `@deprecated` re-export shim so all 9 existing callers continue working
  unchanged. Tests: 32 engine tests in `picker-engine.test.ts` (exhaustive
  size_class coverage + sale interactions + one `routeServiceTap` test per
  `pricing_model` — `custom` pinned as "NOT YET HANDLED — Layer 2" so
  Layer 2 can update it deliberately), 7 hook-contract tests in
  `use-service-picker.test.tsx` with vi-mocked `<CatalogBrowser>` and
  `<ServicePricingPicker>` (the hook's job is wiring, not the components'
  behavior; mocking keeps the test focused). Verification: typecheck
  clean, lint 0 errors (98 warnings = baseline — no new ones), 1131/1131
  vitest pass (was 1088, +43 new), production build compiled
  successfully. **No surface migrated to the hook this session** — Layer
  3a / 3c handle migrations; Layer 3b (4 working POS surfaces) deferred
  indefinitely. **Small deviation from session brief:** brief's example
  `index.ts` re-exported `ServicePickerOptions` from `./picker-engine`,
  but that type belongs to the hook — placed it under
  `./use-service-picker`. The barrel re-exports both, so external import
  sites are unaffected. Commit hash recorded in ledger row below.
- 2026-05-16 (Layer 2 — `custom` pricing_model UX session): added the
  staff-assessment prompt for `pricing_model === 'custom'` services
  (canonical fixture: "Flood Damage / Mold Extraction" — `pricing_model:
  'custom'`, `custom_starting_price: 475`, no `service_pricing` rows).
  New file `src/lib/services/custom-price-dialog.tsx` —
  `<CustomPriceDialog>` matches `<PerUnitPicker>`'s dialog conventions
  (same primitives, same shell, same button layout). Validation enforces
  positive amount ≥ `STRIPE_MIN_DOLLARS` (from `src/lib/utils/money.ts`
  per Rule 20 — no hardcoded 50). Synthesizes a `ServicePricing` row at
  confirm time via the exported `buildCustomPricing(service, amount)`
  helper: `tier_name: 'custom'`, `tier_label: 'Custom Assessment'`,
  `is_vehicle_size_aware: false`, all per-size columns null, synthetic
  `id` of `custom-${service.id}-${Date.now()}`. `picker-engine.ts` got
  one new variant on `ServiceTapRoute` (`open-custom-price-dialog`) and
  one new branch in `routeServiceTap` — fires regardless of vehicle and
  regardless of `flat_price` / `pricing` row state so the operator
  always assesses a custom service rather than quick-adding a stale
  value. The engine is now intentionally ahead of `<CatalogBrowser>` for
  `custom` (the browser still dead-ends until Layer 3a/3d migrates
  consumers). `useServicePicker` gained an imperative `tapService`
  method (Layer 3a/3d consumers will call it from their own list/grid
  entry points) and the `ActiveDialog` slot now picks between
  `<ServicePricingPicker>` and `<CustomPriceDialog>` based on a
  discriminated `ActiveDialogState` union. `index.ts` barrel re-exports
  `CustomPriceDialog`, `buildCustomPricing`, `CustomPriceDialogProps`.
  Tests: the Layer 1 "NOT YET HANDLED — Layer 2" pin in
  `picker-engine.test.ts` was updated to assert the new behavior and a
  second test pinned the "custom routing wins over flat_price/pricing
  rows" invariant. New `custom-price-dialog.test.tsx` covers 10 dialog
  cases (rendering, all validation paths including Stripe-minimum
  boundary, confirm + cancel) plus a `buildCustomPricing` unit test.
  Extended `use-service-picker.test.tsx` with 6 Layer 2 hook cases
  including a `<CustomPriceDialog>` vi-mock (sibling pattern to the
  Layer 1 mocks). Verification: typecheck clean, lint 0 errors (98
  warnings = unchanged baseline), 1149/1149 vitest pass (1131 prior +
  18 net new), build compiled successfully. **No surface migrated** —
  Layer 3a / 3c / 3d still own that work.
- 2026-05-16 (Layer 3a — partial migration; scope narrowed mid-session):
  brief targeted POS Jobs card + Admin Appointment dialog. Discovery
  surfaced an architectural blocker: `<CatalogBrowser>` (wrapped by
  `useServicePicker`) hard-depends on POS-only contexts. `useTicket()`
  at `catalog-browser.tsx:54` THROWS without a `<TicketProvider>`
  ancestor (`ticket-context.tsx:222`); `usePosPermission()` at
  `catalog-browser.tsx:55-56` defaults to `granted: false, loading: true`
  without `<PosPermissionProvider>`. The POS Jobs card runs inside
  `<PosShell>` so the hook drops in cleanly. The Admin Appointment
  dialog lives outside the POS provider tree and would crash on mount.
  Stopped per session-brief risk-callout instruction ("STOP and ask")
  and surfaced 4 paths to the user. **User chose Option A: ship Jobs
  card today, defer Admin migration.** Item 15a's `<EditServicesModal>`
  continues to ship unchanged — including its local `resolveServicePrice`
  that mishandles Pattern A vehicle-size pricing — until a follow-up
  session decouples `<CatalogBrowser>` from POS contexts (likely a new
  Layer 3a.2 or sibling `<ServiceCatalogPane>` in `src/lib/services/`
  per Option D from the in-session discussion). New file
  `src/lib/services/edit-services-dialog.tsx` — `<EditServicesDialog>`
  shared 2-pane wrapper around the hook (left: `<CatalogPane>`, right:
  caller-rendered selected list with per-row remove + running total).
  UI-only, fully controlled — caller owns selection state and the
  persistence call. POS Jobs card migration (`job-detail.tsx`): deleted
  bespoke `getServicePrice()` (the silent revenue leak on tiered
  services), the bespoke modal (`showEditServices`+`allServices`+
  `loadingServices`+`serviceSearch`+`handleToggleEditService`), and the
  unused `<Search>` icon import. New flow: dialog mounts on
  `setShowEditServices(true)`, selection seeds from `job.services`
  (filtering out `is_mobile_fee` rows), `onServiceAdded` /
  `onServiceRemoved` mutate local state, Save calls existing
  `handlePatchJob({services})` — payload shape (`JobServiceSnapshot[]`)
  unchanged. All 6 `pricing_model` values now resolve through the
  canonical engine on the Jobs card. New test file
  `src/lib/services/__tests__/edit-services-dialog.test.tsx` — 13 cases
  with `useServicePicker` vi-mocked (keeps the test focused on the
  wrapper without booting POS contexts). No existing Jobs-card tests
  covered the deleted modal directly, so no rewrites/deletions needed.
  Verification: typecheck clean, lint 0 errors (98 warnings = unchanged
  baseline), 1162/1162 vitest pass (was 1149 at Layer 2; +13 new),
  production build compiled successfully. **Manual UAT NOT performed in
  this session** — requires running the app against a real database;
  user verifies post-session.
- 2026-05-16 (Layer 3a-i UAT findings + edit-via-POS audit): real-world
  UAT of the shipped `<EditServicesDialog>` surfaced 4 failures —
  `<CatalogBrowser>` hard-depends on POS contexts (blocks Admin migration);
  no vehicle-compatibility warning in the new dialog; broken custom-pricing
  add path (Flood Damage button disabled); prices saved to `jobs.services`
  still wrong despite the canonical engine being mounted. Root cause: the
  shared dialog wraps `<CatalogBrowser>`'s UI without inheriting POS's
  surrounding orchestration (ticket state, permission context, compatibility,
  custom pricing routing, sale banners, cascade-write semantics). User
  proposed an architectural pivot — instead of decoupling `<CatalogBrowser>`
  from POS, take operators back to the POS Sale tab to add/remove items
  (mirroring the existing quote → POS edit flow), keeping the rest of the
  job/appointment edit experience pencil-icon-on-source-dialog. Discovery
  audit completed in `docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md`
  (sections 1-8: full trace of quote → POS edit, `<TicketContext>` data-model
  gap analysis, feasibility per record type, ~5.5-session effort estimate,
  breaking-change risk, no new permission keys needed). **Recommendation
  (Section 8): proceed with edit-via-POS — revert Layer 3a-i when the
  replacement lands; delete `<EditServicesDialog>` + Item 15a's
  `<EditServicesModal>` files; keep `picker-engine.ts`, `use-service-picker.ts`,
  `custom-price-dialog.tsx`, and Item 15a's cascade endpoint as canonical
  writers.** Layer 3a-i revert is pending the user's architectural sign-off
  on the audit. Layer 3b is rendered moot (the 4 working POS surfaces ARE
  the surface operators get routed to). Layers 3c (Booking Wizard math) +
  3d (service-resolver.ts) + 4 (ESLint) remain in scope independent of the
  edit-flow architecture.
- 2026-05-16 (Lifecycle persistence audit — scope-sizing for potential
  Item 15g, parallel concern): user reported a separate bug — discount /
  coupon / loyalty applied during the Quote phase silently vanish through
  Quote → Appointment → Job → Checkout. Audit completed in
  `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md`. Three independent
  drop points identified: (1) `quotes` table lacks loyalty + manual-discount
  columns (schema gap — those modifiers never reach DB), (2) `convertQuote`
  hardcodes `discount_amount: 0` and drops `coupon_code` despite
  `appointments.coupon_code` + `coupon_discount` columns existing (logic
  gap — booking wizard at `/api/book` is the only writer of those columns
  today), (3) `checkout-items` only reads `quotes.coupon_code` via
  `job.quote_id` and never falls back to `appointments.coupon_code` — so
  even online bookings (which DO persist coupon to appointment) lose the
  coupon at register hydration. Loyalty redemption is stored only as
  plaintext in `appointments.internal_notes` by the booking wizard.
  Effort: ~5 sessions full fix (schema migrations + endpoint updates +
  UI surfacing + tests); ~0.5 session MVP that closes the coupon-only
  path through logic fixes alone. **Recommendation: schedule as a separate
  Item 15g BEFORE Phase 1's edit-via-POS layers (8a-8f) land**, otherwise
  Phase 1's `LOAD_FROM_SOURCE` action would silently re-zero modifiers
  on every job/appointment edit round-trip. Phase 1 is decision-blocked
  on whether Item 15g lands first (recommended ordering) vs. parallel-
  tracked with full Item 15g following. **Item 15g NOT yet added to the
  roadmap — awaiting user sign-off on scope.**
- 2026-05-16 (Layer 3d — `service-resolver.ts` rewrite, voice agent + SMS
  auto-responder): closes the 4th and final bespoke pricing implementation
  surfaced during Layer 1 verification. `resolvePrice` rewritten as a thin
  wrapper around `resolveServicePriceWithSale` from `picker-engine.ts` per
  CLAUDE.md Rule 22; dispatches by `pricing_model`, synthesizes a
  `ServicePricing` row for `flat` / `per_unit` / `custom` cases (which have
  no row in `service_pricing`), and picks the correct tier for
  `vehicle_size` / `scope` / `specialty`. Four customer-facing silent
  mis-pricing bugs closed: (1) `exotic` + `classic` size_class no longer
  fall through to the sedan column — Ferrari 1-Year Ceramic Shield quoted
  via voice / SMS now correctly returns $725 instead of $425; (2)
  `per_unit` services like Scratch Repair now return `per_unit_price`
  ($150) instead of $0; (3) `specialty` services now dispatch via the new
  optional `specialtyTier` argument to find the matching `tier_name` row
  instead of always returning `tiers[0]`; (4) `custom` services now return
  `custom_starting_price` ($475 for Flood Damage / Mold Extraction)
  instead of $0. `resolveServiceByName` SELECT widened to fetch
  `per_unit_price`, `custom_starting_price`,
  `vehicle_size_exotic_price`, `vehicle_size_classic_price`, plus the full
  `ServicePricing` row shape so the canonical engine can consume it
  directly. `ResolvedService` interface gained `per_unit_price` +
  `custom_starting_price`; `service_pricing[]` retyped from a partial
  subset to the full `ServicePricing[]`. **The `ResolvedPrice` return
  shape (`price`, `salePrice`, `tierName`, `isOnSale`) is preserved
  byte-identically** so the 3 importers
  (`src/app/api/voice-agent/send-quote-sms/route.ts`,
  `src/app/api/webhooks/twilio/inbound/route.ts`,
  `src/lib/services/voice-post-call.ts`) need no code changes. **The
  optional `specialtyTier` argument is wired through the resolver but the
  3 importers do not yet SELECT `vehicles.specialty_tier` from the DB**
  — end-to-end specialty pricing requires a one-line-each follow-up
  update at each call site (`select('size_class, specialty_tier')` +
  `resolvePrice(svc, sizeClass, { specialtyTier: vehicle.specialty_tier
  })`); scheduled as a separate trailing task, not blocking Layer 3d
  closure. New `src/lib/services/__tests__/service-resolver.test.ts` —
  27 cases pinning all 4 bug fixes (flat 3, vehicle_size / scope 7,
  per_unit 3, specialty 7, custom 4, size-class edge cases 2).
  Verification: typecheck clean on touched files; lint 0 errors / 0 new
  warnings on touched files; 1192/1192 vitest pass (was 1162 at Layer 3a
  partial; +27 new from this test file; remaining delta from in-progress
  unrelated tests in the working tree). **Production build NOT
  attempted** — the working tree carries pre-existing uncommitted
  modifications in `step-service-select.tsx`, `checkout-items/route.ts`,
  and `convert-service.ts` from a parallel session that have their own
  unrelated typecheck errors. **Manual UAT NOT performed** — voice +
  SMS paths require a real call / inbound message against the deployed
  environment; user verifies post-session against the canonical fixtures
  (Ferrari Ceramic Shield = $725, Scratch Repair = $150/unit, Mold
  Extraction = $475 starting price; specialty pricing remains partially
  fixed until the call-site updates land).
- 2026-05-16 (Layer 3c — Booking Wizard price-math migration): customer-
  facing booking wizard now routes ALL service-pricing math through the
  canonical engine (`resolveServicePrice` /
  `resolveServicePriceWithSale`) per Rule 22. The 6 audit-cited inline
  math sites in `src/components/booking/step-service-select.tsx`
  (`computePrice`, `getServicePriceDisplay` + its case branches at the
  cited lines, `PricingSelector` cases for flat/vehicle_size/scope/
  specialty/per_unit, and `ScopeTierCard`'s "From $X" floor) are gone.
  `flat` and `per_unit` services have no `service_pricing` row, so the
  wizard synthesizes an ephemeral `ServicePricing` to feed the engine
  (mirrors `routeServiceTap`'s `quick-add-synthetic-flat` pattern); the
  `per_unit` qty multiplication stays wizard-side (the engine resolves
  the unit price). Two engine-correct side effects: (1) `custom`
  pricing_model now resolves to `service.custom_starting_price` — pre-
  fix the wizard had no `custom` branch in `computePrice` and returned 0;
  (2) `is_vehicle_size_aware: true` tiers now apply tier-level
  `sale_price` when active, since `resolveServicePriceWithSale` compares
  sale_price against the resolved per-size price. Wizard-local
  `isVehicleSizeOffered(tier, sc)` is a pure column-presence query (NOT
  a price computation — needed for the scope+size customer grid to hide
  unconfigured sizes rather than falling back to base `tier.price`);
  comment in-source documents this. Deleted: bespoke
  `getVehicleSizePrice(tier, sc)` helper (the variant of the silent
  exotic/classic mispricing root cause), all `getTierSaleInfo` call
  sites in PricingSelector / getServicePriceDisplay / ScopeTierCard,
  the unused `<PricingSelector>` `saleStatus` prop +
  `SaleStatusInfo` interface, the redundant outer-component
  `saleStatus` derivation. `ScopeTierCard`'s `saleInfo` prop renamed
  to `resolved: ResolvedPrice` (engine's canonical output shape); the
  "From $X" floor iterates `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` with
  `isVehicleSizeOffered` filter + `resolveServicePrice` for values.
  Customer-facing UI/layout/styling is untouched per Rule 22 carve-out.
  New test file
  `src/components/booking/__tests__/step-service-select.test.tsx` (27
  cases) pins all 6 `pricing_model` values: flat $175 / vehicle_size
  row-based (exotic $450 NOT sedan, classic Ceramic Shield $725) /
  vehicle_size column-based (engine reads exotic/classic per-size
  columns) / scope (non-vehicle_size_aware tier returns tier.price) /
  per_unit (Scratch Repair $150 × 3 = $450, sale-applied variant) /
  specialty (Aircraft $800, Boat $600, Motorcycle $200) / custom
  (Flood Damage $475). `getServicePriceDisplay` label tests pinned for
  sale strikethrough + "From $X" min. Required exporting `computePrice`
  + `getServicePriceDisplay` from the wizard file for direct test
  consumption (file is `'use client'`, but TypeScript-side exports work
  for both the React tree and the jsdom test). Verification: typecheck
  clean, lint 0 errors (98 warnings = unchanged baseline), 1226/1226
  vitest pass (was 1199 prior; +27 new), production build compiled
  successfully (787 static pages, clean `.next` rebuild).
  **Manual UAT NOT performed** — booking wizard requires running the
  app against a real DB; user verifies post-session per `npm run dev`
  (golden path: customer books a classic vehicle service through the
  wizard and sees $725 surface; per_unit qty stepper math; custom
  service displays starting price label).
- 2026-05-16: UAT against shipped Layer 3c discovered Layer 2's
  `<CustomPriceDialog>` isn't wired into native `<CatalogBrowser>`
  consumers (POS New Quote, POS New Sale, Item 15a's modal, Layer 3a-i's
  dialog). Custom-pricing services (e.g., Flood Damage / Mold Extraction)
  cannot be added — "Add to Ticket" button disabled. Layer 3e scoped to
  wire it into the shared catalog browser ecosystem so all 4 consumers
  benefit. Effort: ~0.5-1 session. Sequence: parallel with Layer 15g-ii;
  both must land before Phase 1.
- 2026-05-17 (Layer 3e — `<CustomPriceDialog>` wired into the
  `<CatalogBrowser>` ecosystem + Item 15a's bespoke modal): closes the
  3-of-4 broken surfaces (POS New Sale + POS New Quote share
  `<CatalogBrowser>`; Item 15a's `<EditServicesModal>` is bespoke; Layer
  3a-i's `<EditServicesDialog>` already worked via the hook). **In-session
  architectural discovery**: the 4 consumers did NOT share a single
  routing component — POS Sale + POS Quote go through `<CatalogBrowser>` →
  `<ServiceDetailDialog>` (where the disabled-button bug lives); Layer
  3a-i routes through `useServicePicker` (Layer 2's hook); Item 15a is a
  separate bespoke checklist toggle (where the worst bug pattern lives —
  silent $0 add with no operator-visible signal). User authorized scope
  expansion to patch all 3 broken surfaces in one session per the
  rationale that Item 15a's modal lives in production for ~6 more sessions
  before Phase 1 Layer 8e deletes it; the silent $0 add bug is S1 because
  the customer is never charged the staff-assessed amount.
  **Implementation**: `<CatalogBrowser>` gains `customPriceService` state
  + custom branch in 3 tap handlers (`handleTapService`,
  `handleTapServiceDirect`, `handleTapServiceDirectUnchecked`) +
  `handleCompatConfirm`'s 'detail' mode + `<CustomPriceDialog>` mount
  alongside `<ServicePricingPicker>`. Branch fires before per-unit /
  picker fallback so custom always goes to the dialog, regardless of
  vehicle / pricing-row state (matches `routeServiceTap`'s
  `open-custom-price-dialog` semantics). New `handleCustomPriceSelect`
  calls `addServiceChecked` so prerequisite/duplicate checks work for
  custom services. Item 15a's modal gets a parallel patch: `handleToggle`
  routes custom services to `<CustomPriceDialog>` instead of the silent
  $0 add; new `handleCustomPriceSelect` commits the row at the operator-
  entered amount; `AdminCatalogService` widened with `description` +
  `custom_starting_price`; `/api/admin/services/active` SELECT widened to
  match. The modal builds a minimal CatalogService-shaped shim at the
  dialog boundary (cast, not full-clone) — short-lived since the modal
  deletes in Phase 1 Layer 8e. **Architectural choice**: did NOT refactor
  `<CatalogBrowser>`'s 3 tap handlers to delegate to `routeServiceTap`
  from the canonical engine — each handler has surface-specific guard
  logic (customer/vehicle presence, compat checks, prerequisite warnings,
  post-add toasts) that's not in `routeServiceTap`. A clean engine-routing
  refactor would extract those guards as a higher-order wrapper; bigger
  scope than Layer 3e's wire-up goal. The custom-branch addition is byte-
  aligned with the engine's route action, so if `<CatalogBrowser>` ever
  migrates to engine routing (currently moot per Layer 3b's perma-deferral),
  the 3 branch sites are the obvious extraction points. New tests:
  `catalog-browser-custom-routing.test.tsx` (3 cases — tap opens dialog;
  confirm emits synthesized pricing row via `onAddService`; cancel emits
  nothing); `edit-services-modal-custom.test.tsx` (4 cases — tap opens
  dialog instead of silent $0 add; confirm commits 1 service at $500;
  cancel commits nothing; non-custom flat service still uses silent
  toggle, no regression). Verification: typecheck clean on touched files
  (14 pre-existing errors in `quote-service.modifiers.test.ts` unrelated);
  lint 0 errors (98 warnings = unchanged baseline); 1259/1259 vitest pass
  (was 1226 prior; +7 new from Layer 3e); production build compiled
  successfully (787 static pages, clean `.next` rebuild). **Manual UAT
  NOT performed** — requires running against a real DB; user verifies
  post-session on 4 paths (POS Sale → Flood Damage → dialog; POS Quote
  → Flood Damage → dialog; Admin Appointments → Edit Services → Flood
  Damage → dialog → save → check `appointment_services` row; POS Jobs
  Layer 3a-i path already works).
- 2026-05-16: UAT discovered `<EditServicesDialog>` (Layer 3a-i, commit `98dfdea6`) has a display-only bug in its "Selected" right-panel total calculation for per_unit services — Scratch Repair × 3 displays as $1,350 instead of correct $450. Underlying `jobs.services` JSONB persistence is unaffected; Job's own Services tile shows correct $450. Bug is in the modal's bespoke total summation, not the canonical engine. Decision: NO patch — accept the display-only defect for the remaining lifetime of the modal. Phase 1 Layer 8e deletes the component entirely; bug dies with it. Documented here so Layer 8e's session has context.
- 2026-05-17 (Layer 4 — ESLint enforcement + 4 missed bespoke-pricer
  migrations): rule `services/no-bespoke-pricing` lands at `'error'`
  enforcing CLAUDE.md Rule 22. Three smoking-gun signals — function-name
  pattern, `switch (pricing_model)` doing money math without engine call
  (refined to allow string/JSX-returning display dispatches + classifier
  switches + label generators), direct `vehicle_size_*_price` reads in
  arithmetic / return contexts. **Discovery surprise**: initial rule
  enforcement surfaced 6 violations, of which 4 were real bespoke
  pricers Layers 3c–3e missed: (1) `api/book/route.ts:computeExpectedPrice`
  server-side booking-price validator (extracted to `_pricing.ts` because
  Next.js route files only permit GET/POST/etc. exports); (2)
  `booking-wizard.tsx:reconstructConfig` deep-link config reconstruction;
  (3) `service-card.tsx:getStartingPrice` public catalog "From $X"
  display; (4) `voice-agent/services/route.ts` catalog response pricing
  array builder (SELECT widened to fetch full ServicePricing). All
  migrated to thin wrappers around `resolveServicePriceWithSale` per
  Layer 3d's pattern; return shapes preserved byte-identically so
  callers need no changes. Customer-money correctness fixes: exotic
  Ferrari + 1-Year Ceramic Shield now correctly validates / displays /
  voice-quotes at $725, classic Ceramic Shield at the classic per-size
  column, per-unit sale-prices applied correctly. **Architectural
  decision for Item 15a's `<EditServicesModal>`**: rather than wrap its
  bespoke `resolveServicePrice` (a dead-code-scheduled surface),
  disabled the Admin "Edit Services" trigger and routed operators to
  POS Jobs card. The modal becomes mounted-but-unreachable; its
  bespoke `resolveServicePrice` carries the SINGLE sanctioned eslint-
  disable comment in the codebase, documenting the deletion-window.
  **Implementation detail**: the rule's engine-call check descends
  into nested arrow/function expressions (so `.map((p) =>
  resolveServicePriceWithSale(p, ...))` callbacks count as engine
  calls in the case body) — without this, the voice-agent migration
  would have required ugly for-loop rewrites. **Voice-agent migration
  caveat**: the rule's static-AST check requires the engine call
  lexically inside the switch's AST; calling a top-level helper
  (`emitTier(p)`) wouldn't satisfy the check. Inlined the call in each
  case body to byte-align rule expectation with implementation.
  Verification: typecheck clean on touched files (pre-existing errors
  in `quote-service.modifiers.test.ts` + `catalog-browser-custom-routing.test.tsx`
  unrelated); lint **0 errors** (98 warnings = unchanged baseline);
  1366/1366 vitest pass (+33 net new — 19 rule cases + 12
  `compute-expected-price` cases + 2 `edit-services-disabled` cases);
  production build compiled successfully (787 static pages, clean
  `.next` rebuild). **Item 15f status after Layer 4**: only Phase 1
  (8a-8f — edit-via-POS restructure) remains. Phase 1 was already
  unblocked by Item 15g completing earlier in the day.

---

### Item 15g — Lifecycle Persistence: Discount / Coupon / Loyalty Across Quote → Appointment → Job → Transaction

- **Status:** **COMPLETE** (2026-05-17) — all 5 layers done (15g-i + 15g-ii + 15g-iii + 15g-v + 15g-iv). Phase 1 (8a-8f) UNBLOCKED.
- **Severity:** S1 (customer-promised concessions silently dropped today)
- **Effort:** 6.5 sessions (~12-14 hours total, layered — 15g-i + 15g-ii + 15g-iii + 15g-v done; 15g-iv remaining)
- **Wave:** 1.5
- **Depends on:** none — must land before Phase 1 (Item 15f Layers 8a-8f)
- **Sequencing:** 15g-i + 15g-ii + 15g-iii + 15g-v done; 15g-iv NEXT (~1 session); then Phase 1 (5.5 sessions). Total remaining: ~6.5 sessions.

**Problem statement:**

The persistence chain has three independent drop points (per `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md`):

1. **Schema gaps:** `quotes` has no loyalty/manual-discount columns; `jobs` has no money columns at all.
2. **Convert logic gap:** `convertQuote` (`convert-service.ts:67-91`) hardcodes `discount_amount: 0` and omits `coupon_code`, despite `appointments` having those columns. `appointments.coupon_code` + `coupon_discount` are written only by the online booking wizard.
3. **Checkout hydration gap:** `checkout-items` only reads `quotes.coupon_code` via `job.quote_id`, never falls back to `appointments.coupon_code`.

The chain is asymmetric — online booking flow works; POS-originated quote/walk-in path silently zeroes everything. Loyalty is currently a plaintext stop-gap in `appointments.internal_notes` per a code comment.

**Acceptance criteria — Sub-Layers (sequential within 15g):**

**Layer 15g-i — MVP coupon-only logic fixes (no schema):**
- `convert-service.ts:67-91`: read `quote.coupon_code` + `quote.coupon?.discount` into appointment row.
- `checkout-items/route.ts:193-237`: fallback to `appointments.coupon_code` + `coupon_discount` when no quote-side coupon. Return in response.
- `pos/jobs/page.tsx:155-214`: re-apply coupon from new response fields.
- Effort: ~0.5 session.
- Coverage: ~70% of operator-reported bug (coupon path).
- No schema changes.

**Layer 15g-ii — Schema migration + endpoint propagation — DONE 2026-05-17:**
- Add columns:
  - `appointments.loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0`
  - `appointments.loyalty_discount NUMERIC(10,2) NOT NULL DEFAULT 0`
  - `quotes.coupon_discount NUMERIC(10,2)` (optional; re-derivation works)
  - `quotes.loyalty_points_to_redeem INTEGER`
  - `quotes.manual_discount_type/value/label` (3 columns)
  - `appointments.manual_discount_value/label` (2 columns)
- Update endpoints to write new columns:
  - `convert-service.ts` — propagate loyalty + manual discount
  - `api/pos/jobs/route.ts` (walk-in) — accept + persist modifiers on synthetic appointment
  - `api/book/route.ts` — migrate from `internal_notes` plaintext to dedicated loyalty columns
  - `quote-service.ts` `createQuote`/`updateQuote` — accept + persist new quote columns
  - `quote-ticket-panel.tsx` — send new fields in PATCH body
- Update `checkout-items/route.ts` to read appointment modifiers, return in response.
- `DB_SCHEMA.md` regen per Supabase migration ritual.
- Effort: ~2 sessions.

**Layer 15g-iii — UI surfacing on source dialogs:**
- Admin Appointment dialog: surface discount + coupon + loyalty modifiers (read-only first; edit affordances later if needed).
- Jobs card "Services" tile: modifier summary (e.g., "$25 off via SAVE25" + "50 pts redeemed").
- Item 15a cascade endpoint update: read/preserve/re-validate modifiers during service edits.
- Effort: ~1.5 sessions.

**Layer 15g-v — Quote totals + receipt modifier rendering (audit follow-up):**
- Source: docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md
- Severity: S1 (customer-facing — every existing modifier-bearing quote currently displays wrong total to customer via SMS link / email / PDF)
- Effort: ~1-1.5 sessions

**Fix A — quotes.total_amount writer correction (~0.5 session):**
- `src/lib/quotes/quote-service.ts`: extract a shared `computeQuoteTotals(input)` helper mirroring the reducer math at `quote-reducer.ts:45-62`. Call from both `createQuote` (`:134-170`) and `updateQuote` (`:344-361`). Lift the `data.items` guard in `updateQuote` so modifier-only PATCHes also recompute (per Layer 15g-ii's auto-save now hashing modifiers via `quote-ticket-panel.tsx:62-89`).
- `src/lib/quotes/convert-service.ts:106-109`: remove the `Number(quote.total_amount) - totalDiscount` workaround. Once writers store net, convert path is `total_amount: Number(quote.total_amount ?? 0)`. Keep `Math.max(0, …)` clamp as defense-in-depth.
- Tests: extend `quote-service.modifiers.test.ts` to assert `total_amount` = net for every modifier combination; extend `convert-service.test.ts` to verify post-fix convert produces identical `appointments.total_amount` for modifier-bearing quotes.
- No schema migration. No DB_SCHEMA.md regen.
- NO one-shot back-fill SQL (per user decision Q3). Auto-save naturally fixes existing modifier-bearing quotes on next edit.

**Fix B — Receipt modifier rendering (~0.75-1 session):**
- 4 customer-facing surfaces (per audit §2) + 1 operator surface need coupon/loyalty/manual rows mirroring `<QuoteTotals>` (`src/app/pos/components/quotes/quote-totals.tsx:42-76`):
  - `src/app/(public)/quote/[token]/page.tsx:288-326` — public quote landing (SMS link target).
  - `src/lib/quotes/send-service.ts` — both `buildEmailHtml` (`:496-622`) + `buildEmailText` (`:457-494`) + the templated path (widen `quote_sent` template variables: `quote_coupon_code`, `quote_coupon_discount`, `quote_loyalty_pts`, `quote_loyalty_discount`, `quote_manual_label`, `quote_manual_discount`).
  - `src/app/api/quotes/[id]/pdf/route.ts:300-334` — PDF rendering.
  - `src/app/pos/components/quotes/quote-detail.tsx:537-553` — operator saved-quote review.
- SMS body STAYS unchanged (160-char limit; the SMS hooks to the public landing page which displays the breakdown).
- Conditional rendering: each modifier row only renders when the modifier is applied (non-zero / non-null), matching `<QuoteTotals>` pattern.
- Tests: snapshot-style assertions on email HTML + PDF output + public landing page. Modifier rows present when applicable, absent when not.

**Out of scope:**
- One-shot back-fill SQL for existing quotes with wrong persisted total_amount (user declined per Q3).
- Schema changes (no migration needed).
- ESLint enforcement (Item 15f Layer 4's scope).
- Booking wizard plaintext loyalty cleanup (Layer 15g-iv's scope).
- SMS body template change (deliberate scope decision — body stays short, link does the work).

**Files likely affected:**
- Modified: `src/lib/quotes/quote-service.ts` (Fix A)
- Modified: `src/lib/quotes/convert-service.ts` (Fix A — workaround removal)
- Modified: `src/app/(public)/quote/[token]/page.tsx` (Fix B)
- Modified: `src/lib/quotes/send-service.ts` (Fix B)
- Modified: `src/app/api/quotes/[id]/pdf/route.ts` (Fix B)
- Modified: `src/app/pos/components/quotes/quote-detail.tsx` (Fix B)
- Modified: seeded `quote_sent` email template body (Fix B — widen variables)
- Extended: `src/lib/quotes/__tests__/quote-service.modifiers.test.ts` (Fix A)
- Extended: `src/lib/quotes/__tests__/convert-service.test.ts` (Fix A)
- New: snapshot tests for email/PDF/public-landing modifier rendering (Fix B)

**Breaking-change watch items (per audit §5.5):**
- Analytics (`getQuoteStats()`, customer-portal "Booked revenue") will show TRUTHFUL (lower) numbers post-fix; release notes should note "quote revenue figures more accurate after fix."
- Existing customer-facing SMS history still shows old (wrong) numbers; the PDF/landing/email re-renders on view show correct numbers. Acceptable trade-off.

**Notes / decisions log:**
- 2026-05-16: UAT against Q-0067 (subtotal $1600, modifiers totaling $1598.70) surfaced both bugs. Per audit, BOTH fixes are required for correct UX. User selected sequential order (15g-v before 15g-iv before Phase 1) and no back-fill SQL.
- 2026-05-16: **Layer 15g-v landed.** Both Fix A (writer correction) and Fix B (5-surface receipt rendering) shipped in a single session.
  - **Fix A:** New canonical `computeQuoteTotals(input)` helper in `quote-service.ts` extracted; mirrors `quote-reducer.ts:45-62` and uses shared `resolveManualDiscountAmount` (extracted to new pure-utility `src/lib/quotes/manual-discount.ts` so client-bundle consumers reach it without dragging convert-side deps; `convert-service.ts` re-exports for backward compat). Both `createQuote` (`:134-170`) and `updateQuote` (`:344-361`) call the helper. `updateQuote` items-guard lifted — modifier-only PATCHes now trigger recompute by fetching existing items + modifier state when not supplied in the PATCH. `convert-service.ts:106-109` workaround removed; convert now trusts `quote.total_amount` directly with `Math.max(0, …)` clamp as defense-in-depth.
  - **Fix B:** New shared `src/lib/quotes/modifier-display.ts` (`resolveQuoteModifierRows(quote)`) consumed by all 5 surfaces. Public landing (`page.tsx:288-326`), email HTML+text fallback (`send-service.ts:457-622`), templated email (composite `quote_modifier_block` + 6 individual variables, new seed migration `20260517052147_quote_sent_template_modifier_block.sql`), PDF (`pdf/route.ts:300-334`), POS quote-detail (`quote-detail.tsx:537-553`). SMS body unchanged per scope. Admin variable picker registers 7 new variables in `src/lib/email/variables.ts`.
  - **Tests:** +35 (1285 → 1320). 12 createQuote/updateQuote writer assertions in `quote-service.modifiers.test.ts`; 4 new "writer-trust contract" cases + 11 fixture updates in `convert-service.test.ts`; new `modifier-display.test.ts` (+19); 4 send-service email-path assertions.
  - **NO back-fill SQL** per user decision Q3 — existing modifier-bearing quotes self-heal on next auto-save (15g-ii auto-save hashes modifier columns).
  - **Verification:** typecheck clean (0 new errors; 2 pre-existing test-file cast errors untouched). ESLint clean on touched files. Vitest 1320/1320 passing. Production build compiled successfully (`✓ Compiled successfully in 12.0s`).
  - **Manual UAT deferred to user per session brief.** Detailed UAT plan in CHANGELOG entry: (1) Fix A — modifier-bearing quote SQL-check `total_amount = subtotal − discounts`; (2) Fix B per-surface — SMS link → public landing / email preview / PDF / POS detail all show modifier rows; (3) Negative case — no-modifier quote shows Subtotal + Tax + Total only.
  - **Analytics watch-item** (audit §5.5): `getQuoteStats()` + customer-portal "Booked revenue" now report truthful (lower) numbers. Operator may notice a stat drop after deploy — that's the correctness landing, not a regression.

**Layer 15g-iv — Booking wizard cleanup + tests:**
- Migrate `api/book/route.ts` from `internal_notes` plaintext loyalty stop-gap to dedicated columns (already added in 15g-ii).
- Remove the inline code comment noting the stop-gap.
- Comprehensive tests: quote round-trip preserves modifiers, convert preserves, walk-in preserves, checkout hydrates correctly.
- Verify QBO line-item sync handles `loyalty_discount` separately (mitigation per audit §9.5).
- Effort: ~1 session.

**Out of scope:**
- `appointment_services.pricing_type` / `standard_price` provenance (deferred; audit §9.1 #3 — doesn't affect this bug).
- Loyalty ledger row write timing — STAYS transaction-bound (audit §9.5 watch-item; do NOT write ledger rows pre-transaction).
- Booking wizard customer-facing UI changes — only its backend writes change.
- Refund flow changes — refunds read from `transactions.loyalty_*` which is unchanged (audit §9.5).

**Files likely affected:**
- New migration: `supabase/migrations/<timestamp>_lifecycle_persistence.sql`
- Modified: `src/lib/quotes/convert-service.ts` (15g-i + 15g-ii)
- Modified: `src/app/api/pos/jobs/[id]/checkout-items/route.ts` (15g-i)
- Modified: `src/app/pos/jobs/page.tsx` (15g-i)
- Modified: `src/app/api/pos/jobs/route.ts` (15g-ii — walk-in)
- Modified: `src/app/api/book/route.ts` (15g-ii + 15g-iv)
- Modified: `src/lib/quotes/quote-service.ts` (15g-ii)
- Modified: `src/components/pos/quote-ticket-panel.tsx` (15g-ii)
- Modified: `src/components/admin/appointments/appointment-detail-dialog.tsx` (15g-iii)
- Modified: `src/app/pos/jobs/components/job-detail.tsx` (15g-iii)
- Modified: `src/lib/appointments/edit-services.ts` (15g-iii — cascade preserves modifiers)
- New tests: `src/lib/quotes/__tests__/convert-service.test.ts`, `src/app/api/pos/jobs/__tests__/checkout-items.test.ts`, `src/lib/quotes/__tests__/quote-service.modifiers.test.ts`
- Modified: `docs/dev/DB_SCHEMA.md` (regen post-migration)

**Notes / decisions log:**
- 2026-05-16: source = `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md`.
- 2026-05-16: user chose Option C (phased 15g-i through 15g-iv) over Option A (full single-session) or Option B (MVP coupon-only).
- 2026-05-16: user confirmed sequence — 15g-i + 15g-ii BEFORE Phase 1's layers 8a-8f. 15g-iii + 15g-iv can run in parallel with Phase 1 later layers.
- 2026-05-16: breaking-change risk assessment is low across the board per audit §9.5. Key watch-items: QBO line-item sync (verify `loyalty_discount` handling), loyalty ledger row write timing (stays transaction-bound).
- 2026-05-16: **Layer 15g-i landed.** Three logic changes, no schema migration:
  - `src/lib/quotes/convert-service.ts` (modified) — appointment insert now writes `coupon_code: quote.coupon_code ?? null` plus `discount_amount`/`coupon_discount`/`total_amount` keyed off `quote.coupon?.discount ?? 0` (runtime-only state today; resolves to 0 until Layer 15g-ii adds `quotes.coupon_discount`).
  - `src/app/api/pos/jobs/[id]/checkout-items/route.ts` (modified) — appointment SELECT extended to fetch `coupon_code`; new fallback after the existing `job.quote_id` lookup inherits `appt.coupon_code` when nothing was recovered from the quote bridge. Closes the online-booking-leaks-at-checkout gap (booking wizard writes `appointments.coupon_code` but online-booked jobs have `quote_id = NULL`).
  - `src/app/pos/jobs/page.tsx` — no change needed. Existing `handleCheckout` already re-validates `data.coupon_code` via `/api/pos/coupons/validate` and dispatches `SET_COUPON`. `SET_COUPON` reducer is replace-based; `RESTORE_TICKET` resets `coupon: null` first → re-checkout naturally idempotent.
  - Tests (10 new): `src/lib/quotes/__tests__/convert-service.test.ts` (3 cases), `src/app/api/pos/jobs/[id]/checkout-items/__tests__/coupon-fallback.test.ts` (4 cases), `src/app/pos/jobs/__tests__/handle-checkout-coupon.test.tsx` (3 cases).
  - Verification gates: typecheck clean (1 pre-existing unrelated error in `step-service-select.tsx` from prior in-progress work, not mine); lint clean (0 errors); vitest 1199/1199 passing including the 10 new tests; build blocked by the same pre-existing `step-service-select.tsx` modification — not introduced by this session.
  - Coverage: ~70% of operator-reported lifecycle-persistence bug (coupon is the most-used modifier). Manual discount + loyalty remain lost — they require schema work in Layer 15g-ii.
- 2026-05-17: **Layer 15g-ii landed.** Schema migration + 6 endpoint updates close the remaining ~30% of the lifecycle-persistence bug — loyalty + manual-discount + coupon-discount snapshot now persist through Quote → Appointment → Job → Transaction.
  - Migration `supabase/migrations/20260517021350_lifecycle_persistence.sql` adds 10 new columns (4 on appointments, 6 on quotes) and 3 CHECK constraints (manual-discount coherent on both tables; loyalty coherent on quotes). All additive + non-breaking; existing rows get DEFAULT 0 (counters) or NULL (snapshots).
  - Type-defs in `src/lib/supabase/types.ts` extended: `Appointment` gains the 4 modifier fields; `Quote` gains the 6 modifier fields.
  - Validation in `src/lib/utils/validation.ts` adds a shared `quoteModifierFields` block on both create+update schemas (6 optional+nullable fields). Coherence is enforced at both server (helpers) and DB (CHECK constraints) layers; Zod stays permissive for legacy clients.
  - `quote-service.ts` — createQuote + updateQuote accept new fields, dedicated `normalizeManualDiscount` + `normalizeLoyaltyRedemption` helpers collapse partial state to fully-null. Percent > 100 throws `QuoteValidationError`. Update is surgical (omitted ⇒ no-op; explicit null ⇒ clear).
  - `quote-ticket-panel.tsx` — `computeQuoteHash` now includes manual-discount + loyalty + coupon-discount so auto-save fires on those edits (previous comment marking these as "NOT persisted" replaced). New `buildModifiersPayload(q)` threaded into auto-save PATCH, manual-save PATCH/POST, `handleCreateJob` PATCH+POST, and the `/api/pos/jobs` POST.
  - `convert-service.ts` — extends 15g-i's coupon work to all three modifiers. New `resolveManualDiscountAmount(type, value, subtotal)` converts type=percent to dollar against subtotal. `discount_amount` = coupon + loyalty + manual for analytics-reader compat; per-modifier columns preserve provenance. `total_amount` clamped to ≥ 0 (over-discount safety).
  - `api/pos/jobs/route.ts` (walk-in) — accepts 7 new modifier fields, persists them on synthetic appointment; null-safe for pure walk-ins.
  - `api/book/route.ts` — replaces `internal_notes` plaintext loyalty stop-gap with `loyalty_points_redeemed` + `loyalty_discount` columns. Pre-fix inline comment removed. Historical plaintext rows untouched; back-fill deferred to Layer 15g-iv.
  - `checkout-items/route.ts` — appointment SELECT extended with the 4 new appointment columns; response shape extended with 5 new fields (`coupon_discount`, `loyalty_points_redeemed`, `loyalty_discount`, `manual_discount_value`, `manual_discount_label`). All `Number()`-coerced for Supabase NUMERIC-as-string handling. Layer 15g-iii wires the client dispatch off these fields.
  - Tests: extended `convert-service.test.ts` (+8), extended `checkout-items/__tests__/coupon-fallback.test.ts` (+5), new `quote-service.modifiers.test.ts` (13). Total +26 tests; 1252/1252 passing.
  - DB_SCHEMA.md regenerated via `npx tsx scripts/regen-db-schema.ts` — verified new columns visible at lines 178, 185-188, 191 (appointments), 2104-2109, 2112-2113 (quotes), 2948-2949 (transactions unchanged).
  - **Production build NOT attempted** — pre-existing syntax error in `src/components/appointments/edit-services-modal.tsx` line 252 (`<>` fragment, parallel session's in-progress modifications) blocks the build. Independent of Layer 15g-ii; my files were committed selectively to avoid sweeping the parallel work.
  - Manual UAT deferred to user per session brief — voice/SMS/booking flows need real customer data.
- 2026-05-17: **Layer 15g-iii landed.** UI surfacing + checkout hydration for loyalty + manual-discount; cascade endpoint reads per-modifier columns.
  - `src/app/pos/jobs/page.tsx` `handleCheckout` — three new dispatches off the checkout-items response: `SET_LOYALTY_REDEEM` (when `loyalty_points_redeemed` or `loyalty_discount` non-zero), `APPLY_MANUAL_DISCOUNT` (when `manual_discount_value` non-zero, `discountType: 'dollar'`, label fallback "Manual discount"). RESTORE_TICKET zeroes the slots first so re-running checkout for the same job stays idempotent. Coupon path (Layer 15g-i) unchanged.
  - `src/components/appointments/modifier-summary.tsx` — new shared `<ModifierSummary variant="admin|pos">` component + `hasAppliedModifiers()` helper. Renders read-only rows for coupon (with code), loyalty (with points label), manual discount (with operator label or fallback). Admin variant is light-theme only; POS variant adds dark-mode classes. Whole block renders `null` when no modifier applied.
  - `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — mounts `<ModifierSummary variant="admin">` below the Services list, above the Mobile Service card.
  - `src/app/pos/jobs/components/job-detail.tsx` — mounts `<ModifierSummary variant="pos">` inside the Services tile (both editable and read-only branches) after the services Total row. `JobDetailData.appointment` shape extended with 6 modifier fields.
  - `src/app/api/pos/jobs/[id]/route.ts` `JOB_SELECT` — extended to fetch `coupon_code`, `coupon_discount`, `loyalty_points_redeemed`, `loyalty_discount`, `manual_discount_value`, `manual_discount_label` on the appointment join.
  - `src/lib/supabase/types.ts` — `Appointment` retroactively gained `coupon_code` + `coupon_discount` (DB columns existed pre-15g-ii, just weren't typed). Required for the source-dialog block to compile.
  - `src/lib/appointments/edit-services.ts` `computeTotalsForServiceEdit` — accepts optional `couponDiscount` / `loyaltyDiscount` / `manualDiscountValue` per-modifier inputs. When any is supplied, the helper recomputes the canonical combined discount as their sum (`coupon + loyalty + manual`) and exposes it via the new `discountAmount` field on `ComputeTotalsResult`. Legacy fallback to the combined `discountAmount` input when all per-modifier values are null. Total clamped to ≥ 0 (over-discount safety, matches `convert-service.ts`'s `resolveModifiers` path).
  - `src/app/api/admin/appointments/[id]/services/route.ts` cascade endpoint — SELECT now includes the 3 per-modifier columns. New inputs threaded into `computeTotalsForServiceEdit`. UPDATE now also writes the canonical `discount_amount` back so it stays in sync with the per-modifier snapshot. Per-modifier columns themselves are NOT touched — they survive the cascade unchanged (the UI surfacing renders off them, so preservation is the contract).
  - Tests: +33 new (1252 → 1285). `edit-services.test.ts` (+4, per-modifier path + null handling + clamp + legacy fallback). `route.test.ts` (+4, coupon-only / loyalty+manual / all-3 / legacy fallback, all asserting per-modifier columns are never written). `handle-checkout-coupon.test.tsx` (+6, SET_LOYALTY_REDEEM + APPLY_MANUAL_DISCOUNT dispatches, label fallback, all-3, skip-on-zero, idempotency). `modifier-summary.test.tsx` (new file, +12 cases).
  - Verification: typecheck clean (no new errors; 2 pre-existing test-file errors from Layer 15g-ii + Layer 3e sessions untouched). Lint 0 errors / 0 new warnings on touched files. Vitest 1285/1285 passing. Production build compiled successfully (`✓ Compiled successfully in 10.0s`).
  - **Manual UAT deferred to user per session brief** — 7-step round-trip path documented in CHANGELOG (Quote with all 3 modifiers → convert → appointment dialog shows summary → generate job → jobs card shows summary → checkout pre-applies all 3 → cascade edit preserves; appointment without modifiers omits the block).
- 2026-05-16 (Quote total + receipt audit — discovery for a pending Layer 15g-v): UAT against shipped 15g-i+ii+iii revealed **2 layered bugs not yet covered by Item 15g**. Audit completed in `docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md`. Findings:
  - **Writer-side semantic bug:** `createQuote` / `updateQuote` write `quotes.total_amount = subtotal + tax` with **no modifier subtraction**. Field name implies "final amount owed", but math is pre-discount. Layer 15g-ii added the per-modifier columns but didn't update the total formula. Q-0067 example: $1600 subtotal, $1598.70 in modifiers, persisted `total_amount: 1600.00`, operator UI live-shows `$1.30`, customer-facing surfaces all display $1600 (wrong).
  - **`convert-service.ts:106-109` is the ONLY consumer that defensively subtracts modifiers** (`Math.max(0, quote.total_amount - totalDiscount)`). Every other reader (17 files: admin pages, public landing, SMS/email/PDF, voice agent, AI responder, customer-portal stats) DISPLAYS or SUMS `total_amount` as the final amount — silently inflating numbers everywhere.
  - **Cross-table consistency check:** `appointments.total_amount` and `transactions.total_amount` are **net-of-discounts** by writer convention. Only `quotes.total_amount` is pre-discount. Drift created when `createQuote` was written before any modifier ever existed on quotes; never updated as modifiers landed.
  - **Receipt-rendering gap:** 4 quote-customer-facing surfaces (SMS body / public landing `/quote/[token]` / email HTML+text / PDF) and 1 operator surface (`pos/components/quotes/quote-detail.tsx`) render only `Subtotal / Tax / Total` — none iterate the modifier columns. The operator UI's `<QuoteTotals>` component already has the reference implementation (`pos/components/quotes/quote-totals.tsx:42-76`); it just needs to be lifted into a server-renderable form for the 4 templates. SMS body is short-by-design and references the public-landing link; no SMS template change needed.
  - **Recommended fix: new Layer 15g-v** (writer correction + receipt modifier rendering across the 4 customer surfaces + the operator review). Effort ~1-1.5 sessions, no schema migration, ESLint scope unchanged. **Lands BEFORE Phase 1 (8a-8f)** — Phase 1 operator-facing surfaces compound the consumer-side mis-rendering if the writer isn't fixed first. **Layer 15g-v NOT yet added to roadmap** — awaiting user sign-off on scope.
- 2026-05-17: **Layer 15g-iv landed. Item 15g is now COMPLETE.** Phase 1 (Item 15f Layers 8a-8f) is unblocked.
  - **Booking-wizard cleanup (`src/app/api/book/route.ts`):** Removed the 2 stale stop-gap comments documenting Layer 15g-ii's migration away from `internal_notes` plaintext loyalty. Removed the redundant explicit `internal_notes: null` write — the column is TEXT with no DEFAULT, so omitting writes NULL natively. No behavioral change to the appointment payload (15g-ii's loyalty/coupon/manual-discount writes are untouched). Cross-codebase audit confirmed: zero READ paths in src/ parse `internal_notes` as a loyalty source. The wizard UI at `src/components/booking/booking-wizard.tsx:960-961` already passes `loyalty_points_used` + `loyalty_discount` as clean top-level body keys — no UI changes needed.
  - **QBO sync verification (audit §9.5 watch-item, `src/lib/qbo/sync-transaction.ts`):** Reads ONLY combined `transaction.discount_amount`; does NOT consult `coupon_discount`/`loyalty_discount`/`manual_discount_value` individually. Builds ONE generic `DiscountLineDetail` per Sales Receipt. Coupon code appears in `PrivateNote` as a string. Pre-existing behavior (NOT a Layer 15g regression). Whether business needs separation into per-modifier QBO journal lines is an accounting policy decision — documented for awareness, NOT flagged as a bug. No roadmap follow-up item created without explicit user direction.
  - **3 new E2E test files (13 tests):**
    - `src/app/api/book/__tests__/modifier-persistence.test.ts` (4 tests, Scenario A) — POST /api/book modifier persistence; pins `internal_notes` omitted from insert payload post-cleanup.
    - `src/app/api/pos/jobs/__tests__/walk-in-modifier-persistence.test.ts` (5 tests, Scenario C) — walk-in synthetic appointment 7-field modifier snapshot; manual_discount_type=percent → dollar resolution against subtotal; over-discount safety clamp; label drop when value resolves to null.
    - `src/lib/quotes/__tests__/modifier-chain.test.ts` (4 tests, Scenario B) — chained Quote → convertQuote → checkout-items reads back identical modifier values; all-3 / coupon-only / modifier-free (negative case) / percent → dollar resolution preserved.
  - Scenario D (negative cases) folded into the modifier-free assertions across all 3 scenario files plus existing `modifier-summary.test.tsx` (15g-iii) and `modifier-display.test.ts` (15g-v).
  - **Verification gates:** typecheck clean for new files (27 pre-existing errors unchanged — 15g-ii supabase mock cast + Layer 3e CatalogService cast, both predate this session). Lint 0 errors / 0 new warnings. Vitest 1333/1333 passing (was 1320 → +13). Production build `✓ Compiled successfully in 12.0s`.
  - **Coverage map (post-15g-iv, all stages green):** Quote writes ✅ | Quote → Appointment convert ✅ | Online booking writer ✅ NEW | Walk-in writer ✅ NEW | Checkout-items hydration ✅ | Checkout dispatch ✅ | Cascade endpoint preservation ✅ | Receipt rendering (5 surfaces) ✅ | Chain-level integration ✅ NEW.
  - **Manual UAT (deferred to user per session brief):** (1) Booking online flow → SQL-check appointment row has `loyalty_points_redeemed`/`loyalty_discount` populated, `internal_notes` NULL. (2) End-to-end chain — quote with 3 modifiers → convert → populate → checkout → transaction; SQL-check every stage carries identical values. (3) QBO sync — verify single combined Discount line matches accounting expectations.

---

## Wave 2 — Tip Overhaul (Sequential — 6 Sessions)

Tips are revenue-affecting and have multiple intertwined paths. Sessions must
run in close succession to maintain momentum and avoid drift.

### Item 3 — Receipt Tip Display Audit + Fixes

- **Status:** not started
- **Severity:** S1 (audit) → S0 (any missing tip display)
- **Effort:** 1 audit session (~45 min) + 1 fix session (~1-2 hours, scope TBD by audit)
- **Wave:** 2 (Sessions A and C)
- **Depends on:** none for audit; fixes depend on audit findings

**Problem statement:**
Tip currently captured on WisePOS E displays correctly on thermal receipts
(verified via receipt #SD-006297, $92 tip on $552 total). Need to verify
all 4 receipt surfaces render the tip line correctly: thermal (verified),
email PDF, email HTML, SMS HTML link, browser-printed copy.

**Acceptance criteria (audit):**
- Read-only inspection of all 4 (or 5) receipt-rendering paths.
- Generate a findings doc listing: each surface, current tip line state
  (renders / doesn't render / renders with bug), file location, and
  recommended fix.
- No code changes during audit session.

**Acceptance criteria (fixes, post-audit):**
- All 4 surfaces correctly render the tip line in the same visual format
  as the thermal receipt: `Tip   $XX.XX` above the TOTAL line.
- Conditional display: tip line only shows when tip > $0.
- Layout / spacing consistent with other line items.

**Out of scope:**
- Cash tip rendering (handled in Item 4 — combined with this in Session C).
- Tip math changes (display only).
- Refactor of receipt template architecture.

**Files likely affected:**
- Email receipt PDF template
- Email receipt HTML template
- SMS receipt HTML template
- Browser-print template
- Possibly a shared receipt-line component

**Session plan:**

*Session A — Audit (read-only)*
- Read CLAUDE.md + FILE_TREE.md + DB_SCHEMA.md
- Inspect all 4 receipt-generation paths and template files
- Generate `docs/dev/RECEIPT_TIP_AUDIT_2026-05-15.md` listing each surface
- No commit (audit doc commit only)

*Session C — Fixes (combined with Item 4 cash tip rendering)*
- See Item 4 session plan

**Notes / decisions log:**
- 2026-05-15: confirmed thermal receipt (SD-006297) renders tip correctly.

---

### Item 4 — Cash Tip Capture + Tip Splitting + Tip Reporting

- **Status:** not started
- **Severity:** S0 (revenue-tracking, payroll-affecting)
- **Effort:** 3-4 sessions (most complex item in the wave)
- **Wave:** 2 (Sessions B, C, E, F)
- **Depends on:** Item 3 audit (Session A) completes first

**Problem statement:**
Three related needs:
1. **Cash tip capture:** today, only WisePOS E card tips are captured. Cashiers
   need a way to record cash tips (customer pays card-then-tip-in-cash, or
   customer pays cash-with-tip, or customer pays cash-then-tip-after).
2. **Tip splitting between cashier and detailer:** percentage configurable per
   role under Admin > Staff > Role Management. Tips split between the cashier
   on the transaction and the detailer assigned to each service.
3. **Tip reporting:** report visible under Admin > Reports (extend Payments
   Report or new Tips section). Filters: date range, detailer, payment method.

**Acceptance criteria — 4a (Cash tip capture):**
- New "Cash Tip" button on the POS payout/completion screen.
- Cashier can enter tip amount; gets stored in `transactions.tip_amount` AND
  flagged as cash-tip vs card-tip (new column or via payment-method check).
- Tip can be added during checkout (before payment completion) OR after
  (post-completion "Add Cash Tip" button on a recently-completed transaction).
- Post-completion cash tip updates `transactions.tip_amount`, recalculates
  loyalty points if applicable, creates audit log entry.

**Acceptance criteria — 4b (Tip splitting config):**
- Admin > Staff > Role Management adds a "Tip %" field per role
  (Cashier, Detailer, Super Admin, Admin, Marketing).
- Default: Cashier 0%, Detailer 100% (or whatever you specify).
- Tip allocation rule: tip is split based on each role's % allocation
  among the cashier on the transaction and the detailers assigned to
  appointment_services on the transaction.
- If multiple detailers worked on a single ticket, split detailer share
  equally among them.

**Acceptance criteria — 4c (Tip reporting):**
- New view: Admin > Reports > Tips (or extension of Payments Report —
  pick one in Session F).
- Date range filters: Today, This Week, This Month, This Year, Custom
  (with date picker).
- Sort/filter dropdowns:
  - Detailer (any individual or "All")
  - Payment method (Card / Cash / All)
- Each row shows: date, transaction #, detailer, payment method, tip amount,
  detailer's share, cashier's share.
- Footer totals: total tip, total to each detailer, total to cashiers.
- Export to CSV.

**Out of scope:**
- Automatic payroll integration (this is a reporting tool — payroll happens
  outside the app).
- Tip pooling logic beyond what's specified above.

**Files likely affected:**
- POS payout screen component (new Cash Tip button)
- transactions table (possibly new `tip_payment_method` column or similar)
- Receipt templates (cash tip rendering — combined with Item 3 in Session C)
- Admin > Staff > Role Management page
- Admin > Reports — new Tips view or extended Payments Report
- API endpoints for tip allocation queries
- Tests for splitting logic

**Session plan:**

*Session B — Cash Tip DB + UX (4a)*
- DB migration: add tip payment method tracking (column or via inference)
- Add Cash Tip button to POS payout screen
- Add post-completion "Add Cash Tip" capability
- Audit log entries for cash tip adds

*Session C — Combined Item 3 + Item 4 receipt extension*
- Apply Item 3 audit fixes for card tip display across all 4 surfaces
- Add cash tip rendering line to all 4 surfaces (when tip exists, render
  consistently regardless of payment method)
- UAT all 4 surfaces

*Session E — Tip Splitting Config (4b)*
- Admin > Staff > Role Management Tip % field
- Tip allocation calculation engine
- Tests for splitting math (single detailer, multi-detailer, no detailer)

*Session F — Tip Reporting (4c)*
- Decide: extend Payments Report or new Tips page (decision early in session)
- Build reporting view with filters
- CSV export

**Notes / decisions log:**
- 2026-05-15: tip splitting between cashier and detailer; configurable %.
- 2026-05-15: post-completion cash tip add is allowed (via dedicated button
  on completed transaction view).
- 2026-05-15: cash payment screen is NOT shown to customer — purely cashier
  side for register balancing.

---

### Item 2 — Tip on Full-Payment Stripe Payment Link

- **Status:** not started
- **Severity:** S0 (revenue-affecting — customer couldn't leave tip when desired)
- **Effort:** 1 medium session (~2 hours)
- **Wave:** 2 (Session D)
- **Depends on:** Item 3 audit (helpful to know baseline before changing flow)

**Problem statement:**
When a customer requests to pay in full via payment link (in-store drop-off
or online booking), the Stripe payment link currently doesn't include a tip
option. Customer can't leave a tip via card on the link. Needs tip flow matching
the established WisePOS E pattern (3 preset percentages + No Tip + tap).

**Acceptance criteria:**
- Full-payment Stripe payment links include `tip_settings` configuration that
  matches the WisePOS E preset percentages (set in Stripe Dashboard, single
  source of truth — no app admin needed per your decision).
- Partial-payment / deposit links do NOT show tip option (per your spec).
- Tip captured via Stripe payment link is recorded in `transactions.tip_amount`
  on webhook receipt (same destination as WisePOS E tips).
- Customer can choose "No Tip" / "Pay tip later" / skip without being forced.
- Works for both in-store-sent payment links AND online-booking pay-in-full
  flow.

**Out of scope:**
- App-side admin UI for tip percentages (per your decision — Stripe Dashboard
  is fine as source of truth).
- Changing the partial-payment / deposit flow.
- Changes to WisePOS E tip handling (already works).

**Files likely affected:**
- Stripe payment link creation route(s) — full-payment path
- Stripe webhook handler — verify tip captured correctly
- Possibly the booking wizard step that creates payment intents
- Tests for tip-included full-payment flow

**Session plan:**
- Single session (Session D).
- Read existing payment link creation code first; understand current flow.
- Add `tip_settings` to full-payment creation path only.
- Verify webhook captures tip correctly.
- UAT: send test payment link to your phone, verify tip prompt appears,
  verify tip is recorded in DB matching the WisePOS E flow.

**Notes / decisions log:**
- 2026-05-15: tip presets controlled from Stripe Dashboard, not app admin.
- 2026-05-15: deposit / partial-payment links explicitly exclude tip option.
- 2026-05-15: customer must have "I'll pay tip later / no tip" option to
  avoid forcing them.

---

## Wave 3 — Job Workflow

### Item 8 — Assign Customer to Walk-In Ticket Post-Completion

- **Status:** not started
- **Severity:** S2
- **Effort:** 1 medium session (~2 hours)
- **Wave:** 3
- **Depends on:** none

**Problem statement:**
Staff sometimes forget to attach a customer to walk-in tickets and only realize
after completion. Need ability to assign a customer to an already-completed
transaction, with retroactive loyalty point application.

**Acceptance criteria:**
- Completed walk-in transactions (no `customer_id` OR with guest placeholder)
  show an "Assign Customer" action.
- Action opens the existing Find Customer / New Customer modal.
- On assignment: `customer_id` is updated, loyalty points retroactively earned
  (computed from `transactions.subtotal` at the same rate as a fresh transaction),
  `loyalty_ledger` entry created, `customers.lifetime_spend` and `visit_count`
  incremented.
- If the transaction is later refunded or voided, the existing refund/void
  logic correctly reverses the retroactively-earned points (no change needed
  to refund/void logic — but tests confirm).
- For NON-walk-in tickets (customer already assigned): no customer-change
  allowed (per your decision: "doesn't feel right").

**Out of scope:**
- Bulk customer assignment to multiple walk-in tickets.
- Customer-change for assigned tickets.

**Files likely affected:**
- POS completed transaction view component
- Customer assignment API route (likely new: PATCH /api/transactions/[id]/assign-customer)
- Loyalty ledger logic
- Tests for retroactive earn + refund interaction

**Session plan:**
- Single session.
- First: verify whether walk-in tickets store NULL customer_id or guest placeholder
  (read-only DB inspection).
- Build the assignment endpoint + UI button.
- Wire to existing loyalty engine for retroactive point calculation.
- Test refund-after-retroactive-assignment to ensure clean reversal.

**Notes / decisions log:**
- 2026-05-15: customer change NOT allowed for already-assigned tickets.
- 2026-05-15: retroactive loyalty point application is the explicit requirement.

---

### Item 7 — Job Timer with Pause + Reason Modal

- **Status:** not started
- **Severity:** S1
- **Effort:** 1-2 sessions (~3-4 hours)
- **Wave:** 3
- **Depends on:** none (but interacts with Item 13's mobile flow eventually)

**Problem statement:**
Job timer starts when detailer clicks "Start Job" (after intake completes).
No pause exists — if detailer goes to lunch or switches vehicles, total time
becomes inaccurate. Need pause with reason capture.

**Acceptance criteria:**
- "Pause" button visible during active job timer.
- Click opens a modal with 4 preset reasons + 1 custom freetext:
  1. Lunch break
  2. Switched to another vehicle
  3. Waiting on customer
  4. Waiting on parts / supplies
  5. Custom (text field appears)
- On pause: timer stops counting toward job duration; paused duration tracked
  separately.
- "Resume" button shown while paused.
- Multiple pauses per job supported (lunch + switch-vehicle in same job).
- Job duration report shows: total elapsed, total active, total paused
  (breakdown by pause reason).
- Pause history visible on the Jobs detail card.

**Out of scope:**
- Auto-pause logic (e.g., based on idle detection).
- Pause time billing — purely labor accounting.

**Files likely affected:**
- Jobs schema (new `job_pauses` or `job_timer_events` table likely needed)
- Active job view component (POS or mobile)
- Pause/Resume API endpoints
- Reporting views that show job duration
- Tests for pause math

**Session plan:**

*Session 1 — DB + state machine*
- Design and migrate timer/pause schema
- Build pause/resume API
- Tests for timer math (single-pause, multi-pause, mid-pause crash recovery)

*Session 2 — UI + reporting*
- Pause button + reason modal
- Job detail card pause history
- Reports updated with pause breakdown

**Notes / decisions log:**
- 2026-05-15: timer starts at "Start Job" click, after intake completes.
- 2026-05-15: pause time NOT counted toward job duration.
- 2026-05-15: 4 preset reasons + custom confirmed.

---

## Wave 4 — Inventory + Scanner

### Item 9 — BT Scanner Intermittent Failures

- **Status:** not started
- **Severity:** S1
- **Effort:** Audit (~1 hour) + fix (~1-2 hours, scope TBD by audit)
- **Wave:** 4
- **Depends on:** none — but referenced in your memory file as deferred item
  ("scanner fast-typing") which may be the same bug.

**Problem statement:**
BT scanner inconsistently rejects scans: scan 1 works, scans 2-4 say "product
not found," scans 5-6 work again. Same behavior in POS checkout and Inventory
Counts. Software issue (same scanner since launch).

**Acceptance criteria (audit):**
- Generate `docs/dev/SCANNER_AUDIT_2026-05-XX.md` documenting:
  - Where scan input is captured (POS checkout, Inventory Counts)
  - Debounce or rate-limit logic (if any)
  - Race conditions in barcode-to-product lookup
  - Whether the "scanner fast-typing" deferred item is the same issue
  - Recommended fix path

**Acceptance criteria (fix):**
- TBD per audit findings, but should include:
  - Reliable scan capture regardless of speed (debounce if needed)
  - Clear error messaging when product genuinely not found
  - No false negatives

**Out of scope:**
- Hardware replacement / configuration changes (this is software-side).
- Adding new scan-input methods.

**Files likely affected:**
- POS checkout scan handler
- Inventory Counts scan handler
- Possibly a shared barcode-input component
- Tests simulating rapid-fire scan input

**Session plan:**

*Session 1 — Audit*
- Trace scan input through both surfaces
- Identify the bug class
- Document findings

*Session 2 — Fix*
- Per audit recommendations

**Notes / decisions log:**
- 2026-05-15: confirmed same scanner since launch; software issue not hardware.
- 2026-05-15: occurs in both POS and Inventory Counts.

---

### Item 10 — Swipe-to-Delete on Inventory Counts (iPad)

- **Status:** not started
- **Severity:** S2
- **Effort:** 1 small session (~1 hour)
- **Wave:** 4
- **Depends on:** none

**Problem statement:**
While doing inventory counts on iPad, user wants to delete an item from the
count list with swipe gesture before committing to inventory.

**Acceptance criteria:**
- iPad/touch-only: swipe left on a count line item reveals a delete action.
- Tap delete removes that line from the in-progress count (does NOT
  affect inventory until commit).
- Confirmation modal: "Remove [Product Name] from this count?" Yes/Cancel.
- Web/desktop: not required for this session.

**Out of scope:**
- Desktop swipe behavior.
- Bulk delete.

**Files likely affected:**
- Inventory Counts view component (iPad-specific path or responsive)
- Possibly a swipe gesture handler component

**Session plan:**
- Single session.
- Use existing swipe-gesture pattern if one exists; otherwise minimal
  implementation.

**Notes / decisions log:**
- 2026-05-15: iPad-only; web/desktop not in scope.
- 2026-05-15: count list is tally-only until commit; delete doesn't touch
  inventory.

---

### Item 11 — Keypad / Scan-Each Toggle for Inventory Counts

- **Status:** not started
- **Severity:** S2
- **Effort:** 1 medium session (~2 hours, including design discussion)
- **Wave:** 4
- **Depends on:** Item 10 helpful but not required

**Problem statement:**
Today: each scan of the same SKU increments the count by 1. For high-count
items (e.g., 26 of one SKU), scanning 26 times is tedious. Want a toggle so
operator can scan once, then enter the total via keypad.

**Acceptance criteria:**
- Toggle at top of Counts screen: "Scan each" / "Scan + Keypad"
- "Scan each" mode (default): current behavior — every scan increments by 1
- "Scan + Keypad" mode: first scan of a SKU shows the existing numeric keypad
  (reused component); user enters total count; subsequent scans of the same
  SKU pre-fill the keypad with the existing total
- Toggle is persistent per session (not per scan)
- Manual numeric entry for products without barcodes — supported in keypad mode

**Out of scope:**
- Voice input for counts.
- Bulk import from CSV (separate feature).

**Files likely affected:**
- Inventory Counts view component
- Reuse: existing numeric keypad component
- Tests for both modes

**Session plan:**
- Single session.
- Design discussion at start: confirm UI layout (toggle position, keypad
  invocation).
- Build mode toggle + branch logic.
- UAT both modes.

**Notes / decisions log:**
- 2026-05-15: keypad is an existing shared component, reusable.
- 2026-05-15: operator-facing decision — let me see designs in-session.

---

## Wave 5 — Major Features (Multi-Session Epics)

### Item 14 — Intake Control Panel + Per-Vehicle-Type Zones + Photo Approval

- **Status:** not started
- **Severity:** S1 (intake is core workflow)
- **Effort:** 5-8 sessions (multi-phase epic)
- **Wave:** 5
- **Depends on:** none, but blocks Item 13

**Problem statement:**
Current intake is rigid: hardcoded number of images required, fixed zones,
no admin control. Need: configurable zones per vehicle type, configurable
minimum photos per zone, admin upload of vehicle silhouettes (SVG/PNG),
ability to enable/disable zones for testing, and approval workflow before
intake photos auto-publish to "Our Work" on the public site.

**Acceptance criteria (full epic):**
- New admin section: Admin > Settings > Intake Configuration (or similar).
- Vehicle types supported: sedan, SUV, truck, motorcycle, RV, boat, aircraft.
  No exotic / classic for now.
- For each vehicle type, configure:
  - Vehicle silhouette image (SVG or PNG upload)
  - Zone list (e.g., Hood, Front Seats, Rear Seats, Driver Side, Passenger Side,
    Trunk, Engine, Tires/Wheels)
  - Per-zone: enabled/disabled, minimum photo count (0 = disable enforcement)
  - Global per-vehicle-type "minimum total photos" override
- Existing sedan zones (front seats, rear seats, driver side, passenger side,
  trunk, hood, tires/wheels, engine) become the default sedan config.
- Detailer intake UI shows vehicle silhouette + zone overlay matching vehicle type.
- Photo storage location unchanged (same S3 path / Supabase Storage).
- Before-after slider auto-generation: still works, BUT no auto-publish to
  "Our Work" — requires admin approval first.
- New admin queue: pending intake → approve → publish to "Our Work."
- Approval action publishes the before/after slider to the public site
  (existing flow, just gated by approval).

**Out of scope:**
- Customer-visible intake configuration (admin-only).
- Photo editing tools (crop, rotate, filter).
- Multi-vehicle-per-appointment intake configuration (existing one-vehicle
  pattern preserved).

**Files likely affected:**
- New admin intake config page
- Vehicle types table (likely new) + vehicle silhouette storage
- Zones config table (likely new)
- Intake photo capture component (read config per vehicle type)
- "Our Work" publishing flow (add approval gate)
- New approval queue page in admin
- Tests for config-driven intake

**Session plan (high-level — refine in-session):**

*Session 1 — Discovery + DB design*
- Audit current intake hardcoding
- Design DB schema for vehicle_types, zones, zone_config
- Document migration plan

*Session 2 — Vehicle types + silhouette upload*
- Build admin vehicle types CRUD
- File upload for silhouettes (SVG / PNG)
- Migrate existing sedan as the default

*Session 3 — Zones config UI*
- Build admin zones CRUD per vehicle type
- Per-zone enable/disable + min photos

*Session 4 — Detailer intake UI*
- Rewire intake component to read config from DB
- Show vehicle silhouette + zone overlay
- Honor enabled/disabled + min photo settings

*Session 5 — Approval workflow*
- Build admin "Pending Intake Approvals" queue
- Gate "Our Work" publishing behind approval
- Migration for existing published items (auto-approve historical)

*Session 6 (if needed) — Polish + edge cases*
- Mobile responsive on iPad
- Multi-vehicle / per-vehicle-type intake QA

**Notes / decisions log:**
- 2026-05-15: vehicle types: sedan, SUV, truck, motorcycle, RV, boat, aircraft.
- 2026-05-15: existing sedan zones (8) become default config.
- 2026-05-15: photo storage location unchanged — same S3/Storage path.
- 2026-05-15: must be able to set min photos = 0 to disable enforcement
  (for testing).
- 2026-05-15: before/after slider auto-publish disabled; requires admin approval.
- 2026-05-15: SVG and PNG both supported for silhouettes.

---

### Item 13 — Detailer Mobile Link (Full Mobile Workflow)

- **Status:** not started
- **Severity:** S1 (mobile detailing exists today; manual workaround in use)
- **Effort:** 8-12 sessions (largest epic on the roadmap)
- **Wave:** 5
- **Depends on:** Item 7 (timer), Item 4 (cash tip), Item 14 (intake redesign)

**Problem statement:**
For onsite/mobile detailing jobs, no mobile-optimized flow exists. Detailer must
do intake/outtake remotely; today this is manual. Need: magic link sent to
assigned detailer for mobile jobs, allowing intake, mid-job customer approval,
full payment collection (CC + cash + check + Venmo + Zelle), tip capture, ticket
closure, and triggering of post-sale automations — all from detailer's phone.

**Acceptance criteria (full epic):**
- New SMS template: "Detailer Mobile Link" under Admin > Settings > Messaging
  > SMS Templates (operator-editable copy, dynamic link pill).
- When a mobile appointment / job is created or flagged as mobile, the
  assigned detailer receives the SMS with the magic link.
- Magic link tied to specific job:
  - Signed token (HMAC or JWT)
  - Expires when job is closed
  - Single-detailer access (token bound to assigned detailer)
  - No detailer login required
- Mobile flow mirrors in-store:
  - Intake (uses Item 14 config — zones, min photos, vehicle type)
  - Job timer with pause (uses Item 7)
  - Mid-job add-on requests (customer approval via SMS — new flow)
  - Payment options: Credit Card / Cash / Check / Venmo / Zelle
    - Credit Card: payment link with tip (uses Item 2)
    - Cash: enter amount, log cash tip if any (uses Item 4)
    - Check: enter check number
    - Venmo / Zelle: confirm receipt via notification on detailer phone
  - On payment confirmation: ticket closes, post-sale automations fire
- All photos stored in same S3/Storage path as in-store intake.
- Post-sale automations (Google review SMS, etc.) fire identically.

**Out of scope:**
- Detailer login / authentication (magic link only).
- Customer signature on mobile (per your spec).
- Phone-died-mid-job recovery (per your spec: detailer has charger in van).
- Offline mode (assumes connectivity).

**Files likely affected:**
- New magic-link generation + verification routes
- Mobile-optimized POS surface (new app routes or responsive existing surface)
- SMS templates table (new template)
- Payment method handlers (Check / Venmo / Zelle new entries)
- Mid-job add-on customer approval flow
- Tests across the entire mobile lifecycle

**Session plan (high-level — refine after Items 7, 4, 14 are mostly done):**

*Session 1 — Magic link infrastructure*
- Token generation, signing, expiry
- Job-to-detailer binding

*Session 2 — SMS template wiring*
- New "Detailer Mobile Link" template
- Trigger on mobile-flagged appointments

*Session 3 — Mobile intake (uses Item 14)*
- Responsive intake flow
- Vehicle silhouette + zones on phone screen

*Session 4 — Mobile job timer (uses Item 7)*
- Pause / resume on phone

*Session 5 — Mid-job add-on approval flow*
- Customer SMS for add-on approval
- Detailer waits for customer confirmation

*Session 6 — Payment: Credit Card (uses Item 2)*
- Mobile payment link with tip
- Send link to customer via SMS

*Session 7 — Payment: Cash (uses Item 4)*
- Cash entry + tip capture

*Session 8 — Payment: Check / Venmo / Zelle*
- Check number entry
- Venmo / Zelle confirmation

*Session 9 — Ticket close + post-sale automations*
- Mark job complete from mobile
- Trigger Google review SMS, all standard automations

*Session 10-12 — Polish + edge cases*
- Error handling: poor connectivity, partial payments
- Receipt delivery on mobile
- Token-expiry handling mid-job

**Notes / decisions log:**
- 2026-05-15: magic link, no detailer auth; expires at job close.
- 2026-05-15: same photo flow, storage, post-sale automations as in-store.
- 2026-05-15: detailer has charger in van — no phone-death recovery needed.
- 2026-05-15: payment methods: CC, Cash, Check (with check #), Venmo, Zelle.
- 2026-05-15: revisit ROI before starting — how many mobile jobs per week
  justify 8-12 sessions of build?

---

## Session-by-session ledger

This is the running log of what's been completed. Update at the end of each
CC session.

| Date | Session # | Item | Status | Commit hash | Notes |
|---|---|---|---|---|---|
| 2026-05-15 | 1 | Item 1 — POS Customer Search → Create Smart Prefill | done | `6b0413dd` | New helper `routeSearchInput` + 24 unit tests + 6 dialog prefill tests. Wired into ticket-panel + quote-ticket-panel. Reused `isPhoneQuery` from existing tokenize.ts. International phone shapes preserved verbatim. Pre-existing in-progress Item 6/12 work left untouched on working tree. |
| 2026-05-15 | 2 | Item 6 — Deposit / Paid-in-Full Label Unification | done | _(this commit)_ | `formatDepositLabel({depositCents,totalCents})` helper added to receipt-composer.ts. `RECEIPT_VOCAB.DEPOSIT_ONLINE`/`DEPOSIT_IN_STORE` replaced with `DEPOSIT`/`PAID_IN_FULL`. Threaded `ticketTotalCents` (subtotal+tax+tip) into 3 render sites: thermal, HTML, public receipt. 10 fixture files regenerated. 7-case helper test suite + threshold tests on `buildSuggestedLabelForPayment` (122 composer tests, 1024 total — all pass). Typecheck/lint/build clean. |
| 2026-05-15 | 3 | Item 12 — Appointments in POS Footer + Reschedule | done | _(this commit)_ | Added Appointments tab (5th primary) to `bottom-nav.tsx`. New `/pos/appointments` route + `appointments-view.tsx` (date-range presets, grouped list) + `reschedule-appointment-dialog.tsx` (modal-from-row-click). New `GET /api/pos/appointments` (date-filtered list, default today+tomorrow, 31-day cap). New `PATCH /api/pos/appointments/[id]/reschedule` — POS-dedicated endpoint, no `fireWebhook` call (notification-suppression by construction; audit row records `notification_suppressed: true`). 17 new tests including 3-spy invariant (`sendSms`, `sendEmail`, `fireWebhook` all 0 calls). Existing `/api/pos/staff/available` reused for detailer dropdown. Permissions: `appointments.view_today` for read, `appointments.reschedule` for write — no new keys. `conversation_search` tool unavailable in env so no prior plan recovered. Typecheck/lint/build/vitest 1024-clean. |
| 2026-05-16 | 4 | Item 15b — Cancel from POS Appointments + This Month filter | done | _(this commit)_ | New `POST /api/pos/appointments/[id]/cancel` endpoint (HMAC POS auth + `checkPosPermission('appointments.cancel')`). `notify_customer` defaults to false — when false, BOTH `sendCancellationNotifications` and `fireWebhook('appointment_cancelled')` are skipped (mirrors Item 12 "no webhook by construction"). New `cancel-appointment-dialog.tsx` (reason textarea + Notify checkbox, amber notice swaps copy with checkbox state). Appointments-view gets "This Month" filter button (today → endOfMonth PST) + Trash icon per row gated by `usePosPermission('appointments.cancel')` (hidden, not disabled, for cashier role). 9-case endpoint suite (suppression invariant: 0 SMS / 0 email / 0 webhook / 0 cancellation-notification calls on the false path) + 4-case RTL suite on the view (filter date math, permission gate). 1071/1071 tests; typecheck/lint/build clean. Parallel Items 15a + 15c work stashed (ROADMAP / CHANGELOG / appointment-detail-dialog / FILE_TREE / job-detail) to keep this commit clean; will be popped post-commit for those sessions to resume. |
| 2026-05-16 | 5 | Item 15c — "Change Time" Affordance on Jobs Card | done | _(this commit)_ | Closes audit gap §10 #10. New `<ChangeTimeButton>` (~120 LOC thin wrapper) placed in the Jobs-card Timing tile header. Hides on permission/appt-id/status guards (RESCHEDULABLE = scheduled/intake/in_progress; pending_approval/completed/closed/cancelled all hidden). Click fetches single appointment + bookable staff in parallel and renders the existing `<RescheduleAppointmentDialog>` from Item 12 **unmodified**. New `GET /api/pos/appointments/[id]` (single-appointment lookup, same select shape as the list endpoint, `appointments.view_today` gate). 15 new tests (11 component + 4 endpoint). Notification suppression inherited from Item 12's reschedule path — no new spy assertions needed. Ran concurrently with Items 15a/15b; only Item 15c files staged for this commit. Hit repeated doc-revert collisions with parallel sessions editing ROADMAP/FILE_TREE/CHANGELOG — re-applied minimum 15c doc edits immediately before commit. Typecheck/lint/build clean; vitest 1067-clean. |
| 2026-05-16 | 6 | Item 15a — Edit Services on Admin Appointment Dialog (with cascade to job) | done | `8726053d` | Closes audit gaps §10 #1 and #11. New `PUT /api/admin/appointments/[id]/services` performs the cascade: replaces `appointment_services` rows, recomputes appointment `subtotal`/`total_amount`, and (if a `jobs` row is linked via `jobs.appointment_id`) rebuilds the `jobs.services` JSONB to match — mirroring the synthetic-mobile-fee shape from `/api/pos/jobs/populate/route.ts`. Permission decision: reused `appointments.reschedule` (same role distribution + no migration). Manual rollback pattern from `/api/pos/jobs/route.ts:381-453` adapted — snapshot/restore preserves original row ids at each failure-injection point. New `GET /api/admin/services/active` (session-authed) feeds the picker. New `<EditServicesModal>` and pure helpers in `src/lib/appointments/edit-services.ts` (Zod schema, `buildJobServicesJsonb`, `computeTotalsForServiceEdit`). 35 new tests (18 helpers + 17 cascade) including the 3-spy notification-suppression invariant (sendSms / sendEmail / fireWebhook all 0). Optimistic services-override state in the dialog re-renders totals immediately; parent refetches on `onServicesUpdated`. POS Jobs-card inline picker left untouched (tech debt acknowledged). Typecheck/lint/build clean; vitest 1088-clean. Concurrent with Items 15b/15c — only 15a files staged. |
| 2026-05-16 | 7 | Item 15f Layer 1 — Extract canonical picker engine + `useServicePicker` hook | Layer 1 done | `bec3e16e` | **Pure refactor, zero behavior change** per session brief. New shared lib `src/lib/services/`: `picker-engine.ts` (canonical math `resolveServicePrice` / `resolveServicePriceWithSale` / `getServicePriceRange` MOVED byte-identical from `src/app/pos/utils/pricing.ts`, plus new `routeServiceTap` pure-function extraction of `<CatalogBrowser>`'s tap routing tree from lines 333-419 / 446-488), `use-service-picker.ts` (`.ts` extension honored via `React.createElement` — JSX-free), `index.ts` (public barrel). `src/app/pos/utils/pricing.ts` becomes a thin `@deprecated` re-export shim — all 9 existing importers (ticket-reducer, quote-reducer, register-tab, catalog-browser, service-detail-dialog, service-pricing-picker, catalog-card, flag-issue-flow, old pricing.test.ts) continue to work without modification. Tests: 32 engine tests covering all 5 size classes, sale interactions, `getServicePriceRange` boundary cases, and one `routeServiceTap` test per `pricing_model` value — `custom` pinned as `'NOT YET HANDLED — Layer 2'` so Layer 2 can update it deliberately. 7 hook-contract tests with vi-mocked `<CatalogBrowser>` + `<ServicePricingPicker>` (keeping the test focused on hook wiring, not the wrapped components' behavior). **Zero surface migrated** — Layer 3a / 3c handle migrations; Layer 3b (4 working POS surfaces) deferred indefinitely; ESLint `services/no-bespoke-pricing` deferred to Layer 4. Small deviation from brief: `ServicePickerOptions` re-exported from `./use-service-picker` (where it's defined) rather than `./picker-engine` (where the brief's index.ts example placed it) — the barrel re-exports both so external import sites are identical. Verification: typecheck clean, lint 0 errors (98 warnings = baseline, no new), 1131/1131 vitest pass (1088 prior + 32 engine + 7 hook + 4 unchanged via shim), production build compiled successfully. |
| 2026-05-16 | 8 | Item 15f Layer 2 — `custom` pricing_model UX | Layers 1+2 done | `3195c38c` | Added the staff-assessment prompt for `pricing_model === 'custom'` services (canonical fixture: "Flood Damage / Mold Extraction" — `custom_starting_price: 475`, no `service_pricing` rows). New file `src/lib/services/custom-price-dialog.tsx` (`<CustomPriceDialog>` + `buildCustomPricing` helper); matches `<PerUnitPicker>`'s dialog conventions per Rule 11. Validation enforces positive amount ≥ `STRIPE_MIN_DOLLARS` from `src/lib/utils/money.ts` per Rule 20 — no hardcoded 50. Synthesizes a `ServicePricing` row with `tier_name: 'custom'`, `tier_label: 'Custom Assessment'`, `is_vehicle_size_aware: false`, all per-size columns null, synthetic `id` of `custom-${service.id}-${Date.now()}`. `picker-engine.ts`: one new variant on `ServiceTapRoute` (`open-custom-price-dialog`) and one new branch in `routeServiceTap` — fires regardless of vehicle and regardless of `flat_price`/`pricing` row state, so the operator always assesses (never quick-adds a stale value). The engine is intentionally ahead of `<CatalogBrowser>` for `custom` until Layer 3a/3d migrates consumers. `useServicePicker` gained imperative `tapService(service)` that runs `routeServiceTap` and either fires `onServiceSelected` (quick-add cases) or opens the appropriate dialog; `ActiveDialog` slot now discriminates between `<ServicePricingPicker>` and `<CustomPriceDialog>` via an `ActiveDialogState` union. `index.ts` barrel re-exports `CustomPriceDialog` / `buildCustomPricing` / `CustomPriceDialogProps`. Tests: Layer 1's "NOT YET HANDLED" pin flipped to assert the new behavior, plus a second engine test pinning "custom wins over flat_price/pricing rows." New `custom-price-dialog.test.tsx` with 10 dialog cases + 1 helper case (all validation paths including the Stripe-minimum boundary, confirm + cancel emit/no-emit). 6 new hook integration cases in `use-service-picker.test.tsx` (vi-mocking `<CustomPriceDialog>` as a sibling to the existing browser/picker mocks). Verification: typecheck clean, lint 0 errors (98 warnings = unchanged baseline), 1149/1149 vitest pass (was 1131; +18 net new), build compiled successfully. **Zero surface migrated** — Layer 3a / 3c / 3d still own that work; no ESLint scaffolding (Layer 4). |
| 2026-05-16 | 11 | Item 15f Layer 3c — Booking Wizard price-math migration to canonical engine | Layer 3c done | _(this commit)_ | Customer-facing booking wizard (`src/components/booking/step-service-select.tsx`) now routes ALL service-pricing math through `resolveServicePrice` / `resolveServicePriceWithSale` per CLAUDE.md Rule 22; bespoke UI preserved per the carve-out for customer surfaces. The 6 audit-cited inline math sites are gone: `computePrice` switch (lines 1307), `getServicePriceDisplay` switch + flat/scope/specialty case branches (1394/1404/1440/1482), `PricingSelector` inner math for all 5 cases (951), and `ScopeTierCard`'s "From $X" floor (1280-1290). For `flat` and `per_unit` services (no `service_pricing` row in the catalog), the wizard synthesizes an ephemeral `ServicePricing` row to feed the engine (mirrors `routeServiceTap`'s `quick-add-synthetic-flat` pattern); `per_unit` qty multiplication stays wizard-side. Two engine-correct side effects: (1) `custom` pricing_model now resolves to `service.custom_starting_price` — pre-fix the wizard's `computePrice` had no `custom` branch and returned 0, silently blocking Flood Damage from booking; (2) `is_vehicle_size_aware: true` tiers now apply tier-level `sale_price` when active (engine compares sale_price against the resolved per-size price; pre-fix wizard ignored sale on per-size tiers). Wizard-local `isVehicleSizeOffered(tier, sc)` provides column-presence check for the scope+size customer grid (hides unconfigured sizes) — a metadata query, not a price computation, since the engine fallback-resolves null columns to `tier.price`. Deleted: bespoke `getVehicleSizePrice(tier, sc)`, all `getTierSaleInfo` call sites in PricingSelector/getServicePriceDisplay/ScopeTierCard, unused `SaleStatusInfo` interface + `saleStatus` prop on `<PricingSelector>`, the redundant outer `saleStatus` derivation. `ScopeTierCard` now takes `resolved: ResolvedPrice` (engine's canonical output shape) instead of `saleInfo: TierSaleInfo | null`; its "From $X" floor iterates `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` with `isVehicleSizeOffered` filter + `resolveServicePrice` for values. `computePrice` no longer takes `isOnSale` param (engine derives internally from `saleWindow`). New test file `src/components/booking/__tests__/step-service-select.test.tsx` (27 cases) pins all 6 `pricing_model` values: flat $175 / vehicle_size row-based (exotic $450 NOT sedan, classic Ceramic Shield $725) / vehicle_size column-based (engine reads exotic/classic per-size columns) / scope (non-vehicle_size_aware tier returns tier.price) / per_unit (Scratch Repair $150 × 3 = $450, sale-applied variant) / specialty (Aircraft $800, Boat $600, Motorcycle $200) / custom (Flood Damage $475). Plus `getServicePriceDisplay` label tests for sale strikethrough + "From $X" min. `computePrice` and `getServicePriceDisplay` exported from the wizard file for direct test consumption (the file is `'use client'`, but exports work both for the React tree and the jsdom test). Verification: typecheck clean, lint 0 errors (98 warnings = unchanged baseline), 1226/1226 vitest pass (was 1199 prior; +27 new), production build compiled successfully (787 static pages, clean `.next` rebuild). **Manual UAT NOT performed** — booking wizard requires running the app against a real DB; user verifies post-session per `npm run dev`. |
| 2026-05-19 | 33 | Roadmap doc update — 2026-05-19 evening (JSONB fix cluster + new follow-ups) | Doc-only | _(this commit)_ | ROADMAP-13-ITEMS.md updated in place on branch `docs/roadmap-update-2026-05-19-evening` (based on v3.7 branch). (1) Version bump v3.7 → v3.8. (2) Workstream E: `ai.txt` P0 flipped ⚪→✅ (commit `1b96405f`, merge `feef903d`, 16 tests, migration `20260519035517`); coupon-enforcement P1 added as ✅ done (commit `a55335de`, merge `17ebbd48`, 24 tests, migration `20260519042312`, new shared helper `src/lib/utils/coupon-enforcement.ts`, 3 consumer sites refactored — `validate/route.ts` + `promotions/available/route.ts` cross-consumer drift resolved); QBO P1 reclassified ⚪→⏸ deferred pending QBO reconnection; `voice-calls-poll` cron reclassified ⏸ deferred → ⚪ not started (P2, audit complete on `audit/voice-poll-and-coupon-enforcement` `83bfae64`); legacy "out-of-scope flag" rows retired now that both flagged items have an explicit status; new follow-up row "Migration LIKE-pattern fix" added (recurring failure surfaced 2× — both homepage-settings and coupon-enforcement required manual SQL force-fix). (3) Workstream F: added "SemVer / version tracking implementation" (surfaced 2026-05-19) and "Migration template hardening" (companion to E's LIKE-pattern investigation). (4) Suggested Next Move rewritten to reflect today's two P1 fixes shipped + new follow-ups. (5) This ledger row added. No source code or test files modified. Verification: `npm run lint` 0 errors. |
| 2026-05-19 | 32 | Workstream E — coupon-enforcement JSONB fix + cross-consumer drift resolution | Fix done | `a55335de` (merge `17ebbd48`) | Admin form save handler at `src/app/admin/settings/coupon-enforcement/page.tsx` called `JSON.stringify(mode)` before Supabase upsert into a JSONB column → immediate double-encoding on every save. User-visible symptom: operator could not reliably set hard mode — every save auto-reverted to soft on next form reload. Cross-consumer drift compounded: `validate/route.ts` compensated with `replace(/"/g, '')` (correct), `promotions/available/route.ts` had no compensation and silently treated `'"hard"'` as no-op enum value (falling through to soft regardless of operator intent). Fix: new shared helper `src/lib/utils/coupon-enforcement.ts` (+78 LOC, canonical reader); 3 consumer sites refactored to use it; admin save drops the stringify. 24 new tests (`+24 new`, baseline 1670 → 1694). Migration `20260519042312_normalize_coupon_type_enforcement_double_encoding.sql` ran but did not match production row due to the same LIKE-pattern issue that affected homepage-settings; row force-fixed with direct SQL (length-based guard). Production UAT: hard mode now persists across reload. Audit ref: `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md` §2. |
| 2026-05-19 | 31.5 | Workstream E — `ai.txt` JSONB fix + defensive backfill | Fix done | `1b96405f` (merge `feef903d`) | Admin PATCH route at `src/app/api/admin/cms/seo/ai-txt/route.ts:90` was calling `JSON.stringify(content)` before Supabase upsert into a JSONB column. Customer-facing exposure: public `/ai.txt` endpoint served the double-encoded JSON blob to AI crawlers (GPTBot, Google-Extended, CCBot, anthropic-ai) instead of valid `User-agent:` + `Disallow:` directives — crawler policy was silently inoperative on any row that had been saved through the admin UI. Fix mirrors homepage-settings pattern: write raw, defensive read at the public endpoint, idempotent migration `20260519035517_normalize_ai_txt_content_double_encoding.sql` (was a no-op in practice since production row was clean). 16 new tests (admin PATCH route + public `/ai.txt` defensive read). Production UAT verified: `curl /ai.txt` serves clean directives; admin Save round-trip preserves `len=394` without corruption. Audit ref: `docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md`. |
| 2026-05-19 | 31.4 | Workstream E — voice-calls-poll cron + coupon-enforcement JSONB audit (read-only) | Audit done | `83bfae64` (branch `audit/voice-poll-and-coupon-enforcement`) | Companion audit to the parent admin-PUT JSONB sweep. Characterizes the two sites the parent audit flagged as out-of-scope. **voice-calls-poll cron**: CONFIRMED-BROKEN but currently SELF-CONSISTENT (write `JSON.stringify(now)` + read `JSON.parse` — both halves work end-to-end on a doubly-encoded ISO timestamp). No production impact today; brittle only if a future change drops one half. Fix urgency P2. **coupon-enforcement admin page**: CONFIRMED-BROKEN with active user-visible corruption — operators could not make hard-mode stick (auto-reverts) AND the `promotions/available` consumer silently treated restricted coupons as soft-mode. Fix urgency P1 — addressed same day in ledger row #32. Audit doc: `docs/dev/AUDIT_VOICE_POLL_AND_COUPON_ENFORCEMENT_2026-05-19.md` (~280 lines). |
| 2026-05-19 | 31 | Roadmap doc update — 2026-05-17→2026-05-19 backfill + Out-of-Scope Workstreams section | Doc-only | _(this commit)_ | ROADMAP-13-ITEMS.md updated in place. (1) v3.7 version bump. (2) New "Roadmap Snapshot" section with 13-item status table + roll-up counts (Done 9 / In progress 0 / Deferred 1 / Not started 10) — 15f surfaced as ✅ done in the table (per-item Status line was already updated on `10f7cffb`). (3) New "Out-of-Scope Workstreams" section covering Workstream A (SMS AI v2, 6 layers — 2 done, 4 pending), Workstream B (Next.js security upgrade — Phase 1 done, Phase 2-3 pending), Workstream C (original triage — Anthropic key rotated, Google Places fixed end-to-end via `82cbcffe` + `9a9e4a02`/`3da3183e`, ElevenLabs timeouts audit pending), Workstream D (infra hardening — deploy guards / credential rotation / `CRON_SECRET` cleanup / Supabase CLI sync / Twilio restore / BillionMail all done), Workstream E (JSONB audit + fixes — homepage settings shipped via `9a9e4a02`/`3da3183e`, admin PUT audit shipped via `cf7aaa90`, P0 `ai.txt` + P1 QBO module fixes pending), Workstream F (process improvements). (4) New "Suggested Next Move" section with two-track structure (feature roadmap vs out-of-scope workstreams). (5) Session ledger backfilled with rows 24–31 covering 2026-05-17 Layer 8f + 2026-05-18 SMS AI audits/v2 Layer 1+2/Next.js audit/Google Place ID fix/homepage JSONB fix/admin PUT audit. No source code or tests modified. Verification: `npm run lint` 0 errors. Branch: `docs/roadmap-update-2026-05-19`. |
| 2026-05-18 | 30 | Workstream E — Admin PUT routes JSONB anti-pattern audit (read-only) | Audit done | `cf7aaa90` | Branch `audit/admin-put-jsonb-encoding`. Doc at `docs/dev/AUDIT_ADMIN_PUT_JSONB_2026-05-19.md` (198 lines). Scoped to `src/app/api/admin/` PUT/POST/PATCH handlers writing JSONB. Found: 5 confirmed-broken routes (all `business_settings.value` writers — `cms/seo/ai-txt`, `integrations/qbo/{callback,connect,disconnect,settings}`, plus shared `lib/qbo/{client,settings}.ts`). 4 routes safe (correct raw-value passthrough or TEXT-column target). 2 out-of-scope siblings flagged: `voice-calls-poll` cron (self-consistent + brittle), `coupon-enforcement` admin page (cross-consumer drift). Recommended fix order: P0 batch — `ai.txt` standalone (customer-facing crawler exposure, ~30min); P1 batch — QBO module coordinated migration (6 files + migration + tests; cannot split). Cross-cutting finding: 4 distinct compensation strategies exist in codebase for the same anti-pattern (try/catch JSON.parse, single-quote strip, all-quote strip, no compensation) — confirms the root anti-pattern was never recognized as a single bug class. Audit-only: no code or test changes. |
| 2026-05-18 | 29 | Workstream E — Homepage settings JSONB double-encoding fix + backfill migration | Fix done | `9a9e4a02` (merge `3da3183e`) | True root cause of yesterday's Google Places cron 502s. The homepage-settings PUT route was calling `JSON.stringify(x)` before passing into a Supabase `.upsert` against a JSONB column → double-encoded values that non-compensating readers (cron, public endpoints) couldn't parse. 15 new regression tests pinning the round-trip. Backfill migration `20260518225000_normalize_homepage_settings_double_encoding.sql`. In practice the migration's strict LIKE pattern didn't normalize the original row — manual UPDATE was used; pattern issue logged but data is clean. Cron verified end-to-end after fix: rating 4.9, count 38, reviews fetched 5. Old Place ID `ChIJf7qNDhW1woAROX-FX8CScGE` was canonical all along (not the suspect). |
| 2026-05-18 | 28 | Workstream A — SMS AI v2 Layer 1+2 (foundation: helpers, tools, prompt, flags) | Layer 1+2 done | `0147c3c5` (base `aed37e7f` + refactor `135b2944`) | Shared helpers + voice-agent-tool wrappers + v2 system prompt + feature flag scaffolding. 119 new tests. Feature flag defaults disabled; routing wiring lands in Layer 4. Tests + observability lands in Layer 6. 2 CC-introduced typecheck errors in test files (`vi.fn` arity + `sendSmsMock` type) tracked in Workstream F cleanup item. |
| 2026-05-18 | 27 | Workstream B — Next.js 15.5.18 upgrade audit + restore-point tag (Phase 1 of 3) | Phase 1 done | `bb74702f` | Audit doc at `docs/dev/NEXTJS_15.5.18_UPGRADE_AUDIT.md`. Tag `pre-nextjs-15.5.18-upgrade` at SHA `d3d3f6d6`. Risk MEDIUM. Three actionable findings: `images.remotePatterns` `**` wildcard (GHSA-9g9p-9gw9-jx7f self-hosted DoS), dead top-level `skipTrailingSlashRedirect` config, React `19.2.3 → 19.2.6` piggyback. Phase 2 (~2.5–3.5h dev test) + Phase 3 (~1.5–2h deploy + monitoring) pending. Target patches all 23 open `next` GHSA advisories including CVE-2025-66478 (CVSS 10.0 RCE). |
| 2026-05-18 | 26 | Workstream C Fix #2 — Google Place ID double-encoding normalize (B + C hardening) | Done (partial — full closure on row 29) | `82cbcffe` | First half of the Google Places cron 502 fix. Normalized the stored `google_place_id` value. Did NOT yet remove the broken write path that produced the double-encoding in the first place — that was discovered later same day and fixed in `9a9e4a02` (row 29). Together these two commits closed the cron-502 incident end-to-end. |
| 2026-05-18 | 25 | Workstream A — SMS AI v2 design-input audit (read-only) | Audit done | `66a8996e` | Catalogues 14 voice-agent endpoints (Bearer-auth, session-identity-free, reusable by SMS AI v2). Documents current SMS handler architecture (single-shot synchronous; no tool loop). Investigates staff-notification specialty path — wired but `staff_notification_inbound_specialty.recipient_phones` is NULL post-seed → falls back to `business_phone` (storefront line, not owner mobile). 7 design questions answered for the v2 build. |
| 2026-05-18 | 24 | Workstream A — SMS AI auto-reply pipeline audit (read-only) | Audit done | `a0814a90` | Surfaces two production bugs visible in the Nayeem Khan / May 18 conversation: (1) intermittent toggle race — `is_ai_enabled` checked at request entry but not at outbound-send time, so mid-conversation operator toggle is ignored; (2) stale response — specialty pivot block returns canned text from a template that no longer matches catalog state. Motivates the v2 rebuild (cutover deletes the specialty pivot + the stale template). |
| 2026-05-17 | 23.5 | Item 15f Phase 1 Layer 8f — comprehensive test coverage — **Phase 1 COMPLETE — Item 15f COMPLETE** | Phase 1 closed | `10f7cffb` | Tests-only session, zero production code changes. Three deliverables: (1) new end-to-end integration test file `src/lib/appointments/__tests__/edit-flow.integration.test.ts` (14 cases) joins load → drain → save and pins cross-layer invariants — source=appointment + source=job (Option G4) happy paths, source=job null appointment_id refusal, modifier-only edits, combined service+modifier edits, all-services-removed save block, bogus UUID 404, parameterized status-guard lockstep (`completed`/`cancelled`/`no_show`), drain↔cascade pricing parity for mobile_fee synthesis. (2) Extended `pos-workspace-products-gating.test.tsx` with the missing Layer 8d gates — barcode-scanner short-circuit (captures `onScan` callback via hoisted mock; verifies edit-mode never hits the barcode-lookup API) + global-search `filteredProducts` (ProductGrid never mounts in edit mode). +3 cases. (3) New `docs/dev/PHASE_1_TEST_COVERAGE.md` — per-surface × test-type coverage matrix (50+ rows across all Phase 1 layers), 9 documented intentional gaps (G1-G9) with rationale, file-to-test mapping for future maintenance, hand-off notes. **Layer 4 ESLint regression verified**: rule at `'error'` (eslint.config.mjs:76), zero `eslint-disable services/no-bespoke-pricing` comments in `src/`, both new/modified test files lint clean. +17 tests net new. 1503/1503 vitest pass (was 1486 at Layer 8e). typecheck 0 new errors on touched files; ESLint 0 errors / 98 warnings unchanged baseline; production build compiled clean. |
| 2026-05-17 | 23 | Item 15f Phase 1 Layer 8e — dead modal deletion + Layer 3a-i revert + appointment time precision fix | Phase 1 Layers 8a–8d + 8d-bis + 8e done; Layer 8f pending | `35ccd6c9` | Sixth session of Phase 1. Two atomic deliverables. **Deliverable 1 (planned cleanup, Layer 8e proper)** — Deleted `<EditServicesModal>` (`src/components/appointments/edit-services-modal.tsx`) + its orphan test `edit-services-modal-custom.test.tsx`; deleted `<EditServicesDialog>` (`src/lib/services/edit-services-dialog.tsx`) + its orphan test `edit-services-dialog.test.tsx`. Both components were unreachable since Layer 8d routed their triggers to POS edit mode. Removed imports + mounts + dead state (`editingServices`, `servicesOverride`, `onServicesUpdated` prop on the Admin Appointment dialog; `showEditServices`, `editSelectedServices`, three `handleEditService*` functions on the Jobs card). Updated `src/app/admin/appointments/page.tsx` to drop the `onServicesUpdated` prop pass. Removed `EditServicesDialog` barrel export from `src/lib/services/index.ts`. Pruned `VehicleSizeClass` import from `job-detail.tsx` (no longer used). The sanctioned `// eslint-disable-next-line services/no-bespoke-pricing` comment lived inside the deleted modal — gone with the file. Codebase-wide `eslint-disable.*services/no-bespoke-pricing` count is now 0. `edit-services-disabled.test.tsx` updated: removed the modal mock + the "does NOT mount the legacy modal" case (premise gone). Grep confirms ZERO references to either component name remain in `src/` (only doc-comment historical references in the test file header). **Deliverable 2 (UAT-driven fix bundled per session brief)** — Walk-in path (`src/app/api/pos/jobs/route.ts:351-359`) was writing `scheduled_start_time` at HH:MM:SS via `Intl.DateTimeFormat(... second: '2-digit' ...)`, breaking the Admin Appointment dialog's HTML5 `<input type="time">` step=60 validator on those rows. Mini-audit confirmed walk-in was the ONLY broken creation path; online booking (zod `^\d{2}:\d{2}$`), voice agent (`normalizeTimeTo24h`), quote convert (`convertSchema`), reschedule routes (internal `normalizeTime` → `:00`), and timeline drag (manual `:00` append) all already wrote minute precision. Three fixes: (a) walk-in formatter now writes `HH:MM:00`; (b) Admin dialog adds local `toTimeInputValue(time)` helper (same shape as POS reschedule dialog's existing helper) — wired into `reset()` for both `scheduled_*_time` fields; (c) one-time backfill migration `supabase/migrations/20260518000000_truncate_appointment_scheduled_times_to_minute.sql` — idempotent `UPDATE ... SET scheduled_*_time = date_trunc('minute', col::time)::time WHERE seconds <> 0` (expected ~5-10 affected rows per user's pre-session SQL). **NOT touched** (intake / receipt / audit precision must keep seconds): `jobs.actual_start_time`, `jobs.actual_end_time`, `transactions.created_at`, receipts, audit log timestamps. **Tests** (+4 net new): `walk-in-modifier-persistence.test.ts` (+1 case asserting `^\d{2}:\d{2}:00$` shape + explicit "00" seconds segment); new `time-input-truncation.test.tsx` (+3 cases — `17:19:11`→`17:19` for legacy, minute-precise input pass-through, `14:00:00`→`14:00`). **Verification:** typecheck 0 new errors (pre-existing `quote-service.modifiers.test.ts` + `catalog-browser-custom-routing.test.tsx` errors persist — confirmed unchanged via `git stash` on clean main); ESLint 0 errors / 98 warnings unchanged baseline; vitest **1486/1486** passing (was 1500 at Layer 8d-bis; net -14 = -4 from deleted `edit-services-modal-custom.test.tsx` -13 from deleted `edit-services-dialog.test.tsx` -1 from removed legacy-modal-not-mounted case +4 new from this session); `rm -rf .next && npm run build` compiled clean in 30s. **Manual UAT NOT performed** — user verifies post-deploy on 5 paths: (1) Jobs card pencil + Admin "Edit in POS" still route to POS (Layer 8d regression check); (2) fresh walk-in creates appointment with `HH:MM:00` shape; (3) legacy seconds-precise appointment renders cleanly in Admin dialog (truncated to `HH:MM`); (4) backfill SQL returns 0 row count post-migration; (5) intake start/stop (`actual_*_time`) still carries seconds (unchanged). Layer 8f (Phase 1 comprehensive tests) is the next sequential session. |
| 2026-05-17 | 22 | Item 15f Phase 1 Layer 8d-bis — UAT fix-up (Jobs card load + register product gate + no_show refusal + Edit-in-POS button) | Phase 1 Layer 8d done; Layer 8d-bis done (UAT fixes); Layers 8e/8f pending | `b87bc2ce` | Fifth session of Phase 1. Four targeted fixes from Layer 8d UAT, all atomic in this commit. **Fix 1 (CRITICAL, Option G4)** — Jobs card edit flow: Layer 8d shipped `id=<APPOINTMENT_UUID>` for source=job; the drain calls `/api/pos/jobs/${id}/checkout-items` (expects JOB UUID), so it 404'd on every Jobs-card edit. Fixed by flipping URL `id` to JOB UUID; checkout-items endpoint adds `appointment_id` to its response; drain reads `data.appointment_id` and uses it as `ticket.sourceId` (Layer 8c's Save POSTs to `/api/pos/appointments/${sourceId}/services`, so sourceId must always be an appointment UUID — invariant preserved, just resolved from response instead of URL). Drain refuses with no dispatch when source=job and appointment_id is null. **Fix 2 (CRITICAL)** — Register tab favorite gate: Layer 8d gated 3 product-add surfaces (Products tab, global search, barcode scanner); the Register favorite/quick-add grid was the missed 4th. `handleTapFavorite` now rejects product favorites in edit mode with the same toast; product favorites get `opacity-40 cursor-not-allowed` + aria-disabled + title tooltip mirroring the disabled Products tab. Service/custom-amount/surcharge/customer-lookup favorites unaffected. **Fix 3 (Audit Finding #5)** — `no_show` refusal: per the appointment+job status flow audit (read-only doc shipped earlier same day) §6.4, `no_show` is a terminal state and should be refused like `completed`/`cancelled`. Both `src/app/api/pos/appointments/[id]/load/route.ts` and `src/lib/appointments/service-edit.ts` now refuse `['completed', 'cancelled', 'no_show']` in lockstep. **Fix 4 (cosmetic)** — Edit in POS button restyle: Layer 8d shipped an in-Services text link; user requested a button matching the admin shell's "Open POS" header pattern, positioned top-right of dialog. Button now absolute `right-12 top-4` inside `DialogHeader` (left of close X at `right-4`); same icon (`MonitorSmartphone`), same classes as `admin-shell.tsx:949-960`. In-Services text link removed. Text: "Edit in POS". **Tests (+5 net new cases, plus contract flip)**: new `register-tab-favorites-gating.test.tsx` (+4); `use-edit-mode-drain.test.ts` source=job test (+2 — sourceId-from-response, null-appointment-id refusal); `edit-services-deep-link.test.ts` rewritten (URL id is now JOB_UUID, not APPT_UUID); `pos/appointments/[id]/load/__tests__/route.test.ts` +1 (no_show); `pos/appointments/[id]/services/__tests__/route.test.ts` +1 (no_show); `service-edit.test.ts` +1 (no_show); `edit-services-disabled.test.tsx` re-pinned to find button by "Edit in POS" label. Verification: typecheck 0 new errors (pre-existing `quote-service.modifiers.test.ts` errors persist — confirmed unchanged via `git stash` on clean main); ESLint 0 errors / 98 warnings unchanged baseline; vitest **1500/1500** (was 1492 prior; +8 net new); production build compiled successfully in 14s. **Deferred (out of scope, tracked in roadmap):** Test 4 banner format (A-XXXXX numbering, post-Phase-1 engine-unification), Test 6 (10 legacy NULL appointment_id jobs — refusal toast covers; backfill is Item 16 candidate), 5 other status-flow audit follow-ups (none affect F1/Phase 1). **Manual UAT NOT performed** — requires running app + real records; user verifies post-deploy on 4 paths (Jobs card pencil → POS edit + Save Changes + return; service+product favorite click distinction in edit mode; no_show direct-link refusal; Admin Appointment dialog top-right button styling). Layer 8e (delete dead modals) is the next sequential session. |
| 2026-05-17 | 21 | Item 15f Phase 1 Layer 8d — source-side affordances + Layer 8c polish | Phase 1 Layer 8d done; Layers 8e/8f pending | `c89e941e` | Fourth session of Phase 1. Ships source-side trigger buttons (closes the trigger gap left by Layers 8a-8c) + two UAT polish fixes. **Jobs card** (job-detail.tsx): `handleOpenEditServices` swapped from `<EditServicesDialog>` mount to `router.push('/pos?source=job&id=<APPOINTMENT_UUID>&returnTo=/pos/jobs?jobId=<JOB_UUID>')`. CRITICAL: `id` is appointment UUID (not job UUID) because Layer 8c's Save POSTs to `/api/pos/appointments/${sourceId}/services` unconditionally — passing job id would 404 the cascade. Legacy pre-Phase-0a walk-ins (appointment_id IS NULL) get refusal toast. Dead `<EditServicesDialog>` mount stays inert until Layer 8e. **Jobs page** (pos/jobs/page.tsx): new `?jobId=<id>` query-param hop opens detail view on mount + strips param via history.replaceState. Audit §7.1 "lands back on /pos/jobs/[id]" UX now matches reality. **Admin Appointment dialog**: Layer 4's disabled-state Edit button re-enabled; routes to `/pos?source=appointment&id=<uuid>&returnTo=/admin/appointments`. `edit-services-disabled.test.tsx` rewritten for enabled+navigate contract. **Products tab disabled in edit mode** (pos-workspace.tsx): 3 defense-in-depth gates — tab button (cursor-not-allowed + aria-disabled + toast on click), `filteredProducts` useMemo (returns [] in edit mode so global search doesn't render product cards), `handleBarcodeScan` (toast block). Cascade endpoint accepts services only; products attach at transaction commit; UI block prevents silent drop. **EditModeBanner label revamp** (edit-mode-banner.tsx): "Editing Appointment #aaaaaaaa" → "Editing Appointment: Jane Doe — Sat, May 16" via new exported `buildEditLabel`. 4-tier fallback hierarchy: customer+date → customer-only → date-only → UUID-prefix safety net. PST date formatting via Intl.DateTimeFormat. Interim label — proper A-XXXXX numbering deferred to post-Phase-1. **Data plumbing**: new `TicketState.editSourceScheduledDate` field; optional `scheduledDate` on ENTER_EDIT_MODE; both load endpoints (appointments/[id]/load + jobs/[id]/checkout-items) widened with `scheduled_date`; drain threads it through. **Tests** (+16 across 4 files): edit-services-disabled.test.tsx rewrite +3, new edit-services-deep-link.test.ts +4, new pos-workspace-products-gating.test.tsx +3, edit-mode-banner.test.tsx +8 (→ total 14). Collateral typecheck-edits to TicketState fixtures across 5 files for the new field. Verification: typecheck 0 new errors; ESLint 0 errors / 98 warnings unchanged baseline; vitest 1492/1492 (was 1476 prior; +16 net new); production build compiled successfully. **Manual UAT NOT performed** — requires running app + real records; user verifies post-deploy on 6 paths: Jobs card → POS edit + return with SQL roundtrip, Admin dialog → POS edit + return, Products tab disabled toast in edit mode, banner customer+date label format, legacy walk-in refusal toast, no regression for fresh-ticket walk-in / Products active in non-edit-mode / quote-edit. |
| 2026-05-17 | 20 | Item 15f Phase 1 Layer 8c — edit-mode UX + modifier-editable cascade | Phase 1 Layer 8c done; Layers 8d/8e/8f pending | _(this commit)_ | Combined backend + frontend session. Spec corrected mid-scope by LOYALTY_REVERSIBILITY_AUDIT — pre-transaction modifier edits are snapshot-only (no customer balance write, no ledger row, no coupon use_count change), so modifier UI stays VISIBLE and EDITABLE in edit mode (corrects original Quote→POS audit §7's incorrect "suppress loyalty redemption UI" recommendation). **Backend**: `editServicesBodySchema` (src/lib/appointments/edit-services.ts) widened with 6 `.optional().nullable()` modifier fields using three-state encoding (omitted=preserve, null=clear, value=write). `superRefine` mirrors `appointments_manual_discount_coherent` DB CHECK. `service-edit.ts` resolves effective values per field (payload overrides, then appointment column, then null), feeds them to `computeTotalsForServiceEdit` — Layer 15g-iii preservation contract preserved (services-only payload doesn't touch modifier columns). `anyModifierEdit` short-circuits legacy `discount_amount` fallback so clearing all modifiers writes 0. Schema mapping: payload `loyalty_points_to_redeem` → column `loyalty_points_redeemed`; null → 0 for NOT NULL DEFAULT 0 loyalty columns. Audit log `details.field` flips to `'services_and_modifiers'` + adds `modifiers_before` / `modifiers_after` slices when any modifier touched. **Frontend**: new `TicketState.editInitialSnapshot: string | null` field + `serializeTicketEditSlice(state)` exported helper + new `MARK_EDIT_INITIAL_STATE` reducer action stamped by the drain as its FINAL dispatch (after async coupon revalidate) so cart doesn't flash dirty on hydration. `<EditModeBanner>` (new component) amber pill at top of Sale workspace surfaces "Editing Appointment #XXX" + "Unsaved changes" badge; returns null outside edit mode. `<TicketActions>` editMode branch: action bar renders [Cancel | Save Changes] only — no Hold, no Checkout. Save POSTs to `/api/pos/appointments/${ticket.sourceId}/services` with `services[]` (filtered to itemType==='service') + 6 modifier fields; manual discount client-resolved (percent→dollar) via canonical `resolveManualDiscountAmount` from @/lib/quotes/manual-discount. On success: EXIT_EDIT_MODE + CLEAR_TICKET + router.push(returnTo); on dirty Cancel: confirmation modal. F2 keyboard shortcut in pos-shell.tsx gated on `!editMode`. All other Sale-tab UI (CouponInput, LoyaltyPanel, manual discount form, customer/vehicle/catalog/mobile) unchanged. **Known limitation flagged for Layer 8d**: Save POSTs to /api/pos/appointments unconditionally — for source=job the drain's `sourceId` is the job UUID, so Layer 8d's source-side affordance should build the deep-link URL with the appointment UUID instead (smaller surface change). **Tests** (+36 across 4 new/modified files): service-edit.test.ts +11, ticket-reducer-edit-mode.test.ts +5, use-edit-mode-drain.test.ts +2, new ticket-actions-edit-mode.test.tsx +12, new edit-mode-banner.test.tsx +6. Collateral typecheck-edits to ticket-actions.test.tsx (new next/navigation mock + editInitialSnapshot field in fixtures), jobs/page.tsx (5th placeholder), and use-edit-mode-drain.ts buildTicketStateFromLoad (same). Verification: typecheck 0 new errors; ESLint 0 errors / 98 warnings unchanged baseline; vitest 1476/1476 (was 1440 prior; +36 net new); production build compiled successfully. **Manual UAT NOT performed** — requires running app against real appointment + customer records; user verifies post-deploy on 8 paths: fresh ticket regression, deep-link drain UX (banner + button swap), coupon removal SQL roundtrip, loyalty change scenario (CRITICAL: customer balance UNCHANGED + no ledger row), dirty Cancel confirmation, clean Cancel direct nav, F2 shortcut suppression in edit mode, no regression for walk-in/quote-edit/hold-ticket flows. |
| 2026-05-17 | 19 | Item 15f Phase 1 Layer 8b — `<TicketContext>` edit-mode extensions + POS deep-link drain | Phase 1 Layer 8b done; Layers 8c/8d/8e/8f pending | _(this commit)_ | Second session of Phase 1. Extends `<TicketContext>` (`src/app/pos/types.ts`) with 4 new fields (`source: TicketSource`, `sourceId`, `returnTo`, `editMode`) + 2 reducer actions (`ENTER_EDIT_MODE`, `EXIT_EDIT_MODE`). Reducer state-leak guards: `initialTicketState` defaults all 4 fields so `CLEAR_TICKET` auto-resets; `RESTORE_TICKET` explicitly strips edit-mode from sessionStorage payloads (audit §8.3 gotcha #5 — sessionStorage is UX nicety, not authoritative). **Endpoint shape decision: Option B** — new `GET /api/pos/appointments/[id]/load` for source=appointment (sibling of `jobs/checkout-items`, gates on `pos.jobs.manage` to match Layer 8a PUT cascade for save-symmetry; status guard refuses completed/cancelled); existing `GET /api/pos/jobs/[id]/checkout-items` reused for source=job. Option A (parallel `jobs/[id]/load`) rejected as redundant duplication. Deep-link drain (`src/app/pos/hooks/use-edit-mode-drain.ts`) mounted on `<PosWorkspace>`. Reads `window.location.search` on mount via `URLSearchParams` (no `useSearchParams` to avoid Suspense complications); validates `source ∈ {'appointment','job'}` + UUID-shaped `id` + same-origin `returnTo` BEFORE the API call (defense in depth). **Open-redirect defense** — `isSafeInternalPath` rejects 5 attack classes: absolute URLs (`https://evil.com`), protocol-relative (`//evil.com`), dangerous schemes (`javascript:` / `data:` / `vbscript:` / `file:` / `about:`), backslash legacy bypass (`\\evil.com`), non-leading-slash / empty. Modifier hydration mirrors `pos/jobs/page.tsx:handleCheckout` lines 185-217 exactly (Item 15g Layer 15g-iii contract): `ENTER_EDIT_MODE` dispatches with `ticketData` having coupon/loyalty/manual zeroed, then follow-up dispatches of `SET_LOYALTY_REDEEM` (when points or discount > 0), `APPLY_MANUAL_DISCOUNT` (label falls back to "Manual discount"), and coupon revalidate via `/api/pos/coupons/validate` → `SET_COUPON`. Drain strips deep-link params from URL via `history.replaceState` after success so re-renders don't re-drain over operator edits. Re-fetches on every mount. **Tests** (+45 across 3 new files): `ticket-reducer-edit-mode.test.ts` (+13 — default state, ENTER/EXIT_EDIT_MODE, CLEAR_TICKET clears edit-mode, RESTORE_TICKET strips edit-mode, modifier propagation parity); `use-edit-mode-drain.test.ts` (+22 — `isUuid` + `isSafeInternalPath` validators with all 5 attack classes, `buildTicketStateFromLoad` pure helper, `runEditModeDrain` endpoint selection + dispatch sequence + coupon revalidate non-fatal failure, error paths 403/404/network/malformed); `api/pos/appointments/[id]/load/route.test.ts` (+10 — 401, 403, 404, 400 completed/cancelled, happy-path shape, modifier-column nulls, mobile_fee synthesis, deposit + deposit_date lookup, deposit=0 when payment_type=pay_on_site). Two collateral typecheck-edits: `ticket-actions.test.tsx` (4 default fields in mock + setTicket); `pos/jobs/page.tsx:handleCheckout` (4 placeholder fields in `newTicket` literal — RESTORE_TICKET strips them in the reducer regardless, the literal is pure TS-shape requirement). **No UI changes** — Sale-tab still shows "Checkout"; Layer 8c branches off `ticket.editMode`. Jobs-card / Admin-dialog affordances are Layer 8d. Verification: typecheck 0 new errors on touched files (2 pre-existing unrelated test errors persist); ESLint 0 errors / 98 warnings unchanged baseline; vitest 1440/1440 passing (was 1395 prior; +45 net new); production build compiled successfully. **Manual UAT NOT performed** — requires running app + real appointment/job records; user verifies post-deploy on 7 paths (backwards compat, appt drain, job drain, open-redirect defense × 3 attacks, 404 handling, 403 handling, state-leak guard). |
| 2026-05-17 | 17 | Item 15f Layer 4 — ESLint enforcement of Rule 22 + 4 missed bespoke-pricer migrations | Layer 4 done; Item 15f complete except Phase 1 | _(this commit)_ | New ESLint rule `services/no-bespoke-pricing` in `eslint-rules/services-no-bespoke-pricing.js`, registered in `eslint.config.mjs` at severity `'error'`. Three signals: (1) function-name pattern flags `resolveServicePrice` / `resolvePrice` / `getServicePrice` / `computeServicePrice` outside `src/lib/services/`; (2) `switch (X.pricing_model)` doing money math without calling the canonical engine — refined in-session to exclude display dispatches returning string/JSX, classifier switches setting non-price flags, and label generators wrapping money reads in `formatCurrency`/`formatMoney`/`formatMoneyForInput`; (3) direct `vehicle_size_*_price` reads in arithmetic / return contexts (column-presence `!= null` checks remain allowed). Engine files (`src/lib/services/**`) + test files are exempt. 19 RuleTester cases in `eslint-rules/__tests__/services-no-bespoke-pricing.test.js`. **Discovery surprise**: initial rule enforcement surfaced 6 violations — 3 were rule false-positives (validate-coupon classifier, OG image label generator, `<ServicePricingDisplay>` JSX dispatch), correctly excluded by Signal 2 refinement; 4 were real bespoke pricers Layers 3c–3e missed. **4 migrations** (all thin wrappers around `resolveServicePriceWithSale` per Layer 3d's pattern, return shapes preserved byte-identically): (1) `src/app/api/book/_pricing.ts` (extracted from `route.ts` because Next.js route files only permit GET/POST/etc. exports — underscore prefix excludes from route resolution) — `computeExpectedPrice` server-side booking validator; synthesizes `ServicePricing` for `flat`; preserves null-skips-validation contract for `per_unit`/`custom`. (2) `src/components/booking/booking-wizard.tsx:reconstructConfig` — deep-link / back-navigation config reconstruction (drift: exotic/classic missing, no sale_price); now uses engine + synthesized rows for `flat`/`per_unit`. (3) `src/components/public/service-card.tsx:getStartingPrice` — public catalog "From $X" display (drift: only iterated sedan/truck/van columns); now iterates `CUSTOMER_SELF_SERVICE_SIZE_CLASSES` through engine for the customer-facing floor. (4) `src/app/api/voice-agent/services/route.ts` — voice-agent catalog pricing array builder; SELECT widened to fetch full `ServicePricing` row shape; each case body inlines `resolveServicePriceWithSale` directly (rule's static-AST check requires the engine call lexically inside the switch body — calling a top-level helper wouldn't satisfy it). **Architectural decision for Item 15a's `<EditServicesModal>`**: rather than wrap its bespoke `resolveServicePrice` (a deletion-scheduled surface), the Admin "Edit Services" trigger in `appointment-detail-dialog.tsx` is disabled (operators use POS Jobs card); the modal carries the SINGLE sanctioned `// eslint-disable-next-line services/no-bespoke-pricing` comment in the codebase documenting the deletion-window. **Implementation note**: the rule's `containsEngineCall` check descends into nested arrow/function expressions so `.map((p) => resolveServicePriceWithSale(p, ...))` callbacks count as engine calls in the case body — without this, the voice-agent migration would require ugly for-loop rewrites. **Tests** (+33 net new): `eslint-rules/__tests__/services-no-bespoke-pricing.test.js` (19 cases — 10 valid: engine/test exemptions, engine-call exemption, display-dispatch / classifier / label-generator non-flags, column-presence check, object-literal-key writes; 9 invalid: function-name pattern, pricing_model switch w/o engine call, direct per-size column read in arithmetic/return); `src/app/api/book/__tests__/compute-expected-price.test.ts` (12 cases — flat ±sale, exotic Ferrari row-pattern $450 NOT sedan, classic Ceramic Shield $725, column-based exotic $500 / classic $600, per_unit / custom / unknown / no-tier-match null contract); `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` (2 cases — Edit button disabled + modal does not mount). Verification: typecheck clean on touched files (pre-existing errors in `quote-service.modifiers.test.ts` + `catalog-browser-custom-routing.test.tsx` unrelated); lint **0 errors** (98 warnings = unchanged baseline); 1366/1366 vitest pass (was 1333 prior; +33 net new); production build compiled successfully (787 static pages, clean `.next` rebuild). **CLAUDE.md Rule 22 updated** to reflect rule is now `'error'`-enforced. **Item 15f status after Layer 4**: only Phase 1 (8a-8f) remains; Phase 1 was already unblocked by Item 15g completing earlier today. |
| 2026-05-17 | 14 | Item 15f Layer 3e — Wire `<CustomPriceDialog>` into shared `<CatalogBrowser>` ecosystem + Item 15a's bespoke modal | Layer 3e done | _(this commit)_ | S1 customer-money-correctness fix. Pre-fix, tapping a `pricing_model === 'custom'` service (canonical fixture: Flood Damage / Mold Extraction — `custom_starting_price: $475`, no `service_pricing` rows) was broken on 3 of 4 native consumers: POS New Sale + POS New Quote opened `<ServiceDetailDialog>` with the "Add to Ticket" button disabled (`disabled={!isPerUnit && !selectedTier}` evaluates to true when tiers=[] AND flat_price=null); Item 15a's `<EditServicesModal>` silently added the row at $0 (worst pattern — no operator-visible signal, customer never charged the staff-assessed amount); Layer 3a-i's `<EditServicesDialog>` already worked via `useServicePicker` hook. **In-session architectural discovery + user-authorized scope expansion**: original brief assumed all 4 consumers shared a single routing component; discovery showed they do NOT (POS Sale/Quote share `<CatalogBrowser>` → `<ServiceDetailDialog>`; Layer 3a-i uses the hook; Item 15a is a bespoke checklist toggle). User authorized patching all 3 broken surfaces in one session since Item 15a's modal lives in production for ~6 more sessions before Phase 1 Layer 8e deletes it. **Implementation**: (1) `<CatalogBrowser>` gains `customPriceService` state + custom branch in 3 tap handlers (`handleTapService`, `handleTapServiceDirect`, `handleTapServiceDirectUnchecked`) + `handleCompatConfirm`'s 'detail' mode + `<CustomPriceDialog>` mount alongside `<ServicePricingPicker>`. Branch fires before per-unit/picker fallback routes, matching `routeServiceTap`'s `open-custom-price-dialog` semantics. New `handleCustomPriceSelect` calls `addServiceChecked` so prerequisite/duplicate checks work for custom services. (2) Item 15a's `<EditServicesModal>` gets the parallel patch — `handleToggle` routes custom services to `<CustomPriceDialog>` instead of silent $0 add; new `handleCustomPriceSelect` commits the row at the operator-entered amount with `tier_name: 'custom'`. `AdminCatalogService` widened with `description` + `custom_starting_price`. Modal builds a minimal CatalogService-shaped shim at the dialog boundary (cast, not full-clone — short-lived since the modal deletes in Phase 1 Layer 8e). (3) `/api/admin/services/active` SELECT widened to include `description` + `custom_starting_price`. **Architectural choice**: did NOT refactor `<CatalogBrowser>` tap handlers to delegate to `routeServiceTap` from the canonical engine — each handler has surface-specific guards (customer/vehicle presence, compat checks, prerequisite warnings, post-add toasts) not in the engine route. A clean engine-routing refactor would extract those as a higher-order wrapper; bigger scope than Layer 3e's goal. The added custom branch is byte-aligned with `routeServiceTap`'s `open-custom-price-dialog` action, so if `<CatalogBrowser>` ever migrates to engine routing (currently moot per Layer 3b's perma-deferral), the 3 branch sites are the obvious extraction points. **Tests** (+7 new): `catalog-browser-custom-routing.test.tsx` (3 cases — tap opens dialog; confirm emits synthesized pricing row via `onAddService` with `tier_name: 'custom'`/`tier_label: 'Custom Assessment'`/`price: 500`; cancel emits nothing); `edit-services-modal-custom.test.tsx` (4 cases — tap opens dialog instead of silent $0 add; confirm commits 1 service totaling $500; cancel commits nothing; non-custom flat service still uses silent toggle, no regression). Verification: typecheck clean on touched files (14 pre-existing errors in `quote-service.modifiers.test.ts` unrelated to this layer); lint 0 errors (98 warnings = unchanged baseline); 1259/1259 vitest pass (was 1226 prior; +7 new from Layer 3e + 26 net from earlier sessions); production build compiled successfully (787 static pages, clean `.next` rebuild). **Manual UAT NOT performed** — requires running against a real DB; user verifies post-session on 4 paths: POS Sale → Flood Damage → dialog; POS Quote → Flood Damage → dialog; Admin Appointments → Edit Services → Flood Damage → dialog → save → check `appointment_services` row; POS Jobs path already works via Layer 3a-i. |
| 2026-05-17 | 13 | Item 15g Layer 15g-ii — Lifecycle persistence schema + endpoint propagation | Layer 15g-ii done | _(this commit)_ | Schema migration `supabase/migrations/20260517021350_lifecycle_persistence.sql` adds 10 new columns (`appointments.loyalty_points_redeemed`/`loyalty_discount`/`manual_discount_value`/`manual_discount_label`; `quotes.coupon_discount`/`loyalty_points_to_redeem`/`loyalty_discount`/`manual_discount_type`/`manual_discount_value`/`manual_discount_label`) and 3 CHECK constraints (`appointments_manual_discount_coherent`, `quotes_manual_discount_coherent`, `quotes_loyalty_coherent`). All additive + non-breaking; existing rows get safe defaults. Per-column COMMENTs document the audit §9.5 invariant that loyalty pre-transaction columns are "planned redemption" snapshots only — loyalty_ledger rows STAY transaction-bound. **6 endpoints updated:** (1) `quote-service.ts` createQuote+updateQuote accept new fields via `normalizeManualDiscount` + `normalizeLoyaltyRedemption` helpers (collapse partial state to fully-null; percent>100 throws); (2) `quote-ticket-panel.tsx` includes modifiers in `computeQuoteHash` (so auto-save fires on modifier edits — pre-fix comment claiming these aren't persisted replaced) and threads new `buildModifiersPayload(q)` into 5 PATCH/POST sites; (3) `convert-service.ts` extends 15g-i's coupon work with `resolveManualDiscountAmount()` helper (type=percent → dollar against subtotal); appointment `discount_amount = coupon+loyalty+manual` for analytics-reader compat; `total_amount` clamped ≥ 0; (4) `api/pos/jobs/route.ts` walk-in accepts 7 new modifier fields, persists on synthetic appointment; (5) `api/book/route.ts` replaces `internal_notes` plaintext loyalty stop-gap with dedicated columns (historical plaintext rows untouched, back-fill deferred to 15g-iv); (6) `checkout-items/route.ts` extends appointment SELECT with 4 new columns + adds 5 new response fields (`coupon_discount`/`loyalty_points_redeemed`/`loyalty_discount`/`manual_discount_value`/`manual_discount_label`), all `Number()`-coerced. Type-defs updated (`Appointment` +4 fields, `Quote` +6 fields). Validation schemas extended with shared `quoteModifierFields` block on create+update (all optional+nullable; coherence enforced server+DB). Tests: +8 in `convert-service.test.ts`, +5 in `checkout-items/__tests__/coupon-fallback.test.ts`, new `quote-service.modifiers.test.ts` (13 cases). 1252/1252 vitest pass (was 1192). Typecheck clean, lint 0 errors / 0 new warnings. DB_SCHEMA.md regenerated. **Production build NOT attempted** — pre-existing syntax error in `src/components/appointments/edit-services-modal.tsx` (line 252 `<>` fragment, parallel-session in-progress work) blocks build; my files committed selectively. **Manual UAT deferred** per session brief — full Quote→Appointment→Job→Checkout round-trip needs real customer data. Layer 15g-iii consumes the new response fields (`SET_LOYALTY_REDEEM` + `APPLY_MANUAL_DISCOUNT` dispatch in `pos/jobs/page.tsx` `handleCheckout`). |
| 2026-05-16 | 10 | Item 15f Layer 3d — `service-resolver.ts` rewrite (voice agent + SMS auto-responder) | Layer 3d done | _(this commit)_ | Removes the 4th and final bespoke service-pricing implementation discovered during Layer 1 verification. `resolvePrice` rewritten as a thin wrapper around `resolveServicePriceWithSale` from `picker-engine.ts` per CLAUDE.md Rule 22; dispatches by `pricing_model` and synthesizes a `ServicePricing` row for `flat` / `per_unit` / `custom` (which have no row in `service_pricing`). Fixes 4 silent mis-pricing bugs that surface directly in customer-facing voice quotes + SMS auto-responder: (1) `exotic` + `classic` size_class no longer fall through to sedan column — Ferrari 1-Year Ceramic Shield now correctly quotes $725 not $425; (2) `per_unit` services like Scratch Repair now return `per_unit_price` ($150) not $0; (3) `specialty` services now dispatch via the new optional `specialtyTier` argument and find the matching `tier_name` row instead of always returning `tiers[0]`; (4) `custom` services now return `custom_starting_price` ($475 for Flood Damage / Mold Extraction) not $0. `resolveServiceByName` SELECT widened to fetch `per_unit_price`, `custom_starting_price`, `vehicle_size_exotic_price`, `vehicle_size_classic_price`, plus full `ServicePricing` shape (id, service_id, tier_label, display_order, max_qty, qty_label, created_at). `ResolvedService` interface gained `per_unit_price` and `custom_starting_price`; `service_pricing[]` retyped from partial subset to full `ServicePricing[]`. `ResolvedPrice` return shape preserved byte-identically so the 3 importers (`send-quote-sms/route.ts`, `webhooks/twilio/inbound/route.ts`, `voice-post-call.ts`) need no code changes. New `src/lib/services/__tests__/service-resolver.test.ts` — 27 cases pinning all 4 bug fixes (flat 3, vehicle_size/scope 7, per_unit 3, specialty 7, custom 4, size-class edge cases 2). **End-to-end specialty fix at the call sites is a follow-up** (they currently SELECT only `vehicles.size_class`; need to also SELECT `specialty_tier` and pass via `{ specialtyTier }`). Verification: typecheck clean on the touched files; lint 0 errors / 0 new warnings on touched files; 1192/1192 vitest pass (was 1162 at Layer 3a partial; +27 new from this test file). **Production build NOT attempted** — working tree carries pre-existing uncommitted modifications in `step-service-select.tsx`, `checkout-items/route.ts`, `convert-service.ts` from a parallel session that have their own typecheck errors unrelated to Layer 3d. **Manual UAT NOT performed** — voice / SMS flows require real call / inbound message; user verifies post-session (Ferrari + Ceramic Shield SMS = $725; per-unit Scratch Repair = $150/unit; Mold Extraction = $475 starting price). |
| 2026-05-16 | 9 | Item 15f Layer 3a (partial) — Migrate POS Jobs card to canonical hook | Layer 3a partial (Jobs card only) | _(this commit)_ | **Scope narrowed mid-session per user direction (Option A from in-session blocker discussion).** Original brief targeted POS Jobs card + Admin Appointment dialog. Discovery surfaced that `<CatalogBrowser>` (wrapped by `useServicePicker`) hard-depends on POS-only contexts: `useTicket()` THROWS without `<TicketProvider>` (`ticket-context.tsx:222`); `usePosPermission()` defaults to `granted: false` without `<PosPermissionProvider>`. POS Jobs card runs inside `<PosShell>` so the hook drops in cleanly; Admin Appointment dialog lives outside that tree and would crash. Stopped per session-brief risk-callout protocol ("STOP and ask") and surfaced 4 paths. User chose Option A: ship Jobs card today, defer Admin migration to a follow-up that decouples `<CatalogBrowser>` from POS contexts. New shared file `src/lib/services/edit-services-dialog.tsx` — `<EditServicesDialog>` 2-pane wrapper around the hook (left: `<CatalogPane>`, right: caller-rendered selected list with per-row remove + running total). UI-only, fully controlled — caller owns selection state + persistence call. POS Jobs card migration in `job-detail.tsx`: deleted bespoke `getServicePrice()` (the silent tier-pricing revenue leak on non-sedan vehicles called out in lifecycle audit §10 #11), the bespoke modal, and the bespoke catalog-fetch state (`allServices`, `loadingServices`, `serviceSearch`, `handleToggleEditService`). Dialog mounts on existing `showEditServices` state; selection seeds from `job.services` (filtering out `is_mobile_fee` rows owned by the mobile picker); `onServiceAdded` / `onServiceRemoved` mutate local state; Save calls existing `handlePatchJob({services})` — payload shape (`JobServiceSnapshot[]`) unchanged. All 6 `pricing_model` values now resolve through the canonical engine on the Jobs card. Removed unused `<Search>` icon import. New test file `src/lib/services/__tests__/edit-services-dialog.test.tsx` — 13 cases with `useServicePicker` vi-mocked (focus on wrapper wiring without booting POS contexts). No existing Jobs-card tests covered the deleted modal directly, so no rewrites/deletions needed. Item 15a's `<EditServicesModal>` keeps shipping unchanged — including its broken local `resolveServicePrice`. **Cascade endpoint, `src/lib/appointments/edit-services.ts` helpers, and Admin dialog integration untouched.** Verification: typecheck clean, lint 0 errors (98 warnings = unchanged baseline), 1162/1162 vitest pass (was 1149 at Layer 2; +13 new), production build compiled successfully. **Manual UAT NOT performed in this session** — POS Jobs card requires running the app against a real DB; user verifies post-session per `npm run dev`. |

---

## Decisions superseded

If a decision in this document is later overridden, record the change here so
future-you can trace the history.

| Date | Item | Original decision | Superseded by | Reason |
|---|---|---|---|---|
| 2026-05-15 | 15 | Full Jobs+Appointments merge (single "Tickets" view replacing both tabs) — original intent recorded in Item 12 audit prerequisite framing. | Wave 1.5 (Items 15a–d): 4 minimal interventions closing audit §10 friction gaps. | Lifecycle audit (`docs/dev/LIFECYCLE_AUDIT_2026-05-15.md` §11) found the DB already supports one-ticket = one-appointment + one-job; the split is in the UI, not the schema. Targeted gap-fills cost substantially less than a full merge and Item 15d serves as a low-risk prototype if a full merge is ever reconsidered. |

---

## Closed items (no longer active)

| # | Item | Date closed | Reason |
|---|---|---|---|
| 5 | Apple Pay / Google Pay on Stripe Reader | 2026-05-15 | Already works — Stripe support confirmed NFC enabled by default on WisePOS E (model WSC51 BBPOS WisePOS E). Customer education only. |

---

## Total estimate summary

| Wave | Items | Sessions | Calendar (full-time) | Calendar (evenings) |
|---|---|---|---|---|
| 1 | 3 (Items 1, 6, 12) | ~3 | 1-2 days | 3-5 days |
| 1.5 | 4 (Items 15a, 15b, 15c, 15d) | ~4-5 | 1-2 days | 4-7 days |
| 2 | 2 (Items 3, 4, 2) | ~5-6 | 2-3 days | 1-2 weeks |
| 3 | 2 (Items 8, 7) | ~2-3 | 1-2 days | 3-5 days |
| 4 | 3 (Items 9, 10, 11) | ~3 | 1-2 days | 3-5 days |
| 5 | 2 (Items 14, 13) | ~13-20 | 3-4 weeks | 3-4 months |
| **Total** | **16 active** | **~30-39** | **~6-7 weeks** | **~5-6 months** |

---

## How sessions interact with this document

**Before each session:**
1. Read the relevant item section above.
2. Confirm scope and acceptance criteria still match what you want.
3. Note any new decisions or clarifications.

**During each session:**
4. CC works against the acceptance criteria.
5. Any scope change is flagged immediately — pause, update this doc, resume.

**After each session:**
6. Update the item's **Status**.
7. Append to the **Notes / decisions log** for that item.
8. Add a row to the **Session-by-session ledger**.
9. If a decision was overridden, log it in **Decisions superseded**.
10. Commit this document alongside the code changes (separate commit if
    convenient).

This makes the roadmap self-documenting and the source of truth for what's
been done, what's left, and why decisions were made.

---

**End of document.**
