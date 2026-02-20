# Quote System Audit: Can It Power Walk-In Job Creation?

## 1. Complete Quote Flow (End-to-End)

### Entry Points
- **POS sidebar**: "Quotes" tab → list view → "+ New Quote" button → opens builder (`mode=builder`)
- **Admin customer detail**: "New Quote" button → deep-links to `/pos/quotes?mode=builder&customer=${id}`
- **Edit existing**: `/pos/quotes?mode=builder&quoteId=<id>`
- **View detail**: `/pos/quotes?mode=detail&quoteId=<id>`

### Builder Flow (`quote-builder.tsx` — 290 lines)

```
┌──────────────────────────────────────────────────────────────────┐
│  QUOTE BUILDER (split layout: catalog left, ticket panel right) │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LEFT PANEL: Full catalog browser                                │
│  ├── Products tab (with category browsing, SKU/barcode search)   │
│  ├── Services tab (with category browsing, name search)          │
│  └── ServicePricingPicker dialog for:                            │
│       ├── Vehicle-size-aware tiers (sedan/truck/SUV pricing)     │
│       ├── Scope tiers (basic/standard/premium/etc.)              │
│       └── Per-unit services (qty picker: # of panels, headlights)│
│                                                                  │
│  RIGHT PANEL: QuoteTicketPanel (577 lines)                       │
│  ├── Customer summary (lookup/create/change)                     │
│  ├── Vehicle summary (select/create/change — triggers reprice)   │
│  ├── Line items (QuoteItemRow: qty edit, notes, remove)          │
│  ├── Coupon input (QuoteCouponInput — validates via POS API)     │
│  ├── Loyalty points panel                                        │
│  ├── Manual discount (permission-gated: dollar or percent)       │
│  ├── Valid Until date picker                                     │
│  ├── Internal notes textarea                                     │
│  ├── Quote totals (subtotal, tax, discount, total)               │
│  └── ACTION BUTTONS:                                             │
│       ├── [Save Draft]  → POST/PATCH /api/pos/quotes             │
│       └── [Send Quote]  → save + QuoteSendDialog (SMS/email)     │
└──────────────────────────────────────────────────────────────────┘
```

### Vehicle-Aware Pricing (Key Advantage)
When a vehicle is selected, `quote.vehicle.size_class` is used to:
1. Auto-resolve the correct price tier from `service_pricing` (sedan/truck_suv/suv_van)
2. On vehicle change: `RECALCULATE_VEHICLE_PRICES` action re-prices ALL service items in the quote
3. `ServicePricingPicker` shows per-vehicle-size price options when applicable
4. Per-unit pricing (e.g., "2 headlights x $150") also supported

### $0.00 / Inspect-to-Quote Items
- The builder allows any price, including $0.00 — there's no minimum price validation on quote items
- Custom items can be added with any name/price via `ADD_CUSTOM_ITEM` action

### Data Persisted on Save

**`quotes` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| quote_number | TEXT | Auto-generated sequential |
| customer_id | UUID | Nullable (can save draft without customer) |
| vehicle_id | UUID | Nullable |
| status | `quote_status` enum | draft/sent/viewed/accepted/expired/converted |
| subtotal | DECIMAL(10,2) | |
| tax_amount | DECIMAL(10,2) | |
| discount_amount | DECIMAL(10,2) | |
| total_amount | DECIMAL(10,2) | |
| notes | TEXT | Internal notes |
| valid_until | DATE | Expiration date |
| access_token | UUID | For public quote page |
| sent_at | TIMESTAMPTZ | Last sent timestamp |
| viewed_at | TIMESTAMPTZ | When customer first viewed |
| accepted_at | TIMESTAMPTZ | When customer accepted |
| converted_appointment_id | UUID | FK to appointments (set on convert) |
| deleted_at | TIMESTAMPTZ | Soft delete |
| created_by | UUID | Employee who created |

**`quote_items` table:**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| quote_id | UUID | FK to quotes |
| service_id | UUID | Nullable |
| product_id | UUID | Nullable |
| item_name | TEXT | Display name snapshot |
| quantity | INTEGER | |
| unit_price | DECIMAL(10,2) | |
| total_price | DECIMAL(10,2) | qty * unit_price |
| tier_name | TEXT | Price tier used |
| notes | TEXT | Per-item notes |

---

## 2. Current Walk-In Flow (Comparison)

### Walk-In Flow (`walk-in-flow.tsx` — 611 lines, 3-step wizard)

```
Step 1: Customer → CustomerLookup + QuickAddCustomer (name+phone)
Step 2: Vehicle  → Select from list or skip or QuickAddVehicle
Step 3: Services → Simple toggle list, flat_price or first tier only
                    NO vehicle-size pricing
                    NO per-unit qty picker
                    NO products
                    NO custom items
                    NO coupons/discounts
                    NO notes per item
Submit: POST /api/pos/jobs → {customer_id, vehicle_id?, services: [{id, name, price}]}
```

### Walk-In Limitations vs Quote Builder

| Capability | Walk-In Flow | Quote Builder |
|-----------|-------------|---------------|
| Customer lookup + create | Basic (name+phone) | Full (CustomerCreateDialog) |
| Vehicle select + create | Basic | Full (VehicleCreateDialog) |
| Vehicle-size pricing | **NO** — uses first tier | **YES** — resolves per size_class |
| Per-unit pricing (headlights, panels) | **NO** | **YES** — PerUnitPicker |
| Scope tiers (basic/standard/premium) | **NO** — uses first tier | **YES** — ServicePricingPicker |
| Products | **NO** | **YES** — full product catalog |
| Custom line items | **NO** | **YES** — ADD_CUSTOM_ITEM |
| Coupons | **NO** | **YES** — QuoteCouponInput |
| Loyalty points | **NO** | **YES** — QuoteLoyaltyPanel |
| Manual discounts | **NO** | **YES** — permission-gated |
| Per-item notes | **NO** | **YES** |
| Internal notes | **NO** | **YES** |

---

## 3. Data Model Comparison: Quote vs Job

| Field | Quote Has It? | Job Has It? | Notes |
|-------|:---:|:---:|-------|
| `customer_id` | Yes (nullable) | Yes (required) | Quote allows draft without customer |
| `vehicle_id` | Yes | Yes | Both nullable |
| Services with pricing | Yes (quote_items table) | Yes (JSONB `services` column) | **Different formats** — quote uses normalized table, job uses `[{id, name, price}]` snapshot |
| Products | Yes (quote_items with product_id) | **NO** | Jobs only track services |
| Custom items | Yes (quote_items with null service/product) | **NO** | |
| `assigned_staff_id` | **NO** | Yes | Auto-assigned via `findAvailableDetailer()` |
| `estimated_duration` | **NO** (but computable from service base_duration_minutes) | **NO** (implicit from estimated_pickup_at) | Neither stores this directly |
| Status | `draft/sent/viewed/accepted/expired/converted` | `scheduled/intake/in_progress/pending_approval/completed/closed/cancelled` | Completely different lifecycles |
| Subtotal/tax/discount/total | Yes (all 4 columns) | **NO** | Job doesn't track pricing — deferred to transaction |
| Coupon | Yes (discount_amount) | **NO** | |
| Notes | Yes (internal) | Yes (intake_notes) | |
| Valid Until / Expiry | Yes | **NO** | Quote-specific |
| Access token | Yes (for public page) | **NO** (has gallery_token, different purpose) | |
| `appointment_id` | Yes (`converted_appointment_id`) | Yes (`appointment_id`) | Different semantics |
| Timer / work tracking | **NO** | Yes (timer_seconds, work_started_at, etc.) | Job-specific |
| Photo documentation | **NO** | Yes (job_photos table) | Job-specific |

---

## 4. Current Quote → Appointment Conversion

**File:** `src/lib/quotes/convert-service.ts` (125 lines)

**Current flow:**
```
Quote (accepted) → "Schedule" button → ConvertDialog → POST /api/pos/quotes/[id]/convert
   ├── Creates appointment with:
   │   ├── customer_id, vehicle_id from quote
   │   ├── date, time, duration from user input
   │   ├── Auto-assigns detailer via findAvailableDetailer()
   │   ├── Copies subtotal/tax/total from quote
   │   └── Creates appointment_services from quote_items
   ├── Updates quote status → 'converted'
   └── Sets quote.converted_appointment_id
```

There is **NO** quote → job conversion. Only quote → appointment → (auto-populate) → job.

---

## 5. Three Integration Options Evaluated

### Option A — Add "Create Walk-In Job" Button to Quote Builder

**Where:** Alongside "Save Draft" and "Send Quote" in `QuoteTicketPanel` (line 478-494).

**What it does:**
1. Save quote as `status='accepted'` (or skip quote record entirely)
2. Extract services from `quote.items` → map to `JobServiceSnapshot[]`
3. Call `POST /api/pos/jobs` with customer_id, vehicle_id, services
4. Auto-assign detailer via existing `findAvailableDetailer()`
5. Navigate to job detail view

**Pros:**
- User stays in the same rich UI they're already using
- All pricing, coupons, notes carry through to the quote record (audit trail)
- Minimal UI change — just one more button
- Quote record created = paper trail for the walk-in

**Cons:**
- Creates a quote record for every walk-in (may be unnecessary overhead)
- "Valid Until" field and quote-specific language could confuse walk-in context
- Two action buttons already exist; a third may feel crowded

**Code changes:** ~3 files
- `quote-ticket-panel.tsx` — add "Create Job" button + handler
- `POST /api/pos/jobs` — already works, no changes needed
- Optional: new API route or service function to combine save-quote + create-job atomically

---

### Option B — Walk-in Flow Opens Quote Builder in "Walk-In Mode"

**How:** Navigate to `/pos/quotes?mode=builder&walkIn=true`. The `QuoteBuilder` checks for `walkIn` param and:
- Hides "Send Quote" button
- Changes "Save Draft" to "Create Job"
- Hides "Valid Until" date picker
- Changes header from "New Quote" to "New Walk-In"
- On submit: creates job directly (optionally saves quote as accepted for record)

**Pros:**
- Full quote builder UX for walk-ins (vehicle-size pricing, per-unit, products, coupons, discounts)
- Single builder component for both workflows
- Cleanest user mental model: "build a ticket, then either send it or start the job"
- Walk-in mode is just a UI variant of the same flow

**Cons:**
- Requires conditional rendering in `QuoteTicketPanel` (walk-in mode flag)
- Need to decide: save a quote record too, or skip it?
- Products in quote can't map to job services (job's `services` JSONB only tracks `{id, name, price}`)

**Code changes:** ~4-5 files
- `quote-ticket-panel.tsx` — conditional buttons/labels
- `quote-builder.tsx` — accept `walkInMode` prop, pass to ticket panel
- `quotes/page.tsx` — read `walkIn` query param, pass through
- `POST /api/pos/jobs` — no changes needed
- Optional: new handler in ticket panel for "create job from quote state"

---

### Option C — "Convert to Job" Button on Saved/Accepted Quotes

**Where:** Quote detail view (alongside existing "Schedule Appointment" / "Edit" / "Resend").

**What it does:**
1. On any quote with status `draft/sent/viewed/accepted`: show "Create Job" button
2. Click → directly create job from quote data (no date/time scheduling)
3. Updates quote status → `converted`
4. Auto-assigns detailer

**Pros:**
- Works for both walk-ins AND accepted quotes that don't need appointment scheduling
- Useful for: "Customer accepted the quote and is here right now"
- Doesn't modify the quote builder at all
- Can be added purely to the detail view

**Cons:**
- Requires creating+saving a quote first, then navigating to detail, then clicking "Create Job" — 3 steps vs 1
- Not great for a fast walk-in workflow where speed matters
- Doesn't address the core problem: walk-in service picker is too basic

**Code changes:** ~3 files
- Quote detail component — add "Create Job" button
- New API route or extension to `convert-service.ts` — `convertQuoteToJob()` (like `convertQuote()` but creates job instead of appointment)
- `POST /api/pos/jobs` — no changes needed (or call it directly from the new service)

---

## 6. Blockers & Edge Cases

### 6.1 `findAvailableDetailer()` — Not in Quote System
- Quote builder has NO concept of staff assignment
- The convert-to-appointment flow calls `findAvailableDetailer()` in `convert-service.ts`
- For walk-in job creation, `POST /api/pos/jobs` already calls it — **no blocker**

### 6.2 Job `services` Column Format Mismatch
- Quote items: normalized table `quote_items` with `service_id`, `product_id`, `unit_price`, `tier_name`, `notes`
- Job services: JSONB array `[{id, name, price}]` — flat snapshot
- **Mapping needed**: quote items → job service snapshots. Straightforward:
  ```ts
  const jobServices = quote.items
    .filter(item => item.serviceId) // Only services, not products
    .map(item => ({ id: item.serviceId, name: item.itemName, price: item.unitPrice }));
  ```
- **Product items are lost** in the job — jobs only track services. Products would need to go to the POS transaction ticket instead.

### 6.3 Quote-Specific Fields That Don't Apply to Walk-Ins
| Field | Confusing in Walk-In? | Mitigation |
|-------|:---:|------------|
| `valid_until` | Yes | Hide in walk-in mode |
| Quote number (#Q-0042) | Mildly | Fine as internal reference |
| "Send Quote" button | Yes | Hide in walk-in mode |
| QuoteSendDialog | Yes | Don't show in walk-in mode |

### 6.4 iPad Touch Compatibility
The quote builder uses the same POS UI components (catalog browser, search bar, dialog modals) that the rest of the POS uses. These are already touch-optimized. The `ServicePricingPicker` uses large tap targets. **No blocker.**

### 6.5 Coupon/Discount Carryover
Quote coupons and discounts are stored on the quote record but **NOT on the job**. Jobs don't track pricing — that's deferred to the POS transaction. For walk-ins, the coupon could either:
- Be applied when the job is checked out (existing flow: job → checkout → register ticket)
- Or be stored in the job's notes for the cashier to apply at checkout

---

## 7. Recommendation

### Option B is the best choice — Walk-In Mode Flag on Quote Builder

**Rationale:**

| Criteria | Option A | Option B | Option C |
|----------|:---:|:---:|:---:|
| Least code changes | 3 files | 4-5 files | 3 files |
| Best UX for walk-ins | Good | **Best** | Poor (3-step) |
| Most reuse of existing code | High | **Highest** | Medium |
| Speed for staff | Fast | **Fastest** | Slow |
| Handles vehicle-size pricing | Yes | **Yes** | Yes |
| Handles per-unit pricing | Yes | **Yes** | Yes |
| Avoids confusing quote concepts | No (still shows quote UI) | **Yes** (hides quote-specific elements) | No |
| Works for accepted quotes too | No | No | Yes |

**Why not A:** Adding a third button to the existing quote panel is simple but doesn't clean up the UX — staff still sees "Send Quote", "Valid Until", quote numbers, etc. during a walk-in. The mental model is muddled.

**Why not C:** Too many steps for walk-ins. It's a good feature to add *separately* for accepted quotes (customer shows up days later) but doesn't solve the core walk-in speed problem.

**Why B:** The quote builder already does 100% of what the walk-in service picker needs but better. Adding a `walkInMode` prop that:
- Changes the header: "New Walk-In" instead of "New Quote"
- Hides: "Valid Until", "Send Quote" button, quote number display
- Changes "Save Draft" to "Create Job"
- On submit: creates job via `POST /api/pos/jobs`, optionally saves quote for audit trail
- Customer is required (not nullable like drafts)

### Estimated File Changes

| File | Change | Lines |
|------|--------|:---:|
| `src/app/pos/quotes/page.tsx` | Read `walkIn` query param, pass to builder | ~5 |
| `src/app/pos/components/quotes/quote-builder.tsx` | Accept `walkInMode` prop, pass to ticket panel | ~3 |
| `src/app/pos/components/quotes/quote-ticket-panel.tsx` | Conditional rendering: hide quote-specific UI, change buttons, add `handleCreateJob()` | ~40 |
| `src/app/pos/jobs/page.tsx` (or job-queue.tsx) | Change "New Walk-In" button to navigate to `/pos/quotes?mode=builder&walkIn=true` | ~3 |
| **Total** | | **~51 lines** |

No new API routes needed. No database changes needed. `POST /api/pos/jobs` already accepts everything.

### Bonus: Option C as a Follow-Up
After implementing Option B, also add "Create Job" to the quote detail view for accepted quotes where the customer shows up later without an appointment. This is ~30 lines of additional work and complements the walk-in flow.

---

## 8. Risks & Edge Cases

1. **Products on quotes can't transfer to jobs** — Job `services` column is service-only. Products would need to be added to the POS ticket separately at checkout. Document this clearly in the UI.

2. **Quote audit trail vs speed** — Decide whether walk-in mode saves a quote record or not. Recommendation: save it (status='converted') for audit trail — the cost is one DB write and the benefit is full pricing documentation.

3. **Coupon carryover** — The existing `checkout-items` endpoint (`GET /api/pos/jobs/[id]/checkout-items`) populates the register ticket with job services. Coupons aren't included. Could enhance this endpoint to also carry the coupon code from the associated quote.

4. **Duration estimation** — Jobs currently don't estimate duration from services. If you want estimated pickup times on walk-in jobs, you'd sum `base_duration_minutes` from the selected services. This isn't a blocker but a nice enhancement.

5. **Navigation back** — After creating a job from walk-in mode, navigate directly to the job detail view (not back to the quote list). The `onCreated(jobId)` callback already exists in the walk-in flow.
