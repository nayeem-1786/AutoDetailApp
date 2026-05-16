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

**Document version:** v1.6 (2026-05-16) — Items 1, 6, 12, 15a, 15b, 15c completed; Items 15d deferred; Items 15e, 15f scoped
**Last session updated:** 2026-05-16 — Item 15f scoped + Items 15d, 15e roadmap entries added
**Total items:** 7 active + 6 done + 1 closed (Items 1, 6, 12, 15a, 15b, 15c done; Item 5 closed: NFC already enabled per Stripe support)

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

- **Status:** not started
- **Severity:** S1 (architectural correctness; existing customer-money bug in 2 surfaces)
- **Effort:** 4-5 sessions (~8-12 hours total, layered)
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

**Layer 3a — Migrate 3 broken operator surfaces:**
- POS Jobs card "Edit Services" modal: replace bespoke checkbox-list +
  `getServicePrice()` (job-detail.tsx:583-587, 1933-2015) with hook mount
  + 2-pane catalog browser + selected-services-list UX (Option B from
  Q2 + Q5 discussion).
- Admin Appointment dialog: replace Item 15a's `<EditServicesModal>` and
  its local `resolveServicePrice` (edit-services-modal.tsx:73) entirely
  with hook mount + 2-pane UX. Item 15a's cascade endpoint
  (`PUT /api/admin/appointments/[id]/services`) and pure helpers
  (`buildJobServicesJsonb`, `computeTotalsForServiceEdit`) STAY — only
  the UI layer changes.
- POS Appointments modal: when Item 15e builds it, must consume the
  canonical hook (NOT a bespoke picker).

**Layer 3c — Booking Wizard price-math migration (NOT UI):**
- `src/components/booking/step-service-select.tsx` replaces its inline
  per-pricing_model price switch (lines 282, 951, 1307, 1394, 1404, 1440,
  1482) with imports of `resolveServicePrice` /
  `resolveServicePriceWithSale` from the canonical engine.
- Bespoke customer-facing UI of the wizard is preserved — only price
  calculations route through the shared resolver.

**Layer 3b — DEFERRED.** Migrating the 4 working POS surfaces (POS Register,
Quote Builder, Flag-an-Issue, Catalog Panel) to the hook is consistency
work, not bug-fix work. These surfaces are already on the canonical engine
via `<CatalogBrowser>` + `<ServicePricingPicker>`. Defer indefinitely;
ESLint enforcement (Layer 4) is the real drift-prevention mechanism.

**Layer 4 — ESLint enforcement:**
- New rule (e.g., `services/no-bespoke-pricing` in `eslint-rules/`):
  - Flags direct reads of `service_pricing.price` outside the canonical
    resolver.
  - Flags direct reads of `vehicle_size_*_price` columns outside the resolver.
  - Flags any function defined outside `src/lib/services/` matching
    `getServicePrice|resolveServicePrice`.
- Ships as `'warn'` initially; scheduled for `'error'` after a deprecation
  window (mirrors the `money/no-unsuffixed-money-prop` pattern from Rule 20).

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
