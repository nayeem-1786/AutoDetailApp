# Appointment Status — Per-Transition Consequence Map

> Read-only Targeted audit, 2026-06-03. Branch:
> `audit/appointment-status-per-transition-consequence-map`.
> Memory #29 type 1 (Targeted).
>
> **Extends** the prior state-machine audit at
> `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` (b0efd95f).
> That audit produced the 6×6 transition matrix and aggregate
> consequence summaries ("MEDIUM RISK webhook re-fire," "NONE for
> lifecycle engine"). This audit drills the aggregates to per-
> transition specifics so the operator can reason about
> "if I open `confirmed → pending`, what fires?" precisely.

---

## TL;DR

- The PATCH endpoints (admin + POS) are the only paths whose
  consequences depend on the transition tuple. **Direct side
  paths** (`/cancel`, `/jobs/[id]/cancel`, `/pos/transactions`, POS
  checkout, `executeUnMaterialize`) write `appointments.status`
  but their consequences are owned by those endpoints — they don't
  participate in the matrix this audit maps.
- The PATCH endpoint emits exactly **TWO webhook events** —
  `appointment_confirmed` on `*→confirmed` and `appointment_completed`
  on `*→completed`. It does **NOT** fire `appointment_cancelled`,
  `appointment_no_show`, `appointment_rescheduled` (status-wise),
  or any direct SMS/email. The cancellation webhook + customer SMS
  live on `/api/{pos/admin}/appointments/[id]/cancel` — a separate
  route the dialog routes `→cancelled` to via UI intercept.
- **No idempotency guard on either webhook.** A round-trip
  (`confirmed → pending → confirmed` or `completed → in_progress →
  completed`) re-fires the webhook every time. Whether that is
  safe is purely a function of the n8n side (which the audit
  cannot verify).
- The lifecycle-engine cron (`/api/cron/lifecycle-engine`) reads
  `appointments.status` in **two of its five phases**: Phase 1D
  (`after_appointment_booked`) and Phase 1E
  (`after_appointment_cancelled`). The prior audit's "NOT IMPACTED"
  claim was correct for review-request triggers (`service_completed`,
  `after_work_completed`, `after_transaction`) but missed these
  two. Per-(rule_id, appointment_id) dedup protects against
  status-flip re-fire, but **first-time eligibility** during a
  status flip CAN schedule a new execution. Detail in C.7-C.8.
- Of **21 currently-blocked transitions**:
  - **6 SAFE** — no PATCH-side effects fire (everything blocked
    from `→ pending`, `→ in_progress`, `→ no_show` cells)
  - **9 MEDIUM** — webhook re-fire risk (everything blocked to
    `→ confirmed` or `→ completed`); receiver-side idempotency
    determines whether MEDIUM is materially LOW or HIGH
  - **6 HIGH** — cells where opening would conflict with a
    structural invariant (`completed → in_progress` collides with
    the un-materialize seam's terminal guard; `cancelled → *`
    collides with terminal-state assumptions in lifecycle dedup +
    audit semantics)
- Two **structural risks** the prior audit underplayed:
  1. PATCH `status=cancelled` exists as a server-side fallback
     path that silently writes `status=cancelled` **without
     firing notifications / cancellation webhook / waitlist
     auto-notify**. The dialog redirects `→cancelled` to the
     `/cancel` endpoint via UI intercept, but a scripted/test
     PATCH bypasses that — operators expecting "cancelling = the
     cancel button does X" will not see X on this path. See
     **Q5** for an operator decision.
  2. PATCH `status=pending` (reverse to pending) with an existing
     job leaves an inconsistent state: the appointment is back to
     pending (re-materialization-eligible per `populate`), the
     job still exists. The dialog intercepts this case with the
     un-materialize modal, but PATCH itself does not. Currently
     mooted because STATUS_TRANSITIONS blocks the PATCH, but
     **opening this transition without a server-side
     un-materialize cascade re-opens the race**. See **Q1**.

---

## Target A — Per-destination-status trigger inventory

The PATCH endpoints (`/api/appointments/[id]` admin,
`/api/pos/appointments/[id]` POS) determine consequences by
inspecting `data.status === <target>` AFTER confirming
`data.status !== current.status`. Every effect listed below
fires WHEN the appointment's new status equals the column header
(regardless of source status) via PATCH. Effects emitted by
side-path endpoints that also produce that status — `/cancel`,
`/jobs/[id]/cancel` cascade, POS checkout, `executeUnMaterialize`
— are listed in the "Side-path producers" sub-section for context
but are NOT part of this audit's PATCH-centric matrix.

### A.0 — Universal effects (every PATCH that flips status, regardless of target)

These fire on **every** non-self transition (X → Y where X ≠ Y),
independent of the target value.

| Effect | Where | What | Guard |
| --- | --- | --- | --- |
| `appointments.status` UPDATE | POS PATCH `pos/appointments/[id]/route.ts:297, :308-319`; Admin PATCH `appointments/[id]/route.ts:109, :117-129` | Writes the new status + `updated_at = now()` to the row. | None. Always fires. |
| `tr_appointments_updated_at` trigger | `supabase/migrations/20260201000037_create_functions_triggers.sql:21` | DB trigger refreshes `updated_at` (redundant — app also writes it). | None. |
| `logAudit` row | POS `pos/appointments/[id]/route.ts:373-392`; Admin `appointments/[id]/route.ts:166-177` | Fire-and-forget insert into `audit_log` with `action='update'`, `entityType='booking'`, `details = { status: { from, to }, ... }` via `buildChangeDetails`. | None. Always fires. |

These are **the only universal PATCH effects on a status-only change**. No notifications, no jobs-table cascade (cascade only fires on `employee_id` change at `pos/appointments/[id]/route.ts:323-329`, irrelevant to status-only PATCH).

### A.1 — Transitions TO `pending`

**PATCH-side effects: NONE beyond A.0.**

- Webhook: none. The `if (data.status === 'confirmed') ... else if (data.status === 'completed') ...` chain at `pos/appointments/[id]/route.ts:340-352` and `appointments/[id]/route.ts:140-148` has no branch for `pending`.
- SMS: none directly.
- Email: none directly.
- Other DB writes: none (no companion `reminder_sent_at` reset, no `payment_status` reset).

**Downstream consequences via cron:**

- `booking-reminders` cron (`cron/booking-reminders/route.ts:31`) gates on `status IN (pending, confirmed) AND reminder_sent_at IS NULL`. **A non-pending→pending PATCH for an appointment whose `scheduled_date = tomorrow` and `reminder_sent_at IS NULL` becomes eligible for tomorrow's 8 AM PST reminder.** The reminder_sent_at one-shot guard means once-per-appointment regardless of round-trips.
- `lifecycle-engine` Phase 1D (`cron/lifecycle-engine/route.ts:429-441`) gates on `created_at >= 24h ago AND status NOT IN (cancelled, no_show) AND channel != walk_in`. **A `cancelled→pending` PATCH within 24h of `created_at` re-includes the appointment in the next cron tick. Per-(rule_id, appointment_id) dedup at line 615-617 means if `after_appointment_booked` previously fired, it stays deduped; if it hadn't (e.g., the appointment was cancelled before its first cron tick), the un-cancel will trigger first-time scheduling.**

**Un-materialize re-entry risk:** `/api/pos/jobs/populate` gates on `status IN ('confirmed', 'in_progress') AND scheduled_date <= today`. **A `*→pending` PATCH that lands on a today-or-past appointment with an existing `jobs` row leaves an inconsistent state — pending appointment + materialized job — but `populate` will NOT re-materialize (status moves OUT of the materialize set, not into it).** This is benign for `populate` but operators eyeing the row will see "pending with a job," which is the state `executeUnMaterialize` (`lib/appointments/lifecycle-sync.ts:208`) exists to prevent. See Q1.

**Side-path producers of `→ pending`:**

- `executeUnMaterialize` (`lib/appointments/lifecycle-sync.ts:208, :293-296`) sets `status='pending'` as Step 5a of un-materialize. This path additionally deletes the linked job, removes job photos from Storage, and writes an `audit_log` row with `action='delete'`, `entityType='job'`, `details.reason='un_materialize'` (`lifecycle-sync.ts:336-354`). **No webhook fires on un-materialize** (`lifecycle-sync.ts:335` comment: "fire-and-forget audit row; no webhooks").

### A.2 — Transitions TO `confirmed`

**PATCH-side effects beyond A.0:**

| Effect | Where | What | Guard |
| --- | --- | --- | --- |
| `appointment_confirmed` webhook | POS `pos/appointments/[id]/route.ts:340-345`; Admin `appointments/[id]/route.ts:140-143` | Fires `fireWebhook('appointment_confirmed', { event: 'appointment.confirmed', timestamp, appointment: {id, status: 'confirmed'} }, supabase)`. Payload at `appointments/[id]/route.ts:134-138` is minimal — id + status — does NOT include from-status. | **NONE.** Fires on every flip-to-confirmed regardless of prior status. |

The webhook handler at `lib/utils/webhook.ts:20-52` resolves URL from `business_settings.n8n_webhook_urls` (a JSONB map per event), POSTs the payload with a 10s `AbortSignal.timeout`. Failure logs to console; no retry, no audit row, no DB record of fire/no-fire. **Idempotency is the receiver's responsibility.**

**Downstream consequences via cron:**

- `booking-reminders` (same gate as A.1) — pending → confirmed leaves an appointment eligible for the next-day reminder if scheduled_date matches. Confirmed→pending→confirmed round-trip would also keep eligibility (the gate is `IN (pending, confirmed)`).
- `lifecycle-engine` Phase 1D — same gate as A.1. Pending → confirmed doesn't change Phase 1D eligibility (both are in the eligible set). cancelled→confirmed does, same as cancelled→pending in A.1.
- `/api/pos/jobs/populate` (`pos/jobs/populate/route.ts:65`) gates on `status IN ('confirmed', 'in_progress') AND scheduled_date <= today`. **A `*→confirmed` PATCH on a today-or-past appointment lands the row in the materialize-eligible set; the next `populate` call (POS Jobs page mount) materializes a `jobs` row if not already present.** Dedup is on `jobs.appointment_id` UNIQUE constraint.

**Side-path producers of `→ confirmed`:**

- `/api/book/route.ts:917-927` fires `booking_created` then `appointment_confirmed` on **new** booking — not a status flip. Initial PATCH-from-pending case starts at `confirmed` by default and the same webhook fires from the booking route.
- `/api/appointments/[id]/notify/route.ts:360` and `/api/pos/appointments/[id]/notify/route.ts:345` — explicit "Send confirmation" operator-triggered endpoints that fire `appointment_confirmed` without changing status. These are not PATCH consequences; they're independent confirmation sends.

### A.3 — Transitions TO `in_progress`

**PATCH-side effects: NONE beyond A.0.**

- Webhook: none (no `in_progress` branch in either PATCH endpoint's webhook switch).
- SMS: none directly.
- Email: none directly.

**Downstream consequences via cron:**

- `booking-reminders` — gate is `IN (pending, confirmed)`. **`in_progress` is OUT of the eligible set, so a `pending/confirmed → in_progress` PATCH removes the appointment from tomorrow's reminder.** If `reminder_sent_at` was already set, no change. If still null, the reminder is silently dropped.
- `lifecycle-engine` Phase 1D — gate excludes only `(cancelled, no_show)`. `in_progress` stays eligible.
- `/api/pos/jobs/populate` (same gate as A.2) — `in_progress` is in the materialize-eligible set. Same as confirmed: a today-or-past `*→in_progress` PATCH on a row without a `jobs` row will materialize one on next populate.

**Side-path producers of `→ in_progress`:**

- `/api/pos/jobs/route.ts:389` POST (walk-in create) inserts a new appointment at `status='in_progress'` — not a flip. No webhook fires here.
- POS jobs operator UI: starting a job (intake/in_progress on `jobs.status`) does NOT cascade to `appointments.status` per `lib/appointments/lifecycle-sync.ts`'s Phase 2C scope ("only `delete_job` is implemented; `materialize` and `set_job_status` are Item 15h territory" — `lifecycle-sync.ts:42-47`). So an operator marking a job "in_progress" leaves the appointment's status unchanged. (The walk-in creation path above is the only way an appointment lands at `in_progress` today, post-Phase 2C.)

### A.4 — Transitions TO `completed`

**PATCH-side effects beyond A.0:**

| Effect | Where | What | Guard |
| --- | --- | --- | --- |
| `appointment_completed` webhook | POS `pos/appointments/[id]/route.ts:346-352`; Admin `appointments/[id]/route.ts:144-147` | Fires `fireWebhook('appointment_completed', { event: 'appointment.completed', timestamp, appointment: {id, status: 'completed'} }, supabase)`. | **NONE.** Fires on every flip-to-completed regardless of prior status. |

**Downstream consequences via cron:**

- `booking-reminders` — `completed` is OUT of the eligible set. Same as A.3.
- `lifecycle-engine` Phase 1D — `completed` stays eligible (excluded set is only cancelled/no_show), but Phase 1D filters on `created_at >= 24h ago`; an appointment that's just been completed is unlikely to also have been created within the last 24h unless walk-in/same-day. Effect on flow: marginal.
- `lifecycle-engine` Phase 1A (`scheduleFromCompletedJobs`, `cron/lifecycle-engine/route.ts:215-264`) gates on `jobs.status='closed'` — NOT `appointments.status='completed'`. The prior audit's C.2 note is correct: review-request triggers are job-driven, not appointment-driven. Admin-PATCH `completed` does NOT trigger review requests.
- `/api/pos/jobs/populate` — `completed` is OUT of the materialize set. Already-materialized job is unaffected. New `*→completed` PATCH on an unmaterialized today-or-past appointment leaves it unmaterialized (no-op for populate).

**Side-path producers of `→ completed`:**

- `pos/transactions/route.ts:653-659` writes `appointments.status='completed'` directly when a job is checked out (`jobs.status='closed'`). **This path does NOT fire the `appointment_completed` webhook** — the webhook is PATCH-endpoint-only. So the canonical completion path (POS checkout) is webhook-silent; operator-manual completion via the dialog edit IS webhook-loud.

### A.5 — Transitions TO `cancelled`

**PATCH-side effects: NONE beyond A.0.**

- Webhook: none on this path. The `appointment_cancelled` webhook is only fired from `/api/appointments/[id]/cancel/route.ts:100-108` (admin cancel endpoint) and `/api/pos/appointments/[id]/cancel/route.ts:132-143` (POS cancel endpoint, gated by `notify_customer`) — and from `/api/customer/appointments/[id]/cancel/route.ts:95` (customer self-cancel) and `/api/pos/jobs/[id]/cancel/route.ts` (job cancel cascade — TODO check this). **PATCH with `status=cancelled` writes the row silently.**
- SMS: none directly. `sendCancellationNotifications` (`lib/email/send-cancellation-email.ts`) is invoked only from `/cancel` endpoints, never from PATCH.
- Email: none directly. Same reasoning.
- Waitlist auto-notify (`appointments/[id]/cancel/route.ts:110-161`): not on PATCH.

**Dialog intercept:** the shared `AppointmentDetailDialog` redirects `→cancelled` to the cancel dialog at `appointment-detail-dialog.tsx:200-208`:

```ts
if (data.status === 'cancelled' && appointment.status !== 'cancelled') {
  if (!canCancel) return;
  onOpenChange(false);
  onCancel(appointment);
  return;
}
```

So from THE DIALOG, PATCH-to-cancelled is unreachable in practice — operators always hit `/cancel`. **A direct PATCH (scripted, test, future caller that didn't go through the dialog) silently cancels without notifications/webhook/waitlist.** Surfaced as Q5.

**Downstream consequences via cron:**

- `lifecycle-engine` Phase 1E (`scheduleFromAppointmentCancelled`, `cron/lifecycle-engine/route.ts:477-524`) gates on `status='cancelled' AND updated_at >= 24h ago AND channel != walk_in`. **A `*→cancelled` PATCH bumps `updated_at` AND sets status=cancelled → eligible for Phase 1E on next cron tick.** Per-(rule_id, appointment_id) dedup means an appointment that gets cancelled, un-cancelled, re-cancelled within 30 days will fire the cancellation rule ONCE.
- `lifecycle-engine` Phase 1D — `cancelled` excluded. The appointment is removed from "newly-booked follow-up" eligibility, but if it already fired Phase 1D (within the 30-day dedup window) it stays deduped.
- `booking-reminders` — `cancelled` excluded. A cancellation removes the appointment from tomorrow's reminder set (if not yet sent).

**Side-path producers of `→ cancelled`:**

- `/api/appointments/[id]/cancel/route.ts` (admin) — full notification + webhook + waitlist auto-notify suite.
- `/api/pos/appointments/[id]/cancel/route.ts` (POS) — notifications + webhook gated by `notify_customer` checkbox (default false → silent).
- `/api/customer/appointments/[id]/cancel/route.ts` — customer self-cancel, full notification suite.
- `/api/pos/jobs/[id]/cancel/route.ts:145-154` — job cancel cascade: when a job is cancelled and `job.appointment_id IS NOT NULL`, the linked appointment is also flipped to `status='cancelled'`. Notification sent from the job-cancel flow's own logic (if requested by operator).

### A.6 — Transitions TO `no_show`

**PATCH-side effects: NONE beyond A.0.**

- Webhook: none. `appointment_no_show` is NOT in the `WebhookEvent` union (`lib/utils/webhook.ts:3-13`). The PATCH endpoint's webhook switch has no `no_show` branch.
- SMS: none directly.
- Email: none directly.

**Dialog intercept:** none. `isEarlierState` (`lib/appointments/lifecycle-sync.ts:81-103`) explicitly excludes `no_show` from the lifecycle rank, so it's not classified as a "backward" transition, and there's no `→no_show` intercept analogous to `→cancelled`'s redirect.

**Downstream consequences via cron:**

- `lifecycle-engine` Phase 1D — `no_show` is in the excluded set, same as `cancelled`. If the appointment was newly-booked AND a Phase 1D rule has fired AND is deduped, it stays deduped. Otherwise excluded.
- `lifecycle-engine` Phase 1E (`after_appointment_cancelled`) — explicitly gates on `status='cancelled'`, NOT `no_show`. **No no-show analog rule exists in the lifecycle engine today.** If the operator wants no-show follow-ups (e.g., "sorry we missed you — reschedule?"), they'd need a new rule type.
- `booking-reminders` — `no_show` excluded. Same as A.3, A.4.

**Side-path producers of `→ no_show`:** none currently. `no_show` is reachable only via PATCH (admin or POS).

---

## Target B — 6×6 per-transition consequence matrix

Each cell answers: "if this transition were performed right now via PATCH (regardless of whether currently allowed), what fires?"

Notation:
- **A.0** = universal effects: `appointments.status` write + `updated_at` bump + `tr_appointments_updated_at` trigger + `audit_log` row (always; see A.0).
- **W:confirmed** = `appointment_confirmed` webhook (per A.2).
- **W:completed** = `appointment_completed` webhook (per A.4).
- **dialog→/cancel** = the shared dialog REDIRECTS this transition to `/cancel` instead of PATCH (per A.5); direct PATCH bypasses redirect and skips notifications/webhook.
- **dialog→un-materialize** = the shared dialog INTERCEPTS this transition with the un-materialize modal when `has_active_job=true` (per `appointment-detail-dialog.tsx:215-224`); direct PATCH bypasses intercept and leaves inconsistent state.
- **populate-eligibility-IN** = the next `/api/pos/jobs/populate` call materializes a `jobs` row for today-or-past appointments (per A.2/A.3).
- **populate-eligibility-OUT** = the appointment exits the populate set (but does NOT delete an existing job; that requires `executeUnMaterialize`).
- **reminder-eligibility-OUT** = the appointment exits `booking-reminders`'s set (per A.3-A.6).
- **reminder-eligibility-IN** = the appointment re-enters `booking-reminders`'s set (per A.1, A.2).
- **lifecycle-Phase-1E** = newly eligible for `after_appointment_cancelled` rules on next cron tick (per A.5).
- **lifecycle-Phase-1D-eligibility-OUT** = appointment exits `after_appointment_booked` source set.
- **lifecycle-Phase-1D-eligibility-IN** = appointment re-enters `after_appointment_booked` source set (cancelled/no_show → pending/confirmed/in_progress within 24h of `created_at` AND not previously deduped).

|             | → **pending** | → **confirmed** | → **in_progress** | → **completed** | → **cancelled** | → **no_show** |
| --- | --- | --- | --- | --- | --- | --- |
| **pending** | ➖ self (no-op at `pos/appointments/[id]/route.ts:240`) | A.0 + **W:confirmed** + populate-eligibility-IN (if today/past) | A.0 + populate-eligibility-IN + reminder-eligibility-OUT | A.0 + **W:completed** + reminder-eligibility-OUT | A.0 + reminder-eligibility-OUT + lifecycle-Phase-1D-eligibility-OUT + **lifecycle-Phase-1E**; **dialog→/cancel** redirect (PATCH bypass = no SMS/email/webhook) | A.0 + reminder-eligibility-OUT + lifecycle-Phase-1D-eligibility-OUT |
| **confirmed** | A.0 + reminder-eligibility-IN (still in pending set); **dialog→un-materialize** when `has_active_job=true` (PATCH bypass = pending + orphan job) | ➖ self | A.0 + reminder-eligibility-OUT + populate-eligibility-IN if today/past | A.0 + **W:completed** + reminder-eligibility-OUT | A.0 + reminder-eligibility-OUT + lifecycle-Phase-1D-eligibility-OUT + **lifecycle-Phase-1E**; **dialog→/cancel** redirect | A.0 + reminder-eligibility-OUT + lifecycle-Phase-1D-eligibility-OUT |
| **in_progress** | A.0 + reminder-eligibility-IN; **dialog→un-materialize** when `has_active_job=true` | A.0 + **W:confirmed** + populate-eligibility-IN (still in set); **dialog→un-materialize** when `has_active_job=true` (rank 2 → rank 1 is also "earlier") | ➖ self | A.0 + **W:completed** + reminder-eligibility-OUT | A.0 + reminder-eligibility-OUT + **lifecycle-Phase-1E**; **dialog→/cancel** redirect | A.0 + reminder-eligibility-OUT |
| **completed** | A.0 + reminder-eligibility-IN; **dialog→un-materialize** *if `has_active_job=true`*, but jobs.status in {completed, closed, cancelled} would fail un-materialize's `terminal` guard (`lifecycle-sync.ts:243-246`) → modal blocks. PATCH bypass leaves completed appointment + revert mismatch. Service-edit gate (`lib/appointments/service-edit.ts:242-251`) un-blocks. | A.0 + **W:confirmed**; service-edit gate un-blocks. populate already materialized. | A.0; reminder-eligibility no change (was OUT); service-edit gate un-blocks; downstream **W:completed re-fire risk** if re-completed | ➖ self | A.0 + **lifecycle-Phase-1E**; **dialog→/cancel** redirect (but `/cancel` 400s on `current.status='completed'` per `appointments/[id]/cancel/route.ts:63-67` — PATCH would be the only path that succeeds) | A.0; no_show after completed semantically broken |
| **cancelled** | A.0 + reminder-eligibility-IN + **lifecycle-Phase-1D-eligibility-IN** (re-eligibility risk if within 24h of created_at + not previously deduped) | A.0 + **W:confirmed** + lifecycle-Phase-1D-eligibility-IN + populate-eligibility-IN if today/past | A.0 + lifecycle-Phase-1D-eligibility-IN + populate-eligibility-IN if today/past | A.0 + **W:completed** + lifecycle-Phase-1D-eligibility-IN | ➖ self | A.0 + lifecycle-Phase-1D-eligibility-OUT (no change; both excluded) |
| **no_show** | A.0 + reminder-eligibility-IN + lifecycle-Phase-1D-eligibility-IN | A.0 + **W:confirmed** + lifecycle-Phase-1D-eligibility-IN + populate-eligibility-IN if today/past | A.0 + lifecycle-Phase-1D-eligibility-IN + populate-eligibility-IN if today/past | A.0 + **W:completed** + lifecycle-Phase-1D-eligibility-IN | A.0 + **lifecycle-Phase-1E**; **dialog→/cancel** redirect (but `/cancel` does NOT 400 on `no_show`, so the redirect works) | ➖ self |

---

## Target C — Idempotency assessment per consequence

| Consequence | Source | Guard / idempotency | Round-trip safety |
| --- | --- | --- | --- |
| `appointments.status` UPDATE (A.0) | PATCH endpoints | Last-write-wins on a single column. | Safe — round-trip just toggles the value. |
| `tr_appointments_updated_at` trigger | `migrations/20260201000037` | Refreshes `updated_at`. | Safe — column is monotonic per row but not semantically protected. |
| `audit_log` row (A.0) | `logAudit` via `lib/services/audit` | No de-dupe; every PATCH writes one row. | **Intentionally NON-idempotent** — round-trips correctly produce two audit rows (forward + reverse). Operator can see both in `/admin/settings/audit-log`. |
| `appointment_confirmed` webhook (A.2) | PATCH | **NO guard at source.** `lib/utils/webhook.ts:42-47` fires every time; no `confirmation_sent_at`-style flag. | **NOT idempotent at source.** Round-trip `confirmed → pending → confirmed` re-fires. Receiver (n8n) MUST be idempotent or operator must accept duplicate downstream actions. **UNKNOWN** at source — operator must verify n8n side. |
| `appointment_completed` webhook (A.4) | PATCH | **NO guard at source.** Same shape as above. | Same as confirmed: re-fires on round-trip; n8n-side idempotency required. UNKNOWN at source. |
| `appointment_cancelled` webhook | `/cancel` endpoints, NOT PATCH | No source-side dedupe in `/cancel` route either; `TERMINAL_STATUSES` block at `appointments/[id]/cancel/route.ts:63` prevents firing from already-cancelled state (returns 400 before reaching webhook). | Round-trip safe because terminal-state guard rejects the second cancel BEFORE webhook fires. |
| `booking-reminders` eligibility | Cron, reads status | `reminder_sent_at IS NULL` one-shot guard. | Safe — once sent, future status flips don't re-fire reminders. |
| `lifecycle-engine` Phase 1D scheduling | Cron, reads status | Per-(rule_id, appointment_id) dedup at `cron/lifecycle-engine/route.ts:609-626` + 30-day per-(rule_id, customer_id) limit. | **Safe for re-fire** within the same `(rule_id, appointment_id)` tuple. **NOT safe for first-time eligibility** — `cancelled → pending` within 24h of created_at and before Phase 1D ever fired WILL schedule on next cron tick. |
| `lifecycle-engine` Phase 1E scheduling | Cron, reads status | Same dedup as 1D. | Safe — round-trip cancel→uncancel→cancel within 30d won't re-fire. |
| `/api/pos/jobs/populate` materialization | Endpoint, reads status | UNIQUE `jobs.appointment_id` (per migration `20260329000002`). | Safe — second populate call on the same appointment doesn't create a second job. But the EXISTENCE of the job after a backward revert is the issue, not duplicate creation; see Q1. |
| `executeUnMaterialize` re-fire (`lifecycle-sync.ts:208`) | `/api/{admin/pos}/appointments/[id]/un-materialize` | Idempotent by construction — 404 on second call (job already deleted). | Safe. |

**Summary tallies:**

| Class | Count | Notes |
| --- | --- | --- |
| Idempotent at source | 7 of 11 | A.0 universals; reminder-sent guard; lifecycle dedup; populate UNIQUE; un-materialize 404 |
| Not idempotent at source | 2 of 11 | Both webhooks (`appointment_confirmed`, `appointment_completed`) |
| Receiver-side unknown | 2 of 11 | Same two webhooks — n8n flows opaque to this audit |
| Intentionally non-idempotent | 1 of 11 | `audit_log` (the rows are the history) |

---

## Target D — Backward / lateral transition risk ranking

For each of the **21 currently-blocked transitions**, this ranks the risk of opening it.

Risk meanings:
- **SAFE** — no PATCH-side effects fire OR all fires are idempotent at source/receiver.
- **MEDIUM** — webhook re-fire is possible; receiver-side idempotency determines material risk (LOW if idempotent, HIGH if not).
- **HIGH** — structural invariant collision OR irrecoverable inconsistency without compensating logic.
- **CRITICAL** — opening would break a money-attached or terminal-state assumption the system relies on for correctness.

### D.1 — From `pending` (3 blocked)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `pending → in_progress` | **SAFE** | A.0 only. No webhook. populate-eligibility-IN is benign (creates job if today/past; idempotent on UNIQUE). reminder-eligibility-OUT only kicks the appointment OUT — no duplicate side effect. Currently blocked solely by `STATUS_TRANSITIONS.pending = [confirmed, cancelled, no_show]`. |
| `pending → completed` | **MEDIUM** | A.0 + W:completed. Re-fire risk on subsequent toggle. Idempotent at source for booking-reminders (already removed since `completed` not in eligible set), un-materialize doesn't apply (no `has_active_job` from a pending appointment). |

(`pending → pending` is the self-cell, allowed as no-op. `pending → confirmed/cancelled/no_show` are already allowed.)

### D.2 — From `confirmed` (3 blocked)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `confirmed → pending` *(operator error #1)* | **HIGH if `has_active_job`, MEDIUM otherwise** | When `has_active_job=true`, the dialog redirects to un-materialize modal (no PATCH fires). Direct PATCH leaves orphan job + pending appointment — populate won't re-materialize (status's OUT of set) so the bad state PERSISTS. When `has_active_job=false`, A.0 only — no risk. Opening at the server with no compensating un-materialize hook is unsafe; opening WITH a server-side un-materialize cascade (`jobStatusForAppointmentStatus` at `lifecycle-sync.ts:59-72` already returns `delete_job` for this transition; just not wired into PATCH) makes this **SAFE**. |
| `confirmed → completed` | **MEDIUM** | A.0 + W:completed. Same as `pending → completed`. Note: the canonical completion path (POS checkout via `pos/transactions/route.ts:653-659`) writes status='completed' directly without webhook; admin/dialog PATCH would be webhook-loud. |

(`confirmed → confirmed` self; `confirmed → in_progress/cancelled/no_show` allowed.)

### D.3 — From `in_progress` (3 blocked)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `in_progress → pending` | **HIGH if `has_active_job`, MEDIUM otherwise** | Same as confirmed→pending. Dialog redirects via un-materialize; direct PATCH bypasses. |
| `in_progress → confirmed` | **MEDIUM** | A.0 + W:confirmed. Re-fire risk. populate-eligibility unchanged (both in set). Semantically odd — operator "ungoing" a started job — but no DB-side inconsistency beyond webhook re-fire. |
| `in_progress → no_show` *(operator error #2)* | **SAFE** | A.0 only. No webhook (no_show isn't in WebhookEvent). No SMS/email. lifecycle-Phase-1D-eligibility-OUT (appointment exits booked-followup set if within 24h of created_at and not previously fired — but at in_progress the appointment is almost certainly past Phase 1D's 24h window). Net consequence: status changes, audit row written, no notifications fire. Matches operator's reported workflow. |

(`in_progress → in_progress` self; `in_progress → completed/cancelled` allowed.)

### D.4 — From `completed` (5 blocked — terminal)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `completed → pending` | **HIGH** | Already-completed appointment likely has linked `transactions` row (via POS checkout). un-materialize's `transaction_linked` guard (`lifecycle-sync.ts:239`) would 409 — appointment can't be reverted without compensating transaction logic. PATCH bypass leaves completed-status revert + transaction still linked → accounting inconsistency. |
| `completed → confirmed` | **HIGH** | Same transaction-linkage concern. W:confirmed fire would notify customer of a confirmation for an appointment they've already completed. service-edit gate would re-open (`service-edit.ts:243`), letting operator add/remove services after completion without compensating money math. |
| `completed → in_progress` | **HIGH** | Same as completed→confirmed. service-edit gate also un-blocks. POS checkout's auto-write to `completed` (`pos/transactions/route.ts:657`) could race with operator's manual revert. |
| `completed → cancelled` | **HIGH** | Transaction-linkage same. `/cancel` endpoint's `TERMINAL_STATUSES` guard at `appointments/[id]/cancel/route.ts:63` already rejects this with 400 — so PATCH bypass would be the ONLY path. The cancellation webhook + waitlist + SMS would NOT fire (PATCH doesn't trigger them). Net: silent cancellation of a completed transaction-linked appointment. Worst-case path. |
| `completed → no_show` | **HIGH** | Semantically nonsensical (no_show after completion). No webhook fires, but data integrity broken. |

### D.5 — From `cancelled` (5 blocked — terminal)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `cancelled → pending` | **HIGH if customer was notified of cancellation, MEDIUM otherwise** | Un-cancel within 24h of `created_at` re-enters lifecycle-Phase-1D-eligibility-IN (first-time fire if not previously deduped). Customer who received cancellation SMS won't receive an un-cancellation SMS — there's no `appointment_uncancelled` webhook. Operator workflow: customer calls back, "I want my appointment after all" → operator un-cancels → customer arrives expecting their slot, but no system confirmation went out. Manageable with operator follow-up but the system is silent. |
| `cancelled → confirmed` | **HIGH** | Same un-cancel issues + W:confirmed fires (customer who got cancelled SMS now gets confirmation SMS — potentially confusing UX but not technically broken). |
| `cancelled → in_progress` | **HIGH** | Same un-cancel issues + populate-eligibility-IN. If the cancellation freed the time slot for waitlist auto-notify (admin route only), the slot may have been re-offered. Conflict potential. |
| `cancelled → completed` | **HIGH** | Same as cancelled→in_progress + W:completed fire. Plus: the appointment never had a transaction attached (cancelled before completion), so flipping to completed creates a transaction-less completed appointment. Lifecycle Phase 1A won't fire (gates on jobs.status='closed'). Quasi-orphan state. |
| `cancelled → no_show` | **MEDIUM** | Both terminal in the previous matrix, semantically distinct: cancelled = customer cancelled in advance; no_show = customer didn't arrive. Operator workflow: customer no-show was originally logged as cancellation but should be reclassified. No webhook fire. No re-eligibility cascade (both excluded). Audit log captures the diff. Mostly low-risk but the customer-facing semantics matter. |

### D.6 — From `no_show` (5 blocked — terminal)

| Transition | Risk | Reasoning |
| --- | --- | --- |
| `no_show → pending` | **MEDIUM** | Customer arrived late, operator re-opens slot. Re-eligibility risk for lifecycle-Phase-1D-eligibility-IN (within 24h of created_at). No webhook fires on the way back to pending. Safer than `cancelled → *` because no customer-facing cancellation comm went out (no_show doesn't trigger SMS/webhook by design). |
| `no_show → confirmed` | **MEDIUM** | Same + W:confirmed fire. Customer who was a no_show now gets a "confirmation" SMS — semantically odd but not broken. |
| `no_show → in_progress` | **MEDIUM** | Same + populate-eligibility-IN. Job materialized if today/past. Operator workflow: customer arrived 20 minutes late, operator processes anyway. Reasonable. |
| `no_show → completed` | **MEDIUM** | Same + W:completed fire. Transaction must be attached separately (via POS checkout path) for accounting coherence. Operator workflow: customer arrived late, work was done, marked complete at end of day. Reasonable. |
| `no_show → cancelled` | **MEDIUM** | Same as cancelled→no_show but opposite direction. Operator workflow: no_show was wrong, customer had pre-cancelled. Reclassification. |

---

### Risk distribution summary

| Risk | Count | Transitions |
| --- | --- | --- |
| **SAFE** | 2 | `pending → in_progress`, `in_progress → no_show` |
| **MEDIUM** | 8 | `pending → completed`, `confirmed → completed`, `in_progress → confirmed`, `cancelled → no_show`, `no_show → {pending, confirmed, in_progress, completed, cancelled}` |
| **HIGH** | 11 | `confirmed → pending`, `in_progress → pending`, `completed → {pending, confirmed, in_progress, cancelled, no_show}`, `cancelled → {pending, confirmed, in_progress, completed}` |
| **CRITICAL** | 0 | No transition irreparably breaks invariants — `completed → *` lands at HIGH because the data inconsistencies are recoverable with compensating logic, not unrecoverable. |

The operator's two reported errors:
- `confirmed → pending`: **HIGH if `has_active_job`, MEDIUM otherwise**. Open only with un-materialize cascade wired into PATCH.
- `in_progress → no_show`: **SAFE.** Open without conditions.

---

## Target E — Recommended action per blocked transition

Open / open-with-guard / keep-blocked, per Target D risk.

### E.1 — Open without conditions (2)

| Transition | Action |
| --- | --- |
| `pending → in_progress` | Add to `STATUS_TRANSITIONS.pending`. No compensating logic required. |
| `in_progress → no_show` *(operator error #2)* | Add to `STATUS_TRANSITIONS.in_progress`. No compensating logic required. |

### E.2 — Open with receiver-side idempotency check (8)

These open with the standing caveat: **the n8n receiver flows for `appointment_confirmed` / `appointment_completed` MUST be idempotent** before opening any MEDIUM transition. Otherwise opening produces duplicate customer-facing notifications.

| Transition | Action |
| --- | --- |
| `pending → completed` | Open after n8n audit. |
| `confirmed → completed` | Open after n8n audit. |
| `in_progress → confirmed` | Open after n8n audit. |
| `cancelled → no_show` | Open without n8n audit (no webhook fires). |
| `no_show → pending` | Open without n8n audit. |
| `no_show → confirmed` | Open after n8n audit (W:confirmed fires). |
| `no_show → in_progress` | Open without n8n audit (no webhook fires). |
| `no_show → completed` | Open after n8n audit (W:completed fires). |
| `no_show → cancelled` | Open without n8n audit (no PATCH-side webhook; dialog→/cancel redirect works for this source state). |

### E.3 — Open with server-side compensating logic (2)

| Transition | Required compensating logic |
| --- | --- |
| `confirmed → pending` *(operator error #1)* | Wire `executeUnMaterialize` into PATCH when `has_active_job=true`. The function and the action type (`lifecycle-sync.ts:59-72` already returns `delete_job` for this case) exist; they're just not invoked from PATCH today. Without this hook, opening server-side would leave orphan jobs whenever the operator's PATCH bypasses the dialog (test, script, customer portal). |
| `in_progress → pending` | Same. |

### E.4 — Keep blocked OR require explicit un-completion path (10)

| Transition | Reasoning |
| --- | --- |
| `completed → pending`, `completed → confirmed`, `completed → in_progress` | Money-attached state. Reverting needs explicit un-completion path that handles linked `transactions` row, `jobs.status` revert, and review-request lifecycle implications. Either keep blocked OR build a `revertCompletion` companion to `executeUnMaterialize` that handles all three. |
| `completed → cancelled` | Same money-attached concern + cancelling-completed is semantically broken. The `/cancel` endpoint already rejects this with 400; closing PATCH preserves that contract. |
| `completed → no_show` | Semantically nonsensical. Keep blocked. |
| `cancelled → pending`, `cancelled → confirmed`, `cancelled → in_progress`, `cancelled → completed` | Un-cancellation needs a customer-facing notification path (no `appointment_uncancelled` webhook today) AND must reconcile with waitlist auto-notification that may have re-offered the slot. Either keep blocked OR build the un-cancel notification path. Operator workflow ("customer changed their mind") is real but the notification gap is the blocker. |

---

## Target F — Open operator decisions

The audit cannot resolve these — they are operator choices.

**Q1 — `confirmed/in_progress → pending` PATCH cascade.** Should the PATCH endpoints invoke `executeUnMaterialize` server-side when `data.status === 'pending'` AND a linked job exists? Today, the dialog intercepts via the un-materialize modal, but the server has no compensating logic. Opening these transitions without the cascade re-opens the orphan-job race for non-dialog callers (scripts, tests, future API callers). Recommended: yes, wire the cascade — `lifecycle-sync.ts:59-72`'s `delete_job` action is already shaped for this. If chosen, both transitions move from HIGH to SAFE.

**Q2 — n8n webhook idempotency audit.** Before opening any MEDIUM transition (8 of them), the operator should verify that `appointment_confirmed` and `appointment_completed` n8n flows handle re-fire gracefully (e.g., dedupe by appointment_id + timestamp window). If not, MEDIUM transitions are effectively HIGH because customer-facing duplicate SMS would result. The prior audit's Q1 — restated here as a blocker on E.2.

**Q3 — Admin/POS PATCH symmetry.** The admin PATCH at `appointments/[id]/route.ts` has NO `STATUS_TRANSITIONS` server-side enforcement (per prior audit B.1). If POS PATCH is loosened (any option), the two converge. Acceptable? OR should both endpoints enforce the same loosened matrix symmetrically?

**Q4 — `cancelled → *` un-cancellation. Is operator workflow real?** The 4 HIGH-risk un-cancel transitions hinge on whether the operator wants this workflow at all. If yes, the missing piece is an `appointment_uncancelled` webhook + customer notification. If no, keep blocked. Operator decides.

**Q5 — Silent PATCH-cancellation gap (PRE-EXISTING).** Direct PATCH with `status=cancelled` writes the row silently — no `appointment_cancelled` webhook, no `sendCancellationNotifications`, no waitlist auto-notify. The dialog redirects to `/cancel` so this gap is mooted in practice, but a scripted/test PATCH (or a future caller) bypasses the redirect. **This is a separate finding from this audit's loosening scope.** Operator decides: (a) close the gap with a server-side redirect (PATCH `status=cancelled` returns 400 with "use /cancel endpoint instead"), (b) close the gap with a server-side cascade (PATCH `status=cancelled` invokes the same notification + webhook logic), or (c) document the gap and leave it (low-risk in practice since the dialog is the only caller). Recommended: option (a) — the cleanest contract.

**Q6 — `→ no_show` notification policy.** No webhook fires today on `→no_show`. Is that intentional? Some businesses send a "we missed you" SMS to no-shows. If desired, this would be a separate add (new `appointment_no_show` webhook + n8n flow) — orthogonal to the loosening decision but adjacent. Operator decides.

**Q7 — Lifecycle Phase 1D re-eligibility on un-cancel.** When `cancelled → pending` happens within 24h of `created_at` AND `after_appointment_booked` rules have NOT yet deduped, the next cron tick WILL schedule those rules. Is that desired (customer gets a "thanks for booking" SMS after un-cancel)? OR is the desired behavior "no second-chance scheduling on un-cancel"? If the latter, an additional dedup-by-cancelled-flag would be needed in Phase 1D. Recommended: leave as-is — re-firing after un-cancel is closer to user intent.

---

## Hard-rules verification

- ✅ Worktree isolation: `~/Claude/SmartDetails/wt-status-consequence-map`, branch `audit/appointment-status-per-transition-consequence-map`, base `b0efd95f`.
- ✅ No source / migration / test changes — read-only.
- ✅ Memory #11 — every trigger claim cites file:line. Direct verification of webhook firings, cron readers, dialog intercepts, and side-path producers.
- ✅ Memory #29 Targeted — confined to PATCH-endpoint consequences and direct side paths. Did NOT expand into:
  - The actual n8n flow audit (Q2 surfaces it as operator follow-up; in-source visibility ends at the webhook URL configured in `business_settings.n8n_webhook_urls`)
  - The `appointment_no_show` webhook design (Q6 surfaces as future work)
  - The waitlist auto-notify cascade (described in A.5 but not exhaustively audited — its own consequence map would be a separate audit)
- ✅ "No effects fire" claims backed by file/line searches (e.g., A.1's "no `pending` webhook branch" is verified against `pos/appointments/[id]/route.ts:340-352` + `appointments/[id]/route.ts:140-148`'s if/else chain).

---

## Cross-references

- Prior audit: `docs/dev/APPOINTMENT_STATUS_STATE_MACHINE_AUDIT.md` (b0efd95f).
- `src/lib/appointments/status-transitions.ts:15-22` — the matrix definition.
- `src/lib/appointments/lifecycle-sync.ts:59-72, :81-103, :208-368` — sync seam: forward action map, `isEarlierState` rank helper, `executeUnMaterialize` executor.
- `src/lib/utils/webhook.ts:3-13, :20-52` — `WebhookEvent` union + `fireWebhook` implementation. Note: `appointment_no_show` is NOT in the union.
- `src/app/api/pos/appointments/[id]/route.ts:236-251, :297-329, :333-353, :373-392` — POS PATCH: status enforcement, update payload, webhook fires, audit row.
- `src/app/api/appointments/[id]/route.ts:104-130, :132-149, :166-177` — Admin PATCH: update payload, webhook fires, audit row. **No STATUS_TRANSITIONS enforcement.**
- `src/app/api/appointments/[id]/cancel/route.ts:63-67, :95-108, :110-161, :163-174` — Admin cancel endpoint: terminal guard, cancellation notifications, webhook, waitlist auto-notify, audit row.
- `src/app/api/pos/appointments/[id]/cancel/route.ts:99-104, :127-144, :146-160` — POS cancel endpoint: terminal guard, notify-gated cancellation, audit row.
- `src/app/api/pos/jobs/populate/route.ts:65` — populate gate on `status IN ('confirmed', 'in_progress')`.
- `src/app/api/pos/jobs/[id]/cancel/route.ts:104-126, :145-154` — job cancel + cascade-cancel of linked appointment.
- `src/app/api/pos/transactions/route.ts:653-659` — POS checkout writing `appointments.status='completed'` directly (no webhook).
- `src/app/api/cron/lifecycle-engine/route.ts:215-264, :419-467, :477-524, :598-704` — Phase 1A (jobs-closed → review request); Phase 1D (newly-booked); Phase 1E (cancelled); shared dedup logic.
- `src/app/api/cron/booking-reminders/route.ts:23-32, :99-102` — reminder query + `reminder_sent_at` one-shot.
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:178-182, :196-224, :478-493` — dialog: status options (recommended vs override), `→cancelled` redirect, un-materialize intercept.
- `src/lib/appointments/service-edit.ts:235-252` — separate terminal-status gate on service editing.
- `supabase/migrations/20260201000037_create_functions_triggers.sql:21` — `tr_appointments_updated_at` trigger (only DB trigger on appointments).
- `src/app/admin/settings/audit-log/page.tsx` — audit log UI surfaces `booking` entity_type entries; status diffs visible per row.
