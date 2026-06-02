# SpecialtyVehicleBlock — Trigger Diagnostic

> Read-only diagnostic, 2026-06-02. Branch:
> `audit/specialty-vehicle-block-trigger-diagnostic`.
>
> Purpose: correct a mental-model drift that conflated "specialty
> vehicle" (the codebase term) with "RV / Boat / Aircraft" (vehicle
> categories). The earlier prompts framed `SpecialtyVehicleBlock` as
> the Step-1 gate for non-priced vehicle categories. That framing is
> wrong. This doc records the actual trigger conditions, the resulting
> UX, and the submitted payload — short, narrow, evidence-only.

## TL;DR

`SpecialtyVehicleBlock` fires when the customer's Step-1
`VehicleSelection.size_class` is **`'exotic'` or `'classic'`** — and
nothing else. It is *not* triggered by `vehicle_category`
(`automobile` / `motorcycle` / `rv` / `boat` / `aircraft`), nor by any
`staff_assessed` flag. The two are orthogonal axes that produce
"Request a Quote" UX via different paths and at different steps.

## 1. Trigger condition

The block toggle is `booking-wizard.tsx`'s `showSpecialtyBlock`
state. It is set to `true` in exactly one place:

`src/components/booking/booking-wizard.tsx:746-751`

```ts
// Gate: if vehicle is exotic or classic, show block page instead of step 2.
// Session 29: trigger keyed off size_class (canonical taxonomy), not parallel flags.
if (vehicle.size_class === 'exotic' || vehicle.size_class === 'classic') {
  setShowSpecialtyBlock(true);
  return;
}
```

Render guard at `src/components/booking/booking-wizard.tsx:1143-1149`:

```tsx
{step === 1 && showSpecialtyBlock && state.vehicleData && businessPhone && (
  <SpecialtyVehicleBlock
    vehicle={state.vehicleData}
    businessPhone={businessPhone}
    onEditVehicle={() => setShowSpecialtyBlock(false)}
  />
)}
```

So the literal trigger is:

- `step === 1`, AND
- `state.vehicleData.size_class === 'exotic' || === 'classic'`.

Customers cannot pick `exotic` or `classic` themselves —
`CUSTOMER_SELF_SERVICE_SIZE_CLASSES` is restricted to the 3 mundane
values (`src/lib/utils/constants.ts:75-79`):

```ts
export const CUSTOMER_SELF_SERVICE_SIZE_CLASSES: readonly VehicleSizeClass[] = [
  'sedan',
  'truck_suv_2row',
  'suv_3row_van',
] as const;
```

So `size_class === 'exotic' | 'classic'` only reaches the wizard via
**the classifier**: `resolveVehicleClassification` in
`src/lib/utils/vehicle-categories.ts` detects exotic / classic from
make+model lookups, and the result flows through `step-vehicle.tsx`'s
`effectiveSizeClass` derivation at `step-vehicle.tsx:214-218`:

```ts
const classifierSpecialty =
  classification?.size_class === 'exotic' || classification?.size_class === 'classic';
const effectiveSizeClass = classifierSpecialty
  ? classification!.size_class
  : (manualSizeClass ?? classification?.size_class ?? null);
```

Note the classifier **wins** for exotic/classic — even if the
customer manually picked `sedan` from the 3-value dropdown, a Ferrari
model lookup will overwrite their pick. That's the Session 29
anti-gaming behavior the trigger relies on.

**The trigger is NOT keyed off:**

- `vehicle_category` — RV / Boat / Aircraft / Motorcycle each route
  through `isSpecialtyCategory(category)` (`vehicle-categories.ts:95`)
  for **pricing tier selection** (`specialty_tier`), but they do NOT
  trip `showSpecialtyBlock`. RV/Boat/Aircraft customers continue
  through Step 2 with normal pricing — they see prices, they book
  directly.
- `services.staff_assessed` — that flag is enforced at **Step 2**, by
  `step-service-select.tsx` rendering `<RequestQuoteCard>` (a sibling
  consumer of the same `<QuoteRequestForm>` base) inside the configure
  panel for the staff-assessed service. Different step, different
  surface, different `request_type` discriminator.

So the codebase has **two orthogonal "Request a Quote" paths**:

| Axis | Path | Trigger | Step | request_type |
| --- | --- | --- | --- | --- |
| Specialty vehicle | `SpecialtyVehicleBlock` | classifier sets `size_class ∈ {exotic, classic}` | 1 (replaces Step 2 transition) | `'specialty_vehicle'` |
| Staff-assessed service | `RequestQuoteCard` (in Step 2 configure panel) | `services.staff_assessed === true` for the selected service | 2 | `'staff_assessed_service'` |

Both paths POST to the same endpoint (`/api/public/specialty-callback`)
which dispatches on `request_type` (see `STAFF_SLUG_BY_REQUEST_TYPE` in
`src/app/api/public/specialty-callback/route.ts:76-79`).

## 2. What the customer sees

When `showSpecialtyBlock` is `true`, the **entire Step-1 surface is
replaced** by `<SpecialtyVehicleBlock>` — the normal `<StepVehicle>`
form is unmounted (`booking-wizard.tsx:1143` vs `:1151` are mutually
exclusive `step === 1` branches). The customer does NOT progress to
Step 2.

The block renders (`specialty-vehicle-block.tsx:65-107`):

1. Headline: "Let's talk about your **exotic** vehicle" (or
   "**classic**" when `size_class === 'classic'` —
   `specialty-vehicle-block.tsx:37`).
2. Body paragraph mentioning the customer's cleaned vehicle
   description (`{year} {make} {model}`).
3. `<QuoteRequestForm>` with:
   - A "Call us now: {formatted phone}" CTA button (tel: link).
   - An "or" divider.
   - A four-field callback form: Name (required), Phone (required,
     normalized via `normalizePhone`), Email (optional), Best time
     (optional).
4. An "Edit my vehicle" footer link that calls
   `setShowSpecialtyBlock(false)` — letting the customer fall back to
   the normal `<StepVehicle>` if the classifier mis-categorized.

On successful submit, the form swaps to a green success card:
"Callback requested! One of our specialists will reach out soon."
(`quote-request-form.tsx:157-162`). **No appointment, no ticket, no
transaction row is created on this path.**

Side effect: on mount the block fires a fire-and-forget POST to
`/api/public/specialty-block-view` with the vehicle YMM + size_class —
denominator for conversion tracking (`specialty-vehicle-block.tsx:43-57`).

## 3. What data is submitted

POST `/api/public/specialty-callback`, JSON body assembled in
`quote-request-form.tsx:108-118` and
`specialty-vehicle-block.tsx:85-91`:

```json
{
  "request_type": "specialty_vehicle",
  "vehicle_year": <number>,
  "vehicle_make": "<string>",
  "vehicle_model": "<string>",
  "size_class": "exotic" | "classic",
  "name": "<trimmed>",
  "phone": "<E.164 — normalizePhone() output>",
  "email": "<trimmed or null>",
  "preferred_time": "<trimmed or null>"
}
```

The `request_type: 'specialty_vehicle'` discriminator routes to the
`booking_staff_notify_specialty` staff SMS template
(`route.ts:76-77`). After #139 the customer also receives the
universal `quote_request_received_customer` template with
`request_subject = "specialty vehicle"` (per CLAUDE.md Rule 9 +
`route.ts` comment at `:40-43`).

## 4. Mental-model correction

> `SpecialtyVehicleBlock` fires when the **classifier flags the
> vehicle as exotic or classic via `size_class`**. It does NOT fire
> on `vehicle_category ∈ {rv, boat, aircraft, motorcycle}`, and it
> does NOT fire on `services.staff_assessed === true`.

Cited code:

- **Actual trigger** — `booking-wizard.tsx:748` checks
  `vehicle.size_class === 'exotic' || vehicle.size_class === 'classic'`.
- **NOT vehicle_category** — `step-vehicle.tsx:322` shows
  `isSpecialtyCategory(category)` (RV/Boat/etc.) is a **separate**
  validation path that requires `specialty_tier`. Those vehicles get
  priced via the `service_pricing.tier_name = size_class` row-based
  pattern and book normally through Step 2.
- **NOT staff_assessed** — staff-assessed services route through
  `<RequestQuoteCard>` at Step 2 (CLAUDE.md Rule 19 §"Public-booking
  staff_assessed enforcement", `_staff-assessed.ts`), with
  `request_type: 'staff_assessed_service'`.

Why the earlier framing was wrong: the operator and prompts conflated
the **codebase term "specialty"** (which `SPECIALTY_TIERS` /
`isSpecialtyCategory` use for any non-`automobile` category — RV,
Boat, Aircraft, Motorcycle) with the **product term "specialty
vehicle"** the block uses (which exclusively means exotic/classic
`size_class`). They share a name and overlap in admin pricing
mechanics, but the booking-wizard branching is gated on `size_class`
alone, not category.

## 5. Notes for the architectural audit

- `SpecialtyVehicleBlock` is a **short-circuit terminator** for Step 1
  — it ends the booking flow without producing an appointment,
  transaction, or ticket. The only persistent artifacts are (a) the
  `audit_log` row written by `/api/public/specialty-callback`, (b) the
  staff SMS + customer ack SMS, and (c) the `specialty-block-view`
  telemetry POST. No `customers` row, no `vehicles` row, no
  `appointments` row.
- The "Request a Quote" UX on Step 1 (`SpecialtyVehicleBlock`) and on
  Step 2 (`RequestQuoteCard`) are **two distinct consumers** of the
  shared `<QuoteRequestForm>` base. They submit the same shape to the
  same endpoint, dispatched server-side via `request_type`. Both
  bypass `/api/book` entirely — the booking-deposit pipeline never
  runs on either path.
- The Edit-my-vehicle footer (`specialty-vehicle-block.tsx:100-106`)
  is the only customer-controlled exit from the block; it flips
  `showSpecialtyBlock` back to `false` and re-renders the normal
  `<StepVehicle>` form so the customer can correct a mis-classified
  YMM. Note this does NOT re-run the classifier — the customer has to
  edit make/model to trigger a re-classify.
- The classifier-is-authoritative invariant
  (`step-vehicle.tsx:214-218`) means a sophisticated user CANNOT
  bypass the block by picking a smaller manual `size_class` — the
  Ferrari detection wins. The only customer escape is "Edit my
  vehicle" → change make/model.
