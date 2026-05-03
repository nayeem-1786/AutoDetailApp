# Messaging Architecture — Restructure Design (Phase 0)

**Author:** Claude Code (Session 6, Phase 0 — read-only investigation)
**Date:** 2026-05-01
**Status:** Proposal. NO code or schema changes shipped from this session.
**Predecessor doc:** `docs/audits/messaging-architecture-and-session5-diagnostic.md` (2026-04-30).

> Reading order
> - **Operators**: Section 6 (Principles) → Section 2 (Decision Tree) → Section 7 (Sequence) → Section 8 (Decisions Needed).
> - **Engineers**: Section 1 (Current State) → Section 3 (Consent) → Section 4 (Dead Code) → Section 5 (Observability) → Section 7 (Sequence) → Section 9 (Risks).
> - **Reviewing this doc**: Section 8 holds every question that needs the user's judgment before any 6.x session ships.

---

## Section 1 — Current State Map

There are **four** messaging-control surfaces, not three. The fourth (Drip) is buried as a tab inside `/admin/marketing/campaigns` and is easy to miss. Together they touch ~3,700 lines of TypeScript across the cron engine, two send routes, three chip palettes, and a shared audience builder.

### 1.1 SMS Templates  *(transactional contract layer)*

#### A. Architectural identity
- **DB tables**: `sms_templates` (single row per slug), with chip contracts in `required_variables` + `optional_variables` JSONB columns.
- **Admin UI**: `/admin/settings/messaging/sms-templates` (page) + `/admin/settings/messaging` (gateway). Edit body + chip selection only — `category` and `recipient_type` are seed-immutable.
- **Read/write code paths**: `src/lib/sms/render-sms-template.ts` (the `renderSmsTemplate<S extends SmsSlug>()` engine, generic over slug) is called from ~22 transactional handlers. The chip palette (`src/lib/sms/palette.ts`) and per-slug contracts (`src/lib/sms/generated-contracts.ts`) are auto-generated from `src/lib/sms/sms-contracts.source.ts` (codegen via `scripts/regen-sms-contracts.ts`).
- **Cron / background**: indirect — `/api/cron/booking-reminders`, `/api/cron/quote-reminders`, and addon-expiry crons render specific slugs via this engine. The slug is hardcoded in the cron's call site; only the body is operator-edited.

#### B. Operator-facing capabilities
- **Form fields per slug**: Active toggle, Body (textarea with chip picker), per-slug Recipient Phone(s) (for staff/detailer slugs), Test Phone (one-tap test send).
- **Chip palette**: `SMS_PALETTE` (~50 chips across categories Customer, Business, Appointment, Vehicle, Money, Links, Service, Loyalty, Operator, Platform).
- **Validation tiers** (Session 2A.5): chips outside the palette → 400 hard-reject (typos); chips in-palette but outside the slug's contract → 409 with `warnings`, client re-POSTs with `confirm_warnings: true` to commit. Mirrors the `confirm_silence` round-trip pattern.
- **Triggers / filters / segments**: NONE. Slug fires whenever its calling code path runs.
- **Outputs**: SMS body only. No email, no coupon attachment, no scheduling. Recipient is determined by the calling code path (customer phone for customer slugs; staff/detailer roster for staff slugs).

#### C. Customer-facing impact
27 slugs (all chip-driven post-Session 3D). The exhaustive ledger:

| Slug | Trigger code path |
|---|---|
| `addon_approved` | POS approves an addon |
| `addon_authorization` | POS adds an addon (customer authorization request) |
| `addon_authorization_resend` | Resend addon auth |
| `addon_authorization_expired` | Cron-driven cleanup |
| `addon_declined` | POS declines an addon |
| `appointment_cancelled` | POS or admin cancels appointment |
| `appointment_confirmed` | Multiple paths (online booking, POS appt notify, voice agent) |
| `appointment_confirmed_postcall` | Voice agent postcall path |
| `booking_confirmed` | Online booking flow |
| `booking_reminder` | Daily 8 AM PST cron |
| `booking_staff_notify` | New online booking → staff |
| `booking_staff_notify_specialty` | Specialty callback request → staff |
| `detailer_job_assigned` | POS assigns detailer to job |
| `job_complete` | POS marks job complete |
| `loyalty_milestone` | Transaction crosses a milestone |
| `payment_receipt` | POS auto-receipt after transaction |
| `quote_accepted_multi` / `_single` | Customer accepts a quote |
| `quote_accepted_staff_notify` | Quote accepted → staff |
| `quote_reminder` | Hourly cron (validity-window driven) |
| `quote_sms_admin` / `_midcall` / `_postcall` | Voice agent + admin send |
| `quote_viewed_followup` | Cron — customer viewed quote without acting |
| `receipt_sms` | POS receipt-by-SMS (Session 3D made this chip-driven) |
| `staff_notification` | Generic staff alert |
| `staff_notification_inbound_specialty` | Inbound SMS containing specialty keyword |

#### D. Code-level inventory
- **Files** (representative; ~12 first-party files; 22 calling sites):
  - Engine + palette: `src/lib/sms/render-sms-template.ts` (399), `src/lib/sms/sms-contracts.source.ts` (275, hand-edited), `src/lib/sms/palette.ts` (121, generated), `src/lib/sms/generated-contracts.ts` (generated), `src/lib/sms/contract.ts`, `src/lib/sms/composites.ts` (211), `src/lib/sms/dedup.ts`, `src/lib/sms/hardcoded-messages.ts` (50, mostly empty stub).
  - Codegen: `scripts/regen-sms-contracts.ts`.
  - Admin API: `src/app/api/admin/sms-templates/route.ts`, `[slug]/route.ts`, `[slug]/reset/route.ts`, `[slug]/test/route.ts`.
  - Admin page: `src/app/admin/settings/messaging/sms-templates/page.tsx`.
- **Tests**: `src/lib/sms/__tests__/render-sms-template.test.ts`, `render-sms-template-contract.test.ts`, `src/app/api/admin/sms-templates/[slug]/__tests__/route.test.ts`.
- **Estimated owned LOC**: ~1,800 (engine + admin + tests, excludes the 22 caller sites).

#### E. Known issues / gaps
- `hardcoded-messages.ts` is now empty (Path B Phase 2 closed). Could collapse to a one-line stub.
- `database.types.ts` is stale — still references `customers.birthday` even though Session 5 dropped it. Suggests `npx tsx scripts/regen-db-schema.ts` ran but the generated TS types weren't regenerated. Hygiene only — not a runtime issue.
- No "messaging conversation log" surface for transactional sends. Slugs that pass `logToConversation: true` write to `conversations`/`messages`; many do not. Operators looking at the customer's thread don't see all SMS history.

---

### 1.2 Marketing → Automations *(event-triggered single-shot)*

#### A. Architectural identity
- **DB tables**: `lifecycle_rules` (the rule), `lifecycle_executions` (the dedup ledger; PK + composite UNIQUE on `(lifecycle_rule_id, COALESCE(appointment_id,…), …, COALESCE(quote_id,…))`).
- **Admin UI**: `/admin/marketing/automations` (list), `/admin/marketing/automations/[id]` (edit), `/admin/marketing/automations/new` (create).
- **Read/write code paths**:
  - Admin API: `src/app/api/marketing/automations/route.ts`, `[id]/route.ts`.
  - Engine: `src/app/api/cron/lifecycle-engine/route.ts` (1,166 LOC). Phases 1A–1F (six trigger branches, each a `scheduleFrom*` function) → shared `scheduleExecutions` (dedup + insert) → Phase 2 `executePending` (render + send).
- **Cron**: registered in `src/lib/cron/scheduler.ts` as `lifecycle-engine`, runs every 10 minutes. Lookback window: **24 hours** for new triggers; **30-day** customer dedup window.

#### B. Operator-facing capabilities
- **Form fields**: Name, Description, **Trigger Condition** (6 options — see below), Trigger Service (optional), Delay (days + minutes), Action (sms / email / both), SMS body (textarea with chip picker), Email subject + Email template (HTML or template_id), Coupon attachment (template coupon → cloned to single-use), Active toggle, **Chain Order** (decorative — see §4), **Is Vehicle Aware** (dead — see §4).
- **Trigger conditions** (UI options, post-Session 5):
  - `after_work_completed` — detailer marked work physically done (`jobs.status='completed'`).
  - `service_completed` — POS rang up the job (`jobs.status='closed'`).
  - `after_transaction` — pure product POS sale (NOT linked to job/appointment).
  - `after_appointment_booked` — newly created appointment (excluding `cancelled`/`no_show`).
  - `after_appointment_cancelled` — appointment status flipped to cancelled.
  - `after_quote_accepted` — quote acceptance event.
- **Chip palette**: `VARIABLE_GROUPS` from `src/lib/utils/template.ts` — 5 groups: Customer Info, Business, Links, Loyalty & History, Coupons, **Event Context** (the only group exclusive to Automations: `service_name`, `vehicle_info`, `vehicle_description`, `detailer_first_name`, `appointment_date`, `appointment_time`, `amount_paid`).
- **Filters / segments**: ONLY `trigger_service_id` (single service ID, optional). **No audience filters.** Cannot say "fire on event X but only for customers with min_spend > Y."
- **Outputs**: SMS, email, both — per-rule. Coupon optional (cloned to a single-use coupon at execution time, scoped to the customer).
- **Dedup model** (per `scheduleExecutions`):
  1. Per-(rule, source-id) — never schedule twice for the same `(rule, job/appointment/transaction/quote)`.
  2. Per-(rule, customer) within 30 days — never schedule the same rule again for the same customer in a month.
  3. Channel eligibility — skip if no contactable channel (phone+sms_consent OR email+email_consent).
  4. Service filter — if `trigger_service_id` is set, the event's `serviceIds[]` must include it.

#### C. Customer-facing impact
- The seeded review-after-service rule (`Google & Yelp Review Request — After Service`) → SMS at +30 min after job close.
- Operator-created custom rules (Sessions 5+ have expanded triggers; today's seeded set is small).
- Body source: `lifecycle_rules.sms_template` (free text with `{chip}` substitution). NOT `sms_templates` (different system).
- Email body: either `email_template_id` → block-rendered via `sendTemplatedEmail`, or `email_template` (legacy plaintext + auto-HTML wrap).

#### D. Code-level inventory
- **Files**:
  - `src/app/api/cron/lifecycle-engine/route.ts` (1,166 LOC, including ~860 LOC for Phases 1+2, ~310 LOC referenced for drip).
  - `src/app/api/marketing/automations/route.ts` (CRUD), `[id]/route.ts`.
  - `src/app/admin/marketing/automations/page.tsx`, `new/page.tsx`, `[id]/page.tsx`.
  - `src/lib/utils/template.ts` (166) — chip palette + `renderTemplate` + `cleanEmptyReviewLines`.
- **Tests**: implicit only — no dedicated test file in `src/app/api/cron/lifecycle-engine/`.
- **Estimated owned LOC**: ~1,500 (engine + admin + chip palette).

#### E. Known issues / gaps
1. **No segment overlay** (audit Layer 2 §C gap #2): "review request after every ceramic, but only enthusiast customers" is unexpressible.
2. **No stop conditions** (audit Layer 2 §C gap #4): a pending execution keeps its `scheduled_for` even if the customer comes back inside the delay window.
3. **`chain_order` is decorative**: the field is settable (form), and `/api/marketing/automations` GETs use `.order('chain_order')` for the listing — but the **engine does not respect it**. `byTrigger(cond)` returns rules in arbitrary Supabase order. Multi-step chains are not actually orchestrated.
4. **`is_vehicle_aware` is dead** (audit confirmed): no consumer in `src/lib` or `src/app/api`. Only set on the form, validated by Zod, included in TS types. Never read.
5. **24h lookback** can miss events when the cron is down for >24h (e.g., dev-server restart loops). No audit/replay surface.
6. **Per-customer 30-day dedup** is not surfaced in admin UI — operators have no way to see "this rule was already sent to customer X 12 days ago" without querying SQL.
7. **Phase 2 send doesn't `logToConversation`**: marketing SMS via `sendMarketingSms()` does not pass `logToConversation: true`, so the customer's conversation thread doesn't show their own marketing messages. Operators investigating "what did this customer receive?" have to cross-reference `lifecycle_executions` + `sms_delivery_log`.
8. **Stale `database.types.ts`** still types `lifecycle_rules.is_vehicle_aware` as required — fine while column exists; will need regen if removed.

---

### 1.3 Marketing → Campaigns *(operator-initiated segment blast)*

#### A. Architectural identity
- **DB tables**: `campaigns` (one row per campaign), `campaign_recipients` (one row per send), `campaign_variants` (A/B test variants).
- **Admin UI**: `/admin/marketing/campaigns` (list with `CategoryTabs`), `/admin/marketing/campaigns/[id]` (view), `/admin/marketing/campaigns/[id]/edit/page.tsx` (edit), `/admin/marketing/campaigns/[id]/analytics/page.tsx` (analytics), `/admin/marketing/campaigns/new/page.tsx` (wizard).
- **Read/write code paths**:
  - Admin: `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` is the editor.
  - Audience: `src/lib/utils/audience.ts` (252 LOC) — shared with Drip.
  - A/B testing: `src/lib/campaigns/ab-testing.ts`.
  - Send: `src/app/api/marketing/campaigns/[id]/send/route.ts` (509 LOC, manual operator-initiated).
  - Process scheduled: `src/app/api/marketing/campaigns/process-scheduled/route.ts` (367 LOC) — **NOT registered in scheduler.ts** (orphan).
- **Cron**: NONE registered. `process-scheduled` exists but no scheduler entry. Auth header is `Bearer <CRON_SECRET>` (different env var than the rest of the app's `CRON_API_KEY`), reinforcing the orphan hypothesis.

#### B. Operator-facing capabilities
- **Form fields** (campaign-wizard.tsx):
  - Channel (`sms` / `email` / `both`), Schedule (now / scheduled-at), Coupon (optional).
  - Audience filters: `customer_type`, `last_service` (single service_id), `days_since_visit_min`/`max`, `vehicle_type`, `min_spend`, `tags[]` (contains-all), `has_email`, `has_phone`. **No zip / geographic filter.**
  - Body: SMS free-text + email subject + email body (block editor or HTML).
  - A/B: per-variant `split_percentage`, optional auto-winner-after-hours selection.
- **Chip palette**: `CAMPAIGN_VARIABLES` from `src/lib/utils/template.ts` — explicit subset of Automations palette **excluding Event Context**. Email block editor uses `getVariablesForCategory('marketing')` from `src/lib/email/variables.ts` — **another partial overlap** (adds `customer_name`, `services_list`, `appointment_total`, `unsubscribe_url`).
- **Filters/triggers**: operator-initiated only. No event triggers.
- **Outputs**: SMS, email, both. Coupon attachable. Variants for A/B.

#### C. Customer-facing impact
- "Spring sale 20% off detail packages — limited time" → operator builds → operator clicks Send Now or schedules.
- Body source: `campaigns.sms_template` + `campaigns.email_subject`/`email_template`/`email_body_blocks`. NOT `sms_templates`.
- Recipient list materialized into `campaign_recipients` with consent enforcement at audience-build time (`applyConsent` in `audience.ts`).

#### D. Code-level inventory
- **Files**:
  - `src/app/api/marketing/campaigns/route.ts`, `[id]/route.ts`, `[id]/send/route.ts` (509), `[id]/duplicate/route.ts`, `[id]/recipients/route.ts`, `audience-preview/route.ts`, `audience-sample/route.ts`, `process-scheduled/route.ts` (367 — orphan).
  - `src/app/admin/marketing/campaigns/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `[id]/analytics/page.tsx`, `new/page.tsx`, `_components/campaign-wizard.tsx`, `_components/campaign-tabs.tsx`.
  - `src/lib/utils/audience.ts` (252) — shared with Drip.
  - `src/lib/campaigns/ab-testing.ts`.
- **Tests**: TBD — none observed in lifecycle-engine path; campaign tests not surveyed in depth.
- **Estimated owned LOC**: ~1,800 (send route + wizard + audience + AB + analytics).

#### E. Known issues / gaps
1. **`process-scheduled` is orphan** (audit Layer 2 §F dead-code #5): no cron registration. Scheduled campaigns silently never auto-send unless someone hits the endpoint manually with `Bearer <CRON_SECRET>`. A campaign created with `scheduled_at` in the future will sit in `status='scheduled'` indefinitely.
2. **No zip / geographic filter** (audit Layer 2 §C gap #1): Scenario 4 ("zip 90701-90717") cannot be expressed despite `customers.zip` existing.
3. **Three chip palettes drift**: Campaigns vs Automations vs Email-blocks have ~80% overlap but with subtle differences (e.g., `customer_name` only in Email-blocks, `appointment_total` only in Email-blocks vs `amount_paid` in Automations).
4. **No "all consented customers" preset**: leaving every filter blank works (`applyConsent` still runs) but the UX doesn't tell operators that's the implicit "everyone" send.

---

### 1.4 Marketing → Campaigns → Drip *(multi-step nurture sequence)*

#### A. Architectural identity
- **DB tables**: `drip_sequences` (sequence-level config), `drip_steps` (per-step body/channel/delay/exit), `drip_enrollments` (one row per customer-in-sequence; UNIQUE on `(sequence_id, customer_id)`), `drip_send_log` (per-step send ledger).
- **Admin UI**: `/admin/marketing/campaigns/drip/new`, `/admin/marketing/campaigns/drip/[id]`. Reachable only via the Drip tab in `/admin/marketing/campaigns/_components/campaign-tabs.tsx` — easy to miss.
- **Read/write code paths**:
  - Admin API: `src/app/api/admin/drip-sequences/route.ts` + `[id]/route.ts` + `[id]/steps/*` + `[id]/enrollments/*` + `[id]/analytics/*`.
  - Engine: `src/lib/email/drip-engine.ts` (869 LOC) — `runAutoEnrollments`, `checkAllStopConditions`, `processEnrollments`, `executeStep`, `executeExitAction`, `enrollCustomer`.
  - Engine entry points: `lifecycle-engine/route.ts` Phases 0, 0.5, 3 delegate to drip-engine.
- **Cron**: same `lifecycle-engine` cron (every 10 min). Drip is a passenger on the same tick.

#### B. Operator-facing capabilities
- **Form fields**:
  - Trigger: `no_visit_days` (lapsed), `after_service` (specific service), `new_customer` (recent customers.created_at), `manual_enroll`, `tag_added`.
  - Per-trigger value JSONB: `days`, `service_id`, etc.
  - Audience filters (same shape as Campaigns).
  - Stop conditions: `on_purchase`, `on_booking`, `on_reply` (sequence-level defaults `{on_reply: false, on_booking: true, on_purchase: true}`).
  - Nurture handoff: `nurture_sequence_id` — when current sequence ends without trigger, optionally enroll into a "nurture" sequence.
  - Per-step: order, delay days/hours, channel, template_id (email) or sms_template (free text), coupon, exit_condition / exit_action / exit_sequence_id / exit_tag.
- **Chip palette**: same `VARIABLE_GROUPS` from `src/lib/utils/template.ts` (passes through `renderTemplate`).
- **Filters / triggers**: 5 trigger conditions. `manual_enroll` and `tag_added` are explicitly skipped by `runAutoEnrollments` (line 701) — `manual_enroll` requires POST to `[id]/enrollments`; `tag_added` has **no caller** (no path enrolls when tags change).
- **Outputs**: SMS or email or both per step. Optional coupon per step.

#### C. Customer-facing impact
- "We miss you — 3-message lapsed flow over 14 days" → drip sequence with `no_visit_days=60`, three steps, stop-on-booking.
- Body source: `drip_steps.sms_template` + `template_id` (email) or step-level sms_body. NOT `sms_templates`.

#### D. Code-level inventory
- **Files**:
  - `src/lib/email/drip-engine.ts` (869).
  - `src/app/api/admin/drip-sequences/route.ts` + `[id]/*` (~7 endpoints).
  - `src/app/admin/marketing/campaigns/drip/_components/drip-builder.tsx` (~600 LOC est) + `drip-steps-editor.tsx`, `drip-step-card.tsx`, `drip-analytics.tsx`, `drip-enrollments-table.tsx`.
- **Tests**: none observed.
- **Estimated owned LOC**: ~2,200.

#### E. Known issues / gaps
1. **`tag_added` trigger has no auto-enroller** (audit-confirmed): the trigger is selectable but `runAutoEnrollments` skips it and no other path watches `customers.tags` for changes. Effectively dead.
2. **`new_customer` uses `customers.created_at`, not first-paid-visit date** (audit Layer 2 §C gap #3): off-by-some-days for customers whose record predates their first paid visit.
3. **Drip is hidden** as a tab inside Campaigns. Operators searching for "lapsed customer flow" don't naturally find it.
4. **Drip and Automations both pass through the same 10-min cron tick**: Phase 0 (auto-enroll) → 0.5 (stop-conditions) → 3 (execute). When the Phase 1+2 (Automations) work is heavy, Drip is delayed; if either throws, the catch is per-phase but the whole tick can take longer.
5. **Sequence-level vs step-level stop semantics are easy to confuse**: step-level `exit_condition`/`exit_action` is independent from sequence-level `stop_conditions`. The two interact in the engine but aren't visually distinguished in the UI.

---

## Section 2 — Operator Decision Tree

The current operator workflow is **undocumented**. Below is the implicit-today routing for the 13 scenarios in the brief. "Gap" means today's systems can't express it cleanly.

| # | Scenario | System today | Works? | Gap notes |
|---|---|---|---|---|
| 1 | Review request 30 min after every paid service | Automations / `service_completed` / 30 min | ✅ | Canonical use case (Session 5 simplified gate). |
| 2 | "We miss you" — last visit > 60d AND past tx > $125 | Campaigns (one-time) OR Drip (single-step `no_visit_days`) | ⚠️ | **Genuine ambiguity** — both can express. Today: must rebuild Campaign weekly OR build a 1-step Drip with audience filter `min_spend≥125`. **Lightweight "recurring single-shot" pattern doesn't exist.** |
| 3 | First-time customer welcome 3 days after first visit | Drip / `new_customer` / 3d step | ⚠️ | Off-by-days: `new_customer` fires off `customers.created_at`, not `MIN(transaction_date)`. POS walk-ins with deferred record creation are mistimed. |
| 4 | Discount to all customers in zip 90701–90717 | Campaigns | ❌ | **No zip filter in `audience.ts`**. `customers.zip` exists but isn't queryable from the wizard. |
| 5 | Service-specific upsell 7 days after Express Wash | Automations / `service_completed` / `trigger_service_id=express_wash` / 7d | ✅* | Works only if `jobs.services` JSONB contains populated `service_id` keys. (Audit Layer 1 Observation #1 flagged that synthetic walk-ins were observed without populated `service_ids` — verify POS walk-in flow before relying on this.) |
| 6 | One-time announcement to all consented customers | Campaigns / no filters / `has_phone=true` | ✅ | UX nit: "no filters set" implicitly = "everyone consented" — not visually obvious. |
| 7 | Cancel scheduled message if customer comes back | Drip (`stop_conditions.on_booking=true`) | ⚠️ | **Drip yes; Automations no.** Pending `lifecycle_executions` rows don't get cancelled when a counter-event lands. If the use case is "review request, but cancel if they re-book inside the window" → there's no path. |
| 8 | Sequence of 3 messages over 14 days for new customers | Drip / `new_customer` / 3 steps | ✅ | Same `created_at` caveat as #3. |
| 9 | Same review request, but only customers tagged "VIP" | None directly | ❌ | Automations has no `audience_filters`. Workaround: skip Automations, build a 1-step Drip with `tags=['VIP']` and `after_service` trigger — but that loses the per-rule chain semantics and uses a different surface. |
| 10 | Birthday message | None | ❌ | Session 5 dropped `customers.birthday`. No infrastructure. Would require: bring back the column, add a date-based trigger to lifecycle-engine OR drip-engine. |
| 11 | Quote follow-up after 48h if not booked | `quote_reminder` (transactional, in `sms_templates`) + cron `quote-reminders` | ✅ | Already chip-driven and cron-driven; lives in System 1. Body editable in admin SMS Templates. |
| 12 | Refund-receipt SMS after refund | None today | ❌ | No `refund_receipt` slug in `sms_templates`. Refund receipts are email-only via the receipt system. **Either net-new transactional slug, or accept that refund receipts are email-only.** |
| 13 | Booking confirmation, payment receipt, job-complete notification — transactional system messages | All in `sms_templates` (System 1) | ✅ | Healthy. |

### 2.1 Decision tree (proposed for the operator manual)

```
Is the message tied to a specific business event in code?
├─ YES, transactional (booking, receipt, addon auth, job complete, voice agent flows)
│   → System 1: SMS Templates. Body is operator-editable; trigger is hardcoded.
│
└─ NO, marketing — does it fire from an event?
    ├─ YES, single message per customer per event
    │   ├─ With segment filter? Today: NOT SUPPORTED. Future: Automations + audience_filters.
    │   └─ Without segment filter: System 2: Marketing → Automations.
    │
    └─ NO, operator-initiated to a segment
        ├─ Single message: System 3: Campaigns.
        ├─ Multi-step / requires stop-conditions: System 4: Drip.
        └─ "Recurring single-shot" (e.g., weekly we-miss-you): NOT SUPPORTED today.
```

---

## Section 3 — Transactional vs Marketing Boundary

### 3.1 Classification

**Transactional** (no `sms_consent` legally required — TCPA carve-out for service-specific messages the customer reasonably expects):

- All 27 slugs in `sms_templates`.
  - These include `booking_confirmed`, `appointment_confirmed*`, `appointment_cancelled`, `addon_*`, `job_complete`, `payment_receipt`, `receipt_sms`, `loyalty_milestone` (debatable — see §3.4), `booking_reminder`, `quote_reminder`, `quote_*`, `detailer_job_assigned`, `staff_notification*`, `booking_staff_notify*`.
- **Code path**: `sendSms()` (no consent check) — every slug calls `renderSmsTemplate()` then `sendSms()`.

**Marketing** (`sms_consent=true` required per TCPA + per CAN-SPAM for email):

- Lifecycle Automations (System 2) — review requests, post-event nurture sends.
- Campaigns (System 3) — segment blasts.
- Drip (System 4) — multi-step nurture.
- **Code path**: all three go through `sendMarketingSms()` (which checks `sms_consent` AND a daily frequency cap) and `sendEmail()` with `isMarketing: true`.

### 3.2 Consent-check consistency

- **Transactional sends use `sendSms()`**: NO consent check. Correct — TCPA doesn't require opt-in for service-specific messages.
- **Marketing sends use `sendMarketingSms()`**: checks `customers.sms_consent === true` AND a daily frequency cap. If either fails, the send returns `{success: false, error: ...}`.
  - **Frequency cap** — `business_settings.sms_daily_cap_per_customer` (default 5). Counts both campaign + lifecycle sends today.
  - The cap is **enforced at send time**, not at schedule time — a `lifecycle_executions` row will be inserted for a customer at-cap, sent later, and silently fail at send. The execution will be marked `failed` with `error_message: "Daily SMS cap reached..."`.
- **Audience build also enforces consent** via `applyConsent` in `audience.ts` — Campaigns + Drip filter at audience build, Automations only checks at send. **Both paths converge** on `sms_consent === true` for SMS, `email_consent === true` for email.

### 3.3 Customer creation paths and consent capture

| Path | Consent capture | Default | TCPA disclosure shown? |
|---|---|---|---|
| Online booking (`/book`) | **Single combined checkbox** required to submit: "I agree to Terms & Conditions and consent to receive appointment reminders, confirmations, and promotional offers from {business_name} via text and email. Msg & data rates may apply. Reply STOP to opt out." → `sms_consent: true, email_consent: !!email`. | OFF (must check to submit). | ✅ Inline on the checkbox label. |
| POS customer creation (`/api/pos/customers/route.ts` + `customer-create-dialog.tsx`) | **No consent capture in form**. New customers default to whatever DB column default is (likely `false`). | DB default. | ❌ **GAP — staff who add a walk-in customer never see a consent prompt.** |
| Voice agent (`/api/voice-agent/appointments/route.ts`) | **Auto-set `sms_consent: true` on new customer creation** with comment "Implied consent — customer initiated phone call". | `true`. | ❌ No express consent — relies on TCPA implied-consent for inbound-initiated communication. |
| Square import (`/api/migration/customers/route.ts`) | Hardcoded `sms_consent: false, email_consent: false`. | `false`. | ❌ Defensive — Square doesn't carry consent flags. |
| Admin customer creation (`/admin/customers/new`) | **Explicit toggles** for `sms_consent` and `email_consent`, with auto-toggle to `true` when the staff fills in phone/email. | Auto-true on field-fill. | ❌ No disclosure shown to the customer; staff makes the call. |
| Quote acceptance | No consent change. The customer must already exist; no path mutates their consent. | n/a. | n/a. |
| Customer portal profile | Can opt out. | Existing. | ✅ |
| Inbound SMS (`STOP`/`HELP`) | `updateSmsConsent()` opts out via `sms_consent_log`. | Existing. | ✅ |

### 3.4 Misclassifications / risks

- **`loyalty_milestone` is in `sms_templates` (transactional) but is debatable**: a "Congrats — you hit Gold tier" message is closer to marketing than service. TCPA "transactional" carve-out is narrowly construed; lifestyle/promotional content embedded in an otherwise transactional message can lose the carve-out. **Decision needed (§8).**
- **POS walk-in consent is unsignaled**: staff who add a customer at the register get no checkbox, no disclosure, no record of express consent. Any subsequent marketing send to that customer relies on `sms_consent` having been flipped via some other path (admin edit, online booking, voice agent). **High-priority gap.**
- **Voice-agent "implied consent on inbound call"** is defensible TCPA-wise but should be **logged** to `sms_consent_log` so auditors can trace it. Today the column is set directly without a log row. **Hygiene gap.**
- **The booking checkbox combines transactional + marketing consent**: legally fine because it's opt-in for both. But operators wanting to opt out of marketing while keeping appointment reminders have no granular control today (the customer portal `sms_consent` toggle kills both because all sends route through the same column).

---

## Section 4 — Dead Code Inventory

### 4.1 Confirmed dead

| # | Item | Evidence | Proposed removal |
|---|---|---|---|
| D1 | `lifecycle_rules.is_vehicle_aware` (column, form field, Zod schema, TS type) | `grep is_vehicle_aware src/lib src/app/api` returns only the form, validation, and types — **no consumer**. | Drop column + remove form field + remove Zod entry. ~30 LOC, 1 migration. **S/low risk.** |
| D2 | `tag_added` drip trigger | `runAutoEnrollments` explicitly `continue`s on `tag_added`. No path mutates tags-and-fires. | Either implement (watch `customers` updates for tag adds — non-trivial) or remove from valid triggers + dropdown. **Recommend remove.** ~20 LOC. **S/low risk.** |
| D3 | `/api/marketing/campaigns/process-scheduled` (route file, 367 LOC) | Not registered in `scheduler.ts`. Uses `Bearer <CRON_SECRET>` (different env var than `CRON_API_KEY`) — orphan. | **Decision required first**: does the user want scheduled campaigns to actually fire? If yes → register. If no → delete the route. **Either way, current state is broken.** |
| D4 | `src/lib/sms/hardcoded-messages.ts` non-empty interface | `HARDCODED_SMS_MESSAGES = []` since Session 3D. Interface + export retained "in case future hardcoded SMS get added." | Collapse to a single-line stub (or delete and re-add when needed). **XS/no risk.** |

### 4.2 Confirmed misleading-but-not-dead

| # | Item | Evidence | Proposed action |
|---|---|---|---|
| M1 | `lifecycle_rules.chain_order` | Used as `.order('chain_order')` in `/api/marketing/automations/route.ts:30` for the **listing display**. Cron does NOT respect it (rules iterate in arbitrary Supabase order). UI form labels it "Order in multi-step sequences" — **operator expectation does not match behavior**. | Two options: (a) implement (cron iterates rules in `chain_order` ASC, so a "step 1" can chain into "step 2") or (b) rename to `display_order` + remove from chain semantics. **Decision required (§8).** |
| M2 | Stale `database.types.ts` (still has `customers.birthday`) | Session 5 dropped the column from the live DB. Generated types lag. | Run `supabase gen types` (or whatever generator regen step exists) to refresh. **XS/zero risk.** |

### 4.3 Not dead (verified)

- `drip_sequences.nurture_sequence_id` — reachable in UI at `drip-builder.tsx:521` (Nurture sequence picker). Engine respects via `seq.nurture_sequence_id` check at `drip-engine.ts:852`. **Keep.**
- `drip_sequences.manual_enroll` trigger — POST endpoint at `/api/admin/drip-sequences/[id]/enrollments` exposes manual enrollment. **Keep.**
- `drip_sequences.no_visit_days` and `new_customer` triggers — both consumed by `runAutoEnrollments`. **Keep.**

---

## Section 5 — Observability Gaps

### 5.1 Today's blind spots (from Session 5 incident + this audit)

The Session 5 diagnostic exposed that operators have **no way to answer "why didn't rule X fire for customer Y?"** without diving into SQL. The gates that can silently suppress a send:

| Gate | Where | Surfaced? |
|---|---|---|
| Rule `is_active=false` | `lifecycle_rules.is_active` | ✅ in admin (toggle visible). |
| Cron lookback window (24h) | `route.ts:57` | ❌ — invisible to operators. If cron was down >24h, late triggers are dropped. |
| Per-(rule, source-id) dedup | `scheduleExecutions` source-set | ❌. |
| Per-(rule, customer) 30-day dedup | `scheduleExecutions` customer-set | ❌ — caused the Session 5 false alarm. |
| `trigger_service_id` mismatch | Engine line 636 | ❌ — also depends on `jobs.services` containing `service_id` keys (audit Layer 1 Observation #1). |
| Channel eligibility (no phone+sms_consent AND no email+email_consent) | Engine line 627–629 | ❌. |
| `sms_consent=false` at send time | `sendMarketingSms` | Partial — recorded in execution `error_message`. |
| Daily frequency cap | `checkFrequencyCap` | Partial — recorded in execution `error_message` (and `sms_delivery_log`). |
| Marketing feature flag off (`sms_marketing` / `email_marketing`) | Engine Phase 2 gate | ❌ — entire Phase 2 silently no-ops; pending rows accumulate. |
| Review-link feature flag off | Engine line 794 | Partial — execution `error_message`. |
| Cron silently failing (HTTP 500) | `scheduler.ts` swallows non-OK | ❌ **High severity** — Session 5 secondary finding. The "Completed in Xms" log line prints regardless of HTTP status. |

### 5.2 What signals would help

A. **Per-customer "why didn't this fire" tool** (admin `/admin/marketing/automations/[id]`):
- Section: "Test against customer" — pick a customer; the engine's `scheduleExecutions` runs in dry-run mode for this `(rule, customer)` and reports each gate's verdict (sourceBlocked, customerBlocked, serviceMisMatch, channel eligibility).
- Same data already exists in the diagnostic logging Session 5's investigator added temporarily — formalize it as an admin endpoint.

B. **Cron health dashboard** (admin `/admin/system/cron-health` or similar):
- Per-job: last-success-at, last-failure-at, last-fail-reason, mean run-time over last 24h, count of `[CRON] returned 5xx` in last 24h.
- Source: a new `cron_runs` table populated by the cron wrapper itself, OR scrape `pm2 logs` (less reliable).
- Critical because dev-server stickiness silently 500s the lifecycle cron (Session 5 secondary finding).

C. **Per-rule audit feed** (in admin rule view): "Last 25 executions" — show `customer_id`, `triggered_at`, `scheduled_for`, `executed_at`, `status`, `error_message`. Already in `lifecycle_executions` — just needs a UI surface.

D. **Marketing send health unified view**: combine `lifecycle_executions` + `campaign_recipients` + `drip_send_log` into a single "what did this customer receive in the last 60 days" view. Today operators have to query three tables to reconstruct a customer's marketing history. Cross-reference with `sms_delivery_log` for actual delivery state (Twilio status callback).

E. **Conversation-thread log for marketing sends**: pass `logToConversation: true` from `sendMarketingSms()` → marketing SMS shows up in the customer's `messaging` thread alongside transactional and inbound. Today they don't.

### 5.3 Cron health verification

The pm2 / scheduler `[CRON] Completed lifecycle-engine in Xms` line is **not proof of success** because the wrapper logs Completed regardless of HTTP status (Layer 1 secondary finding). The minimum trustworthy verification today is:

- Query `lifecycle_executions` for a row with `created_at >= now() - 11min` (just past the 10-min tick).
- OR query a fresh `sms_delivery_log` row.
- OR add a `cron_runs(job_name, started_at, finished_at, http_status, response_excerpt, error)` table written by `runJob` in `scheduler.ts`.

---

## Section 6 — Proposed Product Principles

The four systems become coherent only when each has an unambiguous purpose. Below are principles intended to be **prescriptive enough that any new SMS scenario routes to exactly one system**.

### Principle 1 — SMS Templates is the contract layer for **transactional sends only**.

- **Is for**: messages tied to a specific event in a specific code path, with stable contractual chip variables (booking, receipt, addon auth, voice-agent post-call, staff notification).
- **Is NOT for**: marketing sends, segment-driven sends, scheduled-by-rule sends, or anything where the operator decides "who gets this."
- **Operator surface**: edit body + chips. Cannot configure trigger or recipient logic — those are coded.
- **Why this principle**: TCPA boundary, code-path provenance, body editability without engineering involvement.

### Principle 2 — Marketing → Automations is **"one event → one message → one customer"**.

- **Is for**: event-driven, single-shot, dedup'd messages. "After X happens, send Y after Z delay, but never twice for the same customer in a window."
- **Is NOT for**: multi-step nurture (use Drip), one-time blasts (use Campaigns), or transactional contracts (use SMS Templates).
- **Operator surface**: trigger + service filter + audience filter (proposed) + delay + body + optional coupon.
- **Why this principle**: matches the natural "event-triggered" mental model and consolidates lifecycle review/upsell logic.

### Principle 3 — Marketing → Campaigns is **"send now or send-later, to a segment"**.

- **Is for**: operator-initiated one-time blasts. A/B testing belongs here.
- **Is NOT for**: recurring sends (use Automations or Drip), event-driven sends (use Automations).
- **Operator surface**: audience filters (segment) + body + optional A/B + send-now or schedule-once.
- **Why this principle**: clear "I picked this audience and sent this message at this time" semantics, with attribution to a single recipient list.

### Principle 4 — Drip is **"many messages, over time, per enrollment, with stop-conditions"**.

- **Is for**: long-running multi-step nurture flows (welcome series, lapsed reactivation, post-purchase education) with per-customer enrollment lifecycle.
- **Is NOT for**: single-shot event sends (use Automations), one-time blasts (use Campaigns).
- **Operator surface**: trigger + audience filters + steps (each with channel/delay/body/coupon/exit) + sequence-level stop-conditions + nurture handoff.
- **Why this principle**: Drip is the only system with native "multi-step + stop-conditions + nurture handoff" semantics.

### 6.1 Tie-breaker rules

When a scenario sounds like it could go in two systems, apply in order:

1. **Code-path-provenance test**: is there a specific call site in code where this message must fire? → System 1 (transactional).
2. **Step-count test**: does the customer receive >1 message per enrollment? → System 4 (Drip).
3. **Initiation test**: who decides when this fires?
   - The operator clicks Send → System 3 (Campaigns).
   - A business event happens → System 2 (Automations).
   - The customer matches an ongoing segment definition → System 4 (Drip with `no_visit_days` / `new_customer`).

### 6.2 Net-new pattern: "Recurring single-shot"

Scenario 2 ("we miss you, last visit > 60d AND past tx > $125 — fire weekly") doesn't fit neatly. Today operators must either:
- Build a Campaign and re-create it weekly (operationally bad), or
- Build a 1-step Drip with the audience filter (works but UI is multi-step-oriented).

**Recommendation**: lean into Drip for this case and document that "Drip with 1 step + no_visit_days trigger + audience filter" is the canonical recurring-single-shot pattern. **Do not** add a fifth system.

---

## Section 7 — Implementation Sequence

### 7.1 All proposed changes (catalogued)

Each change references the principle / gap it addresses.

| # | Change | Addresses | Size | Files | Risk |
|---|---|---|---|---|---|
| C1 | Add `audience_filters JSONB` to `lifecycle_rules`; engine reads it via shared `applyFilters` from `audience.ts` | Principle 2; §C gap #2 ("review request, but only VIPs") | M (~150–250 LOC + migration + admin UI) | `lifecycle_rules`, lifecycle-engine route, automations admin form, validation, audience.ts | Medium — touches scheduling logic |
| C2 | Add `stop_conditions JSONB` to `lifecycle_rules` (mirror Drip shape: `on_purchase`, `on_booking`, `on_reply`); cancel pending executions when counter-event lands | Principle 2; §C gap #4 (Scenario 7) | M (~200 LOC + migration + admin UI) | `lifecycle_rules`, lifecycle-engine, admin form | Medium — adds new transitions to executions |
| C3 | Add `zip_in TEXT[]` (or `zip_prefix TEXT[]`) filter in `audience.ts`; UI in campaign-wizard | Principle 3; §E.3 (Scenario 4) | S (~80 LOC) | `audience.ts`, campaign-wizard.tsx, drip-builder.tsx | Low |
| C4 | Document operator decision tree (`docs/manual/MARKETING_DECISION_GUIDE.md`) + admin nav inline help | Principles 1–4 unambiguity | S (docs only) | new doc, sidebar tooltip | Low |
| C5 | Unify chip palette: single source of truth (extend `sms-contracts.source.ts` or new `template-vars.source.ts`); generate per-surface filtered subsets for Automations / Campaigns / Drip / Email-blocks | Drift risk across `VARIABLE_GROUPS` / `CAMPAIGN_VARIABLES` / `email/variables.ts` | L (~400 LOC + codegen) | template.ts, email/variables.ts, both surfaces of the editor, codegen script | Medium-high — touches every surface |
| C6 | Drop `is_vehicle_aware` column + form + Zod | §4.1 D1 | S (~30 LOC + migration) | `lifecycle_rules`, automations admin form, validation | Low |
| C7 | Resolve `chain_order`: either implement multi-step chain (cron orders by `chain_order` ASC, supersede semantics) OR rename to `display_order` and drop chain framing from form | §4.2 M1 | S–M depending on choice (~50 vs 200 LOC) | lifecycle-engine, automations admin form | Low if rename / Medium if implement |
| C8 | Resolve `process-scheduled`: either register in `scheduler.ts` and migrate auth from `CRON_SECRET` to `CRON_API_KEY` (15 min), OR delete the route (5 min) | §4.1 D3 (orphan) | XS (15 LOC) — option (a) | `scheduler.ts`, the route, env docs | Low |
| C9 | Drop `tag_added` drip trigger from valid options + UI | §4.1 D2 | XS (~20 LOC) | drip-builder.tsx, validation, drip-engine.ts | Low |
| C10 | Collapse `hardcoded-messages.ts` to one-line stub OR delete and re-add when needed | §4.1 D4 | XS | `src/lib/sms/hardcoded-messages.ts` | Zero |
| C11 | Pass `logToConversation: true` from `sendMarketingSms()` (Automations + Campaigns + Drip) | §1.2 E.7, §5.2 E (visibility) | S (~30 LOC) | `sms.ts`, send call sites | Low |
| C12 | "Test rule against customer" admin tool — dry-run `scheduleExecutions` for a `(rule, customer)` and report gate verdicts | §5.2 A | M (~250 LOC) | new endpoint + admin page | Low |
| C13 | `cron_runs` table + scheduler.ts wrapper writes per-tick rows; admin "Cron Health" page | §5.2 B, §5.3 | M (~250 LOC + migration) | new table, scheduler.ts, new admin page | Low |
| C14 | Per-rule "Last 25 executions" panel in `/admin/marketing/automations/[id]` | §5.2 C | S (~100 LOC) | automations admin page, new GET endpoint | Low |
| C15 | Unified "Customer marketing send history" view (joins lifecycle_executions + campaign_recipients + drip_send_log) | §5.2 D | M (~250 LOC) | new endpoint + customer detail page | Low |
| C16 | POS customer creation — add SMS/Email consent toggles + brief disclosure copy | §3.3 GAP (POS walk-in) | S (~80 LOC) | pos/customer-create-dialog.tsx, /api/pos/customers/route.ts | Medium (UX-sensitive — requires user judgment on default state) |
| C17 | Voice agent — log `sms_consent_log` row for implied-consent on customer-initiated call | §3.3 hygiene | XS (~15 LOC) | voice-agent/appointments/route.ts | Low |
| C18 | Move `loyalty_milestone` to marketing-bucket OR keep transactional with a documented rationale | §3.4 misclassification | S (~10 LOC) — depends on decision | sms.ts call site for that slug | Low — affects TCPA risk |
| C19 | Granular consent split: separate `sms_consent_transactional` from `sms_consent_marketing` (or treat current `sms_consent` as marketing-only and let transactional always send) | §3.4 design choice | L (DB + audit + every send call site) | many | High — touches consent semantics; should NOT be done lightly |
| C20 | Move Drip out of the Campaigns tab — make it a top-level `/admin/marketing/drip` page (rename "Campaigns" → "Blasts" or similar) | §1.4 E.3 (Drip is hidden) | S (~50 LOC sidebar nav + redirects) | admin sidebar, route file moves | Low |
| C21 | Refresh `database.types.ts` to drop `customers.birthday` | §4.2 M2 | XS (regen) | generated file | Zero |
| C22 | Verify POS walk-in flow writes `service_id` keys into `jobs.services` JSONB (Layer 1 Observation #1) | Scenario #5 functionality | XS (investigation + possibly small fix) | POS job creation path | Low (but if the bug is real, service-targeted Automations are silently broken on walk-ins) |

### 7.2 Proposed session sequence

Per project memory rule #14, each session ≤ ~300 LOC and ≤ 3 file surfaces. The grouping below respects that and orders by impact-per-risk.

#### Session 6a — Decision tree doc + dead-code housekeeping (XS, low risk)
**Includes**: C4, C8 (verdict from §8), C9, C10, C21.
**Why first**: zero-risk wins, plus operator-facing documentation that makes the principles real before any structural change. Sets the bar for all subsequent sessions.
**Surfaces**: `docs/manual/MARKETING_DECISION_GUIDE.md` (new), `scheduler.ts` OR delete `process-scheduled/route.ts`, `drip-builder.tsx`, `drip-engine.ts`, `hardcoded-messages.ts`, regen `database.types.ts`.

#### Session 6b — Audience filter on Automations (M, medium risk)
**Includes**: C1.
**Why second**: highest single-change product impact. Closes the largest §C gap. Reuses the existing `applyFilters` shape.
**Surfaces**: migration (add column), `lifecycle-engine/route.ts`, `automations/[id]+new` admin form, `validation.ts`, `audience.ts` (light shape extraction).

#### Session 6c — POS walk-in consent + voice-agent consent log (S, medium risk)
**Includes**: C16, C17.
**Why third**: addresses the largest *legal* gap. POS walk-ins today silently default `sms_consent=false`, meaning any later marketing send is silently skipped — but more importantly, if a staff member toggles consent later via admin without express customer authorization, that's a TCPA risk. UI design needs user input (§8).
**Surfaces**: `pos/customer-create-dialog.tsx`, `/api/pos/customers/route.ts`, `voice-agent/appointments/route.ts`.

#### Session 6d — Stop-conditions on Automations (M, medium risk)
**Includes**: C2.
**Why fourth**: closes Scenario 7 gap. Mirror Drip semantics. Adds counter-event watchers to the cron tick.
**Surfaces**: migration, `lifecycle-engine/route.ts` (Phase 1.5: cancel pending), `automations/[id]+new` admin form, `validation.ts`.

#### Session 6e — `chain_order` resolution (S, low risk)
**Includes**: C7.
**Why fifth**: removes a misleading UI affordance. Decision needed first (§8).
**Surfaces**: form rename or engine change in `lifecycle-engine`, `automations/[id]+new`.

#### Session 6f — Zip filter (S, low risk)
**Includes**: C3.
**Why sixth**: small and self-contained; geographic targeting unblocks promo zip-targeted campaigns.
**Surfaces**: `audience.ts`, campaign-wizard, drip-builder.

#### Session 6g — Observability surface 1: per-rule executions panel + test-against-customer (M, low risk)
**Includes**: C12, C14.
**Why seventh**: highest-impact observability with no schema change. Eliminates the "why didn't this fire" mystery.
**Surfaces**: new endpoint, `/admin/marketing/automations/[id]/page.tsx`.

#### Session 6h — Observability surface 2: cron-health table + page (M, low risk)
**Includes**: C13.
**Why eighth**: closes Session 5 secondary finding. Operators get a real "is the cron healthy" view.
**Surfaces**: migration, `scheduler.ts` wrapper, new admin page.

#### Session 6i — Conversation-thread logging for marketing (S, low risk)
**Includes**: C11.
**Why ninth**: small but qualitative — customer threads finally show all SMS history.
**Surfaces**: `sms.ts`, send call sites.

#### Session 6j — `is_vehicle_aware` removal (XS, low risk)
**Includes**: C6.
**Why tenth**: housekeeping. Defer until any other column-touching session is queued so migrations bundle naturally.
**Surfaces**: migration, automations form, validation.

#### Session 6k — Drip relocation (S, low risk)
**Includes**: C20.
**Why eleventh**: improves discoverability. Defer until 6a's decision tree doc is shipped (so the rename matches the doc).
**Surfaces**: admin sidebar, route file moves, redirects.

#### Session 6l — Customer marketing send history (M, low risk)
**Includes**: C15.
**Why twelfth**: highest-effort observability addition; depends on 6g+6h being shipped first so the team has a consistent admin pattern.
**Surfaces**: new endpoint, customer detail page.

#### Session 6m — Chip palette unification (L, medium-high risk)
**Includes**: C5.
**Why last**: largest, most invasive change. Could be split into 6m.1 (introduce source of truth + Automations migration) and 6m.2 (Campaigns + Email-blocks migration). Defer until everything else is stable.
**Surfaces**: codegen, `template.ts`, `email/variables.ts`, multiple editors.

#### Session 6n (deferred / decision-required)
**Includes**: C18 (loyalty_milestone reclassification), C19 (granular consent split).
**Why last/optional**: legal-judgment-heavy. C19 in particular touches every send call site and isn't worth it if the user prefers a single combined consent model. Discuss in §8 before scheduling.

#### Session 6o (post-investigation)
**Includes**: C22 (verify POS walk-in service_ids).
**Why optional**: this is research with a possible 1-line fix at the end. Might not even be a session — could fold into Session 6c.

### 7.3 Out of scope (do NOT redo)

- **Customer `birthday` column** — already dropped in Session 5. Don't recreate unless explicit need (Scenario #10) gets prioritized — that's a separate roadmap decision.
- **`actual_pickup_at` gate on `service_completed`** — Session 5 already simplified this. Don't reintroduce the pickup-workflow filter.
- **Path B Phase 2 hardcoded-slug elimination** — closed in Session 3D. Don't reopen.
- **Voice-agent walk-in `actual_pickup_at`** — also gone in Session 5. Stable.

---

## Section 8 — Decisions Needed From User

Each decision below is a fork in the design where the choice depends on user/business judgment. None should be pre-decided.

### D1 — Should `chain_order` be implemented or removed?

- **Implement (option A)**: cron iterates rules in `chain_order` ASC, with supersede semantics ("rule 2 fires only if rule 1 didn't fire / didn't get a reply within X"). Powerful but introduces new dedup states.
- **Rename (option B)**: rename column to `display_order`, drop "chain" framing from the form. Operator can still sort the list, but the field doesn't promise orchestration.
- **Tradeoff**: A is genuinely useful for review-then-followup-if-no-google-review patterns; B is honest about today's behavior.

### D2 — Should `process-scheduled` be wired up or deleted?

- **Wire up (option A)**: add to `scheduler.ts`, migrate auth env var from `CRON_SECRET` to `CRON_API_KEY`. Scheduled campaigns finally fire.
- **Delete (option B)**: scheduled campaigns aren't a current workflow; delete the orphan code.
- **Tradeoff**: A unblocks "schedule a campaign for next Friday at noon" UX; B reduces surface area. If operators have built `scheduled_at` campaigns expecting them to fire, B is a data issue. **Recommend a quick SELECT on `campaigns.status='scheduled'` to count affected rows before deciding.**

### D3 — POS walk-in consent UI: opt-in or opt-out default?

- **Opt-in (option A)**: checkbox unchecked by default; staff actively asks customer for consent before checking.
- **Opt-out (option B)**: checkbox checked by default; staff must uncheck to refuse.
- **No checkbox (option C, status quo)**: don't capture consent at the POS — rely on later channels.
- **Tradeoff**: A is the most TCPA-defensible; B converts more customers but can be challenged in audits; C punts the problem. **A is the safest legal posture for a small business.**

### D4 — Should `loyalty_milestone` stay transactional or move to marketing?

- **Transactional (status quo)**: simpler — no consent gate.
- **Marketing**: more legally defensible (TCPA carve-out is narrowly construed; "Congrats — you hit Gold" is closer to promotional than service).
- **Tradeoff**: marketing classification means customers without `sms_consent=true` won't get the milestone notification — which may surprise repeat customers who never opted in for marketing.

### D5 — Granular consent (transactional vs marketing) — split or unified?

- **Unified (status quo)**: one `sms_consent` flag governs both. Simple. But conflates two distinct consent regimes.
- **Split**: `sms_consent_transactional` (always assumed `true` because TCPA doesn't require it for service messages) and `sms_consent_marketing` (explicit opt-in).
- **Tradeoff**: split is more legally hygienic and lets customers opt out of marketing while keeping reminders — but touches every send call site (high blast radius). **Most small businesses live with unified for simplicity.**

### D6 — Drip-engine consolidation into lifecycle-engine, or keep separate?

- **Keep separate (status quo, recommended)**: drip-engine is 869 LOC of well-bounded code; the lifecycle cron just delegates to it. Refactor surface area is low.
- **Consolidate**: one engine, one codebase. Saves 100 LOC of cross-call wiring at the cost of much larger refactor.
- **Tradeoff**: consolidation only pays off if a future change must touch both engines simultaneously. Not warranted today.

### D7 — Cron lookback window: 24h, 48h, 72h, or "since last successful tick"?

- **24h (status quo)**: simple; matches the comment "Designed to be called every 5–15 minutes."
- **48h / 72h**: safer if cron is down for >24h.
- **Since last successful tick**: most correct — but requires C13 (`cron_runs` table) to know what "successful" means.
- **Tradeoff**: longer windows risk re-scheduling already-handled events (mitigated by source-id dedup); the source-id dedup is robust enough that **48h is probably the right default** with C13 as the long-term fix.

### D8 — Chip palette unification — single palette with per-surface filters, or shared core + surface-specific extensions?

- **Single palette + filters (option A)**: one `template-vars.source.ts`; each surface (Automations / Campaigns / Drip / Email-blocks / SMS Templates) declares which chips it supports.
- **Shared core + extensions (option B)**: a "common" set + surface-specific add-ons (e.g., Email-blocks adds `appointment_total` and `unsubscribe_url`).
- **Tradeoff**: A is simpler to reason about; B preserves the ability to have surface-specific chips that don't pollute global. **Recommend A** unless an Email-block-specific need surfaces that doesn't generalize.

### D9 — "Recurring single-shot" pattern — bless Drip-with-1-step, build a 5th system, or extend Automations?

- **Bless Drip-with-1-step (status quo)**: already works; document it as the pattern.
- **5th system (Recurring Campaigns)**: net-new surface; rejected — adds complexity without proportional payoff.
- **Extend Automations to support segment-only triggers**: would let "weekly we-miss-you" live as an Automation rule with a date-based trigger and audience filter — overlaps with Drip's `no_visit_days`.
- **Tradeoff**: Drip-with-1-step is the pragmatic answer; document it and update the Drip UI copy to reflect "even one step is OK."

### D10 — Birthday messages (Scenario #10) — bring back the column or skip?

- **Skip (status quo)**: column was just dropped; don't reintroduce without proven demand.
- **Reintroduce**: requires birthday capture in customer flows + a date-based trigger (lifecycle-engine `after_date` or drip `birthday`).
- **Tradeoff**: small data-collection cost vs. a personable touch many small businesses use. **Skip until operator explicitly asks.**

---

## Section 9 — Risks & Unknowns

### 9.1 Risks during restructure

| # | Risk | Mitigation |
|---|---|---|
| R1 | Adding `audience_filters` to `lifecycle_rules` changes scheduling semantics — existing rules become more restrictive if operators populate filters by accident | Default filters to `{}` (passes all). Add a "preview audience count" affordance on the rule edit form (mirror the campaign-wizard preview). |
| R2 | `stop_conditions` on Automations introduces cancellation semantics. A bug here could spam customers (not cancel) or silently kill all sends | Add a feature flag to gate the Phase 1.5 cancellation logic. Roll out one rule at a time. |
| R3 | Chip palette unification touches all four send surfaces | Land in two-step rollout: (a) introduce source of truth + Automations only (still works), (b) Campaigns + Email-blocks. Each step independently reverts. |
| R4 | POS consent UI change — staff training cost | Coordinate with §8 D3 decision. Roll out with a one-page training doc in `docs/manual/`. |
| R5 | Cron-runs table writes 13 rows per tick × 24h × 60 min / cron-interval — could grow large | Add a `cleanup-cron-runs` cron retention to 30 days. Estimate: ~400k rows / 30d at current cadence — fine. |
| R6 | Stale `database.types.ts` could mask removed columns | Add a CI check: `git diff --name-only main src/lib/supabase/database.types.ts` after any migration; fail if missing. |

### 9.2 Unknowns needing investigation

| # | Unknown | Investigation method |
|---|---|---|
| U1 | Does the POS walk-in flow write `service_id` keys into `jobs.services` JSONB? (Layer 1 Observation #1) | Inspect `/api/pos/jobs/route.ts` and POS booking flow; SELECT `services` JSONB structure on a recent walk-in. |
| U2 | How many `campaigns.status='scheduled'` rows exist in production? | `SELECT count(*) FROM campaigns WHERE status='scheduled'`. Affects D2. |
| U3 | What's the actual blast radius of `sendMarketingSms` in code? Does anything call it with `customerId=undefined`? | Grep for callers; verify each respects the comment "called without customerId — no consent/frequency check." |
| U4 | Is the dev-server HMR-stickiness pathology that 500'd `/api/cron/lifecycle-engine` reproducible? | Repro on demand by editing a deep import; observe HTTP response. If reproducible → file as a separate dev-experience issue, not a Session-6 scope item. |
| U5 | What does `getVariablesForCategory('marketing')` in `email/variables.ts` actually return vs. `CAMPAIGN_VARIABLES`? Diff before unification. | Read both definitions side-by-side; build a 3-column diff table. |
| U6 | Are there any uses of `sms_templates.recipient_type` that operators today could legally invoke? | Read seed migrations; confirm the column is only set in seeds, never via UI. |
| U7 | Does any Automation rule today use `is_vehicle_aware=true`? | `SELECT count(*) FROM lifecycle_rules WHERE is_vehicle_aware=true`. Affects D6 / C6 ordering. |
| U8 | Is `tag_added` selected by any existing drip sequence? | `SELECT count(*) FROM drip_sequences WHERE trigger_condition='tag_added'`. If 0, removal is safe. |

### 9.3 Hard constraints

- **No external schedulers** (CLAUDE.md rule 2): all cron via `src/lib/cron/scheduler.ts`. Implication for D2: option A must register in scheduler.ts; option B deletes the orphan.
- **No quick fixes** (CLAUDE.md rule 4): each session must ship a fully-thought-out solution covering edge cases. Implication for C2 stop-conditions: cancellation must handle the "rule was sent + customer book-then-cancel within window" race.
- **Per-session ≤300 LOC + ≤3 file surfaces** (memory rule #14): bounds the granularity in §7.2.
- **PST timezone** (CLAUDE.md rule 1): any new time-based filter (D7 lookback, weekly recurring) must be PST.
- **Vehicle taxonomy** (CLAUDE.md rule 19): if any of these messaging changes wants to filter by vehicle attributes, use `size_class`, not new boolean flags.

---

## Closing notes

The single largest insight from this audit is: **the four messaging systems are individually well-built, but the operator has no rubric to choose between them.** Sections 6 (Principles) and 2 (Decision Tree) are the highest-leverage outputs of this design — they cost no engineering work, eliminate the largest source of operator confusion, and unlock the rest of §7 to land cleanly.

Within engineering changes, **Session 6b (audience filters on Automations)** is the highest-impact-per-LOC change. It closes the largest product gap (Scenario #9, "review request but only VIPs") and reuses the existing `applyFilters` shape.

The largest *legal* risk is the **POS walk-in consent gap** (§3.3). Until 6c lands, every walk-in customer who is later "marketing-sent" relies on an opaque later-edit by staff with no documented disclosure trail. That's a TCPA-enforcement-action shaped problem in waiting.
