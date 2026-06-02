# Public Booking — Architectural Audit (Concerns 1 + 2, Expanded Scope)

> Read-only architectural audit, 2026-06-02. Branch:
> `audit/public-booking-architectural-coherence-expanded`.
>
> Memory #29 type: **Architectural** (system-level soundness, not
> per-component). The audit's job is to map the design space and
> surface decisions — not to recommend the answer.
>
> Two operator-identified concerns being addressed together because
> they share a root cause (under-defined public-booking ↔ POS ↔
> customer-account data model):
>
> **Concern 1 (original):** The public booking flow's single-primary
> ticket structure feels disjoint relative to POS's multi-primary
> ticket model.
>
> **Concern 2 (new, post-#139):** Logged-in customers who add a new
> vehicle during booking are perceived to never have that vehicle
> surface in their account "Saved Vehicles" list. (Audit will show
> this perception is partially incorrect at the data layer but
> entirely correct at the UX layer — a transparency gap, not a
> persistence gap.)
>
> **Critical prerequisite reading** —
> `docs/dev/SPECIALTY_VEHICLE_BLOCK_TRIGGER_DIAG.md` (merged
> 2026-06-02 immediately before this audit) corrected a mental-model
> drift: "specialty vehicle" (the codebase short-circuit) ≠
> "RV/Boat/Aircraft" (the vehicle_category enum) ≠ "staff_assessed"
> (the per-service quote-required flag). The three are orthogonal
> axes. This audit holds the distinction throughout.

---

## TL;DR

There are **three distinct architectural paths** through the public
booking surface — not one. The operator and prior audits implicitly
conflated them. Spelling them out:

| Path | Trigger | Outcome | Ticket created? |
| --- | --- | --- | --- |
| **Normal flow** (Step 1 → 2 → 3 → 4 → `/api/book`) | Default | `appointments` + `appointment_services` + (optional) `transactions` deposit row | YES |
| **Specialty-vehicle short-circuit** (Step 1, replaces flow) | `vehicleData.size_class ∈ {exotic, classic}` (classifier-only) | `audit_log` + staff SMS + customer ack SMS | **NO** |
| **Staff-assessed short-circuit** (Step 2, replaces configure panel) | `selectedService.staff_assessed === true` | `audit_log` + staff SMS + customer ack SMS | **NO** |

Both short-circuits POST to `/api/public/specialty-callback` with a
`request_type` discriminator. Neither writes a customers, vehicles,
or appointments row. They are **lead-capture terminators**, not
booking-creation paths. The audit findings apply only to the
**Normal flow** unless a short-circuit-specific note is called out.

**Concern 1 finding.** Public booking's Normal flow is **structurally
single-primary** at four layers: client state shape
(`booking-wizard.tsx:87-104` carries `service: BookableService` and
`config: ConfigureResult` — singular), client Step 2 selection
(`step-service-select.tsx:170` carries `pendingServiceId: string |
null`), submission shape (`bookingSubmitSchema` at
`validation.ts:364-401` accepts one `service_id` + N `addons`), and
server insert (`/api/book/route.ts:489-503` inserts one primary +
addon rows into `appointment_services`). POS is structurally
multi-primary: `ticket-reducer.ts` state is `items: TicketItem[]`
(`ticket-reducer.ts:5`) with item-level `parentItemId` linkage
(`ticket-reducer.ts:181-192`) — no global "selectedService"
concept; any number of primaries with their own addon trees can
co-exist.

The DB schema NEITHER enforces NOR opposes multi-primary:
`appointment_services` is a many-to-one junction
(`DB_SCHEMA.md:154`) that already supports multiple service rows
per appointment, but the booking API only ever writes one
"primary" row + N addon rows distinguished by which client-supplied
field they came from, not by a schema-level flag. So lifting
single-primary is a UI + API job, not a schema job.

**Concern 2 finding.** Logged-in customers' new vehicles **ARE**
persisted to the same `vehicles` table that the portal "Saved
Vehicles" page reads from. `/api/book/route.ts:324-352` calls
`findOrCreateVehicle(customerId, ...)` which writes to `vehicles`
with `customer_id = customerId`
(`vehicle-helpers.ts:188-204`); `/api/customer/vehicles GET`
reads `vehicles WHERE customer_id = customer.id`
(`/api/customer/vehicles/route.ts:34-38`). They are the same
table. The operator's stated mental model — "never persisted" — is
**factually incorrect at the data layer**. But the perception
behind it has a real root: there is **no UI confirmation, no
"Save to my account?" toggle, no consent, and no post-booking
notification** that the vehicle was added. The booking confirmation
shows the appointment but does not surface vehicle-save status.
This is a **transparency/consent gap**, not a persistence gap. The
distinction matters because the fix shapes are completely
different: a persistence gap would require schema or write-path
work; a transparency gap requires UX work only.

**Three paths forward (T7):**

- **Path A** — Document both as intentional. Normal flow stays
  single-primary (matches operator's "simpler customer surface"
  posture); for Concern 2 add a small "Vehicle saved to your
  account" toast or post-confirmation banner. ~1 session.
- **Path B** — Partial restructure. Single-primary stays;
  prereq enforcement (W5) + addon vehicle_compat (W7) +
  Concern-2 transparency toggle (with operator-set default)
  land together. ~3 sessions.
- **Path C** — Full restructure. Public booking becomes
  POS-shape: multi-primary, prereq enforcement, addon-on-primary
  attachment, "Save vehicle" + "Save card" + "Save address" as
  first-class consent surfaces. Treats the booking flow as a
  thin customer-trust wrapper around the same canonical
  ticket-shape POS uses. ~4-6 sessions, touches ~15-25 files,
  DB-schema-touching for `appointment_services.is_primary`.

The audit does not recommend a path — that's the operator's call.
It maps the dimensions evenly so the choice is grounded.

---

## Critical context — the three architectural paths

> Foundational scoping. Every target T1-T9 below distinguishes
> which path it applies to. Future readers should not re-conflate.

### Path 1 — Normal booking flow

Step 1 (vehicle pick) → Step 2 (service select + configure) →
Step 3 (schedule) → Step 4 (customer info + payment) → POST
`/api/book` → `appointments` row created.

Files: `booking-wizard.tsx`, `step-vehicle.tsx`,
`step-service-select.tsx`, `step-schedule.tsx`,
`step-confirm-book.tsx`, `step-payment.tsx`, `inline-auth.tsx`,
`api/book/route.ts` (+ `_classification.ts`,
`_mobile-eligibility.ts`, `_staff-assessed.ts`, `_pricing.ts`).

Schema writes: `customers`, `vehicles`, `appointments`,
`appointment_services`, `transactions` (when deposit), `payments`,
`transaction_items`, `sms_consent_log` (when opt-in),
`audit_log`.

This is the path Concerns 1 + 2 attach to.

### Path 2 — Specialty-vehicle short-circuit

Step 1 vehicle entry → classifier returns
`size_class ∈ {exotic, classic}` → `<SpecialtyVehicleBlock>` REPLACES
the rest of the wizard → POST
`/api/public/specialty-callback` with
`request_type='specialty_vehicle'`.

Trigger: `booking-wizard.tsx:748` checks
`vehicle.size_class === 'exotic' || vehicle.size_class === 'classic'`
and flips `showSpecialtyBlock`. Customers CANNOT self-pick exotic
or classic (`CUSTOMER_SELF_SERVICE_SIZE_CLASSES` at
`constants.ts:75-79` restricts the dropdown); only the classifier
produces those values.

Schema writes: `audit_log` only. NO `customers`, NO `vehicles`,
NO `appointments`. The customer becomes a LEAD, not a booking.

### Path 3 — Staff-assessed short-circuit

Step 2 service select → customer picks a service with
`services.staff_assessed === true` → `<RequestQuoteCard>` REPLACES
the configure panel → POST `/api/public/specialty-callback` with
`request_type='staff_assessed_service'`.

Trigger: `step-service-select.tsx:398` checks
`selectedService.staff_assessed` and short-circuits the configure
panel. Secondary defense: `_staff-assessed.ts`'s
`checkNotStaffAssessed` rejects at `/api/book` if a tampered
request reaches that endpoint
(`/api/book/route.ts:153-162`).

Schema writes: `audit_log` only. Same lead-capture pattern as
Path 2. Forward-extensible via the `request_type` discriminator
for F2 (RV/Boat/Aircraft non-priced).

**Both short-circuit paths share `<QuoteRequestForm>` as their
base** (`quote-request-form.tsx`) — distinct wrappers, common
form/network/success. Both BYPASS the entire `/api/book` pipeline.

---

## Target T1 — Define the intended architectural model

### T1.1 — Public booking Normal flow's intended ticket structure

**Observed implementation:** one customer + one vehicle + one
primary service + N add-ons + one scheduled time = one
appointment.

Evidence at every layer:

- **Wizard state** — `BookingState` shape at
  `booking-wizard.tsx:87-104`:
  ```ts
  service: BookableService | null;
  config: ConfigureResult | null;
  ```
  Single nullable `service`. `ConfigureResult` (defined at
  `step-service-select.tsx:31-42`) holds `addons: AddonSelection[]`
  — an array — but is itself singular: one config per booking.

- **Step 2 selection** — `step-service-select.tsx:170`:
  `const [pendingServiceId, setPendingServiceId] = useState<string | null>(selectedServiceId);`
  Single ID. Re-selecting another card overwrites
  (`:170-181` initializer + the click handlers that call
  `setPendingServiceId(svc.id)`).

- **Submission shape** — `bookingSubmitSchema` at
  `validation.ts:364-401`:
  ```
  service_id: z.string().uuid(),     // SINGULAR
  tier_name, price, ...              // attached to THE primary
  addons: z.array(bookingAddonSchema) // PLURAL
  ```

- **Server insert** — `/api/book/route.ts:489-503` constructs a
  `serviceRows` array with the primary FIRST (no flag — implicit
  by index) followed by addons:
  ```ts
  const serviceRows = [
    { appointment_id, service_id: data.service_id, price_at_booking: data.price, tier_name: data.tier_name },
    ...data.addons.map((addon) => ({ ... }))
  ];
  ```
  Inserts into `appointment_services`. **There is no
  `is_primary` column** — the primary's role is implicit from
  having been the lone `service_id` on the submission, not from
  schema.

- **DB schema** — `appointment_services` is a vanilla junction
  (`DB_SCHEMA.md:154` FK column reference; the table itself is
  documented elsewhere in the schema). No primary/addon
  distinction at the column level.

**Where the two layers diverge:** the DB **does not enforce
single-primary** — `appointment_services` would happily accept
multiple rows all marked equivalent. The constraint lives
EXCLUSIVELY in the UI + submission layer. So multi-primary is a
schema-friendly change but a UI-/API-disrupting one.

### T1.2 — POS ticket structure

**Observed implementation:** one customer + one vehicle + N items
where each item is either a standalone (product or
primary-classification service) OR an addon-of-a-primary (linked
via `parentItemId`).

Evidence:

- **State shape** — `ticket-reducer.ts:5-38`:
  ```ts
  export const initialTicketState: TicketState = {
    items: [],
    customer: null,
    vehicle: null,
    ...
  };
  ```
  Flat array. No "primaries" / "addons" partitioning at the
  state level.

- **Item shape** — `TicketItem` carries `parentItemId: string |
  null` (referenced throughout `ticket-reducer.ts:181-192`,
  `:160-174`). When non-null, the item is an addon attached to
  the item with that ID; when null, the item is standalone (a
  primary service, a product, or an add-on-without-anchor
  authorized via manager override).

- **Add-time gating** — `use-validated-service-add.tsx:96-130`
  routes EVERY add through one helper that:
  1. Checks prerequisites via `usePrerequisiteCheck` (the
     PRIMARY gate, locked #122).
  2. Falls back to add-on-only gate (manager PIN) ONLY when
     there are no prereqs configured AND the service is
     `classification='addon_only'` AND solo.
  3. Commits via the caller's `onAdd`.

- **POS supports many primaries per ticket by design.** The
  ticket-reducer's `parentItemId` model is the structural
  encoding — primaries are items with `parentItemId === null`
  whose classification is `primary` or `both`. Multiple such
  items can co-exist.

So POS = multi-primary, prereq-enforcing, vehicle-compat-aware,
manager-override-equipped. Public booking = single-primary, no
prereq, partial-compat (primary checked, addon not — W7), no
override path.

### T1.3 — The short-circuit Quote-Request paths

`SpecialtyVehicleBlock` (Path 2) and `RequestQuoteCard` (Path 3)
are NOT ticket-creating. They are **lead-capture terminators**.
The only persistent artifacts:

- `audit_log` row written by `/api/public/specialty-callback`.
- Staff SMS dispatch (via per-`request_type` template slug — see
  `STAFF_SLUG_BY_REQUEST_TYPE` in
  `/api/public/specialty-callback/route.ts:76-79`).
- Customer ack SMS dispatch (universal
  `quote_request_received_customer` template, Session #139).
- For SpecialtyVehicleBlock: a `/api/public/specialty-block-view`
  telemetry POST on mount
  (`specialty-vehicle-block.tsx:43-57`).

**Architectural question:** are these fixtures (intentional
final design) or placeholders (interim until something better)?

Evidence they are FIXTURES:

- Operator has explicitly named this pattern as the target for F2
  RV/Boat/Aircraft (per the diagnostic's §5 + Session #137
  comments at `specialty-callback/route.ts:13-28`) — F2 will use a
  third `request_type` discriminator value, indicating the lead-
  capture pattern is the intended extension point.
- `<QuoteRequestForm>` was deliberately extracted in Session
  U-B.3 (2026-06-01) from `<SpecialtyVehicleBlock>` to be the
  shared base for both consumers (`quote-request-form.tsx:10-43`).
- The `request_type` discriminator is documented as forward-
  extensible: "Adding a new request_type (e.g., F2 non-priced
  vehicle category) is a one-line addition to the map plus a
  new seed migration" (per CLAUDE.md Rule 19 §Public-booking
  staff_assessed enforcement).

Evidence they MIGHT BE placeholders:

- Neither short-circuit creates a customer or vehicle record,
  so when the customer LATER calls in, staff start the booking
  process from scratch — losing the lead data. (The lead data
  IS in `audit_log` but the booking pipeline doesn't read from
  there.) A future iteration that wrote the lead to a
  `quote_requests` or `leads` table would convert the pattern
  from "alert staff" to "create durable lead record."
- There is no admin UI for browsing pending quote requests —
  staff respond reactively via SMS rather than working from a
  prioritized queue.

**Verdict:** the short-circuit pattern is operator-locked as the
fixture for non-self-bookable customer paths; the lead-capture
shape is intentionally lightweight (SMS + audit_log) but is a
candidate for enrichment if Path B or C lands and the lead
volume justifies a queue. This audit treats Paths 2 + 3 as
fixtures, not gaps.

### T1.4 — Customer account ↔ booking relationship (Concern 2 anchor)

For a Normal-flow booking, what data SHOULD be linked between
the customer account and the booking?

**Currently linked (server-side, automatic):**

- **Customer record** — `/api/book/route.ts:199-294` find-or-
  create by phone first, then email, then create new. New
  records get `customer_type='enthusiast'`. Existing records
  get `email` backfilled if previously NULL
  (`:214-216`). Consent fields upgraded (never downgraded) on
  every booking (`:220-221`).
- **Vehicle record** — `:319-352` `findOrCreateVehicle` writes
  to `vehicles` with `customer_id` linkage every time, for
  every booking. New-vehicle case: insert
  (`vehicle-helpers.ts:188-204`); existing match (via
  `customer_id + lower(make) + lower(model) +
  vehicle_category` unique index `idx_vehicles_customer_make_model`
  at `DB_SCHEMA.md:3064`): NULL-field backfill
  (`vehicle-helpers.ts:156-186`).
- **Saved address** — Phase Mobile-1.1: when mobile booking has
  a non-empty address AND the customer has no profile address
  on file → silent UPDATE writes parsed address to
  `customers.address_line_1/2/city/state/zip`
  (`mobile-address-action.ts:70-91`). When customer HAS a
  profile address and entered one differs → returns
  `diff: true` for the confirmation banner to show a conflict
  prompt — does NOT auto-overwrite.
- **Linked auth** — anonymous customer creates account later →
  `/api/customer/link-account/route.ts:74-110` matches by phone
  or email, attaches `auth_user_id` to the existing customers
  row. Their prior bookings/vehicles automatically become
  visible in the portal.

**Currently NOT linked / not propagated:**

- **first_name / last_name** updates during booking — only
  backfilled for NEW customers via the initial insert
  (`/api/book/route.ts:271-294`); existing customers' name
  values are never updated from booking input even when the
  customer enters something different (e.g., legal-name
  change). No code path in the book route updates name fields
  on existing rows.
- **phone updates** — phone is the lookup key, so it's
  inherently never "updated" via booking — the booking attaches
  TO the row matched by that phone.
- **Notes / special instructions** entered for the appointment
  — written to `appointments.job_notes` only
  (`/api/book/route.ts:469`); not propagated to the customer's
  general notes field anywhere.
- **Payment method** — Stripe PaymentIntent is recorded on the
  `appointments` row + `payments` row (`:514-526` + `:727-740`),
  but card-on-file persistence to a saved payment method on
  the customer record is NOT implemented in this code path
  (Stripe Customer object linkage is not done here).
- **Email-consent inversion** — if a customer is opted-in and
  unchecks the box on the booking form, the value is NOT
  written down: `:220-221` only writes consent fields when
  `smsConsent` or `emailConsent` is TRUE (the design rule per
  CLAUDE.md Rule 9 "consent upgrades, never downgrade").

**For a NEW vehicle entered at booking time** the current design
is **silent automatic persistence** to the customer's
`vehicles` table. The customer is not asked, not informed in the
booking confirmation, and the next time they visit
`/account/vehicles` the vehicle will be there. This is the
**same shape** as the mobile-address silent-save (Phase
Mobile-1.1) — operator-locked precedent for the "silently_saved"
pattern.

**For an ANONYMOUS customer who books and later signs up** the
link-account route stitches everything together by phone or
email, so their prior bookings + vehicles ARE retroactively
visible in the portal.

---

## Target T2 — Catalog the disjoint (ticket-structure dimension)

Public booking vs POS, dimension by dimension. ✅ = supported, ❌ =
absent, ⚠️ = partial. "N/A on Short-circuits" notes when the
dimension doesn't apply to Paths 2 + 3 (they bypass `/api/book`
entirely).

| # | Dimension | Public booking (Normal) | POS | Intentional? | Customer impact | Short-circuit relevance |
|---|---|---|---|---|---|---|
| D1 | **# primary services per ticket** | ❌ Single only | ✅ Multi | Probably yes (operator-stated "simpler customer surface") | Customer with 2 vehicles or wanting paint correction + interior detail must call or book twice | N/A — short-circuits don't create tickets |
| D2 | **Prerequisite enforcement** | ❌ Absent (W5 open) | ✅ Canonical, locked via `useValidatedServiceAdd` | Operator-stated TODO (W5) | Customer can book a service that requires prior detail with no warning | N/A |
| D3 | **Addons attached to a specific primary** | ⚠️ Addons attached implicitly to THE primary (single) | ✅ Each addon has explicit `parentItemId` linkage | Falls out of D1 — no need for explicit linkage when only one primary exists | None today; would matter if D1 changes | N/A |
| D4 | **Addon vehicle_compat enforcement** | ❌ Absent (W7 open) | ✅ Server flags + dialog suppression (per CLAUDE.md Rule 22 V1+V2) | Operator-stated TODO (W7) | Customer can add a sedan-only addon to an RV booking; price/scope may not match at fulfillment | N/A |
| D5 | **Manager override paths** | ❌ Absent | ✅ Manager PIN via `pos.override_prerequisites` | Yes, customer surface should not have override capability | None — operators handle exceptions via direct contact | N/A |
| D6 | **Mobile vs in-shop flag** | ✅ Per-booking flag + zone validation | ✅ Per-ticket flag + zone | Equivalent | None | N/A |
| D7 | **Pricing display: per-vehicle tier vs flat** | ✅ Canonical engine (Item 15f Layer 4 reconstruction at `booking-wizard.tsx:402-528`) | ✅ Canonical engine | Equivalent post-Item 15f | None | N/A |
| D8 | **Custom-quote / "Request quote" handling** | ✅ Short-circuit Paths 2 + 3 | ✅ Manager-override + manual line item | Different shapes — customer surface uses short-circuit; POS uses inline override | None on customer side | These ARE the short-circuits |
| D9 | **Tax handling** | ⚠️ Booking-deposit `tax_amount=0`; per-row `is_taxable` persists post-W4 (Session #138); customer-visible tax UX deferred | ✅ POS finalization computes + collects tax via `calculateItemTax` at drain | Q-C-1 LOCKED Option A — deferred tax is the design | Customer sees pre-tax total at booking; tax appears at POS-finalize ("balance due") | N/A — short-circuits collect no money |
| D10 | **Vehicle data collection (year/make/model/color/size)** | ✅ Full + classifier-driven (#136 ships polished UX) | ✅ Full + manual operator pick | Equivalent fields; different UX (customer gets 3-value `size_class` dropdown; operator gets 5-value) | None at field level | N/A |
| D11 | **Customer data collection (new vs returning)** | ✅ find-or-create by phone with email fallback (`route.ts:199-294`) | ✅ POS customer dialog | Equivalent | None | N/A |
| D12 | **Scheduling (timeslot + mobile address)** | ✅ Step 3 + Step 2 mobile section | ❌ POS doesn't schedule — works on existing or just-created appointments | Intentional — POS is in-shop fulfillment, not scheduling | None | N/A |
| D13 | **Notes / special instructions per line item** | ❌ Booking-wide `notes` field only (`route.ts:469` writes to `appointments.job_notes`) | ✅ Per-item notes on `TicketItem` | Probably accidental (the wizard never added a per-service notes field) | Customer with one note per service must combine into the single field | N/A |
| D14 | **Pricing modifiers (combo, sale, manual discount)** | ✅ Combo + sale via canonical engine (`booking-wizard.tsx:438-490`); coupon + loyalty at Step 4 | ✅ All three + manager-set manual discount | POS has manager manual discount; public does not (intentional — customer surface) | None at customer level | N/A |
| D15 | **Card-on-file / saved payment** | ❌ Stripe PaymentIntent recorded per booking but not saved to customer | ✅ Stripe Terminal + saved methods via the POS flow | Probably intentional (one-off bookings; POS recurring) | None today; would matter for repeat customers | N/A |
| D16 | **Cross-customer "Add another booking" UX** | ❌ Each booking is its own POST | N/A (POS is in-shop, not multi-booking) | Intentional | Customer wanting to book multiple appointments must complete + restart | N/A |
| D17 | **Save vehicle to account (transparency)** | ❌ Silent automatic save (Concern 2) | N/A (POS operator picks an existing vehicle or creates one inline) | UNCLEAR — silent-save matches Phase Mobile-1.1 precedent for address, but no operator-locked decision recorded for vehicles | Concern 2's stated symptom — customer doesn't know it happened | N/A |
| D18 | **Save mobile address to account (transparency)** | ✅ Silent-save with toast + "diff" prompt (`mobile-address-action.ts`) | N/A | Intentional (Phase Mobile-1.1 locked) | None today | N/A |

**Which dimensions matter most:** D1 (Concern 1's anchor), D2 +
D4 (W5 + W7 already open), D13 (per-item notes — incidental
sibling), and D17 (Concern 2's anchor). D15 (saved card) and D16
(multi-booking sessions) are aspirational; not actively
demanded.

---

## Target T3 — Single-primary constraint deep-dive (Concern 1)

### T3.1 — UI prevention sites

The constraint manifests at three UI layers:

1. **Step 2 list → configure transition**
   (`step-service-select.tsx:170` + `:171`): `pendingServiceId`
   is a single string. Clicking another service card overwrites
   it. The configure panel renders for whichever ID is current.
2. **Step 2 Continue button**: the `onSelect` callback fires
   ONCE per booking; the wizard's `handleServiceSelect`
   (`booking-wizard.tsx:760-774`) overwrites `state.service`
   and `state.config`.
3. **Wizard state**: `BookingState.service: BookableService | null`
   (`booking-wizard.tsx:90`). Singular.

There is **no UI affordance** to add a second primary. The
operator could (architecturally) add an "Add another service"
button below the configure panel, but the state shape would
need to change first.

### T3.2 — API enforcement

`bookingSubmitSchema` at `validation.ts:364-401`:
```ts
service_id: z.string().uuid(),  // singular field
tier_name, price                 // attached to that one service
addons: z.array(...)             // plural — but addons, not primaries
```

Server inserts at `/api/book/route.ts:489-503` are written
against this shape. **Adding a second primary at the API would
require schema-changing the validator**: `services:
z.array(bookingServiceSchema)` or similar.

### T3.3 — DB schema permissiveness

The DB schema is **agnostic** to the constraint. Searching
`DB_SCHEMA.md` for `appointment_services`:
- It is a junction table (per `:154` FK reference: `vehicle_id`
  → vehicles, and parallel `appointment_id` + `service_id`
  references).
- There is no `is_primary` flag at the column level.
- There is no UNIQUE constraint preventing multiple equivalent
  rows.

So a hypothetical multi-primary booking would write multiple
rows into `appointment_services` and the schema accepts it
without complaint. The constraint lives ENTIRELY in the UI
layer and the API submit shape.

### T3.4 — What lifting the constraint would require

- **Schema:** Optional addition of an `is_primary` column to
  `appointment_services` to distinguish primaries from addons,
  OR continue using the implicit "first row = primary" pattern
  but acknowledge it. The current pattern can already represent
  multi-primary if the API stops treating one row specially.
- **API:** Rewrite `bookingSubmitSchema` to accept
  `services: array<{ service_id, tier_name, price, addons:[] }>`,
  recompute prices server-side per service group, write multiple
  `appointment_services` rows.
- **UI:** Step 2 becomes "Add services to your booking" + a
  list-shaped configure region with per-service tier + addons
  + remove button. The single-card configure panel is replaced
  by a cart-shaped surface. Step 4 order summary needs N
  groups instead of one.
- **Pricing engine:** Price validation per-service against
  per-service tier (today: one `computeExpectedPrice` call at
  `route.ts:165`). No engine change required — just N calls
  with N inputs.
- **Mobile fee, coupon, loyalty math:** all operate on
  totalized cart — works the same shape regardless of N
  primaries.
- **Confirmation messaging:** SMS + email templates need to
  render service lists rather than singular service name.

Estimated touch surface: ~15-20 files, including new tests for
the multi-primary path. Several sessions.

### T3.5 — Business reasons to KEEP single-primary

Worth surfacing rather than assuming:

1. **Customer cognitive load.** A list-shaped Step 2 is harder
   to scan than a card-shaped one; conversion rate may drop.
2. **Time-slot estimation.** Multi-primary means
   `data.duration_minutes` becomes a sum-over-services. The
   slot-availability check (`route.ts:179-186`) and the
   detailer-assignment heuristic (`findAvailableDetailer`,
   `:432-437`) both work today against one number.
3. **Pricing transparency.** With combos + add-on combo prices,
   per-primary pricing is a single mental model; multi-primary
   introduces "which primary owns this addon's combo" decisions.
4. **POS as the multi-service surface.** When a customer wants
   "the works," staff add services in POS at the appointment —
   already-supported, already-canonical. The booking flow's
   job is to GET the customer to the appointment; the upsell
   happens in person.

These are reasons; the operator decides whether they
collectively outweigh the conversion-cost of "I have to book
twice for my second car."

---

## Target T4 — Prerequisite enforcement (W5 anchor)

### T4.1 — Where prereq enforcement lives

**POS:** `useValidatedServiceAdd` (`use-validated-service-add.tsx`)
wraps every add path. Layer 1 is `usePrerequisiteCheck`
(`use-prerequisite-check.ts`), which POSTs to
`/api/pos/services/check-prerequisites/route.ts` with the
ticket's `service_ids`, gets back per-prereq satisfaction +
vehicle-compat flags, and surfaces a `PrerequisiteWarningDialog`
when unmet. CLAUDE.md Rule 22 locks this as canonical: "any
operator surface that adds a service to a ticket/quote MUST
route the add through `useValidatedServiceAdd`."

**Public booking:** ❌ NOTHING. `step-service-select.tsx` has no
prereq checks at all. `/api/book/route.ts` has no prereq
checks. The customer can pick a service whose prereq they have
never received, and the booking is accepted. (W5 from
`PUBLIC_BOOKING_NAV_AND_OPTION_WIRING_AUDIT.md:255`, status
✅ identified, ❌ not resolved.)

### T4.2 — Are prereq + multi-primary entangled?

**They are INDEPENDENT.** Prereq is "the customer must have
booked X previously before they can book Y." Multi-primary is
"can the customer book Y and Z in one go." Both can be
enforced or not enforced regardless of the other:

- Single-primary + no prereq: today's state.
- Single-primary + prereq: a hypothetical that adds the POS-
  shape prereq check to the Step 2 selection (the W5 fix
  shape per the prior audit at lines 255 + 270).
- Multi-primary + no prereq: still buys two services with no
  history check.
- Multi-primary + prereq: needs the prereq check to fire
  per-service-added, like POS does.

The prereq check can be IMPLEMENTED naturally either way. It's
cleaner to ship W5 first (single-primary + prereq) and then
multi-primary later, OR to ship multi-primary first with a
no-prereq stance and follow up. The order doesn't matter
structurally.

**Public booking can reach the canonical prereq check** —
`/api/pos/services/check-prerequisites` is callable from
`/api/book` (just a server-to-server fetch with the same
input shape), or the rule could be lifted to
`src/lib/services/check-prerequisites.ts` and called by both
endpoints. The POS-coupling is by URL path only, not by
business logic.

---

## Target T5 — NO-UNIFICATION precedent re-examination

The #128 audit
(`docs/dev/VEHICLE_FORM_UNIFICATION_AUDIT.md`) concluded that
vehicle-form components across surfaces should NOT be unified —
the four context-driven forms (`step-vehicle.tsx`,
`account/vehicle-form-dialog.tsx`,
`pos/vehicle-create-dialog.tsx`,
`admin/customers/[id]/page.tsx`) intentionally diverge because
their trust boundaries diverge.

### T5.1 — Does the same logic apply to ticket structure?

**Probably yes, but the analogy is partial.** The vehicle-form
audit's principle was: "public is conservative because the
customer can't be trusted with operator-trust fields (e.g.,
exotic/classic, full 5-value size_class); POS is full-power
because operators have training." That principle maps cleanly
onto:

- **Number of primaries.** Customer surface is conservative
  (one) because the customer's mental model is "I am booking
  one service"; POS is full-power (N) because the operator can
  build a coherent ticket from many services.
- **Prereq enforcement.** Customer surface should be
  conservative (block at booking time, prevent buying a service
  they cannot use) for the customer's benefit; POS is
  full-power (block by default, manager-override available)
  for the operator's discretion.
- **Manager override.** Operator-only by definition.

But there are dimensions where the analogy breaks:

- **Addon vehicle_compat (W7).** Customer surface conservatism
  should mean MORE checks (block ineligible addons), not fewer
  — opposite of single-primary's "fewer features."
- **Per-item notes (D13).** Less feature on customer surface
  isn't a trust call; it's just an UX gap.

### T5.2 — If yes, what's the principle?

Suggested framing:

> "Public is a curated, conservative subset of POS's capability,
> tuned for customer-mental-model simplicity. Each subset
> decision is intentional — driven either by customer-trust
> boundaries (operator-only features) or by conversion-friction
> reduction (single primary)."

### T5.3 — If no, why doesn't no-unification apply here?

A counter-argument:

> "The vehicle FORM has four different trust boundaries (public
> customer-self, portal customer-self, POS operator-trust,
> admin operator-trust). The TICKET SHAPE has only two (public
> customer-self, POS operator-trust). Single-primary is a UX
> design choice, not a trust call — operators don't trust
> customers less because they're booking one car, they choose
> to constrain the UX for conversion reasons. So the
> 'NO-UNIFICATION' analogy is decorative; the real question is
> 'do we want the public flow to handle the 5% multi-service
> bookings or do we want them in POS?'"

Either framing is defensible. The audit doesn't pick.

### T5.4 — Does the short-circuit pattern suggest a third
intentional model?

Yes. The short-circuit pattern (Paths 2 + 3) is a DISTINCT
architectural shape from both Normal flow and POS:

- **Trigger:** server-loaded service/vehicle flag.
- **UI:** form replaces the rest of the wizard or the
  configure panel.
- **Output:** SMS + audit_log; no DB row writes for the
  customer's eventual booking.
- **Forward path:** staff outreach via the SMS dispatch.

Future surfaces that need "lead-capture, not booking-creation"
can consume `<QuoteRequestForm>` directly with a new
`request_type` value. F2 RV/Boat/Aircraft is the next planned
consumer per the diagnostic + Session U-B.3 comments.

This is a **third model** that future architectural work should
recognize: Normal flow / POS shape / Short-circuit lead. Each
optimizes for different goals (ticket creation /
operator-power / lead capture).

---

## Target T6 — Data persistence patterns (Concern 2)

### T6.1 — Customer-vehicle data path by scenario

| # | Scenario | Booking flow path | Vehicle persisted to `vehicles`? | When | Code path | Operator-expected behavior (Q-Arch-6/7) |
|---|---|---|---|---|---|---|
| 1 | Anonymous customer books for first time, new vehicle | Normal flow | **YES** | At `/api/book` POST | `/api/book/route.ts:271-294` creates customers row, `:324-352` calls `findOrCreateVehicle` which writes `vehicles` row | OPEN — Q-Arch-7 — should silent-save be the default for anonymous too? |
| 2 | Anonymous customer books → later creates account | Normal flow + `/api/customer/link-account` | **YES** (linked retroactively) | At book time (vehicle row created); at signup (auth attached) | `/api/customer/link-account/route.ts:74-110` matches existing customers by phone or email, sets `auth_user_id`, so the prior vehicle becomes portal-visible | Current behavior probably operator-intended |
| 3 | Logged-in customer books with SAVED vehicle | Normal flow | N/A (already exists) | — | `/api/book/route.ts:321-323` reuses `data.vehicle.id` directly | No change needed |
| 4 | Logged-in customer books with NEW vehicle | Normal flow | **YES** (silently) | At `/api/book` POST | `:324-352` → `findOrCreateVehicle` (`vehicle-helpers.ts:188-204` insert; unique index `idx_vehicles_customer_make_model` dedups) | Concern 2 anchor — operator wants explicit consent / notification; current silent-save matches Phase Mobile-1.1 precedent |
| 5 | Customer's vehicle classified as exotic/classic | **Path 2 (SpecialtyVehicleBlock short-circuit)** | **NO (by design)** | Never (flow terminates pre-`/api/book`) | `booking-wizard.tsx:746-751` blocks Step 2; POST goes to `/api/public/specialty-callback` which only writes `audit_log` | Intentional per the SpecialtyVehicleBlock diagnostic; customer is a LEAD, not a booking |
| 6 | Customer picks `staff_assessed` service | **Path 3 (RequestQuoteCard short-circuit)** | **NO (by design)** | Never | `step-service-select.tsx:398-407` short-circuits configure panel; POST same endpoint with `request_type='staff_assessed_service'` | Intentional per CLAUDE.md Rule 19; same shape as row 5 |

**Rows 5 + 6 are confirmed-intentional**; the audit recommends
this row table itself becomes the documentation note (no other
doc currently spells it out). Rows 1 + 4 are where Concern 2's
gap is meaningful.

### T6.2 — Where exactly does the row-4 gap live?

The data **DOES persist**. The gap is in the UX/transparency
layer:

1. **`step-vehicle.tsx`** has no "Save to my account?" toggle.
   The new-vehicle form (`step-vehicle.tsx:422-630` manual
   entry) collects fields but never prompts for save consent.
2. **`step-confirm-book.tsx`** has no "This vehicle will be
   saved to your account" disclosure on the order summary.
3. **`booking-wizard.tsx`** carries no `save_vehicle_to_account`
   in `BookingState` or the submission body.
4. **`bookingSubmitSchema`** (`validation.ts:340-355`) has no
   such field.
5. **`/api/book/route.ts`** unconditionally calls
   `findOrCreateVehicle` for any new-vehicle submission.
6. **The booking confirmation** (`booking-confirmation.tsx`,
   wired via `booking-wizard.tsx:687-706`) shows the
   appointment but does not surface the vehicle-save action —
   so a returning customer who visits `/account/vehicles`
   later sees vehicles they don't remember "saving."

So Concern 2's perception ("never persisted") is wrong, but the
underlying complaint ("never asked, never told, no consent
trail") is correct.

### T6.3 — Fix shape (architectural recommendation)

Three sub-shapes, in order of effort:

**Fix 6.3.A — Transparent silent-save (Path A from T7):**
- Mirror Phase Mobile-1.1 exactly. After successful booking,
  show a non-blocking toast or post-confirmation banner: "We
  saved {vehicle description} to your account so you can
  re-book faster next time."
- No consent toggle; no schema change; no API change. The
  persistence already happens — only the UI feedback is new.
- Optionally: differentiate "saved (silent)" from "matched
  existing" by reading `findOrCreateVehicle`'s `created` flag
  (`vehicle-helpers.ts:181, 213, 233`) and surfacing the
  difference. This requires `/api/book` to forward the flag
  in the response.

**Fix 6.3.B — Opt-in toggle:**
- Add `<Checkbox>` to `step-vehicle.tsx` manual form: "Save
  this vehicle to my account."
- Add `save_vehicle_to_account: boolean` to the submission
  payload + schema.
- `/api/book/route.ts:324-352` gates `findOrCreateVehicle` on
  the flag (default OFF or default ON per Q-Arch-6).
- Trade-off: this contradicts Phase Mobile-1.1's silent-save
  precedent. If the operator wants consistency, address +
  vehicle should follow the same pattern.

**Fix 6.3.C — Match Phase Mobile-1.1's full pattern:**
- Silent-save when the customer has no prior matching vehicle
  (new vehicle, no row for this customer).
- "Conflict" UX when the new vehicle differs from an existing
  matched row (the unique-index match — same make+model — but
  different year/color/etc.). Today findOrCreateVehicle
  silently backfills NULLs (`vehicle-helpers.ts:160-172`) but
  never overwrites non-NULL fields. Operator may want explicit
  "Update existing vehicle?" prompt for the differ case.

The audit notes that **6.3.A and 6.3.B are mutually exclusive
philosophical postures** (transparency over consent vs. consent
over transparency). 6.3.C extends either.

### T6.4 — Other persistence gaps spotted during the sweep

Comprehensive sweep per operator's "every option" framing:

| # | Gap | Surface | Severity | Notes |
|---|---|---|---|---|
| P1 | First/last name updates during booking don't propagate to existing customers | `/api/book/route.ts:210-235` | Minor | The find-by-phone path only updates email/customer_type/consent. A customer whose legal name changed (marriage, etc.) cannot fix it via booking. |
| P2 | No saved-payment-method linkage | `/api/book/route.ts:514-740` | Minor | Stripe PaymentIntent recorded on the appointment; not linked to Stripe Customer object. Repeat bookings re-enter card. |
| P3 | Per-appointment notes (`job_notes`) not propagated to the customer's general profile notes | `/api/book/route.ts:469` | Minor | Notes like "I have a German Shepherd, please don't enter the back yard" stay buried on the appointment. Future bookings don't see them. |
| P4 | Email-consent downgrade ignored (per design) | `/api/book/route.ts:220-221` | None — locked by CLAUDE.md Rule 9 | "Consent upgrades, never downgrade." Documenting only. |
| P5 | Vehicle-row backfill is one-way (NULL → value) | `vehicle-helpers.ts:160-172` | Minor | If the customer enters a corrected color on a return booking ("Silver" → "Champagne"), the existing row's NON-null color is never updated. They have to edit via portal. |
| P6 | Concern 2 itself: silent vehicle save with no UX trail | step-vehicle / step-confirm-book / `/api/book` | Significant per operator | This is T6.3. |

P1, P3, P5 are siblings that could be addressed in the same
session as P6 (Concern 2's fix), or surfaced separately. The
audit names them so the operator decides scope.

---

## Target T7 — Three architectural paths forward

> Even-handed. Path A is a valid outcome.

### Path A — Document as intentional (no restructure)

- Public booking stays single-primary.
- Concern 2: add a "Vehicle saved to your account" toast/
  banner at booking confirmation (Fix 6.3.A).
- Document the row-5/row-6 short-circuit pattern in
  CLAUDE.md or a dedicated doc. (Today the diagnostic +
  Session #137 comments cover this informally; no canonical
  doc records it as the operator-locked pattern.)
- Document the single-primary constraint in the same place,
  citing the four reasons in T3.5.

**Gained:** clarity for future readers; lightweight Concern 2
fix; preserves customer conversion path.

**Lost:** customer cannot self-serve multi-service bookings —
calls/books-twice for "the works"; W5 (prereq) + W7 (addon
compat) stay open; per-item notes (D13) stay absent.

**Migration:** ~1 session, ~3 files, 0 schema changes.

**Customer expectations:** none disrupted; current conversion
path preserved.

**F2 interaction:** F2 lands as another short-circuit (new
`request_type` value); orthogonal to single-primary, ships
independently.

**Schema:** no changes.

### Path B — Partial restructure

- Public booking stays single-primary.
- Concern 2: opt-in toggle (Fix 6.3.B) OR silent-save with
  conflict UX (Fix 6.3.C), operator's choice.
- W5 (prereq enforcement on public booking) lands —
  `useValidatedServiceAdd`'s rule lifted to a shared module
  + called from `/api/book/route.ts` between
  classification + price validation.
- W7 (addon vehicle_compat) lands — `step-service-select.tsx`
  filters addon list against the vehicle's category, and
  `/api/book/route.ts` re-validates.
- Optionally P1, P3, P5 from T6.4 (sibling persistence
  gaps).

**Gained:** prereq + addon-compat parity with POS; Concern 2
resolved with explicit consent trail; some sibling fixes.

**Lost:** still no multi-primary; some customer-conversion cost
if prereq blocks come into play.

**Migration:** ~3 sessions, ~5-8 files, 0 schema changes
(prereq + compat are pure logic adds; Concern 2 fix is form +
API + endpoint change).

**Customer expectations:** mild disruption — customers may see
prereq blocks they didn't see before; balanced by clearer
vehicle-save UX.

**F2 interaction:** F2 still lands as short-circuit; W5/W7
parallels do not constrain F2.

**Schema:** no changes (Concern 2 silent-save option has none;
opt-in toggle option has none).

### Path C — Full restructure

- Public booking becomes POS-shape: multi-primary, prereq
  enforcement, addon-on-primary attachment, per-item notes.
- Concern 2: vehicle persistence becomes part of a broader
  "saved entities" framework — saved vehicles, saved
  addresses (already partial via Mobile-1.1), saved payment
  methods, saved coupons. Operator decides default save
  posture per entity type.
- `appointment_services` gets an `is_primary` boolean column
  for the new multi-primary shape (or the schema stays as-is
  and the "primary" role is encoded by row order + a
  per-row `parent_appointment_service_id`, mirroring
  POS's `parentItemId`).
- `/api/book/route.ts` is rewritten to consume an array of
  services with per-service tier + addons + notes.
- Step 2 becomes "build your booking" cart-shape UI.

**Gained:** customer-facing parity with POS — same
"power-user" can self-serve any combination. F2-equivalent
custom-quote services become inline configurations rather
than short-circuit jumps (though the short-circuit pattern
could STILL be the right tool for staff-assessed; this is a
sub-decision).

**Lost:** customer conversion path complicated; A/B testing
needed to confirm conversion doesn't drop; significant
engineering investment; potential for the public surface to
LEAK operator-only features (manager overrides) if guardrails
are not careful.

**Migration:** ~4-6 sessions, ~15-25 files, 1 schema
migration if `is_primary` chosen.

**Customer expectations:** materially disrupted — different
Step 2 UX. Requires deliberate change-management.

**F2 interaction:** Path C is the only path that makes F2
"inline" instead of "short-circuit" — RV/Boat/Aircraft staff
quote becomes part of the cart. The short-circuit pattern
might still be retained for genuinely unbookable categories
(e.g., a one-off aviation paint job).

**Schema:** likely 1 migration (e.g., add `is_primary` or
`parent_appointment_service_id` to `appointment_services`);
potentially a `saved_payment_methods` table; otherwise no
changes to `customers` or `vehicles`.

---

## Target T8 — Severity-ranked architectural findings

Severity reflects **architectural impact**, not patch-fix size.

| ID | Severity | Finding | Surface | Concern | Path implication |
|---|---|---|---|---|---|
| A1 | **Significant** | Single-primary constraint in Normal flow vs. POS multi-primary | Public booking Normal flow | 1 | Path B preserves; Path C lifts |
| A2 | **Significant** | New-vehicle silent-save has no UX trail (Concern 2 root) | Public booking Normal flow | 2 | Any path — fix shapes 6.3.A / 6.3.B / 6.3.C |
| A3 | **Moderate** | Prereq enforcement absent on public (W5 inherited) | Public booking Normal flow | 1 (entangled) | Path B or C |
| A4 | **Moderate** | Addon vehicle_compat absent on public (W7 inherited) | Public booking Normal flow | 1 (entangled) | Path B or C |
| A5 | **Moderate** | Per-item notes not supported (D13) | Public booking Normal flow | 1 (sibling) | Path C |
| A6 | **Minor** | Three architectural paths (Normal / SpecialtyBlock / StaffAssessed) not canonically documented anywhere | Public booking surface | Both | Any path — A6 is just write-the-doc |
| A7 | **Minor** | first/last name updates not propagated on existing customers (P1) | `/api/book` customer-update branch | 2 (sibling) | Any path |
| A8 | **Minor** | Saved-payment-method linkage absent (P2) | `/api/book` payment branch | 2 (sibling) | Path C only |
| A9 | **Minor** | Vehicle-row backfill is NULL-only; non-NULL fields never updated (P5) | `vehicle-helpers.ts` findOrCreateVehicle | 2 (sibling) | Path B or C |
| A10 | **Minor** | Lead-capture pattern (short-circuit) has no `quote_requests` / `leads` table — staff respond reactively from SMS, not queue | `/api/public/specialty-callback` | Neither (T1.3 fixture finding) | Independent — could ship in any path |

**Tally by concern:**

- Concern 1 (single-primary + entangled): A1, A3, A4, A5
  (4 findings — 1 Significant, 3 Moderate; A5 is Minor sibling).
- Concern 2 (data persistence): A2, A7, A8, A9 (4 findings —
  1 Significant, 3 Minor).
- Cross-concern: A6 (docs), A10 (lead-capture extension).

---

## Target T9 — Open operator decisions

The audit cannot decide these. The operator must.

- **Q-Arch-1:** Is the public booking flow intentionally a
  "simpler subset" of POS (curated for customer mental model),
  or should it match POS's multi-primary power? (Pins Path A
  vs. Path C; Path B is the in-between hedge.)
- **Q-Arch-2:** If "simpler subset," what principle defines the
  subset boundary? Suggested in T5.2; operator confirms or
  modifies.
- **Q-Arch-3:** Path A, B, or C? (Concrete commitment for the
  next arc of work.)
- **Q-Arch-4:** F2 RV/Boat/Aircraft staff_assessed quote flow
  — strictly a short-circuit consumer (Path 3 extension), or
  does it interact with the multi-primary decision (e.g., a
  customer wanting "RV detail + their daily-driver detail" in
  one booking)? The diagnostic strongly implies short-circuit;
  audit asks for confirmation.
- **Q-Arch-5:** Customer-conversion concerns about adding flow
  complexity? Any A/B test data to inform? Any
  operator-anecdotal signal that single-primary is or is not
  losing bookings?
- **Q-Arch-6:** For "logged-in user adds new vehicle during
  booking" — default save behavior:
  - (i) Silent automatic save (current behavior + Fix 6.3.A
       transparency toast) — matches Mobile-1.1 precedent.
  - (ii) Opt-in toggle, default ON (Fix 6.3.B with default
       ON).
  - (iii) Opt-in toggle, default OFF.
  - (iv) Silent-save plus conflict UX for matching-but-
       differing rows (Fix 6.3.C extension).
- **Q-Arch-7:** For "anonymous user books then later creates
  account" — current behavior auto-stitches vehicles via
  `/api/customer/link-account` phone/email match. Operator
  confirms this is intended, or should there be an
  acknowledgment step at signup ("We found 3 previous
  bookings under this phone — link them to your new account?
  [Yes / No]")?
- **Q-Arch-8:** Other customer-account ↔ booking persistence
  gaps (T6.4 P1, P3, P5) — addressed alongside Concern 2 or
  separately? (These are all Minor severity; could legitimately
  be deferred indefinitely.)

---

## Appendix — Findings dependent on incomplete information

- **Conversion-rate data** to inform Q-Arch-5 is not in the
  codebase. Audit cannot quantify the cost of single-primary;
  recommendation requires either operator anecdote or
  instrumented A/B test before Path B/C is sized.
- **Operator's prior intent on Concern 2** — the
  Phase Mobile-1.1 silent-save pattern (Sept-Oct 2025 vintage
  per the `mobile-address-action.ts` comments) precedes
  Concern 2's surfacing. It's possible the operator's "never
  persisted" complaint is actually "Mobile-1.1's silent-save
  is also wrong, both should be opt-in" — i.e., the address
  precedent is the bug, not the model. The audit cannot
  resolve this; Q-Arch-6 (i) vs (ii)/(iii) is the same
  underlying question for addresses.
- **F2 scope** — Q-Arch-4 hinges on whether F2 is "another
  staff_assessed-style pricing decision" or "a category of
  vehicle that's structurally non-self-bookable." The two
  read identically from the customer's perspective (Request a
  Quote flow), but they imply different code paths internally.
  Audit treats them as identical for now per the diagnostic +
  Session U-B.3 framing.

---

## Hard-rules verification

- ✅ Worktree isolation — audit performed in
  `~/Claude/SmartDetails/wt-arch-audit` on branch
  `audit/public-booking-architectural-coherence-expanded`,
  base `88288db0` (SpecialtyVehicleBlock diagnostic merge).
- ✅ No source / migration / test changes — read-only.
- ✅ No DB writes — all evidence from source + schema doc.
- ✅ File:line citations for every claim.
- ✅ Verified against actual code (Memory #11) — every
  claim is grounded in code paths cited, not inferred from
  prior audit summaries.
- ✅ Memory #29 Architectural type — stays at system-level
  altitude, names the three paths, surfaces decisions rather
  than recommending answers.
- ✅ Quote-Request short-circuit paths distinguished from
  Normal flow throughout T1-T6.
- ✅ T7 paths even-handed; Path A is presented as a valid
  outcome.
- ✅ T6 comprehensive sweep — surfaced P1-P5 alongside the
  reported Concern 2 root.

---

## Cross-references

- `docs/dev/SPECIALTY_VEHICLE_BLOCK_TRIGGER_DIAG.md` —
  immediately-prior diagnostic; foundational scoping.
- `docs/dev/PUBLIC_BOOKING_FLOW_AUDIT.md` (d5ea9e65) — prior
  audit; F1 resolved via #131.
- `docs/dev/PUBLIC_BOOKING_NAV_AND_OPTION_WIRING_AUDIT.md`
  (1eeade10) — W1-W7 inventory; W5 + W7 inherited into this
  audit as A3 + A4.
- `docs/dev/VEHICLE_FORM_UNIFICATION_AUDIT.md` (c872c05d) —
  NO-UNIFICATION precedent re-examined in T5.
- `docs/dev/VEHICLE_FORMS_BEHAVIOR_AUDIT.md` (d3c65ae3) —
  #135's behavioral audit; vehicle form context.
- `docs/dev/VEHICLE_TAXONOMY_AUDIT.md` (1dd4cac7) — size_class
  + specialty_tier canonical taxonomy.
- `docs/dev/POS_SALE_VS_QUOTES_PARITY_AUDIT.md` — POS ticket
  shape reference.
- `docs/dev/POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md` —
  POS prereq enforcement model (canonical for W5 lift).
- `docs/dev/QUOTE_REQUEST_SMS_AUDIT.md` — #137/#139 staff SMS
  flow context.
- `docs/dev/DB_SCHEMA.md:3035-3068` — `vehicles` table
  definition + customer-link unique index.
- `CLAUDE.md` Rules 9, 19, 22 — SMS, vehicle classifier,
  service-pricing canonical engine.
