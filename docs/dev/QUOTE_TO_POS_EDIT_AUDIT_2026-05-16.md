# Quote → POS Edit Pattern: Generalization Audit

**Date:** 2026-05-16
**Author:** read-only audit (no code or schema changes)
**Scope:** Investigate whether the existing "edit a saved quote in the POS Quote Builder" pattern can be generalized to "edit services/products on an existing appointment" and "edit services on a job (status: scheduled/intake/in_progress)."
**Trigger:** Item 15f Layer 3a-i partial completion. The shared `<EditServicesDialog>` wrapper around `<CatalogBrowser>` + `<ServicePricingPicker>` cannot be mounted in Admin context because `<CatalogBrowser>` hard-depends on POS-only providers (`useTicket`, `usePosPermission`). User proposed an architectural pivot: instead of extracting catalog UI into Admin, send the operator back to POS to add/remove items — mirroring the existing quote → POS edit flow.
**Decision deliverable for:** whether to revert Layer 3a-i and rebuild as edit-via-POS, or persist with the in-place dialog approach.
**This is NOT:** a redesign of POS, a critique of Layer 3a-i, a fix for any bug, or a sprint plan.

---

## Section 1 — Current Quote → POS Edit Flow (full trace)

### 1.1 Entry point

The "Edit" button on a saved quote lives in **two** POS surfaces:

- **POS Quote Detail page** — `src/app/pos/components/quotes/quote-detail.tsx:335-339` (and again at `:382-385` for `sent`/`viewed` statuses, `:421-424` for accepted/expired re-quote). Rendered only when `canCreateQuote` (`usePosPermission('quotes.create')`) is true. Button label: "Edit", icon `<Edit3>`.
- **POS Quote List row** — `src/app/pos/components/quotes/quote-list.tsx` (selection routes through `setView({ mode: 'detail', quoteId })` then onward).

There is **no** Edit affordance for a saved quote in the Admin surface — per CLAUDE.md, "Quotes are READ-ONLY in admin: All creation/editing via POS builder deep-links." The Admin Quote slide-over (`src/app/admin/quotes/components/quote-slide-over.tsx`) only supports soft-delete.

### 1.2 Navigation

The Edit button handler is `handleEdit()` at `quote-detail.tsx:160-164`:

```ts
function handleEdit() {
  // Clear quote state before editing to force fresh load
  quoteDispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays });
  onEdit(quoteId);
}
```

The `onEdit` callback is wired by the page-level router at `src/app/pos/quotes/page.tsx:39`:

```ts
onEdit={(quoteId) => setView({ mode: 'builder', quoteId })}
```

The page maintains its own local view state — `View` discriminated union at `quotes/page.tsx:9-12`:

```ts
type View =
  | { mode: 'list' }
  | { mode: 'detail'; quoteId: string }
  | { mode: 'builder'; quoteId: string | null; walkIn?: boolean };
```

Selecting `mode: 'builder'` with a non-null `quoteId` swaps the rendered component from `<QuoteDetail>` to `<QuoteBuilder>` (`quotes/page.tsx:45-53`). The browser URL is not changed by this — `setView` is a `useState` setter, not a `router.push`. There IS a `useSearchParams` reader at `quotes/page.tsx:14-30` that supports deep-linking via `?mode=builder&quoteId=...&walkIn=...`, but the in-app Edit click stays in-page with the same URL.

**Implications:**
- The whole edit flow lives at `/pos/quotes` — operator stays inside the POS provider tree.
- No actual URL navigation happens on Edit click. The URL changes only if the operator was deep-linked in.
- Back-button behavior: pressing browser back doesn't return to the detail view — the parent component's `view` state resets to whatever the URL says. `<QuoteBuilder>`'s own `onBack` prop is wired to `setView({ mode: 'list' })` (`quotes/page.tsx:50`) — meaning Back from edit returns to the **list**, not to the quote detail. (Detailed behavior is `setView({ mode: 'list' })` — see `quotes/page.tsx:50`.) When a save succeeds the `onSaved` callback at `quotes/page.tsx:51` lands the operator on `{ mode: 'detail', quoteId }`.

### 1.3 State loading

The `<QuoteBuilder>` (`src/app/pos/components/quotes/quote-builder.tsx:31-195`) reads `quoteId` from props. The effect at `quote-builder.tsx:40-195` handles three cases:

1. **`quoteId === null`** (new quote): `dispatch({ type: 'CLEAR_QUOTE', validityDays: quoteValidityDays })`.
2. **`quoteId` matches `quote.quoteId` in context** (already loaded): set `loadingQuote(false)` and stop.
3. **`quoteId` differs**: fetch + hydrate.

The fetch flow (`quote-builder.tsx:53-194`):
1. `posFetch(\`/api/pos/quotes/${quoteId}\`)` (auth: HMAC + PIN-derived session).
2. Map `q.items` (DB rows) → `TicketItem[]` (POS state shape) — see `quote-builder.tsx:61-96`. Notable fields preserved:
   - `service_id` / `product_id` → `serviceId` / `productId` discriminator.
   - `unit_price`, `total_price`, `tier_name`.
   - `quote.vehicle.size_class` is stamped onto each item as `vehicleSizeClass`.
   - `pricingType` is forced to `'standard'` — sale/combo pricing pattern from POS Sale tab is NOT round-tripped through the quote schema.
3. **Coupon re-hydration** (`:99-151`): If `q.coupon_code` exists, call `/api/pos/coupons/validate` with the loaded cart to re-compute discount. If the coupon is no longer valid (expired, deactivated, items shifted), the cashier sees a toast warning and the coupon is silently dropped. The mechanism is identical to the auto-apply path in `ticket-context.tsx:86-115`.
4. **Mobile state** (`:173-182`): Reconstructed from `is_mobile` + `mobile_zone_id` + `mobile_address` + `mobile_surcharge` + `mobile_zone_name_snapshot`. The "Custom..." picker mode is inferred from `is_mobile && !mobile_zone_id`.
5. `dispatch({ type: 'LOAD_QUOTE', state: loadState })` — fires the reducer at `quote-reducer.ts:LOAD_QUOTE` which replaces the entire `QuoteState`.

**State NOT preserved on load:**
- `manualDiscount` — no DB column.
- `loyaltyPointsToRedeem` / `loyaltyDiscount` — no DB column. (Loyalty redemption is per-transaction, not per-quote.)
- Per-item sale/combo pricing provenance — items are loaded as `standardPrice = unit_price` and `pricingType = 'standard'`.

Code-comment at `:158-160` explicitly notes these as "follow-up" deferrals.

### 1.4 Cart hydration vs. POS Sale cart

The Quote Builder's `<QuoteContext>` (`src/app/pos/context/quote-context.tsx`) is a **parallel context to `<TicketContext>`** — Sale tab uses `<TicketContext>`, Quote tab uses `<QuoteContext>`. They share the same `TicketItem` shape and reducer actions but have separate state. The reducers are nearly siblings (`ticket-reducer.ts` 613 LOC vs `quote-reducer.ts` 558 LOC). Both providers mount inside `<PosShell>` (`pos-shell.tsx:148-169`) — every POS route gets both.

`<CatalogBrowser>` is built around `<TicketContext>` by default (`catalog-browser.tsx:54-56`):

```ts
const { ticket, dispatch: ticketDispatch } = useTicket();
const { granted: canCreateTickets } = usePosPermission('pos.create_tickets');
const { granted: canAddItems } = usePosPermission('pos.add_items');
const hasCallbacks = !!onAddProduct || !!onAddService;
const dispatch = hasCallbacks ? undefined : ticketDispatch;
```

When the caller passes `onAddProduct` / `onAddService`, the browser routes adds through the callback instead of dispatching to `<TicketContext>`. This is the escape hatch the Quote Builder uses (`quote-builder.tsx:482-491`):

```tsx
<CatalogBrowser
  key={tab}
  type={tab}
  search=""
  onAddProduct={handleAddProduct}
  onAddService={handleAddService}
  vehicleSizeOverride={vehicleSizeClass}
  vehicleSpecialtyTierOverride={vehicleSpecialtyTier}
  addedServiceIds={addedServiceIds}
/>
```

But **even in callback mode**, the browser still calls `useTicket()` on line 54 — it just doesn't dispatch. That call requires `<TicketProvider>` to exist or it throws (`ticket-context.tsx:219-224`). The compatibility check, prerequisite check, and pricing-picker work the same. This is why Quote Builder works (it runs inside `<PosShell>` where `<TicketProvider>` is mounted) and Admin Appointment dialog does not (`<PosShell>` is not in its ancestor tree).

### 1.5 POS UX in edit mode

Identical to new-quote creation, with two cosmetic deltas:

- `<QuoteBuilder>` header label at `quote-builder.tsx:425`:
  ```tsx
  {walkInMode ? 'New Walk-In' : quoteId ? 'Edit Quote' : 'New Quote'}
  ```
- Auto-save's load-snapshot guard at `quote-ticket-panel.tsx:362-368` skips the first auto-PATCH for an existing quote.

Functionally identical: same 2-pane layout (catalog browser left, `<QuoteTicketPanel>` right), same search bar, same add/remove flows, same customer/vehicle pickers, same mobile picker, same coupon input, same prerequisite warnings.

### 1.6 Save mechanism

Two save paths:

**(a) Implicit auto-save** — fires on every edit after `AUTO_SAVE_DEBOUNCE_MS` (~800ms default) trailing edge:
- `quote-ticket-panel.tsx:352-403` debounced effect.
- Skipped when: `walkInMode === true`, `items.length === 0`, `status` not `'draft'`, or current state hash matches `lastSavedHashRef.current` (the load snapshot for existing drafts).
- Calls `persistDraft({ silent: true })` at `:382-388`.
- Sends `PATCH /api/pos/quotes/${quoteId}` with the full cart, mobile payload, coupon code, items.

**(b) Explicit save / send / convert / create-job** — same `persistDraft` function but with `{ silent: false }`. Triggered by:
- "Save Draft" footer button (`:1030`) → `handleSaveDraft` (`:588-591`).
- "Send" button → `handleSendQuote` (`:593-630`): persists, then opens `<QuoteSendDialog>` to choose SMS/email channel.
- "Create Job" button → `handleCreateJob` (`:640-787`): persists as `status: 'converted'`, posts to `/api/pos/jobs` with `quote_id`, navigates to `/pos/jobs`.
- "Convert to Appointment" button on the Quote Detail page (not the builder) — calls a different path (`POST /api/pos/quotes/[id]/convert`).

The unmount cleanup at `quote-ticket-panel.tsx:407-423` fires a final `persistDraft` if the operator navigates away mid-edit (footer-tab nav, Back link). It does NOT fire on hard tab-close — `beforeunload` is "acceptably out of scope" per the inline comment.

### 1.7 Save persistence

`PATCH /api/pos/quotes/${quoteId}` (`src/app/api/pos/quotes/[id]/route.ts:41-104`) delegates to `updateQuote()` in `src/lib/quotes/quote-service.ts:249-380`. The flow:

1. **Existence check** (`quote-service.ts:254-264`): `select('id, status').eq('id', quoteId).is('deleted_at', null).single()` — soft-deleted quotes 404, but **any non-deleted status** is allowed to PATCH. No guard for `status === 'converted'` or `'expired'`.
2. **Field updates** (`:266-289`): customer_id, vehicle_id, notes, valid_until, status, coupon_code, mobile_*.
3. **Items + totals recompute** (`:294-380`): If `items` array is in the body, delete all `quote_items` rows and re-insert; recompute `subtotal`, `tax_amount`, `total_amount`. Tax = sum of (product items only) × `TAX_RATE`. Mobile surcharge added to subtotal.

**No cascade.** A quote PATCH never touches `appointments`, `appointment_services`, or `jobs.services`. The only forward link is `quotes.converted_appointment_id`, which is only written by the convert flow.

**Side effects:**
- `logAudit` entry (`api/pos/quotes/[id]/route.ts:65-75`) — entityType: `quote`.
- `resolveMobileAddressAction()` (`:87-91`) — checks if the entered address should be auto-saved to the customer profile; returns a `mobile_address_action` in the response. The UI surfaces a "Save address?" dialog on response if `diff` is set.

No webhook fires on quote update. No SMS/email to the customer. The send flow is a separate explicit action.

### 1.8 Return navigation

After a successful save, control flow depends on which button was pressed:

- **Auto-save**: Stays on the builder. No nav.
- **Save Draft**: At `quote-ticket-panel.tsx:259-267`: if no mobile-address dialog needed, `onSaved(savedId)` fires, which the parent wires to `setView({ mode: 'detail', quoteId })` (`quotes/page.tsx:51`) — operator lands on the quote detail page.
- **Send**: `handleSendComplete` (`:632-638`) clears the quote state and calls `onSaved` → lands on detail.
- **Create Job**: `router.push('/pos/jobs')` (`:780`) — leaves the Quote surface entirely.
- **Convert to Appointment** (from detail page): the convert API + `<QuoteBookDialog>` close the dialog and refetch the quote on the detail page.

**No "returnTo" mechanism.** The destination is hardcoded per action. There is no equivalent of `?returnTo=/admin/appointments/[id]` that would survive the round-trip.

### 1.9 Edge cases the current flow handles

| Edge case | Current handling | Citation |
|---|---|---|
| Editing a `converted` quote | UI: Edit button NOT shown for `converted` status (`quote-detail.tsx:332,378,418` — only on draft/sent/viewed/accepted/expired). API: `updateQuote` would allow it (no guard). | `quote-detail.tsx`, `quote-service.ts:249-264` |
| Editing an `expired` quote | UI: "Re-quote" button instead of "Edit" on expired (`quote-detail.tsx:418-424`) — clones into a new quote (calls `onReQuote` → `setView({ mode: 'builder', quoteId: null })`). | `quote-detail.tsx:166-170, 418-424` |
| Auto-save fires while user is editing | Coalesce — `dirtyRef.current = true`, re-fire after in-flight save completes. | `quote-ticket-panel.tsx:376-388` |
| Customer changes mid-edit | Free — `dispatch({ type: 'SET_CUSTOMER' })` updates context, auto-save persists. Vehicle is cleared on customer change at the reducer level. | `quote-ticket-panel.tsx:451-462`, `ticket-context.tsx:73` (analogous) |
| Vehicle changes mid-edit | If category changes, prompt to clear services; otherwise reprice via `SET_VEHICLE`. | `quote-ticket-panel.tsx:474-498` |
| Mobile-address requires save-to-customer prompt | `resolveMobileAddressAction` returns a `diff` payload; UI defers `onSaved` until the address dialog closes. | `quote-ticket-panel.tsx:259-263` |
| Permission gating | `quotes.create` gates the Edit button (`canCreateQuote` at `quote-detail.tsx:122,334`). API does not re-check on PATCH — the route's only check is `authenticatePosRequest`. | `quote-detail.tsx:122`, `api/pos/quotes/[id]/route.ts:46-49` |
| Coupon no longer valid on load | Silently drop, toast warning. | `quote-builder.tsx:137-150` |
| Soft-deleted quote | API returns 404 via `QuoteNotFoundError`. UI surfaces "Failed to load quote", calls `onBack()`. | `quote-service.ts:259, 263`, `quote-builder.tsx:186-188` |
| Operator navigates away mid-edit | Unmount cleanup flushes auto-save. | `quote-ticket-panel.tsx:407-423` |

---

## Section 2 — `<TicketContext>` data model

### 2.1 Full type definition

`TicketState` is defined at `src/app/pos/types.ts:76-94`:

```ts
export interface TicketState {
  items: TicketItem[];
  customer: Customer | null;
  vehicle: Vehicle | null;
  coupon: { id: string; code: string; discount: number; isAutoApplied?: boolean } | null;
  loyaltyPointsToRedeem: number;
  loyaltyDiscount: number;
  manualDiscount: { type: 'dollar' | 'percent'; value: number; label: string } | null;
  depositCredit: number;        // Pre-paid deposit from online booking
  depositDate: string | null;
  priorPayments: PriorPayment[]; // Itemized prior payments for the linked appointment
  priorPaymentsTotal: number;
  notes: string | null;
  // Computed totals
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}
```

`TicketItem` (`types.ts:14-56`) carries pricing provenance (`standardPrice`, `pricingType: 'standard' | 'sale' | 'combo'`, `comboSourcePrimaryId`, `saleEffectivePrice`), per-unit metadata, prerequisite metadata, vehicle-size class, and an `isCustomPrice` opt-out flag for vehicle-change reprice.

`TicketAction` (`types.ts:98-115`) — 14 action types: `ADD_PRODUCT`, `ADD_SERVICE`, `ADD_CUSTOM_ITEM`, `UPDATE_ITEM_QUANTITY`, `UPDATE_PER_UNIT_QTY`, `REMOVE_ITEM`, `RESTORE_ITEM`, `SET_CUSTOMER`, `SET_VEHICLE`, `SET_COUPON`, `SET_LOYALTY_REDEEM`, `SET_NOTES`, `UPDATE_ITEM_NOTE`, `APPLY_MANUAL_DISCOUNT`, `REMOVE_MANUAL_DISCOUNT`, `RESTORE_TICKET`, `CLEAR_TICKET`.

### 2.2 Comparison to `<QuoteContext>`

`QuoteState` (`types.ts:166-188`):

```ts
export interface QuoteState {
  items: TicketItem[];                    // ← shared shape
  customer: Customer | null;              // ← same
  vehicle: Vehicle | null;                // ← same
  coupon: { id; code; discount; isAutoApplied? } | null;  // ← same
  loyaltyPointsToRedeem: number;          // ← same (but unpersisted in DB)
  loyaltyDiscount: number;                // ← same (but unpersisted in DB)
  manualDiscount: ... | null;             // ← same (but unpersisted in DB)
  notes: string | null;                   // ← same
  subtotal / taxAmount / discountAmount / total: number;  // ← same
  // Quote-specific:
  quoteId: string | null;
  quoteNumber: string | null;
  validUntil: string | null;
  status: QuoteStatus | null;
  mobile: QuoteMobileState;
}
```

**`QuoteState` has, that `TicketState` does NOT:**
- `quoteId`, `quoteNumber`, `validUntil`, `status` — identity + expiry metadata.
- `mobile: QuoteMobileState` — `{ isMobile, zoneId, address, surcharge, zoneNameSnapshot, isCustom }`.

**`TicketState` has, that `QuoteState` does NOT:**
- `depositCredit`, `depositDate` — pre-paid online deposit being applied as cash at checkout.
- `priorPayments[]`, `priorPaymentsTotal` — itemized prior payments for the linked appointment (from `checkout-items`).

The two reducers (`ticket-reducer.ts` 613 LOC, `quote-reducer.ts` 558 LOC) diverge mostly in totals math (Quote has the mobile-surcharge inline; Ticket fetches `priorPayments` separately) and in restore-from-API actions (`LOAD_QUOTE` vs `RESTORE_TICKET`).

### 2.3 What `<TicketContext>` does NOT represent today

The audit's §1.4 list — combined with `appointments` schema columns (`appointments.id` lookup in `src/lib/supabase/types.ts:363-407` and DB_SCHEMA §1.1) — surfaces the gap-set for round-tripping appointment/job edits through a ticket-shaped state:

| Field | Lives in | Today's `TicketState` | Today's `QuoteState` | Should go through ticket state? |
|---|---|---|---|---|
| `appointments.id` | DB | absent | absent | **No** — pass via URL/props; not a cart concern |
| `appointments.status` (`pending`/`confirmed`/`in_progress`/`completed`/`cancelled`/`no_show`) | DB | absent | n/a (quote has own status) | **No** — admin/POS dialog handles |
| `appointments.scheduled_date` / `scheduled_start_time` / `scheduled_end_time` | DB | absent | absent | **No** — reschedule has its own modal |
| `appointments.employee_id` (assigned detailer) | DB | absent | absent | **No** — pencil-icon on Jobs card/dialog |
| `appointments.job_notes` / `internal_notes` | DB | absent | absent (quote has `notes`) | **No** — pencil edit in source dialog |
| `appointments.payment_status` (`pending`/`partial`/`paid`/`refunded`/`partial_refund`) | DB | implied via `priorPayments` | absent | **Partial** — already there for sale-tab checkout |
| `appointments.payment_type` (`deposit`/`pay_on_site`/`full`) | DB | absent | absent | **No** — booking-time only |
| `appointments.deposit_amount` | DB | `depositCredit` | absent | Already present in Ticket |
| `appointments.payment_link_url` / `payment_link_token` / `payment_link_amount_cents` | DB | absent | absent | **No** — Jobs card "Send Payment Link" modal |
| `appointments.is_mobile` / `mobile_zone_id` / `mobile_address` / `mobile_surcharge` / `mobile_zone_name_snapshot` | DB | absent | yes (`QuoteState.mobile`) | **No** — `<EditMobileModal>` is the canonical surface |
| `appointments.cancellation_reason` / `cancellation_fee` | DB | absent | absent | **No** — cancel dialog handles |
| `appointments.reminder_sent_at` | DB | absent | absent | **No** — cron concern |
| `jobs.id` | DB | absent | absent | **No** — URL/props |
| `jobs.status` (`scheduled`/`intake`/`in_progress`/`pending_approval`/`completed`/`closed`/`cancelled`) | DB | absent | n/a | **No** — Jobs card buttons |
| `jobs.services` (JSONB snapshot) | DB | round-trips as `items` + `loadCheckoutItems` | n/a | This IS what we want to edit |
| `jobs.timer_seconds` / `work_started_at` / `intake_started_at` / `intake_completed_at` / `work_completed_at` | DB | absent | absent | **No** — `<JobTimer>` handles |
| `jobs.intake_notes` | DB | `notes` field overloaded for in-flight notes; quote `notes` distinct | absent (only quote `notes`) | **No** — pencil edit |
| `jobs.estimated_pickup_at` / `actual_pickup_at` / `pickup_notes` | DB | absent | absent | **No** — addon-flow + complete-job flow |
| `jobs.gallery_token` | DB | absent | absent | **No** |
| `jobs.assigned_staff_id` | DB | absent | absent | **No** — reassign modal |
| `job_addons[]` | DB | absent | absent | **No** — Flag-an-Issue is its own flow |
| `job_photos[]` | DB | absent | absent | **No** |
| `transactions.id` (when closed) | DB | absent | absent | **No** |

**Read-out:** the only data the user wants to round-trip is **services + products + (possibly) coupon + (possibly) mobile**. Everything else stays put.

A "ticket loaded from an existing record" pattern only needs to widen `TicketState` (or a new sibling state) by:
- A source discriminator (`source: 'appointment' | 'job' | 'new'`) and `sourceId: string | null`.
- A `returnTo: string | null` for navigation back.
- Possibly an `editMode: boolean` flag so the panel suppresses checkout/loyalty UI.

The quote pattern proves this works without intruding on the other fields — `<QuoteState>` simply adds `quoteId`, `quoteNumber`, `validUntil`, `status`, `mobile` to the shared shape and the rest of the cart is identical.

---

## Section 3 — Quote → POS pattern feasibility for appointments and jobs

### 3.1 Editing services/products on an APPOINTMENT (no job yet)

**Source of truth for services:** `appointment_services` rows (DB_SCHEMA §1.2 / lifecycle audit §1.4).

**Edit-load endpoint (proposed):** A new `GET /api/pos/appointments/[id]/edit-cart` (or generalized `GET /api/pos/tickets/edit?source=appointment&id=...`) reads the appointment + its `appointment_services` rows + customer + vehicle + mobile fields + active coupon (today appointments don't carry a coupon code, but transactions do — coupon is applied at checkout, not booking), and returns a `TicketState`-shaped payload that the POS Sale tab can hydrate.

Closest existing endpoint: `GET /api/pos/jobs/[id]/checkout-items` (`src/app/api/pos/jobs/[id]/checkout-items/route.ts`) — already returns a cart-shaped payload for the post-completion checkout. That endpoint reads `jobs.services` (denormalized JSONB) + linked appointment + `priorPayments`. Reusable as a template; a new sibling `/edit-cart` for the pre-job case is needed.

**Edit-save endpoint (proposed):** A new `PUT /api/pos/appointments/[id]/services` would replace `appointment_services` rows and recompute `appointment.subtotal`/`total_amount` — **identical to Item 15a's existing `PUT /api/admin/appointments/[id]/services` cascade endpoint** (`src/app/api/admin/appointments/[id]/services/route.ts:61-409`). That endpoint already:
- Replaces all `appointment_services` rows in one PUT (snapshot + delete + insert + rollback pattern).
- Recomputes totals via `computeTotalsForServiceEdit` from `src/lib/appointments/edit-services.ts`.
- **Cascades to `jobs.services` JSONB if a job is linked** (lines 279-334) — exactly the direction the audit §10 #11 gap calls out.
- Audits with `notification_suppressed: true`.
- Guards `status IN ('completed','cancelled')` with a 400.
- Permission-gates on `appointments.reschedule`.

**Reuse opportunity:** The new POS-side endpoint could literally proxy to the admin endpoint (passing through the POS-employee session as authority), OR move the existing endpoint to `/api/admin/...` → `/api/appointments/...` and gate per-call. Smarter: keep Item 15a's endpoint as the canonical writer, mount a new HMAC-authed POS variant that shares the underlying helpers (`buildJobServicesJsonb`, `computeTotalsForServiceEdit` in `src/lib/appointments/edit-services.ts` already exist as pure functions).

**Permissions:** Item 15a already maps to `appointments.reschedule` (per CLAUDE.md alignment). The new POS edit-via-POS surface should reuse `appointments.reschedule` for consistency — no new permission key needed. Detailer role stays denied (which matches "operators with `pos.jobs.manage`/`appointments.reschedule` can edit; detailers cannot").

**Cascade concern (resolved):** Item 15a already implements `appointment_services` → `jobs.services` JSONB cascade. The new flow REUSES that.

### 3.2 Editing services on a JOB (status: scheduled, intake, in_progress)

**Source of truth:** `jobs.services` JSONB snapshot (`[{id, name, price, is_mobile_fee?}]`).

**Edit-load endpoint:** `GET /api/pos/jobs/[id]/checkout-items` (`src/app/api/pos/jobs/[id]/checkout-items/route.ts`) already returns a TicketItem-shaped payload (with `priorPayments`, `depositCredit`, `coupon` from the linked quote). It's used today by the "Checkout" button at job-detail.tsx:1444-1458. **Reusable directly** — the POS Sale tab already hydrates from this when an operator clicks Checkout. The only delta for "edit services" is to set a different action button (Save Changes instead of Checkout).

**Edit-save endpoint:** Two options:
- **Direct write to `jobs.services`** via the existing `PATCH /api/pos/jobs/[id]` `services` field (already supported — `src/app/api/pos/jobs/[id]/route.ts` accepts `services` payload; Layer 3a's Jobs-card-migration uses this). This is what today's Jobs card "Edit Services" modal does.
- **Cascade through appointment_services** via the Item 15a endpoint — calls `PUT /api/admin/appointments/[id]/services` with the new service list, which writes BOTH `appointment_services` AND `jobs.services` in one transaction.

**The user has previously raised the cascade question** (audit §10 #11): "Today the operator edits a job's services → only `jobs.services` JSONB mutates, `appointment_services` rows go stale." The proposed pattern should fix this by ALWAYS routing job-services edits through the cascade endpoint. The opposite-direction concern from the brief (job → appointment) becomes "this is how the cascade SHOULD work" if we make it bidirectional through one endpoint.

**Status-based gating:**
- `scheduled` / `intake`: allow service edit (matches today's Jobs card behavior, gated on `pos.jobs.manage`).
- `in_progress`: **Flag-an-Issue flow is the customer-approval path for mid-job adds** (lifecycle audit §4, confirmed working). The proposal does NOT replace Flag-an-Issue. Direct service edit on an `in_progress` job should be admin-only OR redirected to Flag-an-Issue. Today's Jobs card already gates this — `isEditable = canManageJobs && status NOT IN [completed, closed, cancelled]` (audit §7) — meaning `in_progress` IS editable today, which is wrong per the user's requirement. The edit-via-POS pivot is an opportunity to align: for `in_progress`, the "Edit Services" button should open the Flag-an-Issue wizard instead of the cart.
- `completed` / `closed` / `cancelled`: no edit (matches today).

**Cascade direction concern (jobs.services → appointment_services):** If the cascade endpoint is the single writer (proposal: yes), then job-services edits route through `/api/appointments/[id]/services` (or a new POS sibling) and write both tables atomically. No "drift" between the two tables. This is **architecturally cleaner than today**, where the Jobs card writes only `jobs.services` JSONB.

### 3.3 Existing quote-edit constraints that may differ for appointments / jobs

| Quote-edit assumption | Holds for appointments? | Holds for jobs? | Notes |
|---|---|---|---|
| Customer + vehicle CAN be changed mid-edit | ⚠️ Mostly | ⚠️ Mostly | Today's Jobs card already supports customer/vehicle swap (`job-detail.tsx:519-553`). For appointments with paid deposits, customer change is risky. Per Item 8 in roadmap, "Change customer on a completed walk-in transaction" is its own work — out of scope. Recommend: customer/vehicle stays in the source dialog (pencil), not editable from the POS edit-cart surface. |
| No Stripe Terminal authorization in flight | ✅ | ⚠️ | Quote-edit doesn't touch payments. For jobs, the operator might have just authorized a card and then clicked "Edit Services" — the cart would surface a `priorPayments` warning, similar to today's payment-mismatch banner. |
| No scheduled date/detailer | ❌ | ❌ | Both have these. Recommend: do not surface or edit date/detailer/notes from the POS edit surface — keep them in the source dialog (Admin Appointment / POS Jobs card) with pencil-icon affordances. |
| Auto-save on every keystroke | ⚠️ | ⚠️ | Quote auto-save is safe because quotes are draft-state ephemera. Appointment + job auto-save would write through the cascade endpoint and trigger downstream effects (payment-mismatch banner, cascading job snapshot, audit log). Recommend: NO auto-save for appointment/job edit. Explicit "Save Changes" only. |
| `LOAD_QUOTE` reducer replaces entire state | ✅ | ✅ | Pattern transfers cleanly — just need parallel actions: `LOAD_TICKET_FROM_APPOINTMENT`, `LOAD_TICKET_FROM_JOB`. |
| Permission gate at UI layer only, API ungated | ⚠️ | ⚠️ | Quote PATCH lacks `quotes.create` check (only auth). For appointment/job edits, server-side permission checks are essential — the existing Item 15a endpoint already gates on `appointments.reschedule`. |
| Soft-delete handled at GET (404) | ✅ | ✅ | Both quotes and jobs use `deleted_at` semantics; the pattern applies. |
| Status guard at API layer (`appointment.status NOT IN [completed, cancelled]` for service edits) | ✅ | ✅ | Item 15a endpoint already enforces this. Same guard belongs on a POS-side variant. |

---

## Section 4 — Implementation costs

### 4.1 Backend

| Work | Reuse vs new | Effort |
|---|---|---|
| GET `/api/pos/tickets/edit?source=appointment&id=...` (load appointment as ticket) | New endpoint; helpers reusable | 0.5 session |
| GET `/api/pos/tickets/edit?source=job&id=...` (load job as ticket) | Mostly reuses `/api/pos/jobs/[id]/checkout-items` logic | 0.25 session |
| PUT `/api/pos/appointments/[id]/services` (POS-authed) | **Major reuse**: extract Item 15a's logic from `api/admin/appointments/[id]/services/route.ts` into a shared service function callable from both routes. Already uses `editServicesBodySchema` + `buildJobServicesJsonb` + `computeTotalsForServiceEdit` (`src/lib/appointments/edit-services.ts`) | 0.5 session |
| Polymorphic `?source=appointment\|job` discriminator vs separate endpoints | **Recommend separate endpoints.** One POS-authed PUT per source. Avoids server-side branching on auth shape (admin cookie vs POS HMAC) — the route's auth layer is the discriminator. | n/a |
| Job-side service edit: route through cascade endpoint (i.e., `PATCH /api/pos/jobs/[id]` with `services` → call cascade or refactor to call new POS PUT for cascade) | **Refactor.** The Jobs-card path today writes `jobs.services` directly; the new pattern routes through `/api/pos/appointments/[id]/services` so the appointment_services rows stay in sync. | 0.5 session |
| Audit trail | Item 15a logic reusable | 0 |
| Tests | Layer 3a's `route.test.ts` already exists for the admin endpoint; add POS-auth variants. | 0.5 session |

**Backend subtotal:** ~2.25 sessions.

### 4.2 Frontend

| Work | Reuse vs new | Effort |
|---|---|---|
| Extend `<TicketContext>` for "loaded from existing" mode: `source: 'new' \| 'appointment' \| 'job'`, `sourceId`, `returnTo`, `editMode` | Adds 4 fields to `TicketState`, 1 reducer action `LOAD_FROM_SOURCE` | 0.5 session |
| POS Sale tab UI in edit mode: hide checkout button; replace with "Save Changes"; suppress loyalty redemption UI; suppress receipt printing; suppress payment flow; suppress "Hold Ticket"; suppress "Clear" or change to "Cancel Edit" | Modifies `<TicketPanel>`, `<TicketActions>`, `<RegisterTab>` — gate on `ticket.editMode` | 1 session |
| Navigation: `/pos?source=appointment&id=...&returnTo=...` (deep link into Sale tab) | New search-param reader at `src/app/pos/page.tsx`. Drains on first read, dispatches `LOAD_FROM_SOURCE`. | 0.5 session |
| Source-side affordances: "Edit Services" button on Admin Appointment dialog routes to POS (`router.push('/pos?source=appointment&id=...')`); same for Jobs card. | Remove `<EditServicesModal>` import + state from `appointment-detail-dialog.tsx`; remove `<EditServicesDialog>` mount from `job-detail.tsx`. | 0.25 session |
| Return-to handling: after Save, `router.push(returnTo)` | Trivial | included |
| Edge case: operator navigates away mid-edit | Existing `<TicketContext>` already persists to sessionStorage (`ticket-context.tsx:29-35`). Reuse. | 0 |
| Race conditions: optimistic concurrency (`appointments.updated_at` ETag) | Defer — Item 15a doesn't have this either; if/when needed, add to both. | 0 |
| Zero-service ticket: today quote-edit blocks at `persistDraft` with `q.items.length === 0`. Mirror: appointment-edit save blocks if zero services. | Trivial guard | included |

**Frontend subtotal:** ~2.25 sessions.

### 4.3 Edge cases

| Case | Handling |
|---|---|
| Mid-edit nav away | Today's `<TicketContext>` persists to sessionStorage and restores on remount. Quote-edit's unmount cleanup pattern (`quote-ticket-panel.tsx:407-423`) is for auto-save; with no auto-save for appointment/job edits, this concern reduces to "if operator leaves and comes back, do they want their unsaved changes?" — sessionStorage handles transparently. |
| Concurrent edit (another operator changes the underlying record) | Item 15a does not implement OCC. Acceptable for now — the operator pool is small (1-3 detailers + 1 cashier). If it bites, add `updated_at` ETag on `PUT`. |
| All services removed | UI: Save button disabled when `editSelectedServices.length === 0` (`<EditServicesDialog>` already does this — `edit-services-dialog.tsx:240`). API: same Item 15a guard. |
| Source record soft-deleted between edit-load and save | API returns 404 on PUT. UI surfaces toast + bounces back to source view. |
| Mobile picker change mid-edit | The mobile picker is its OWN modal today (`<EditMobileModal>`). Should it open inside the POS edit surface or stay on the source page? Recommend: keep `<EditMobileModal>` on the source dialog (don't migrate). The edit-via-POS surface is for services + products only — mobile, date, detailer, notes stay pencil-edit on source. |
| Operator opens edit twice in two tabs | sessionStorage scope is per-tab → no collision. The two saves race at the DB; last write wins. Acceptable. |
| Operator opens an `in_progress` job in edit mode | The action button on the job card for `in_progress` should be "Flag Issue" (already exists), NOT "Edit Services." The edit-via-POS button shows only for `scheduled` / `intake`. |

---

## Section 5 — Breaking-change risk assessment

| Surface | Risk | Mitigation |
|---|---|---|
| POS new-ticket creation | **Low.** `<TicketContext>` gets new fields and a new reducer action; existing flow ignores the new fields when `source === 'new'`. | Default field values + reducer branches. |
| POS new-quote creation | **Zero.** Untouched. `<QuoteContext>` is separate. | n/a |
| POS quote-edit (existing) | **Zero.** Untouched. Quote-edit's auto-save and `<QuoteContext>` are independent. | n/a |
| POS Sale checkout | **Low.** `<TicketPanel>` adds an `editMode` branch; if `editMode === false` (the default), behavior is identical. | Default branch matches today's behavior. Tests must cover both branches. |
| Existing appointments flow (booking, cancel, reschedule) | **Low.** Item 15a's endpoint stays. The POS-side variant is additive. Booking and reschedule paths are independent. | Don't touch `/api/appointments/[id]` or `/api/pos/appointments/[id]/reschedule`. |
| Existing jobs flow (intake, in-progress, complete, Flag-an-Issue) | **Medium.** Removing the Jobs-card inline `<EditServicesDialog>` and routing to POS instead changes muscle memory for cashiers — and the `in_progress` branch needs to redirect to Flag-an-Issue, which is a behavior change (today's Jobs card allows direct edit on `in_progress`). | Communicate the muscle-memory change in release notes; verify Flag-an-Issue redirect during UAT. Layer 3a's Jobs-card migration would be reverted in favor of "navigate to POS." |
| Webhook firing on appointment/job changes | **Zero.** No webhook fires on `appointment_services` edit today (Item 15a deliberately suppresses notification — `notification_suppressed: true`). New flow inherits. | n/a |
| AI auto-responder pricing (`service-resolver.ts`) | **Zero.** Layer 3d concern, not this audit. Service-resolver bugs are independent of edit-flow changes. | n/a |
| `<EditServicesModal>` (Item 15a) | **Removed.** The Admin Appointment dialog stops using it. The component file becomes dead code → can be deleted. | Delete the file post-migration. |
| `<EditServicesDialog>` (Layer 3a) | **Removed.** Same — the shared dialog becomes dead code. Engine + hook stay (they're consumed by Booking Wizard via Layer 3c, voice agent via Layer 3d). | Delete the file post-migration. Keep `picker-engine.ts`, `use-service-picker.ts`, `custom-price-dialog.tsx`. |
| Layer 3a Jobs-card migration | **Reverted.** The Jobs-card `handleOpenEditServices` becomes a `router.push('/pos?source=job&id=...&returnTo=...')` instead of mounting `<EditServicesDialog>`. | This is the architectural pivot the audit recommends. See §8. |

**Critical risk:** the migration touches `<TicketContext>` — the highest-traffic state container in POS. Any reducer regression manifests as cart corruption on every transaction. Mitigation: keep all new state under an `editMode` / `source` discriminator branch; default branch is byte-identical to today.

---

## Section 6 — Permissions and roles impact

The new edit-via-POS pattern should not invent new permission keys. Per audit §9, existing keys cover the work:

| Action | Existing key | Source | Detailer? |
|---|---|---|---|
| Edit services on an appointment (no job yet) | `appointments.reschedule` | Item 15a precedent (audit §6, §9.1) | denied |
| Edit services on a job (status: scheduled, intake) | `pos.jobs.manage` | Today's Jobs card (audit §9.2) | granted |
| Edit services on a job (status: in_progress) | `pos.jobs.flag_issue` via Flag-an-Issue redirect | Today's flow (audit §4) | granted |
| Block edit on completed/closed/cancelled | n/a (status guard at API) | Item 15a precedent | n/a |

**Per-field permission gating** (audit §9.1 — Admin Appointment dialog has fine-grained gates) is **NOT inherited** by the POS edit surface, because the POS surface only edits services + products. Mobile/date/notes/status stay on the source dialog and keep their per-field gates.

**Detailer impact:** Detailers can edit services on a job today via the Jobs card (because `pos.jobs.manage = true` for detailer per audit §9.2). In the new flow, they navigate to POS with the job's cart loaded. The Sale tab is allowlisted for detailers (`pos.add_items` granted to detailer per role-defaults). No regression.

**Cashier impact:** Cashier has `pos.jobs.manage = false` per audit §9.2 (only super_admin/admin/detailer have it). The Jobs-card "Edit Services" button is hidden for cashier today. In the new flow, same gate (button hidden for cashier).

**No new permission keys needed.**

---

## Section 7 — User-flow comparisons

### 7.1 POS Jobs card — Edit services

**Today (Layer 3a):**
1. Operator on `/pos/jobs/[id]` (job detail card).
2. Taps the "Services" tile → modal opens (`<EditServicesDialog>`).
3. Modal shows 2-pane catalog browser + selected-services list.
4. Operator taps a service in catalog → tapService routes → quick-add or picker.
5. Save Changes → `handlePatchJob({ services })` → modal closes, card refreshes.
6. **Click count: 3-4 clicks** (Services tile, tap service, Save).
7. **Cognitive load: modal-on-card.** Operator stays in the Jobs context.
8. **Capability:** catalog + pricing tiers + custom price + per-unit + prerequisite — full canonical engine. **Missing:** vehicle-compatibility warning (per CC session brief Risk #2). **Broken:** custom-pricing add path (Flood Damage button disabled — brief Risk #3). **Bug:** prices saved still wrong (brief Risk #4).

**Proposed (edit-via-POS):**
1. Operator on `/pos/jobs/[id]` (Jobs card).
2. Taps "Services" tile → `router.push('/pos?source=job&id=...&returnTo=/pos/jobs/[id]')`.
3. Browser navigates to `/pos` (Sale tab) with cart pre-loaded from job.
4. POS shows the FULL Sale-tab UI — catalog, search, mobile picker, customer card, vehicle card, ticket panel with all line items.
5. Operator interacts with catalog (any of the 8 routing paths in `picker-engine.ts`).
6. Operator clicks "Save Changes" (replaces the "Checkout" button when `editMode === true`).
7. `PUT /api/pos/appointments/[id]/services` (cascade endpoint) → success → `router.push(returnTo)`.
8. Operator lands back on `/pos/jobs/[id]`; card auto-refreshes.
9. **Click count: 3-4 clicks** (Services tile, tap service, Save). Same as today.
10. **Cognitive load: full surface switch.** Operator leaves the Jobs context, edits in POS, comes back.
11. **Capability:** EVERYTHING the Sale tab does — full canonical engine, compatibility warning (already in `<CatalogBrowser>`), sale banners, prerequisite checks, custom pricing, per-unit pickers, product additions, mobile fee picker, coupon application, manual discount, vehicle compatibility prompts.

**Net comparison:** click count identical. Cognitive load increases (full surface switch). Capability is **strictly higher** — all the bugs Layer 3a-i didn't fix are not present, because the operator is now in the surface where those features are already wired.

### 7.2 Admin Appointment dialog — Edit services

**Today (Item 15a):**
1. Operator on `/admin/appointments` → dialog opens.
2. Click "Edit Services" → `<EditServicesModal>` opens.
3. Modal shows a single-pane checkbox list (no 2-pane, no canonical engine — Item 15a's bespoke modal).
4. Operator toggles services in the list.
5. Save → `PUT /api/admin/appointments/[id]/services` → modal closes.
6. **Click count: 3-4 clicks.**
7. **Capability:** Limited. Bespoke `resolveServicePrice` (audit §15f) mishandles some pricing patterns. No 2-pane catalog. No custom pricing. No per-unit picker. No compatibility warning. **Item 15a explicitly accepts these as out-of-scope** because the canonical engine wasn't ready when 15a shipped.

**Proposed (edit-via-POS):**
1. Operator on `/admin/appointments` → dialog opens.
2. Click "Edit Services" → `router.push('/pos?source=appointment&id=...&returnTo=/admin/appointments')`.
3. Browser navigates to POS Sale tab with appointment loaded.
4. Operator edits in full POS UX (same as §7.1 step 4-6).
5. "Save Changes" → cascade endpoint → `router.push(returnTo)` → lands back on `/admin/appointments`.
6. The dialog auto-reopens? **No** — `/admin/appointments` re-renders fresh. **Improvement candidate:** preserve `?dialogId=...` query param so the dialog reopens on return. Trivial.
7. **Click count: 4 clicks** (Edit Services, tap service, Save). One more than today.
8. **Cognitive load: SIGNIFICANT context switch.** Admin user is moved into POS — a different layout, a different theme, a different mental model. Mitigation: most admin users with `appointments.reschedule` are also POS-savvy.
9. **Capability:** matches POS Sale tab — all bugs in Item 15a's bespoke `<EditServicesModal>` disappear because they don't exist in the canonical engine path.

**Net comparison:** +1 click. +1 surface switch. -1 bespoke component (Item 15a's modal becomes dead code). +everything the canonical engine does.

### 7.3 POS Appointments modal (Item 15e — not built)

**Today:** No service-edit support (Item 15e is on the roadmap).

**Proposed:** The POS Appointments modal gets a "Edit Services" button that routes to `/pos?source=appointment&id=...&returnTo=/pos/appointments`. This **collapses Item 15e's service-edit requirement** into the same code path as the Admin dialog and Jobs card. Item 15e shrinks to "POS Appointments modal needs to support all the OTHER fields (status, notes, mobile, etc.) — services routing is solved by edit-via-POS."

---

## Section 8 — Recommendation

### 8.1 Viable?

**Yes — proceed with edit-via-POS as the unified pattern.**

The pivot solves all four real-world UAT failures from Layer 3a-i:

| Failure | Why it disappears under edit-via-POS |
|---|---|
| `<CatalogBrowser>` hard-depends on POS contexts | The operator is now IN the POS context. No decoupling needed. |
| No compatibility warning in `<EditServicesDialog>` | The full POS Sale tab already has it. |
| Broken custom-pricing add path | The full POS Sale tab already has it (Layer 2's `<CustomPriceDialog>` is wired). |
| Wrong prices saved to `jobs.services` | The cascade endpoint (Item 15a) uses canonical resolver + writes both `appointment_services` AND `jobs.services` atomically. Layer 3a-i's pricing bug came from the Jobs card writing `jobs.services` directly with a stale snapshot — that write path goes away. |

### 8.2 Effort estimate

| Layer | Sessions |
|---|---|
| 8a — Backend: shared cascade endpoint + POS-authed PUT variant | 1.5 |
| 8b — Frontend: extend `<TicketContext>` with source/sourceId/returnTo/editMode + deep-link drain at `/pos?source=...` | 1 |
| 8c — POS Sale-tab UX: edit-mode branch (Save Changes button, suppress checkout/loyalty/hold/clear) | 1 |
| 8d — Source-side affordances: Jobs card + Admin Appointment dialog + (future) POS Appointments modal | 0.75 |
| 8e — Revert Layer 3a-i: delete `<EditServicesDialog>`, restore Jobs-card pencil-edit-then-route pattern; delete `<EditServicesModal>` (Item 15a) | 0.5 |
| 8f — Tests: Sale-tab edit branch, cascade endpoint POS-auth variant, in_progress redirect to Flag-an-Issue | 0.75 |
| **Total** | **~5.5 sessions, ~12-14 hours** |

This is **smaller than Item 15f's remaining work** (Layers 3a-ii + 3b + 3c + 3d + 4 = ~6 sessions remaining per the roadmap). It also REPLACES Layer 3a-ii (decouple `<CatalogBrowser>` from POS contexts) and Layer 3b (migrate 4 working POS surfaces to the hook — they're already the surface the operator goes to).

### 8.3 Gotchas to know before signing off

1. **Layer 3a-i revert** — the `<EditServicesDialog>` ships in production currently. Reverting means restoring the Jobs card's pre-Layer-3a pencil-edit pattern (which had the bespoke `getServicePrice` revenue leak) BUT only for the brief window between revert and edit-via-POS landing. Mitigation: ship the full edit-via-POS scope in one PR; don't revert Layer 3a-i until the replacement is ready.

2. **`<EditServicesDialog>` was just shipped (commit `98dfdea6`)** — the user verified the audit's premise that it has real-world issues. Communicating "we're throwing this away and rebuilding" to the user before the audit landed would have been premature; the audit itself is the cover for that decision.

3. **In_progress job services edit** — today's Jobs card allows direct edit on `in_progress` (audit §7.3: "Works" for "Add / remove services"). The audit's recommendation is to redirect `in_progress` to Flag-an-Issue. This is a **behavior change**, not a bug fix. The user's session brief asserts the Flag-an-Issue flow already works correctly and shouldn't change. Question to confirm before implementing: should `in_progress` edits go through Flag-an-Issue OR continue to allow direct edit (with the same canonical engine)? The audit recommends **direct edit allowed for admin only; cashier/detailer routed to Flag-an-Issue**. This is gated by `ADMIN_ROLES` check pattern at `job-detail.tsx:649-650`.

4. **Auto-save off for appointment/job edits** — diverges from the quote pattern. Operator must press Save Changes. This is a deliberate choice (cascading effects, payment-mismatch banner, audit log) — but it MUST be communicated in the UI (e.g., a banner "Unsaved changes" if `editMode && hasUnsavedItems`).

5. **`<TicketContext>` sessionStorage persistence** — already exists. An unsaved edit-mode session restored on remount would show stale data if the underlying record was modified. Mitigation: on `LOAD_FROM_SOURCE`, always re-fetch from the server (never trust the cached state). Treat sessionStorage as a UX nicety, not authoritative.

6. **Item 15a's `<EditServicesModal>`** — becomes dead code AFTER edit-via-POS lands for the Admin dialog. The `PUT /api/admin/appointments/[id]/services` endpoint stays (it's the cascade writer); the modal component gets deleted in the same PR. Don't delete the endpoint — both flows use it.

7. **Booking Wizard (customer-facing) is unaffected.** The wizard has its own bespoke UI (per CLAUDE.md Rule 22 carve-out: "Customer-facing surfaces may keep bespoke UI but their price math MUST use the canonical resolver"). Layer 3c (wizard price-math migration) is independent and not blocked by this work.

8. **Voice agent / SMS auto-responder unaffected.** Layer 3d (service-resolver.ts rewrite) is independent and not blocked.

### 8.4 Minimum viable scope

**Ship edit-via-POS for JOBS first.** Jobs are the highest-friction surface (Layer 3a-i's worst bug — wrong prices saved). Admin appointment edits can keep using Item 15a's `<EditServicesModal>` for one more cycle.

Order of operations:
1. **Backend (8a)** — extract Item 15a's logic into `src/lib/appointments/service-edit.ts` callable from both admin + POS routes. Add POS-authed `PUT /api/pos/appointments/[id]/services` that calls the same helper.
2. **Frontend state (8b)** — `<TicketContext>` extensions, deep-link drain at `/pos`.
3. **Frontend UX (8c)** — Sale-tab edit-mode branch.
4. **Source affordance (8d) for Jobs card ONLY** — Jobs-card "Services" tile routes to `/pos?source=job&id=...`. Admin Appointment dialog keeps `<EditServicesModal>` for now.
5. **Revert Layer 3a-i for Jobs card** — delete `<EditServicesDialog>` mount from `job-detail.tsx`; restore inline state for `showEditServices`-as-route-trigger.
6. **Tests (8f)** — Jobs cart load + save round-trip.
7. **UAT** — verify the four real-world UAT failures are gone.
8. **Stretch (next cycle):** add edit-via-POS for Admin Appointment dialog; delete `<EditServicesModal>` and `<EditServicesDialog>` files.

### 8.5 What is NOT in scope

- Flag-an-Issue flow stays as-is (user-confirmed working).
- Cancel / reschedule paths unchanged.
- Mobile picker (`<EditMobileModal>`) stays on the source dialog — does NOT migrate to POS.
- Date / detailer / notes / status / payment-link edits stay on the source dialog with pencil-icon affordances (per audit §11.2 intervention #4 model: cross-surface gaps closed without merging).
- Customer/vehicle swap on a job stays on the source Jobs card (today's behavior).
- Layer 3b (4 working POS surfaces) — they ARE the surface now; no migration to a hook is needed.
- Layer 3c (Booking Wizard) — independent, customer-facing path.
- Layer 3d (service-resolver.ts) — independent, server-side path.
- Layer 4 (ESLint enforcement) — independent of edit-flow architecture; ships per its own schedule.
- Item 15e (POS Appointments full parity) — service-edit requirement is solved by this work; the rest of 15e (status/notes/mobile parity) is independent.

### 8.6 What this changes about Item 15f Layer 3a

The Layer 3a-i partial-completion (Jobs card migration to `<EditServicesDialog>`) should be **reverted** when edit-via-POS for Jobs lands. The `<EditServicesDialog>` component file (`src/lib/services/edit-services-dialog.tsx`) should be **deleted** since it's no longer mounted anywhere.

The Layer 3a-ii follow-up (decouple `<CatalogBrowser>` from POS contexts) becomes **permanently deferred** — there's no longer a need to mount the catalog browser outside POS.

Item 15f's overall scope shrinks from "migrate 6 surfaces + decouple catalog browser" to "engine + hook stay; Booking Wizard math (3c) + service-resolver (3d) + ESLint (4) ship per plan; UI migration concern is resolved by routing all operator service edits through the POS Sale tab."

---

## Appendix A — Files referenced in this audit

### Source code (read-only inspection)

- `src/app/pos/quotes/page.tsx` — view-state router (list/detail/builder)
- `src/app/pos/components/quotes/quote-detail.tsx` — Edit/Re-Quote entry points
- `src/app/pos/components/quotes/quote-builder.tsx` — Quote edit-mode hydration (`LOAD_QUOTE`)
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — auto-save + explicit save flows
- `src/app/pos/context/quote-context.tsx` — `QuoteProvider` (POS-only)
- `src/app/pos/context/ticket-context.tsx` — `TicketProvider` (POS-only); throws without provider
- `src/app/pos/context/quote-reducer.ts` — `LOAD_QUOTE` action
- `src/app/pos/context/ticket-reducer.ts` — `RESTORE_TICKET` action
- `src/app/pos/types.ts` — `TicketState`, `QuoteState`, `TicketItem`, `QuoteMobileState`
- `src/app/pos/pos-shell.tsx` — provider mount order (Reader → Ticket → Checkout → HeldTickets → Quote → PosShellContent)
- `src/app/pos/pos-layout-inner.tsx` — `<PosShell>` per-route wrapper
- `src/app/pos/components/catalog-browser.tsx` — calls `useTicket()` + `usePosPermission()`; throws outside POS
- `src/app/pos/jobs/components/job-detail.tsx` — Layer 3a Edit Services dialog integration
- `src/app/pos/components/register-tab.tsx` — Sale-tab cart
- `src/app/pos/components/bottom-nav.tsx` — POS footer tabs
- `src/components/appointments/edit-services-modal.tsx` — Item 15a bespoke modal (becomes dead code under proposal)
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — Item 15a `<EditServicesModal>` mount
- `src/lib/services/edit-services-dialog.tsx` — Layer 3a wrapper (becomes dead code under proposal)
- `src/lib/services/use-service-picker.ts` — canonical hook (engine + dialog routing)
- `src/lib/services/picker-engine.ts` — canonical engine (`resolveServicePrice`, `routeServiceTap`)
- `src/lib/appointments/edit-services.ts` — Item 15a pure helpers (`buildJobServicesJsonb`, `computeTotalsForServiceEdit`)

### Endpoints

- `PATCH /api/pos/quotes/[id]` (`src/app/api/pos/quotes/[id]/route.ts`) — quote PATCH; no status guard at API
- `PUT /api/admin/appointments/[id]/services` (`src/app/api/admin/appointments/[id]/services/route.ts`) — Item 15a cascade endpoint
- `POST /api/pos/jobs` (`src/app/api/pos/jobs/route.ts`) — walk-in + create-from-quote
- `GET /api/pos/jobs/[id]/checkout-items` — checkout-cart hydration (model for edit-cart endpoint)
- `PATCH /api/pos/jobs/[id]` — generic job patch (accepts `services` payload today)

### Documentation

- `docs/dev/ROADMAP-13-ITEMS.md` Item 15f §785-1046 — Layers 1+2 done, 3a partial
- `docs/dev/LIFECYCLE_AUDIT_2026-05-15.md` §1, §2, §3, §7
- `docs/dev/DB_SCHEMA.md` §1.1 — `quotes`, `appointments`, `appointment_services`, `jobs`, `transactions`
- `CLAUDE.md` Rule 22 — canonical service pricing engine

---

*End of audit. No code changes performed. The deliverable is this document; the decision is the user's.*
