# Appointment + Job Status Flow Audit — Phase 1 Layer 8d-bis

> Read-only audit. No code changes.
>
> **Date:** 2026-05-17
> **Driver:** Phase 1 Layer 8d UAT surfaced that the POS appointment edit
> flow refuses some non-terminal statuses (user-reported as "in_progress
> blocked", though the actual guard is `completed`/`cancelled`).
> Additionally, UAT data showed `appointments.status = 'in_progress'` +
> linked `jobs.status = 'scheduled'` co-occurring — leaving open whether
> this is design, drift, or undocumented behavior. This audit catalogues
> every status writer across both tables, traces the intended state
> machines, and refines the Layer 8d-bis F1 whitelist before code lands.
>
> **TL;DR (read before §7):**
> 1. `appointments.status` and `jobs.status` are **intentionally orthogonal**.
>    Appointments model the customer-visit lifecycle (pending → confirmed
>    → in_progress → completed); jobs model the operational ticket queue
>    (scheduled → intake → in_progress → pending_approval → completed →
>    closed). They share `in_progress`/`completed`/`cancelled` keywords but
>    transition independently — there is **no auto-sync trigger** between
>    them at the DB layer.
> 2. The UAT divergence (`appt=in_progress` + `job=scheduled`) is normal
>    for **POS walk-ins** — `src/app/api/pos/jobs/route.ts:387` creates
>    appointments at `in_progress` and the linked job at `scheduled`
>    atomically. Same divergence is also reachable via the admin
>    appointment-status dropdown (`STATUS_TRANSITIONS` at
>    `src/app/admin/appointments/types.ts:24` allows `confirmed → in_progress`
>    independent of any job state).
> 3. Layer 8b's load endpoint currently allows `in_progress` (only
>    `completed`/`cancelled` are refused). The user's "in_progress
>    blocked" framing is **incorrect** — the actual gap is that
>    `no_show` IS currently allowed but shouldn't be. F1 whitelist
>    update is: **refuse `completed`, `cancelled`, AND `no_show`**.
>    `pending`, `confirmed`, `in_progress` should all load successfully.
> 4. There is no separate "in_progress blocker" — verify the UAT
>    repro before any code change. If a real 400 was observed on an
>    in_progress appointment, it must be coming from a different surface
>    (e.g., the cascade endpoint or some upstream guard not yet identified).

---

## Section 1 — Status enum inventory

### 1.1 `appointments.status`

| Property | Value |
|---|---|
| Type | Postgres ENUM `appointment_status` |
| Definition | `DB_SCHEMA.md:3221` |
| Values | `pending`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show` |
| Constraint | NOT NULL DEFAULT `'pending'` |
| Schema row | `DB_SCHEMA.md:152` |

### 1.2 `jobs.status`

| Property | Value |
|---|---|
| Type | TEXT with CHECK constraint (NOT an enum) |
| Definition | `jobs_status_check` at `DB_SCHEMA.md:1230` |
| Values | `scheduled`, `intake`, `in_progress`, `pending_approval`, `completed`, `closed`, `cancelled` |
| Constraint | NOT NULL DEFAULT `'scheduled'` |
| Schema row | `DB_SCHEMA.md:1208` |

### 1.3 Shared vocabulary, separate state machines

Three values appear in both: `in_progress`, `completed`, `cancelled`. These
share the same string token but mean different things in each table —
appointments track the customer's visit; jobs track the operational ticket.
Reading them as the same status is the audit's first warning sign.

### 1.4 Database triggers (none mutate status)

`supabase/migrations/20260201000037_create_functions_triggers.sql` defines
the canonical trigger set. Only `tr_appointments_updated_at` (and a future
`tr_jobs_updated_at` if added) touch these tables — both are
`update_updated_at()` BEFORE-UPDATE bumpers that don't read or write
`status`. **There is no DB trigger that mutates either status column.**
Every status write traced below is application-level code.

---

## Section 2 — `appointments.status` writers

Eight code paths write `appointments.status`. Organized by the resulting
status value:

### 2.1 `pending` (INSERT — newly-created appointments without payment)

| File | Lines | When |
|---|---|---|
| `src/app/api/book/route.ts` | 327, 341 | Online booking with no payment_intent_id (no deposit). Customer self-service `/book` flow. |
| `src/app/api/voice-agent/appointments/route.ts` | 511-525 | ElevenLabs voice agent creates appointment from a phone call. Always lands in `pending` for admin review. |

Both INSERTs only — no transitions to `pending`. The default value
(`DEFAULT 'pending'`) handles fallbacks.

### 2.2 `confirmed` (INSERT — paid or staff-created appointments)

| File | Lines | When |
|---|---|---|
| `src/app/api/book/route.ts` | 327, 341 | Online booking WITH `payment_intent_id` (deposit paid via Stripe). Status = `confirmed` to skip admin review. |
| `src/lib/quotes/convert-service.ts` | 130 | Quote-to-appointment conversion (POS / admin / voice). Default = `'confirmed'` per `options.appointmentStatus ?? 'confirmed'`. Voice agent overrides to `'pending'` (per its `ConvertQuoteOptions`). |

### 2.3 `in_progress` (INSERT — walk-in atomic create)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/jobs/route.ts` | 387 | POS Walk-in flow. Creates synthetic appointment (`channel='walk_in'`, `payment_type='pay_on_site'`) at status `in_progress` directly. Linked job is created at `status='scheduled'` (line 476) in the same transaction. **This is the primary source of the "appt=in_progress + job=scheduled" divergence pattern.** |

### 2.4 `in_progress` / any-value (UPDATE — admin dropdown)

| File | Lines | When |
|---|---|---|
| `src/app/api/appointments/[id]/route.ts` (PATCH) | 109, 117-122 | Admin appointment-detail dialog status dropdown. Gated by `appointments.update_status` permission. Accepts any value passed in `body.status` — no server-side transition validation (the client `STATUS_TRANSITIONS` map at `src/app/admin/appointments/types.ts:22-29` is UI-only; bypassing the client lets you write anything the enum allows). |

This is the path that lets an admin set `appointments.status = 'in_progress'`
even on a non-walk-in appointment. Fires `appointment_confirmed` /
`appointment_completed` webhooks on those specific transitions only —
`in_progress` transitions DO NOT fire a webhook (lines 132-149).

### 2.5 `completed` (UPDATE — transaction commit, the canonical close-out)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/transactions/route.ts` | 654-660 | POS Sale checkout commits. When the transaction has an `appointment_id` (via the linked job), the appointment is UPDATEd to `'completed'`. Synchronous with the job's `'closed'` transition (line 647). Same-effect-block — both writes happen if the surrounding job-link block succeeds. |

This is **the only writer that transitions an appointment to `completed`**
in normal flow. The admin dropdown (§2.4) could also set it, but that's
an out-of-band override.

### 2.6 `cancelled` (UPDATE — 4 cancellation surfaces)

| File | Lines | Who triggers | Notes |
|---|---|---|---|
| `src/app/api/appointments/[id]/cancel/route.ts` | 75-90 | Admin appointment cancel | Sets `status='cancelled'`, `cancellation_fee`, `cancellation_reason`. Fires `appointment_cancelled` webhook + sends customer SMS/email if `notify_customer`. |
| `src/app/api/pos/appointments/[id]/cancel/route.ts` | 107-115 | POS appointment cancel (Item 15b) | Same shape, POS-side auth, `notify_customer` defaults to false. |
| `src/app/api/customer/appointments/[id]/cancel/route.ts` | 75-85 | Customer-portal self-cancel | Same shape, customer auth, always notifies. |
| `src/app/api/pos/jobs/[id]/cancel/route.ts` | 141-150 | POS job cancel (cascades) | When a job is cancelled, this ALSO sets the linked `appointments.status='cancelled'`. The only writer where the job-side cancel propagates to the appointment side. |

### 2.7 `no_show` (UPDATE — admin dropdown ONLY)

No dedicated endpoint, no cron, no trigger. The ONLY writer is the admin
dialog status dropdown via the generic PATCH route §2.4. `pending` →
`no_show` and `confirmed` → `no_show` are both allowed per
`STATUS_TRANSITIONS` (UI-side). No webhook fires for this transition.

### 2.8 Audit summary — appointment status transitions in the wild

```
INSERT default        → pending           (book.ts no-payment, voice-agent)
INSERT explicit       → confirmed         (book.ts with deposit, convert-service)
INSERT explicit       → in_progress       (pos/jobs walk-in only)
PATCH any → any       → any               (admin dropdown — bypasses client UI map)
checkout commit       → completed         (pos/transactions; only canonical close)
cancel endpoints (4)  → cancelled         (admin/pos/customer + jobs cascade)
admin dropdown        → no_show           (no other writer)
```

**No automatic cron, lifecycle-engine, or background job mutates
`appointments.status`.** This was verified by searching
`api/cron/lifecycle-engine/route.ts`, `api/cron/booking-reminders/route.ts`,
and the lifecycle module — none update `appointments.status`.

---

## Section 3 — `jobs.status` writers

Seven code paths. Organized by resulting status:

### 3.1 `scheduled` (INSERT — newly-created jobs)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/jobs/route.ts` | 476 | POS walk-in atomic job create (parallel with the §2.3 appointment INSERT). |
| `src/app/api/pos/jobs/populate/route.ts` | 150 | Daily populate cron — turns `appt.status IN ('confirmed', 'in_progress')` appointments into jobs at `scheduled`. Reads filter at line 55. **Same-day or next-day jobs only.** |

Both surfaces always create jobs at `scheduled`.

### 3.2 `intake` (PATCH — Start Intake action)

| File | Lines | When |
|---|---|---|
| `src/app/pos/jobs/components/job-detail.tsx:handleStartIntake` | 383-406 (calls generic PATCH) | Detailer clicks "Start Intake" on the POS Jobs card. Issues `PATCH /api/pos/jobs/[id]` with `{ status: 'intake', intake_started_at: <now> }`. |
| `src/app/api/pos/jobs/[id]/route.ts` (PATCH) | 109-225 | Generic job PATCH handler. Accepts `status` in the WORKFLOW_FIELDS list (line 113). No transition validation server-side — client-side step buttons enforce the legal transitions. |

### 3.3 `in_progress` (POST — Start Work action)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/jobs/[id]/start-work/route.ts` | 50-65 | Detailer clicks "Start Work" after intake completes. **Server-side guard**: refuses unless `status === 'intake'` AND `intake_completed_at IS NOT NULL` (lines 34-46). Sets `status='in_progress'`, `work_started_at`. **Does NOT touch `appointments.status`.** |

This is the dedicated transition route for the most "important" job step
(work begins, timer starts). The dedicated endpoint exists because of the
server-side state guard — the generic PATCH wouldn't enforce
`intake_completed_at IS NOT NULL`.

### 3.4 `completed` (POST — Complete Job action)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/jobs/[id]/complete/route.ts` | 50-94 | Detailer clicks "Complete" — finalizes timer, generates gallery token, fires customer notifications. **Server-side guard**: refuses unless `status === 'in_progress'` (line 50). Sets `status='completed'`, `work_completed_at`, `gallery_token`. **Does NOT touch `appointments.status`** — the job is done but the customer hasn't paid yet (appt stays at `confirmed`/`in_progress` until checkout commits). |

### 3.5 `closed` (UPDATE — transaction commit / link-transaction)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/transactions/route.ts` | 643-651 | POS Sale checkout commit. When a `completed` job is linked to this transaction, status flips to `closed`. Same atomic block ALSO sets `appointments.status = 'completed'` (lines 654-660) — **the only place both columns transition together**. |
| `src/app/api/pos/jobs/[id]/link-transaction/route.ts` | 44-47 | Alternative manual link path. Same effect (job→closed) but no appointment-side write. Rarely used — primary close-out goes through `/api/pos/transactions`. |

### 3.6 `cancelled` (UPDATE — job cancel endpoint)

| File | Lines | When |
|---|---|---|
| `src/app/api/pos/jobs/[id]/cancel/route.ts` | 95-114 | Operator cancels the job. Sets `status='cancelled'`, `cancellation_reason`, `cancelled_at`, `cancelled_by`. **Also cascades to appointment** (lines 141-150) — sets `appointments.status='cancelled'` if `appointment_id` is present. |

### 3.7 `pending_approval` (transition path: NOT WIRED)

The enum lists `pending_approval` but the codebase has no writer that
sets it. Searched for `status: 'pending_approval'` / `status === 'pending_approval'`:
- `pos/jobs/page.tsx:46` and `admin/jobs/page.tsx:60-68` reference it for
  UI dropdown labels + filter UI only.
- No write site.

This is **dead enum capacity** — likely a forward-looking value for the
add-on approval flow that's currently routed through `job_addons.status`
instead. Worth flagging for the post-Phase-1 cleanup pass; out of Layer
8d-bis scope.

### 3.8 Audit summary — job status transitions in the wild

```
INSERT                → scheduled         (walk-in + populate cron)
PATCH explicit        → intake            (Start Intake — generic PATCH)
POST start-work       → in_progress       (dedicated route with guards)
POST complete         → completed         (dedicated route with guards)
checkout commit       → closed            (pos/transactions; parallel appt → completed)
job cancel            → cancelled         (also cascades to appt → cancelled)
pending_approval      → (no writer; dead enum slot)
```

**No automatic cron, lifecycle-engine, or background job mutates
`jobs.status`.** Verified the same way as appointments.

---

## Section 4 — Cross-table status divergence

### 4.1 Where the divergence originates

Two code paths produce the UAT-observed `appt=in_progress` + `job=scheduled`:

**Path A — POS walk-in (most common in production):**
`src/app/api/pos/jobs/route.ts:381-414`. Walk-in atomic create writes
`appointments.status = 'in_progress'` (line 387) AND `jobs.status = 'scheduled'`
(line 476) in the same request. By design — see §4.2.

**Path B — Admin override:**
`src/app/api/appointments/[id]/route.ts:117` PATCH route accepts any
`status` value (gated only by the `appointments.update_status` permission).
An admin who manually sets `appt.status` from `confirmed` → `in_progress`
via the dialog dropdown leaves the linked job untouched at whatever it was
(`scheduled` if intake hasn't started). No cascade to job-side.

### 4.2 Is this by design?

**Yes, by design.** The two columns model different concerns:

| Column | Models |
|---|---|
| `appointments.status` | The customer's visit lifecycle. "Where is the customer in the chain pending → confirmed → in_progress → completed?" Walk-ins are born `in_progress` because the customer is physically present and being served. |
| `jobs.status` | The operational ticket queue. "Where is this work-order through scheduled → intake → in_progress → completed → closed?" Independent of customer presence — the job can be at `scheduled` even while the customer is physically present, as long as the detailer hasn't clicked "Start Intake" yet. |

The walk-in pattern is the cleanest illustration: a customer walks in at
10am, cashier creates the appointment + job; appointment is "in_progress
visit" (customer here), but the detailer hasn't started intake — job is
still queued.

The only place both columns transition together is at checkout commit:
`pos/transactions/route.ts:643-660` writes `job.status='closed'` AND
`appt.status='completed'` in the same block. Every other transition is
independent.

### 4.3 Is divergence a "bug" requiring separate fix?

**No, none required for Layer 8d-bis.** The columns are orthogonal by
design, and the documented divergence patterns are all reachable via legitimate
flows (walk-in atomic create, admin status override, job-side intake
transitions). No code path is "supposed to keep them in sync but missed."

The one mild inconsistency worth noting (but out of scope for 8d-bis):
- Job cancel cascades to appointment cancel (§3.6).
- Appointment cancel does NOT cascade to job cancel — see the four cancel
  endpoints in §2.6. If an operator cancels the appointment via the admin
  dialog, the linked job stays at `scheduled` / `intake` / `in_progress`.
  No one has reported issues; the job-side cancel cron / UI doesn't pick
  up cancelled-appt jobs.

Documenting that asymmetry here for future cleanup; it doesn't affect F1.

---

## Section 5 — Intended vs. actual state machines

### 5.1 `appointments.status` state machine

Intended (per `STATUS_TRANSITIONS` at
`src/app/admin/appointments/types.ts:22-29`):

```
pending ─┬─► confirmed ──┬─► in_progress ──┬─► completed
         │               │                 │
         └──► cancelled  ├──► cancelled    └──► cancelled
         │               │
         └──► no_show    └──► no_show
```

**Actual transitions in production code:**

- **`pending` → `confirmed`**: admin dropdown. No automated writer.
- **`pending` → `cancelled` / `no_show`**: admin dropdown OR cancel endpoints.
- **`confirmed` → `in_progress`**: admin dropdown (manual). No automated writer.
- **`(any non-terminal)` → `completed`**: `pos/transactions/route.ts:657` at
  checkout commit, only when a linked job exists.
- **`confirmed` → `cancelled`**: 4 cancel endpoints (admin, POS, customer,
  job-cascade) per §2.6.
- **`in_progress` → `completed`**: same as above (checkout commit).
- **`in_progress` → `cancelled`**: POS job cancel cascade (§3.6) only — no
  other route.

**"Back doors" that violate the STATUS_TRANSITIONS map:**

- `PATCH /api/appointments/[id]` accepts any value passed (line 117). The
  STATUS_TRANSITIONS map is UI-only; a curl request could write
  `pending → completed` or `completed → pending`. No server-side
  guardrails. Acceptable risk (gated on `appointments.update_status`
  permission — admin/super_admin only).
- POS walk-in (`pos/jobs/route.ts:387`) skips `pending` and `confirmed`
  and INSERTs directly at `in_progress`. Legitimate per the design intent
  (walk-ins haven't gone through the pending/confirmed phases).

### 5.2 `jobs.status` state machine

There is no explicit `STATUS_TRANSITIONS` map for jobs in the codebase
(searched — none found). The intended state machine is enforced
ad-hoc by dedicated transition endpoints:

```
scheduled ──► intake ──► in_progress ──┬──► completed ──► closed
   │            │            │         │
   │            │            │         ├─► cancelled
   │            │            │         │
   └────► cancelled ◄────────┴─────────┘
```

**Server-side guards (the only enforced transitions):**

- `intake → in_progress`: `start-work/route.ts:34-46` refuses unless
  `status === 'intake'` AND `intake_completed_at IS NOT NULL`.
- `in_progress → completed`: `complete/route.ts:50` refuses unless
  `status === 'in_progress'`.
- Generic PATCH `/api/pos/jobs/[id]` includes `status` in WORKFLOW_FIELDS
  (line 113) with no transition validation — clients are trusted to send
  legal values.

**Back doors:**
- The generic PATCH (line 109-225) accepts any status. The TERMINAL_STATUSES
  guard at line 171 prevents editing OTHER manage-only fields when status
  is terminal, but doesn't prevent the status itself from being written
  to any value. A staff member with POS access can in theory write
  `closed` directly via PATCH, bypassing the checkout flow.

### 5.3 Cross-table transition map

The only cross-table writers:

```
checkout commit (pos/transactions):
  appt: <any non-terminal> → completed
  job:  completed           → closed

POS job cancel (pos/jobs/[id]/cancel):
  job:  <any non-terminal>  → cancelled
  appt: <any non-terminal>  → cancelled

No other cross-table writer.
```

What's NOT cross-cascaded:
- Admin appointment cancel does NOT cancel the linked job.
- Admin appointment status change (via PATCH dropdown) does NOT touch job.
- Job intake / start-work / complete transitions do NOT touch appointment.

---

## Section 6 — Layer 8b load endpoint status-guard analysis

### 6.1 Current guard

`src/app/api/pos/appointments/[id]/load/route.ts:75-80`:

```ts
if (appt.status === 'completed' || appt.status === 'cancelled') {
  return NextResponse.json(
    { error: `Cannot edit services on an appointment with status "${appt.status}"` },
    { status: 400 }
  );
}
```

**Allowed statuses (current):** `pending`, `confirmed`, `in_progress`, **`no_show`** ←
the gap.
**Refused statuses (current):** `completed`, `cancelled`.

### 6.2 Layer 8a cascade endpoint (PUT) guard

`src/lib/appointments/service-edit.ts:235-242`:

```ts
if (
  appointment.status === 'completed' ||
  appointment.status === 'cancelled'
) {
  throw new ServiceEditError('INVALID_STATUS', 400, ...);
}
```

Same guard as the load endpoint. `no_show` would currently pass the cascade
too.

### 6.3 The user's "in_progress blocked" report

The session brief stated Layer 8b "refuses to load appointments in
`in_progress` status." **The code does not contain that block.** `in_progress`
is currently allowed at both the load and cascade endpoints (verified at
`load/route.ts:75` and `service-edit.ts:235`).

Possible explanations:
1. The UAT failure was on a `completed` appointment that the user perceived
   as "in_progress" (perhaps the linked job was at `in_progress` while the
   appointment had already flipped to `completed` via checkout).
2. The UAT failure was an unrelated error (e.g., 404 from a bogus
   `sourceId`) misattributed to the status guard.
3. The user's framing was a paraphrase, and the actual failure mode was on
   a different status — e.g., `no_show`, which IS currently allowed but
   probably shouldn't be (see §6.4).

**Recommendation:** ask the user to reproduce with the exact appointment
ID and check the 400 response body before assuming `in_progress` is the
blocker. The code shows it isn't.

### 6.4 What F1 (refuse terminal-only) should actually be

Per §5.1 the appointment status enum has six values:

| Status | Editable? | Reason |
|---|---|---|
| `pending` | ✅ Yes | Pre-confirmation; admin/operator may need to fix services before confirming. |
| `confirmed` | ✅ Yes | Booked but not started; the canonical "I need to add a service" case. |
| `in_progress` | ✅ Yes | Walk-ins and admin-overridden states. Editing in-flight services is core to Phase 1's purpose. |
| `completed` | ❌ No | Transaction committed. Editing services would create a divergence between `appointment_services` and `transaction_items`; the latter is the legal record. |
| `cancelled` | ❌ No | Slot freed, no service is being delivered. |
| `no_show` | ❌ No | Customer didn't show up; no service is being delivered. Editing here makes no sense and likely creates auditor confusion. |

**Layer 8d-bis F1 whitelist update:**
- Refuse: `completed`, `cancelled`, **`no_show`** (add).
- Allow: `pending`, `confirmed`, `in_progress`.

### 6.5 Job-side status interaction (out of F1 scope, flagged)

The load endpoint at `src/app/api/pos/appointments/[id]/load/route.ts`
reads ONLY from the `appointments` table. It does not check the linked
`jobs.status` (and indeed has no job-side fetch).

The cascade endpoint at `src/lib/appointments/service-edit.ts` queries
the linked job at line 309 but uses it only for the JSONB sync, not for
status guarding.

**Edge case worth flagging:** an appointment at `in_progress` whose linked
job is at `completed` (work done, photos taken, customer hasn't paid
yet — appointment hasn't transitioned to `completed`). Editing services
in this window would change the appointment + cascade to `jobs.services`,
but the work is already done — the operator's edit is semantically
nonsensical.

Today's guard doesn't catch this. Whether to add it depends on UX intent:
- If the post-complete-pre-checkout window should be editable for
  late-discovered changes (e.g., "we forgot to add the headlight restoration
  to the ticket"): keep current behavior, no guard needed.
- If editing should be locked once work is complete: add a job-side guard
  `if (linkedJob?.status === 'completed' || linkedJob?.status === 'closed')`.

**Recommendation:** keep current behavior, flag for future UAT. Not in
F1 scope.

---

## Section 7 — Recommendations

### 7.1 F1 whitelist update — actionable

Update **two** guard sites (must be consistent — load and cascade should
refuse the same set so a load success implies a save can succeed):

1. **`src/app/api/pos/appointments/[id]/load/route.ts:75-80`**

   Change from:
   ```ts
   if (appt.status === 'completed' || appt.status === 'cancelled') { ... }
   ```
   To:
   ```ts
   if (['completed', 'cancelled', 'no_show'].includes(appt.status)) { ... }
   ```

2. **`src/lib/appointments/service-edit.ts:235-242`**

   Same change to the cascade endpoint's guard. Update the corresponding
   route tests (`src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts`
   already has `'returns 400 on completed appointment'` and
   `'returns 400 on cancelled appointment'`; add a `'returns 400 on no_show appointment'`
   case).

3. **`src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts`** — add
   a parallel `'returns 400 on no_show appointment'` case to the load tests.

Effort: ~15 minutes of editing + tests.

### 7.2 The "in_progress blocked" report needs verification

The code does not block `in_progress`. Before shipping F1, the user should
either:
- Re-reproduce the failure and capture the appointment's actual status
  + the 400 response body.
- Confirm the original report was about `no_show` or `completed` (mis-
  reported as `in_progress`).

If the report turns out to be a real `in_progress` 400, it's coming from
a code path NOT identified in this audit and the F1 fix may not address
the user's UAT failure. Verify before shipping.

### 7.3 Cross-table divergence — no fix needed, document the design

The `appt.status` and `jobs.status` columns are orthogonal by design. The
UAT-observed divergence (`appt=in_progress` + `job=scheduled`) is normal
for walk-ins and admin overrides. **No code change required.**

Recommend: add a short paragraph to `docs/dev/ARCHITECTURE.md` or
`docs/dev/DB_SCHEMA.md` explaining the orthogonal-by-design relationship
so future engineers don't waste time chasing it as a bug. Out of scope
for Layer 8d-bis itself.

### 7.4 Follow-up items (out of F1 scope, worth tracking)

| # | Item | Severity | Notes |
|---|---|---|---|
| 1 | `pending_approval` is a dead enum value with no writer | Low | Likely intended for add-on approval flow that ended up on `job_addons.status` instead. Drop from the CHECK constraint in a future cleanup migration. |
| 2 | Admin appointment cancel does NOT cascade to job cancel | Medium | Job stays in queue with a cancelled appointment behind it. No reports of issues; document the asymmetry. |
| 3 | Generic PATCH /api/appointments/[id] accepts any status value | Medium | The client-side `STATUS_TRANSITIONS` map is the only transition validation. A future hardening pass could move that validation server-side. |
| 4 | Generic PATCH /api/pos/jobs/[id] accepts any status value (incl. `closed` skipping the transaction-commit path) | Medium | Same concern. |
| 5 | Post-complete-pre-checkout job-side guard | Low | Whether to lock service edits once `jobs.status='completed'` but before transaction commit. Decide via UAT. |
| 6 | `no_show` rendering UX in POS | Low | Confirm POS Sale tab doesn't show `no_show` appointments in any "active" list. Per `pos/jobs/components/job-detail.tsx:865` `no_show` is excluded from action buttons; full audit deferred. |

### 7.5 Status guard summary

After F1 lands, the canonical "appointment-is-editable" predicate is:

```
appt.status NOT IN ('completed', 'cancelled', 'no_show')
```

If a future need arises to gate on the linked job's status too, add a
sibling predicate `linkedJob?.status NOT IN ('completed', 'closed', 'cancelled')`
to the cascade endpoint — both predicates must hold. F1 doesn't take this
step.

---

## Appendix A — Files referenced

### Database schema

- `docs/dev/DB_SCHEMA.md` §appointments (lines 144-206), §jobs (1198-1244),
  §Enums (3218-3243)
- `supabase/migrations/20260201000037_create_functions_triggers.sql` —
  trigger inventory (no status-touching triggers)

### Status writers (read-only inspected)

Appointment writers:
- `src/app/api/book/route.ts` (online booking INSERT)
- `src/app/api/voice-agent/appointments/route.ts` (voice INSERT)
- `src/lib/quotes/convert-service.ts` (quote conversion INSERT)
- `src/app/api/pos/jobs/route.ts` (walk-in INSERT + appt INSERT)
- `src/app/api/appointments/[id]/route.ts` (admin PATCH — generic)
- `src/app/api/pos/transactions/route.ts` (checkout commit UPDATE)
- `src/app/api/appointments/[id]/cancel/route.ts` (admin cancel)
- `src/app/api/pos/appointments/[id]/cancel/route.ts` (POS cancel)
- `src/app/api/customer/appointments/[id]/cancel/route.ts` (customer cancel)
- `src/app/api/pos/jobs/[id]/cancel/route.ts` (job cancel → appt cascade)

Job writers:
- `src/app/api/pos/jobs/route.ts` (walk-in)
- `src/app/api/pos/jobs/populate/route.ts` (populate cron)
- `src/app/api/pos/jobs/[id]/route.ts` (generic PATCH — start-intake +
  intake-complete + workflow fields)
- `src/app/api/pos/jobs/[id]/start-work/route.ts` (dedicated)
- `src/app/api/pos/jobs/[id]/complete/route.ts` (dedicated)
- `src/app/api/pos/transactions/route.ts` (checkout commit → closed)
- `src/app/api/pos/jobs/[id]/link-transaction/route.ts` (alt close path)
- `src/app/api/pos/jobs/[id]/cancel/route.ts` (job cancel)

### State-machine reference

- `src/app/admin/appointments/types.ts:22-29` — `STATUS_TRANSITIONS` map
  (UI-only — not enforced server-side)

### Layer 8 endpoints (read-only inspected)

- `src/app/api/pos/appointments/[id]/load/route.ts` — Layer 8b load endpoint
- `src/lib/appointments/service-edit.ts` — Layer 8a cascade helper

### Documentation

- `docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` §4.3 (edge cases /
  status guards)
- `docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md` (Layer 8c rationale —
  status guards are upstream of the modifier-edit work)
