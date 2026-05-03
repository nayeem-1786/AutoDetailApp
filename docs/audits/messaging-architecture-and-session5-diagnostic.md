# Messaging Architecture Audit + Session 5 Lifecycle Diagnostic

**Date:** 2026-04-30
**Mode:** Read-only investigation (NO code changes shipped, no schema/data mutations).
**Scope:** Two-layer report — Layer 1 is the urgent diagnostic for Session 5; Layer 2 is the broader architectural audit of the messaging/marketing systems.

> A temporary diagnostic wrapper + console writes were applied to `src/app/api/cron/lifecycle-engine/route.ts` during this investigation, observed once, and **fully reverted** (`git checkout` of the file). No persisted code changes exist in the working tree from this session.

---

## Layer 1 — Session 5 Diagnostic

### TL;DR

**Root cause:** the synthetic walk-in IS evaluated by the new Session 5 logic. The job correctly matches the simplified gate. The `lifecycle_executions` row is being suppressed by the **30-day per-customer/per-rule dedup set** because the same `(rule 00b438f3, customer 9634d6c4)` tuple already produced an execution yesterday (2026-04-29 22:50 UTC).

This is an **expected feature of the engine**, not a Session 5 bug. There is, however, a **secondary finding** (dev-server compilation drift) worth surfacing as well, plus a few **observations** that aren't bugs but are worth noting before subsequent test runs.

### Evidence

#### 1. Session 5 commit IS the running code

- Commit `ee37d2523d5b85e3056c38375c4276c5dbb650f1` — confirmed via `git log`.
- The dev server (`next-server v15.3.3`, PID 33638, cwd = repo root) is running in dev mode, not a `next start` build. Hot module reload serves from source — there is no production build to verify.
- Compiled HMR cache `/Users/nayeem/.../​.next/server/app/api/cron/lifecycle-engine/route.js` exists, last rebuilt today at 17:18:13.
- `grep actual_pickup_at .next/server/.../lifecycle-engine/route.js` → **0 matches**. Session 5 dropped that filter and the compiled output reflects it.
- `grep -c scheduleFromCompletedJobs|scheduleFromWorkCompleted|after_quote_accepted|after_appointment_booked|after_appointment_cancelled|work_completed_at` → **1+ each** in the compiled file. The new branches and new SQL are present.

#### 2. The job was correctly identified as a candidate

A temporary diagnostic wrapper instrumented `scheduleFromCompletedJobs` and `scheduleExecutions`. One real cron invocation produced (verbatim from `/tmp/lc_diag.log`, since cleared):

```
scheduleFromCompletedJobs: rules=1 lookbackWindow=2026-04-30T00:22:24.720Z jobs.found=1 error=null
  ruleIds=[{"id":"00b438f3-…","target_service_id":null,"delay_min":3}]
  jobIds=[{"id":"eba2fe4a-…","customer_id":"9634d6c4-…","updated_at":"2026-04-30T22:55:48.918+00:00",
           "sms_consent":true,"email_consent":false,"phone":true,"email":false}]
```

So Phase 1A's SQL — `status='closed' AND updated_at >= now-24h AND customer_id IS NOT NULL` — surfaces this exact job. Routing from `service_completed` → `scheduleFromCompletedJobs` is also confirmed working (line 115–117 of route.ts).

#### 3. Dedup is what's blocking insertion

```
scheduleExecutions: triggerEvent=job_closed events=1 sourceDedup.size=0 customerDedup.size=1
  sourceDedup=[]
  customerDedup=["00b438f3-…:9634d6c4-…"]

  event eba2fe4a-… cust=9634d6c4-… hasPhone=true hasEmail=null serviceIds=[]
    rule 00b438f3-… sourceBlocked=false customerBlocked=true serviceMisMatch=null
```

Decision:
- `sourceBlocked=false` — there is no prior execution for this exact `(rule, job_id=eba2fe4a)`, so the job-id-level dedup is not what's blocking.
- `customerBlocked=true` — the **30-day per-customer-per-rule** dedup set already contains `00b438f3:9634d6c4` from yesterday's test execution.
- `serviceMisMatch=null` — `trigger_service_id` is null, no service filter.
- `hasPhone=true && !hasEmail` — channel eligibility passes.

The `customerDedupSet` is built from the SQL `SELECT lifecycle_rule_id, customer_id FROM lifecycle_executions WHERE created_at >= now()-30d`. Yesterday's execution row is within that window, so the new candidate is dropped at line 633 of route.ts.

This matches the user's observed timeline ("Most recent review-related execution is from 2026-04-29 22:50 (yesterday)").

#### 4. The customer dedup is intentional, not buggy

It exists to prevent spamming the same customer with the same rule's SMS more than once a month. The synthetic-walk-in test re-uses the same customer across runs, so each repeat is caught.

**Implication for testing**: to retest a `service_completed` rule end-to-end against the same job/customer, the operator must either (a) use a fresh customer record, (b) wait 30 days, or (c) hard-delete the prior `lifecycle_executions` row for that `(rule, customer)`. Any of these reset the gate.

### Secondary Finding — dev-server compilation drift

When the curl probe was first run against `/api/cron/lifecycle-engine`, the route returned **HTTP 500** with the legacy Pages-Router error fallback HTML (the response body included `ENOENT: open '.next/server/pages/_document.js'`). The auth check (the first 3 lines of `GET`) returned 401 cleanly with no key, proving the route handler itself loads — so the 500 was thrown _after_ auth, in some downstream module.

After a single trivial source edit (a try/catch wrapper around the body), the route immediately started returning HTTP 200 again. No source-level fix was actually applied — the wrapper itself was reverted. The behavior cleared the moment the file's modtime advanced and Next.js reran HMR for the route.

Interpretation: dev-server caches got into a stale state where `/api/cron/lifecycle-engine` was throwing at runtime before producing a response. The internal cron scheduler in `src/lib/cron/scheduler.ts` swallows non-OK responses (`if (!response.ok) { console.error(...); return; }`, lines 43–46) and **always logs `[CRON] Completed lifecycle-engine in Xms`** in the wrapping `runJob` whether or not the HTTP call succeeded — so the user's observation of "`Completed lifecycle-engine in Xms` in pm2 logs" is **not evidence the cron actually succeeded**. The companion `[CRON] lifecycle-engine returned 500` line would have been printed alongside it; check the dev terminal scrollback.

This is **not a Session 5 bug per se** — Session 5 didn't change `scheduler.ts`, `instrumentation.ts`, or any imports of the route. It's an HMR pathology that probably reproduces on `cmd+s` of any sufficiently large dependency in the route's import tree. But it does mean: **assume the cron has been silently 500-ing on its scheduled tick at least some of the time in this dev session**.

### Observations (not bugs, but flag for next session)

1. **`jobs.services` was empty `[]` on the synthetic walk-in.** The `serviceIds` extraction in `scheduleFromCompletedJobs` (line 244–248) treats `jobs.services` as a JSONB array of `{service_id, …}` objects. For this synthetic job, that array was empty. The test rule has `trigger_service_id=null`, so the empty array doesn't matter — but **any future rule with a service-specific trigger will silently skip walk-ins whose `jobs.services` JSONB does not contain populated `service_id` keys.** Worth verifying that the POS walk-in flow is writing service_ids into `jobs.services`, or relying on the appointment_services join path instead.

2. **`email_consent` returned `null`, not `false`.** The boolean expression `event.customer.email_consent` evaluates `null` as falsy, so the channel gate works. But the column should arguably default to `false` on insert. Surfaced for hygiene only.

3. **Migration `20260430000001_rfb2_drop_birthday_and_expand_lifecycle.sql` adds `lifecycle_executions.quote_id`.** The runtime evidence above proves the SELECT for that column works, which means the migration *was applied* to the live DB.

### What does NOT need rolling back

After this investigation, **nothing in Session 5 needs to be reverted**:
- The simplified gate (`status='closed'` only, no `actual_pickup_at`) functions as intended.
- The new trigger conditions (`after_work_completed`, `after_appointment_booked`, `after_appointment_cancelled`, `after_quote_accepted`) are correctly routed and structurally consistent with the existing dedup model.
- The new `quote_id` column + composite unique index correctly extends the source-id dedup space without colliding with prior rows.
- The pickup-workflow removal is consistent across `route.ts`, the POS UI (`job-detail.tsx`), and the deleted endpoint.

The only artifact worth a follow-up is the **dev-server stickiness** issue, which is an environment problem, not a Session 5 problem.

### Recommended next test for the operator

To verify the new `service_completed` simplified gate end-to-end, choose one of:

1. **Simplest** — clear the prior `lifecycle_executions` row for `(rule=00b438f3, customer=9634d6c4)` and re-run the closed-job flow. Diagnostic above proves this would yield a fresh execution with `scheduled_for = job.updated_at + 3 min`.
2. **Cleanest for repeat testing** — adopt a "test fixture customer" pattern: for each end-to-end test, create a fresh customer record, exercise the flow, then delete or merge.

---

## Layer 2 — Architectural Audit of Messaging Systems

### Inventory: there are FOUR systems, not three

The user's prompt called out three systems. The codebase actually has **four** orthogonal messaging-control surfaces. The fourth (Drip) is reachable only as a tab inside `/admin/marketing/campaigns` (`CampaignTabs` in `_components/campaign-tabs.tsx`) so it's easy to miss.

| # | System | DB table(s) | Admin UI | Engine / runtime |
|---|---|---|---|---|
| 1 | **SMS Templates** | `sms_templates` | `/admin/settings/messaging/sms-templates` | `renderSmsTemplate()` in `src/lib/sms/render-sms-template.ts`, called from 22 transactional code paths |
| 2 | **Marketing → Automations** (Lifecycle Rules) | `lifecycle_rules`, `lifecycle_executions` | `/admin/marketing/automations` | `/api/cron/lifecycle-engine` Phase 1 + Phase 2 |
| 3 | **Marketing → Campaigns** (one-time) | `campaigns`, `campaign_recipients` | `/admin/marketing/campaigns` | `/api/marketing/campaigns/[id]/send` (manual) and `/api/marketing/campaigns/process-scheduled` (scheduled) |
| 4 | **Marketing → Campaigns → Drip** | `drip_sequences`, `drip_steps`, `drip_enrollments` | `/admin/marketing/campaigns/drip` (tab) | `/api/cron/lifecycle-engine` Phases 0/0.5/3 (delegates to `src/lib/email/drip-engine.ts`) |

### A. Purpose of each system

#### 1. SMS Templates (sms_templates)

- **Intent:** body templating + chip contracts for **transactional** SMS messages — confirmations, receipts, reminders, staff notifications, voice-agent post-call SMS, addon authorizations, etc.
- **Trigger:** none. The slug is hardcoded into the calling code path; the DB row provides the body and the contract.
- **Calling surface:** 22 distinct route handlers. Confirmed slugs being rendered include `addon_approved`, `addon_authorization*`, `appointment_confirmed*`, `booking_confirmed`, `booking_reminder`, `booking_staff_notify*`, `detailer_job_assigned`, `job_complete`, `loyalty_milestone`, `payment_receipt`, `quote_accepted_*`, `quote_reminder`, `quote_sms_*`, `quote_viewed_followup`, `receipt_sms`, `staff_notification*`. Per the source-of-truth file `sms-contracts.source.ts`, **all 27 slugs are now chip-driven** (Path B Phase 2 closed by Session 3D).
- **Operator affordance:** edit body, toggle active, set recipient phones (for staff/detailer slugs), pick a "test phone" number. No segment, no targeting, no scheduling.
- **Editable surface:** body only — the `category` and `recipient_type` are not user-editable (they are seeded in migrations).

#### 2. Marketing → Automations (lifecycle_rules)

- **Intent:** **single-shot, event-driven** customer messages that fire at a delay after a discrete business event. Reviews-after-service, "miss you" follow-ups after a quote is accepted, post-cancellation reschedule prompt.
- **Triggers (post-Session 5):** `service_completed`, `after_work_completed`, `after_transaction`, `after_appointment_booked`, `after_appointment_cancelled`, `after_quote_accepted`.
- **Targeting affordance:** `trigger_service_id` (optional — restrict to a specific service). No segment filters, no zip filter, no spend filter, no behavioral filter.
- **Body/template:** free-text with `{variable}` chips drawn from `VARIABLE_GROUPS` in `src/lib/utils/template.ts` (a separate, parallel chip palette from the `SMS_PALETTE` used in (1)).
- **Coupon attach:** rule can clone a template coupon into a unique single-use coupon per execution.
- **Dedup model:** per-(rule, source-id) AND per-(rule, customer, 30 days).

#### 3. Marketing → Campaigns (campaigns)

- **Intent:** **one-time or scheduled blast** to a customer segment. "Send to everyone matching X."
- **Triggers:** none — this is purely operator-initiated. Either send-now or schedule-at-datetime.
- **Targeting affordance (audience filters):** see `src/lib/utils/audience.ts` — `customer_type`, `last_service` (single service id), `days_since_visit_min/max`, `vehicle_type`, `min_spend`, `tags`, `has_email`, `has_phone`. **No zip-code / postal / geographic filter.** **No "first-time customer" filter** other than via `tags`.
- **Body/template:** SMS free-text + email subject/body OR email block-editor templates. Variable chips from a slightly different palette (`CAMPAIGN_GROUPS`) — overlaps with (2) but is not identical.
- **Operator affordance:** A/B testing with split %, auto-winner selection, scheduled-at, audience preview count, recipients table.

#### 4. Marketing → Campaigns → Drip (drip_sequences/_steps/_enrollments)

- **Intent:** **multi-step nurture sequence** spread over time, with per-customer enrollment lifecycle, stop conditions, and optional handoff to a "nurture" sequence.
- **Triggers:** `no_visit_days`, `after_service`, `new_customer`, `manual_enroll`, `tag_added`. (Note: `no_visit_days` and `new_customer` are time-windowed customer-segment triggers, not single-event triggers.)
- **Stop conditions:** purchase, booking, reply since enrollment.
- **Targeting:** `audience_filters` (same shape as Campaigns); also a per-step contact-method requirement.
- **Body/template:** per step, channel selection per step, body free-text per step.
- **Engine:** runs in `src/lib/email/drip-engine.ts` (`runAutoEnrollments`, `checkAllStopConditions`, `processEnrollments`), invoked from lifecycle-engine cron Phases 0/0.5/3.

#### "When should an operator use which?" — currently undocumented

There is **no developer-facing or operator-facing documentation** that disambiguates these four systems. The closest thing is the `CategoryTabs` UI grouping ("One-Time" vs "Drip") inside `/admin/marketing/campaigns` and the implicit naming in admin sidebars. Operators have no rubric to decide:

- "I want a review request" → Automations (good)
- "I want a one-time announcement" → Campaigns (good)
- "I want a 'we miss you' multi-message lapsed-customer flow" → Drip (good)
- "I want a single 'we miss you' SMS to lapsed customers" → ??? (no good answer; see Scenario 2 below)

### B. Customer-facing SMS slugs and where each is configured

The 27 chip-driven slugs in `sms_templates` represent the **transactional** ledger. Marketing SMS sends do not use `sms_templates`; they use the free-text body stored directly in `lifecycle_rules.sms_template`, `campaigns.sms_template`, or `drip_steps.sms_body`. Below is the exhaustive map of all customer-receivable SMS, classified by which system controls them:

| Slug / channel | Body source | Trigger code path | System owner |
|---|---|---|---|
| `addon_approved` | `sms_templates` | `/api/pos/jobs/[id]/addons/[addonId]` (POS approves addon) | (1) |
| `addon_authorization` | `sms_templates` | `/api/pos/jobs/[id]/addons/route.ts` (POS adds addon) | (1) |
| `addon_authorization_resend` | `sms_templates` | `/api/pos/jobs/[id]/addons/[addonId]/resend` | (1) |
| `addon_authorization_expired` | `sms_templates` | (cron-driven cleanup) | (1) |
| `addon_declined` | `sms_templates` | `/api/pos/jobs/[id]/addons/[addonId]` (decline action) | (1) |
| `appointment_cancelled` | `sms_templates` | `/api/pos/jobs/[id]/cancel` | (1) |
| `appointment_confirmed` | `sms_templates` | `/api/appointments/[id]/notify`, `/api/pos/appointments/[id]/notify`, `/api/voice-agent/appointments` | (1) |
| `appointment_confirmed_postcall` | `sms_templates` | `/api/voice-agent/appointments` (postcall path) | (1) |
| `booking_confirmed` | `sms_templates` | `/api/book/route.ts` (online booking flow) | (1) |
| `booking_reminder` | `sms_templates` | `/api/cron/booking-reminders` | (1) |
| `booking_staff_notify` | `sms_templates` (staff-recipient) | `/api/book` and `/api/voice-agent/notify-staff` | (1) |
| `booking_staff_notify_specialty` | `sms_templates` (staff-recipient) | `/api/public/specialty-callback` | (1) |
| `detailer_job_assigned` | `sms_templates` (detailer-recipient) | `/api/pos/jobs/[id]/...` (detailer assignment) | (1) |
| `job_complete` | `sms_templates` | `/api/pos/jobs/[id]/complete` | (1) |
| `loyalty_milestone` | `sms_templates` | `/api/pos/transactions` (after milestone hit) | (1) |
| `payment_receipt` | `sms_templates` | `/api/pos/transactions` (auto-receipt) | (1) |
| `quote_accepted_multi` / `_single` | `sms_templates` | `/api/quotes/[id]/accept` | (1) |
| `quote_accepted_staff_notify` | `sms_templates` (staff) | `/api/quotes/[id]/accept` | (1) |
| `quote_reminder` | `sms_templates` | `/api/cron/quote-reminders` | (1) |
| `quote_sms_admin` / `_midcall` / `_postcall` | `sms_templates` | `/api/voice-agent/send-quote-sms` and admin send path | (1) |
| `quote_viewed_followup` | `sms_templates` | (cron-driven) | (1) |
| `receipt_sms` | `sms_templates` | `/api/pos/receipts/sms` | (1) |
| `staff_notification` (generic) | `sms_templates` (staff) | various staff paths | (1) |
| `staff_notification_inbound_specialty` | `sms_templates` (staff) | `/api/webhooks/twilio/inbound` | (1) |
| Lifecycle rule "Review request — after service" | `lifecycle_rules.sms_template` (free text) | `/api/cron/lifecycle-engine` Phase 1A → Phase 2 | (2) |
| Any "After Quote Accepted / Cancelled / Booked / Work Completed" rule | `lifecycle_rules.sms_template` (free text) | `/api/cron/lifecycle-engine` Phase 1B–1F | (2) |
| One-time blast "We miss you / spring promo / store reopening" | `campaigns.sms_template` (free text) | `/api/marketing/campaigns/[id]/send` or `/api/marketing/campaigns/process-scheduled` | (3) |
| Drip step body | `drip_steps.sms_body` (free text) | `/api/cron/lifecycle-engine` Phase 3 (via drip-engine) | (4) |

#### Misclassification check

- **`booking_reminder` and `quote_reminder` both live in System (1) but are scheduled-by-cron, not strictly synchronous-transactional.** They straddle (1) and (2). Reasoning: their bodies are stable, contractual chip-driven messages tied to an appointment/quote object — not segment- or campaign-driven. Living in `sms_templates` is correct for body editability; the cron just calls the same `renderSmsTemplate()` engine. No misclassification.
- **No transactional SMS lives in Marketing > Automations.** Good.
- **No campaign SMS lives in SMS Templates.** Good.
- **Path B (Sessions 2A–3D) eliminated all hardcoded slugs.** `INTENTIONALLY_HARDCODED_SMS` is now an empty array (`hardcoded-messages.ts`). System (1) is fully editable.

### C. Overlap and gaps

#### Overlap zones (operator could pick either system)

| Scenario | Could be in | Currently lives in | Comment |
|---|---|---|---|
| "Review request after service" | Automations OR a one-shot Campaign scheduled per closed job (impractical) OR a drip with one step | Automations | Automations is the natural fit — event-driven, single-shot. |
| "We miss you, you haven't been in for 60 days" — single SMS | Campaigns (segment filter `days_since_visit_min=60`) OR Drip (no_visit_days trigger with one step) | Either — currently Campaigns *and* Drip can both express it | **Genuine ambiguity.** Operator-facing labels don't tell you which to pick. |
| "Send a coupon to ceramic-coating customers" | Campaigns (filter `last_service=<id>`) OR Automations (`trigger_service_id=<id>`) — but only after a triggering event | Campaigns for one-time blast; Automations for "after every ceramic" | Different semantics (segment vs event), but operators may not realize this. |
| Multi-step nurture | Drip (only) | Drip | No overlap. |
| "First-time customer welcome 3 days after first visit" | Drip (`new_customer` trigger) OR Automations (no equivalent — see Gaps) | Drip | Drip is the only path that works today. |
| Tag-driven enrollment | Drip (`tag_added`) only | Drip | No overlap. |

#### Gaps (operator wants but no system can do)

1. **Campaigns has no zip-code or geographic filter.** Scenario 4 below ("zip codes 90701–90717") cannot be expressed today. The customer record HAS `zip` (per migrations), but `audience.ts` doesn't filter on it. **Net new filter needed.**
2. **Automations has no segment-overlay.** "Send a review request after every service, BUT ONLY for customers tagged 'enthusiast'" — Automations has no audience-filter slot, only `trigger_service_id`.
3. **Drip's `no_visit_days` is a "lapsed" segment, not a "first-time" cohort.** The `new_customer` trigger gets close to "first visit" semantics but uses `customers.created_at`, which is record-creation time, not first-transaction time. For a customer originated via the POS who later becomes recurring, "3 days after their first visit" means `MIN(transaction_date) + 3d`, which neither Drip nor Automations expresses today.
4. **No cancel-and-resend / supersede semantics.** A pending `lifecycle_executions` row keeps its `scheduled_for` even if the customer comes back inside the delay window. There is no "cancel scheduled future send if event Z happens before" hook for Automations. (Drip has `stop_conditions` for this; Automations does not.)
5. **No cross-channel coordination.** If both an Automation and a Drip step both target the same customer at the same time, both fire. Per-customer rate-limiting is rule-internal (the 30-day dedup is per `(rule, customer)`, not global).
6. **No "all customers with consent" one-shot blast** without faking a segment filter. Operators have to leave all filters blank and rely on the implicit `applyConsent` to gate the audience. This works, but the UX doesn't explicitly surface it.

### D. Trigger taxonomy across systems

#### Marketing → Automations trigger conditions (post-Session 5)

| `trigger_condition` | Source row | Source field | When it fires |
|---|---|---|---|
| `service_completed` | `jobs` | status → `closed` (POS rang up) | Job closed in last 24h, customer present |
| `after_work_completed` | `jobs` | status → `completed` (detailer marked done) | Same job can match this AND `service_completed` at different times |
| `after_transaction` | `transactions` | status='completed' AND **NOT linked to any job** AND **NOT linked to an appointment** | Pure product POS sales |
| `after_appointment_booked` | `appointments` | created_at, status NOT IN (cancelled, no_show) | Newly created bookings |
| `after_appointment_cancelled` | `appointments` | updated_at + status='cancelled' | Cancellation event |
| `after_quote_accepted` | `quotes` | accepted_at, status='accepted', deleted_at IS NULL | Quote acceptance |

#### Campaigns audience filters

`src/lib/utils/audience.ts` exposes:
- `customer_type` ∈ {enthusiast, professional}
- `last_service` (one service_id)
- `days_since_visit_min`, `days_since_visit_max`
- `vehicle_type`
- `min_spend`
- `tags` (array contains-all)
- `has_email`, `has_phone`
- + implicit consent enforcement (`sms_consent`/`email_consent` based on channel)

#### SMS Templates → which slugs fire from where

See the table in Section B.

#### Cross-reference: event AND segment?

**Today, no.** An Automation rule cannot say "fire on `service_completed`, but only for customers with `min_spend > $500`." There is no `audience_filters` column on `lifecycle_rules`. The only segment-like restriction is `trigger_service_id`. This is **a real product gap** — the user's instinct that operators would want this is correct.

### E. Scenario coverage

| # | Scenario | System today | Works? | Gap |
|---|---|---|---|---|
| 1 | "Review request 30 min after every paid service" | Automations / `service_completed` / 30 min delay | **Yes**. This is the canonical use case Session 5 simplifies the gate for. | None. |
| 2 | "We miss you for >60d AND past tx >$125" — segment | Campaigns (`days_since_visit_min=60`, `min_spend=125`) | **Yes** as a one-time blast. **No** as a recurring weekly sweep. | If operator wants this to run automatically each week, they have to either re-create the campaign each week or build a Drip with `no_visit_days=60` + a single step + audience_filters min_spend=125. Drip handles it but the UI is multi-step-oriented. **Gap: lightweight "recurring single-shot" pattern.** |
| 3 | "First-time customer welcome 3 days after first visit" | Drip / `new_customer` / 3d step | **Partial.** `new_customer` fires off `customers.created_at`, not first-transaction date. Off-by-some-days for customers whose record predates their first paid visit. | **Gap: trigger is `created_at`, not first-paid-visit.** |
| 4 | "Discount to all customers in zip 90701–90717" | Campaigns | **No.** No zip filter in `audience.ts`. | **Gap: missing geographic filter.** Quick fix would be a new `zip` (single, prefix-match, or `IN` list) filter. |
| 5 | "Service-specific upsell 7 days after Express Wash" | Automations / `service_completed` / `trigger_service_id=<express-wash-id>` / 7d | **Yes**, IF `jobs.services` is populated with `service_id` keys. See Layer 1 Observation #1 — synthetic walk-ins were observed without populated service_ids. | Verify POS walk-in flow writes service IDs into `jobs.services`. |
| 6 | "One-time announcement to all consented customers" | Campaigns / no filters / `has_phone=true` | **Yes** — leaving filters empty selects all consented customers. | UX nit: not visually obvious that "no filters set" means "everybody." Minor. |
| 7 | "Cancel-and-resend if customer returns" | Drip (`stop_conditions.on_purchase=true`) | **Yes for Drip.** **No for Automations** — pending `lifecycle_executions` are not cancelled when a counter-event happens. | **Gap: Automations has no stop-conditions.** |

### F. Recommended architectural clarity

Below are **principles** (proposed, not implemented), and the most-impactful improvements that would make these systems coherent. Per the user's instructions, this is a finding/proposal; no implementation here.

#### Proposed product principles

1. **SMS Templates is the contract layer for transactional sends only.** It owns the body and the chip contract for messages tied to a specific event in a specific code path. Operators edit body, never trigger. If a slug is read from `sms_templates`, it's transactional by definition. (Today's reality matches this — keep the discipline.)

2. **Marketing → Automations is "one event, one message" per customer.** Event-triggered, single-shot, dedup'd. Free-text body (because variability is per-rule, not per-event). The natural surface for "after X happens, send Y after Z delay."

3. **Marketing → Campaigns is "send now / send later, to a segment".** Segment-driven, operator-initiated, no recurrence (one-time blasts only). A/B testing belongs here.

4. **Drip is "many messages, over time, per customer".** Long-running, multi-step, with stop-conditions and nurture handoff. Use Drip when more than one message is needed per enrollment, OR when stop-conditions are needed.

#### 5 most impactful architectural improvements (in rough priority order)

1. **Add `audience_filters` to `lifecycle_rules`.** Closes the "fire on event but only for segment" gap (Section C, gap #2). Reuse `applyFilters` from `src/lib/utils/audience.ts` so the filter dialect is identical across Automations / Campaigns / Drip. This is the largest architectural improvement for the smallest implementation cost — `audience.ts` already exposes the right shape.

2. **Add `stop_conditions` to `lifecycle_rules`** (matching the Drip shape: on_purchase / on_booking / on_reply since `triggered_at`). Cancels pending `lifecycle_executions` rows whose `status='pending'` and counter-event happened in the gap. Closes Section E scenario #7.

3. **Add a `zip` (or `zip_in[]`) filter in `audience.ts`.** Closes Section E scenario #4 and unblocks geographic targeting. No schema change — `customers.zip` already exists.

4. **Document the operator decision tree.** A short `docs/manual/MARKETING_DECISION_GUIDE.md` (1 page): event vs segment, single vs multi-step, transactional vs marketing. Eliminates the "I don't know which UI to use" ambiguity. Could be inline help in the admin nav too.

5. **Unify the variable/chip palette.** Today there are at least three palettes:
   - `SMS_PALETTE` (System 1 — sms_templates) in `src/lib/sms/palette.ts`
   - `VARIABLE_GROUPS` / `ALL_GROUPS` (System 2 — automations) in `src/lib/utils/template.ts`
   - `CAMPAIGN_GROUPS` (System 3 — campaigns) also in `src/lib/utils/template.ts`
   - Email block editor uses yet another set (`getVariablesForCategory('marketing')` in `src/lib/email/variables.ts`)

   These overlap heavily — `{first_name}`, `{vehicle_description}`, `{business_name}`, etc. — but with subtle differences in availability per surface. Drift risk is high. A unified palette with per-surface filtering would reduce the mental tax for operators **and** for engineers (today, "is this chip available in Campaigns?" requires reading the source).

#### Dead/redundant code candidates (for cleanup, NOT this session)

These were identified during the audit. None block functionality; flagging for a future cleanup session:

1. **`src/lib/sms/hardcoded-messages.ts` is now an empty array.** Path B Phase 2 closed. The interface and re-export are preserved as a documentary surface; that's reasonable. The file could be reduced to a one-line "intentionally empty" stub if the author wants.

2. **Automations form's `is_vehicle_aware` field** (`lifecycleRuleSchema.is_vehicle_aware`, default `false`). Searching the codebase, this column is set on the rule but never consumed in `lifecycle-engine/route.ts` or in `executePending`. Possibly dead.

3. **Automations form's `chain_order` field.** Same situation — settable, but the cron loop iterates rules in arbitrary order. No code currently respects `chain_order`. Either implement it or remove it.

4. **Drip's `nurture_sequence_id` / nurture handoff** in `drip-engine.ts` — implemented but no UI surface for picking the nurture sequence visible in the snippet I read. Worth verifying whether it's reachable from `drip-builder.tsx`.

5. **`process-scheduled`** for campaigns is an internal cron-style endpoint at `/api/marketing/campaigns/process-scheduled`. It's not registered in `src/lib/cron/scheduler.ts` (the 13 jobs list), so currently nothing invokes it on a schedule. Either it's invoked by an external scheduler that isn't visible here (e.g., legacy n8n leftover), or it's effectively dead code. **Schedule a verification check** before any cleanup — scheduled campaigns might silently never send.

---

## Closing notes

- **Layer 1**: the synthetic walk-in is being correctly evaluated. The 30-day per-customer dedup is what blocks the new execution. Reset the dedup row OR use a fresh customer to retest.
- **Layer 1 secondary**: `npm run dev` got into a stale-compile state that returned 500 silently from the lifecycle cron. The internal scheduler logs "Completed" regardless of HTTP status, so log lines are not proof of actual cron success. Restart the dev server when in doubt.
- **Layer 2**: there are four messaging systems, not three. The biggest product gaps are (a) Automations has no segment overlay, (b) Automations has no stop-conditions, (c) Campaigns has no zip filter, (d) the operator decision tree is undocumented, (e) the chip palettes have drifted.
- **No code changes** were committed in this investigation. The diagnostic edits to `src/app/api/cron/lifecycle-engine/route.ts` were fully reverted via `git checkout`.
