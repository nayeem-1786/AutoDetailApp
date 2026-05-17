# Loyalty Reversibility Audit — Phase 1 Layer 8c Scoping

> Read-only audit. No code changes.
>
> **Date:** 2026-05-17
> **Driver:** Phase 1 Layer 8c (POS Sale-tab edit-mode UX) is being scoped.
> The session brief asked: when an operator edits an appointment in POS edit
> mode, can they remove or change the loyalty redemption? The reversibility
> framing assumed loyalty was already deducted from the customer balance at
> appointment creation, so editing later would need a refund-style restore.
> This audit traces every writer of `customers.loyalty_points_balance`,
> documents the refund path's restoration logic, and assesses what Layer 8c
> actually needs.
>
> **TL;DR (read before §6):** the foundational assumption in the brief is
> **wrong**. Loyalty is NOT deducted at appointment creation. It is deducted
> only at transaction commit (`POST /api/pos/transactions`). The appointment
> row's `loyalty_points_redeemed` column is a "planned redemption" snapshot,
> not a balance mutation — exactly as documented in the lifecycle persistence
> audit §9.5 (the design intent that drove Item 15g-ii's schema). Therefore
> Layer 8c can edit loyalty (and coupon, and manual_discount) on a
> pre-transaction appointment **without touching customer balance, without
> writing ledger rows, and without freeing coupon use_count slots**. None of
> the refund-path restoration helpers need to be extracted or reused. The
> scope shrinks to: widen the cascade endpoint's write set to accept 6
> optional modifier fields. **Recommended: ship modifier editability (Option
> A1) in Layer 8c at ~0.25 session backend extension on top of the existing
> UX scope.** Refund-path extraction is moot.

---

## Section 1 — Loyalty engine map

### 1.1 Source of truth

**Customer balance:** `customers.loyalty_points_balance` (INTEGER NOT NULL
DEFAULT 0). DB_SCHEMA.md:598.

**Audit trail:** `loyalty_ledger` table. DB_SCHEMA.md:1339-1359. Key columns:

| Column | Type | Notes |
|---|---|---|
| `customer_id` | UUID NOT NULL | FK → `customers(id)` ON DELETE CASCADE |
| `transaction_id` | UUID | **Nullable.** FK → `transactions(id)` ON DELETE SET NULL |
| `action` | `loyalty_action` enum | `earned`, `redeemed`, `adjusted`, `expired`, `welcome_bonus` |
| `points_change` | INTEGER NOT NULL | Signed delta |
| `points_balance` | INTEGER NOT NULL | Resulting balance after this row applied |
| `description` | TEXT | Free-form audit string |
| `created_by` | UUID | FK → `employees(id)` ON DELETE SET NULL |

**Key invariant from the schema:** `transaction_id` is nullable. The system
already supports ledger rows that are NOT tied to a transaction (e.g., admin
manual adjustment, migration import, customer-restore reset). This matters
for §3 below.

### 1.2 All writers of `customers.loyalty_points_balance`

There is **no shared loyalty helper module** in `src/lib/`. Every writer
inlines the pattern: SELECT balance → compute new → INSERT `loyalty_ledger`
row → UPDATE `customers.loyalty_points_balance`. Eight call sites total:

| # | File | Lines | Trigger | `action` | `transaction_id` set? | Audit (`logAudit`)? | Idempotent? |
|---|---|---|---|---|---|---|---|
| 1 | `src/app/api/pos/transactions/route.ts` | 462-479 | Checkout commit (redeem) | `redeemed` | Yes (the new transaction) | No (the route owns its own audit) | No — re-running double-deducts |
| 2 | `src/app/api/pos/transactions/route.ts` | 505-525 | Checkout commit (earn) | `earned` | Yes | No | No |
| 3 | `src/app/api/pos/sync-offline-transaction/route.ts` | 240-310 | Offline queue replay (redeem + earn) | `redeemed` / `earned` | Yes | No | No — relies on offline-queue de-dup elsewhere |
| 4 | `src/app/api/pos/refunds/route.ts` | 566-642 | Refund / void of an existing transaction (restore + clawback) | `adjusted` (both directions) | Yes (the original transaction) | No (refund route owns its own audit) | No |
| 5 | `src/app/api/pos/loyalty/earn/route.ts` | 79-109 | Legacy earn endpoint; comment line 54 confirms transactions/route.ts is the primary earn path | `earned` | Yes | Yes — `action: 'adjust'`, `entityType: 'customer'`, `+N loyalty points` | No |
| 6 | `src/app/api/pos/card-customer/route.ts` | 154-174 | Earn-after-transaction in the card-swipe flow | `earned` | Yes | No | No |
| 7 | `src/app/api/admin/customers/[id]/restore/route.ts` | 37-67 | Customer un-archive — resets balance to 0 (preserves history via ledger row with `points_change: -prevBalance`) | `adjusted` | **No** (transaction_id omitted from insert payload) | No | No |
| 8 | `src/app/admin/customers/[id]/page.tsx` | 558-595 | Admin manual adjustment dialog (client-side mutate via Supabase RLS) | Caller-selected (`adjusted` / `expired` / `welcome_bonus`) | **No** (omitted) | No (server-side `logAudit` would require API-route promotion) | No |

Two non-writers worth distinguishing:

- `src/app/api/pos/loyalty/redeem/route.ts` is **read-only / validation**.
  Despite the name, it does NOT mutate. It checks the customer's balance and
  returns `{ points_to_redeem, discount, remaining_balance }` so the cart can
  preview the math. The actual deduction happens at transaction commit (#1
  above). This is why all Layer 15g-iii's load-endpoint snapshots flow
  through unchanged into the cart — the snapshot is a plan, not a fact.

- `src/app/api/migration/loyalty/route.ts` 47-90 — bulk import for legacy
  Square data; only runs at migration time, not in normal operation.

### 1.3 DB triggers

Per DB_SCHEMA.md inspection of the `customers` and `loyalty_ledger` tables:
**no DB triggers** mutate `customers.loyalty_points_balance` automatically.
The visit-stats trigger `tr_update_customer_stats`
(transactions/route.ts:448) handles visit_count / last_visit_at but does NOT
touch loyalty. Every loyalty balance write is application-level.

### 1.4 Pre-transaction snapshot writers

Three places persist `loyalty_points_redeemed` / `loyalty_discount` to a
NON-transaction row, with **zero balance impact**:

| File | Lines | Target | Notes |
|---|---|---|---|
| `src/app/api/book/route.ts` | 333, 361-362 | `appointments` insert | Online booking. Sets the snapshot; does NOT mutate customer balance. |
| `src/lib/quotes/convert-service.ts` | 100-101, 148-149 | `appointments` insert | Quote-to-appointment conversion. Same pattern. |
| `src/lib/quotes/quote-service.ts` (Layer 15g-ii) | — | `quotes` insert/update | Pre-conversion plan; same pattern. |

This is the contract Layer 8b's cascade endpoint operates inside: the
appointment row carries a planned-redemption snapshot that future
transaction-commit code reads and acts on.

---

## Section 2 — Refund-path loyalty restoration

### 2.1 Location

`src/app/api/pos/refunds/route.ts` lines 566-642. This is the ONLY
"reverse-direction" loyalty code path in the codebase.

### 2.2 How it identifies points to restore

The refund handler reads the **transaction row's** stored snapshot:

```ts
// refunds/route.ts:570-580
if (transaction.customer_id && (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0)) {
  const { data: customer } = await supabase
    .from('customers')
    .select('loyalty_points_balance')
    .eq('id', transaction.customer_id)
    .single();
  // ...
  let runningBalance = customer.loyalty_points_balance;
  const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
  const isFullRefund = totalRefundAmount >= txFullAmount;
```

`transaction.loyalty_points_redeemed` is the snapshot that was deducted at
commit. Full refund restores the full amount; partial refund pro-rates:

```ts
// refunds/route.ts:584-588
if (transaction.loyalty_points_redeemed > 0) {
  restoredPoints = isFullRefund
    ? transaction.loyalty_points_redeemed
    : Math.floor(transaction.loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));
```

### 2.3 What helper is called

**None.** The restoration is inlined. The two DB calls (ledger insert +
customer update) are written directly in the route handler:

```ts
// refunds/route.ts:592-600
await supabase.from('loyalty_ledger').insert({
  customer_id: transaction.customer_id,
  transaction_id: transaction.id,
  action: 'adjusted',
  points_change: restoredPoints,
  points_balance: runningBalance,
  description: `Refund: restored ${restoredPoints} redeemed pts`,
  created_by: posEmployee.employee_id,
});
```

```ts
// refunds/route.ts:626-629
await supabase
  .from('customers')
  .update({ loyalty_points_balance: Math.max(0, runningBalance) })
  .eq('id', transaction.customer_id);
```

### 2.4 Pure-function callability

The restoration logic is **not exposed as a reusable function**. It is
tightly coupled to:

- The original `transaction` row (needs `loyalty_points_redeemed`,
  `loyalty_points_earned`, `total_amount`, `tip_amount`, `customer_id`).
- The `totalRefundAmount` computed elsewhere in the refund handler
  (for pro-rate math).
- The refund's `posEmployee.employee_id` (for `created_by`).
- Persistence of `points_restored` / `points_clawed_back` to the `refunds`
  table (lines 634-642) — refund-specific schema.

Extracting it as a `(customer_id, points, reason)` helper would require
peeling off the pro-rate math and the refund-row metadata writes — doable,
but the refund handler is the only caller and lifting it has no concrete
beneficiary today. **No callers outside the refund route.**

### 2.5 Coupon parallel

For symmetry: `refunds/route.ts` 680-704 also reverses
`coupons.use_count -= 1` on full refund only (partial refunds leave use_count
intact, since the coupon was still partially "consumed"). Same pattern —
inline, refund-coupled, no shared helper.

---

## Section 3 — Reusability assessment for Layer 8c

### 3.1 Reframing the scenario

The session brief describes the scenario as:

> Appointment has `loyalty_points_redeemed: 152` (deducted at appointment-
> creation time). Operator removes loyalty redemption. Cascade must:
> zero out appointment loyalty fields + **restore 152 points to customer
> balance** + emit audit.

**The bolded clause is incorrect.** Per §1.2 and §1.4 of this audit, points
are NOT deducted at appointment-creation time. The 152 points still sit on
`customers.loyalty_points_balance`. There is nothing to restore.

The correct framing for each sub-case (all assume the appointment's status
is not `completed`/`cancelled`, which the cascade endpoint already blocks):

| Sub-case | Customer balance impact | Ledger row needed? | Effort |
|---|---|---|---|
| Pure removal: appointment `loyalty_points_redeemed: 152 → 0` | **None.** No deduction was ever applied. | **No.** | UPDATE appointment row only |
| Partial change: `152 → 50` | **None.** | **No.** | UPDATE appointment row only |
| Pure addition: `0 → 50` | **None.** Pre-transaction; deduction happens at checkout. | **No.** | UPDATE appointment row only |
| Re-application: `50 → 100` | **None.** | **No.** | UPDATE appointment row only |

The customer balance is reconciled exactly once, when the transaction commits
at the eventual checkout (refs `pos/transactions/route.ts:463-479`). At that
moment, the transaction reads `data.loyalty_points_redeemed` from the cart
(which Layer 8b hydrates from the appointment row), so the most-recently-
saved appointment value is the one that gets honored. No double-deduction.
No drift.

### 3.2 What the cascade endpoint needs

`src/lib/appointments/service-edit.ts` currently (Layer 15g-iii contract):

- Reads `appointment.coupon_discount` / `loyalty_discount` /
  `manual_discount_value` to feed `computeTotalsForServiceEdit`.
- Writes back `subtotal`, `total_amount`, `discount_amount`, `updated_at`.
- **Never touches** the per-modifier columns (`coupon_code`,
  `coupon_discount`, `loyalty_points_redeemed`, `loyalty_discount`,
  `manual_discount_value`, `manual_discount_label`) on UPDATE.

For Layer 8c modifier editing, the cascade endpoint needs to **widen its
write set** to optionally accept and persist these six fields. The Zod
schema (`editServicesBodySchema` in `src/lib/appointments/edit-services.ts`)
gets six new optional/nullable fields; `computeTotalsForServiceEdit` already
accepts the per-modifier values (15g-iii); the UPDATE statement at
`service-edit.ts:358-366` adds the new columns to its `.update({...})`
object. ~30-50 LOC.

### 3.3 What the cascade endpoint does NOT need

- No `customers.loyalty_points_balance` UPDATE.
- No `loyalty_ledger` INSERT.
- No `coupons.use_count` adjustment.
- No call into the refund-path inline helper.
- No new permission key.

### 3.4 Cleanest call signature

The cascade endpoint already has the actor + ip + source + supabase client.
For modifier editing, the route just passes the new optional fields through
the existing `body` argument:

```ts
// Hypothetical Layer 8c-aware request body (no helper extraction needed):
{
  services: [...],                       // existing
  coupon_code?: string | null,           // new
  coupon_discount?: number | null,       // new
  loyalty_points_to_redeem?: number | null,  // new
  loyalty_discount?: number | null,      // new
  manual_discount_value?: number | null, // new
  manual_discount_label?: string | null, // new
}
```

The existing Layer 15g-iii precedent for `coupon_code`/`coupon_discount`
mutual coherence (`appointments_manual_discount_coherent` CHECK constraint,
DB_SCHEMA.md:191) tells us the DB will reject inconsistent payloads at the
write boundary — Zod + DB defense.

---

## Section 4 — Audit-trail considerations

### 4.1 Existing audit on the cascade endpoint

`src/lib/appointments/service-edit.ts:427-456` already emits an audit row
when services change:

```ts
logAudit({
  userId: input.actor.authUserId,
  userEmail: input.actor.email,
  employeeName: input.actor.name,
  action: 'update',
  entityType: 'booking',
  entityId: id,
  entityLabel: `Appointment #${id.slice(0, 8)}`,
  details: {
    field: 'services',
    before: existingServices.map(...),
    after: newServices.map(...),
    subtotal_before, subtotal_after,
    total_before, total_after,
    cascaded_to_job_id: linkedJobId,
    notification_suppressed: true,
  },
  ipAddress: input.ipAddress ?? '',
  source: input.source,   // 'admin' or 'pos'
});
```

For Layer 8c modifier edits, the `details.field` would extend to a more
neutral `modifiers_and_services` (or a structured `{services_changed,
modifiers_changed}` payload). The `before`/`after` shape would include the
six modifier columns alongside the existing services diff.

### 4.2 Loyalty-specific audit requirement?

Per §3.1, no loyalty balance mutation happens on edit — so the audit row
only documents the APPOINTMENT's planned redemption change, not a customer-
balance change. The existing per-customer ledger view (`admin/customers/[id]
/page.tsx` loyalty tab) won't surface a new row, because no new row was
written. That's correct behavior: the customer's balance didn't move.

If the user wants pre-transaction visibility of "Sam edited appointment #abc
to remove 152 points of planned redemption" — that visibility is the
**`audit_log` entry** described above, NOT a `loyalty_ledger` entry. The two
serve different audiences:

- `loyalty_ledger` = customer-facing transaction history (their balance
  changed because of X). Stays transaction-bound by design (§1.2 row #7-8
  are the only non-transaction-bound writers, and both are admin tools).
- `audit_log` = operator-facing change-tracking ("Sam at IP X edited record
  Y on date Z, here's the diff"). Already wired through the cascade
  endpoint's `logAudit` call.

### 4.3 Existing helper extension cost

Zero. The `audit_log` entry the cascade already writes is the right vehicle.
The `details` JSONB payload absorbs the six new modifier fields without
schema change.

---

## Section 5 — Reversibility edge cases

### 5.1 Customer balance went negative since redemption (cited in brief §5)

The brief's scenario: customer redeemed 152 (balance 152 → 0), then
redeemed more elsewhere (balance now -100), and a 152-point restore would
bring balance to +52.

**This scenario does not arise in Layer 8c**, because pre-transaction
redemption doesn't decrement the balance in the first place. The customer's
balance never went negative as a result of the edit-mode redemption — the
deduction is deferred to transaction commit.

The closest related real-world bug — which is **pre-existing and
unrelated to Layer 8c** — is in
`src/app/api/pos/transactions/route.ts:464`:

```ts
currentBalance = Math.max(0, currentBalance - data.loyalty_points_redeemed);
```

If the customer's balance dropped below the appointment's planned redemption
between booking and checkout (e.g., they redeemed elsewhere first), the
transaction commit clamps to 0 — the customer effectively gets a discount
on points they don't have. This is a separate persistence-gap bug; it is
NOT introduced by Layer 8c and NOT in Layer 8c's scope to fix.

### 5.2 Customer record soft-deleted (cited in brief §5)

CLAUDE.md Rule 18 enforces that forward-looking queries filter
`deleted_at IS NULL`. The Layer 8b load endpoint at
`src/app/api/pos/appointments/[id]/load/route.ts:63` joins
`customer:customers!appointments_customer_id_fkey` **without** a
`deleted_at` filter — which is intentional per the rule's "historical joins
are intentionally unfiltered" clause; the appointment still belongs to a
customer record even if the customer was archived.

For Layer 8c modifier editing, no balance write touches the customer at all
(§3.1). So a soft-deleted customer attached to an edit-mode appointment
poses no integrity risk — the cascade endpoint writes appointment fields
only. **Existing behavior is correct.**

If the user wants stricter UX on the front-end (e.g., "this customer is
archived — block edit"), that's a Layer 8c UX decision, not a data-integrity
requirement. The cascade endpoint accepts the write either way.

### 5.3 Coupon usage limits (cited in brief §5, bonus check)

Coupon `use_count` is incremented at transaction commit
(`pos/transactions/route.ts:586`) and decremented on **full refund only**
(`pos/refunds/route.ts:692`). Pre-transaction, the `use_count` is never
touched.

For Layer 8c, removing a coupon from an appointment in edit mode just
updates `appointments.coupon_code` and `appointments.coupon_discount`. The
eventual transaction commit either won't include the coupon (if removed) or
will include the new one (if swapped). **No `use_count` slot to free
because none was claimed.**

The validation endpoint `src/app/api/pos/coupons/validate/route.ts:75-77`
checks `use_count < max_uses` at apply time — a single coupon with
`max_uses: 1` won't accept a second validation until its use_count is
freed (which happens via the refund path). Layer 8c can re-validate when
the operator picks a new coupon, and validation will correctly reject if
the coupon is exhausted. No new logic needed.

### 5.4 Concurrent edits (not in brief but worth noting)

Today Item 15a's cascade endpoint has no optimistic concurrency control
(`updated_at` ETag) — see audit §4.3 in the QUOTE_TO_POS_EDIT_AUDIT.
Adding modifier editability inherits the same absence. Acceptable for the
1-3 detailer + 1 cashier operator pool; if it becomes a problem, OCC adds
to both surfaces (services + modifiers).

### 5.5 Post-transaction edits (not in brief but worth flagging)

The cascade endpoint already blocks `completed` and `cancelled` status
(service-edit.ts:190-198). For appointments where the customer has paid a
deposit but the final transaction hasn't yet committed (status = `confirmed`,
payment_status = `partial`), the appointment IS editable today. The deposit
transaction's `loyalty_points_redeemed: 0` is unrelated to the final
transaction's eventual value, so Layer 8c modifier edits stay safe in this
window. **No additional guard needed.**

---

## Section 6 — Recommendation

### 6.1 Net finding

The session brief's loyalty-reversibility framing is built on an incorrect
premise: it assumes pre-transaction redemption already mutated the customer
balance, which would require restoration on edit. The actual architecture
(per lifecycle persistence audit §9.5 and confirmed across all 8 writers in
§1.2 of this audit) is:

- **Pre-transaction:** `appointments.loyalty_points_redeemed` is a planned-
  redemption snapshot. `customers.loyalty_points_balance` is unchanged.
  `loyalty_ledger` has no row.
- **Transaction commit:** `customers.loyalty_points_balance` decrements,
  `loyalty_ledger` inserts with `action: 'redeemed'`, `transactions
  .loyalty_points_redeemed` snapshots the committed value.
- **Refund:** the refund path's inline restore logic
  (`pos/refunds/route.ts:566-642`) is the ONLY reverse-direction code path.
  It reads the COMMITTED transaction's snapshot and restores against the
  current customer balance.

Layer 8c lives entirely in the pre-transaction window. Modifier edits don't
need restoration logic.

### 6.2 Option A1 (recommended): ship modifier editability in Layer 8c

**Effort:** ~0.25 session of backend extension on top of Layer 8c's
existing UX scope (which is ~1 session per the audit §8.2 estimate).

**Scope:**

1. Extend `editServicesBodySchema` in `src/lib/appointments/edit-services.ts`
   with six optional/nullable modifier fields. ~10 LOC + 1 Zod
   `.refine()` for `manual_discount_value`/`manual_discount_label`
   coherence (mirror of `appointments_manual_discount_coherent` CHECK).
2. Extend the appointment UPDATE at `src/lib/appointments/service-edit
   .ts:358-366` to write the six columns when provided. ~10 LOC.
3. Extend the `logAudit` call (service-edit.ts:427-456) `details` payload
   to include modifier before/after. ~10 LOC.
4. Update tests in `service-edit.test.ts` and both route tests
   (admin + POS) to pin the new write path. ~80 LOC across 2-3 new cases.
5. Update Layer 8c's "Save Changes" handler to pass the cart's current
   `coupon`/`loyaltyPointsToRedeem`/`loyaltyDiscount`/`manualDiscount`
   into the PUT body.

**No customer-balance writes. No ledger writes. No coupon use_count writes.
No refund-helper extraction.**

**No new permission key.** The existing `appointments.reschedule` (admin)
and `pos.jobs.manage` (POS) gates cover modifier editing identically.

### 6.3 Option A2 (fallback): defer modifier editability to Layer 8c.1

If the user wants to keep Layer 8c's scope minimum-viable (services only),
modifier editing can slot in as a small follow-up after 8c lands. Same
~0.25 session cost. No architectural reason to defer.

### 6.4 What is NOT in scope for Layer 8c

- Loyalty refund-helper extraction. The refund-path's inline logic stays
  inline; no caller would exist outside the refund route.
- Loyalty balance reconciliation pre-transaction. The architecture's
  intentional design is plan-now-deduct-later.
- The `pos/transactions/route.ts:464` balance-clamp bug
  (`Math.max(0, ...)`). Separate persistence-gap concern; flagged here for
  awareness but explicitly out of Layer 8c scope.
- Post-transaction edit support. Already blocked by the cascade endpoint's
  `completed`/`cancelled` status guard.

### 6.5 Recommendation

**Ship Option A1.** Pre-transaction modifier editing is architecturally
free for the customer-balance side because the audit's lifecycle invariant
(planned-redemption snapshot) makes it free. The brief's reversibility
framing pointed at refund-path extraction, but the refund path is the wrong
abstraction — it's transaction-bound by design and doesn't apply pre-
transaction. Widen the cascade endpoint's write set; let the existing
transaction-commit code path handle the eventual balance reconciliation.

The whole "Layer 8c suppresses loyalty redemption UI" line in the audit
§8.2 estimate (Layer 8c — "suppress checkout/loyalty/hold/clear") is over-
cautious in light of this finding. The loyalty redemption UI should stay
**visible and editable** in edit mode; the cart's modifier state should
flow into the cascade endpoint's payload on Save Changes. The only UX
suppression needed in edit mode is checkout/payment flow (no transaction
commits from edit mode) — Layer 8b's `editMode` flag already gates that
cleanly.

---

## Appendix A — Files referenced

### Source code (read-only inspection)

- `src/app/api/pos/transactions/route.ts` — primary loyalty earn + redeem on
  transaction commit; coupon use_count increment
- `src/app/api/pos/sync-offline-transaction/route.ts` — mirror for offline
  replay
- `src/app/api/pos/refunds/route.ts` — refund-path loyalty restore + clawback
  + coupon use_count decrement (full refund only)
- `src/app/api/pos/loyalty/redeem/route.ts` — read-only validation; NO
  mutation
- `src/app/api/pos/loyalty/earn/route.ts` — legacy earn endpoint; logAudit
- `src/app/api/pos/card-customer/route.ts` — card-swipe earn-after-tx flow
- `src/app/api/admin/customers/[id]/restore/route.ts` — balance reset on
  un-archive
- `src/app/admin/customers/[id]/page.tsx` — admin manual adjustment (client-
  side via Supabase RLS)
- `src/app/api/migration/loyalty/route.ts` — migration import
- `src/app/api/book/route.ts` — appointment INSERT with planned-redemption
  snapshot (no balance touch)
- `src/lib/quotes/convert-service.ts` — quote → appointment with snapshot
- `src/lib/appointments/service-edit.ts` — Layer 8a cascade helper (read +
  recompute + write; NO modifier write today)
- `src/lib/appointments/edit-services.ts` — `editServicesBodySchema` Zod
  schema (extension target for A1)

### Documentation

- `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md` §1.3, §9.5 (the
  design intent that drove Item 15g-ii and confirms the planned-redemption
  invariant)
- `docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` §7, §8.2 (Layer 8c
  framing the current session is adjusting)
- `docs/dev/DB_SCHEMA.md` `customers` §578-616, `loyalty_ledger` §1339-1359,
  `appointments` §144-206
- `docs/dev/ROADMAP-13-ITEMS.md` Item 15f Phase 1 + Item 15g (5-layer
  Layer 15g-i through 15g-v completion)
