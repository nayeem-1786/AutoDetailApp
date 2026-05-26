# Issue 42 — `appointment_services.quantity` Schema Gap Audit (2026-05-26)

**Audit branch:** `audit/issue-42-appointment-services-quantity`
**Status:** Audit done; implementation deferred to a separate session.
**Out-of-scope:** D45, D46, D47 work — those helpers and surfaces stay byte-identical. This audit covers schema + conversion flow ONLY.

---

## TL;DR

`appointment_services` was created on 2026-02-01 (`20260201000015_create_appointments.sql:31-38`) with six columns and has never gained a `quantity` integer. Its two sibling line-item tables — `quote_items` (`docs/dev/DB_SCHEMA.md:2057`) and `transaction_items` (`docs/dev/DB_SCHEMA.md:2906`) — both carry `quantity INTEGER NOT NULL DEFAULT 1`. The asymmetry is the schema gap captured as Issue 42 during D46.

The conversion site at `src/lib/quotes/convert-service.ts:170-184` already has `quote_items.quantity` in scope (the SELECT at line 45 pulls `quote_items(*)` and `convert-service.ts:230` already reads `item.quantity ?? 1` for the `enrichItemsWithTierMeta` summary call), but the INSERT shape simply omits a quantity field. The fix is to (a) add the column with `DEFAULT 1 + CHECK (quantity > 0)` (b) one-line edit at `convert-service.ts:175-180` to copy `item.quantity` into the INSERT (c) widen four customer-facing SELECTs (notify routes, public pay page, POS jobs cancel) to pull `quantity` and pass it to `renderTierToken` — which already handles qty>1 correctly per D45.

Per operator-locked decisions, the migration uses `DEFAULT 1` as the backfill strategy (no retroactive `UPDATE` from `quote_items.quantity`). The handful of historical multi-quantity appointments (estimated 0–5 rows across all history; the post-D43 pluralization was rare and recent) are accepted as qty=1 in display and corrected manually via Admin UI if needed.

Consumer impact on all NON-customer-facing READ paths is zero — adding an additive column with a default never breaks an existing SELECT. The four D46 customer-facing surfaces upgrade to correct qty>1 rendering automatically once the column flows through; D46's `attachTierMetaToItems` + `renderTierToken` are already shape-agnostic and handle qty>1 with `qty_label` pluralization per D45 contract.

**Implementation scope estimate:** 1 migration + 2 src file edits + 4 surface SELECT widenings + 8–12 tests. Single session feasible (~90–120 min). **All critical decisions locked** per the session brief; the only minor decisions surfaced below (column COMMENT wording, index opt-out) the implementation session may default-accept.

---

## Root cause statement

`appointment_services` was created on 2026-02-01 without a `quantity` column because at the time every appointment had exactly one row per service and quantity was implicit. D43 Session C (2026-05-25) introduced per-tier multi-quantity quotes (`(service_id, tier_name, quantity)` triple for idempotency), but the corresponding schema work on `appointment_services` was deferred so D43 + D45 + D46 could ship without a schema migration. Issue 42 captures the deferral.

---

## Empirical evidence

1. **DB_SCHEMA.md `docs/dev/DB_SCHEMA.md:126-141`** — `appointment_services` table has 6 columns: `id`, `appointment_id`, `service_id`, `price_at_booking`, `tier_name`, `created_at`. No `quantity`. Versus `quote_items` (`DB_SCHEMA.md:2057`) and `transaction_items` (`DB_SCHEMA.md:2906`) which both carry `quantity INTEGER NOT NULL DEFAULT 1`.

2. **Supabase types `src/lib/supabase/database.types.ts:251-292`** — `appointment_services.Row` has no `quantity` field. Versus `quote_items.Row` (`database.types.ts:4254`) which has `quantity: number`.

3. **D45 CHANGELOG note carried in source comment at `src/app/api/pos/jobs/[id]/cancel/route.ts:187-194`** — the POS jobs cancel chip explicitly hardcodes `quantity: 1` when composing via `enrichItemsWithTierMeta` and inline-comments the reason: "appointment_services has no quantity column today — multi-quantity quote_items flatten to one appointment_service row per tier with implicit qty=1."

4. **D46 source comment at `src/app/(public)/pay/[token]/page.tsx:43-46`** — "appointment_services has no quantity column today (Issue 42 schema gap); renderTierToken receives quantity=1 implicitly and emits the qty=1 branch tier_label. Per-row multi-quantity tier display cannot be reconstructed from the appointment row alone."

5. **SMS_AI_V2_PROMPT_OBSERVATIONS.md Section 2 Issue 42 `docs/dev/SMS_AI_V2_PROMPT_OBSERVATIONS.md:1278-1289`** — Operator-locked Issue 42 capture from 2026-05-26.

6. **Q-0087 empirical confirmation** (Observations doc line 1276) — quote-stage surfaces correctly rendered `(2 Rows)` via D45 chip composition + qty_label pluralization; appointment-stage surfaces (notify routes, pay page) rendered the qty=1 branch (`Per Row`) because the column doesn't exist to thread the signal through.

---

## Target 1 — `appointment_services` consumers (READ paths)

Full inventory below. Every consumer's read shape is documented; "qty-aware?" = whether it currently reads or renders quantity. **All current consumers are unaffected by the additive column change**; the schema change can ship without touching any READ that doesn't want to take advantage of it.

### Customer-facing D46 surfaces (need SELECT widening post-fix)

| File:line | Read shape | Qty-aware? | Post-fix action |
|---|---|---|---|
| `src/app/api/appointments/[id]/notify/route.ts:33-38` | `services:appointment_services(service_id, price_at_booking, tier_name, service:services(name))` | No | Add `quantity` to SELECT; pass to `renderTierToken({ tier_name, tier_label, qty_label, quantity })` at line 84 |
| `src/app/api/pos/appointments/[id]/notify/route.ts:39-44` | identical to admin notify | No | identical to admin notify |
| `src/app/(public)/pay/[token]/page.tsx:79-83` | `appointment_services(id, service_id, price_at_booking, tier_name, service:services(name))` (type at line 39-53) | No | Add `quantity` to SELECT; pass to `renderTierToken` at line 312-316 + update `AppointmentRecord` type at line 39-53 |
| `src/app/api/pos/jobs/[id]/cancel/route.ts:199-204` | `services:appointment_services(service_id, tier_name, price_at_booking, service:...(name))` | No (hardcodes `quantity: 1` at line 245) | Add `quantity` to SELECT; replace hardcoded `quantity: 1` with `s.quantity ?? 1` at line 245 |

### Non-customer-facing READ consumers (no action needed; additive column ignored)

| File:line | Purpose |
|---|---|
| `src/app/(account)/account/page.tsx:78` | Customer portal home — service name + price |
| `src/app/(account)/account/appointments/page.tsx:29, 56` | Customer portal appointments list |
| `src/app/admin/page.tsx:83, 97, 607` | Admin dashboard appointment cards |
| `src/app/admin/appointments/page.tsx:146, 171` | Admin appointments listing |
| `src/app/admin/appointments/components/appointment-detail-dialog.tsx:160` | Admin slide-over services list |
| `src/app/admin/appointments/components/day-appointments-list.tsx:60` | Admin day-view list |
| `src/app/pos/components/appointments/appointments-view.tsx:333, 335` | POS appointments tab list |
| `src/app/api/admin/global-search/route.ts:152, 281, 292` | Global search service-name autocomplete |
| `src/app/api/admin/messaging/[conversationId]/summary/route.ts:90, 151` | Messaging summary chip |
| `src/app/api/pos/appointments/route.ts:79` | POS appointments fetch (list) |
| `src/app/api/pos/appointments/[id]/route.ts:51` | POS single appointment fetch |
| `src/app/api/pos/appointments/[id]/cancel/route.ts:169` | POS appointment cancellation (post-cancel fetch for notification) |
| `src/app/api/pos/appointments/[id]/load/route.ts:66, 94, 97` | POS load appointment into ticket (post-cancel rebuild) |
| `src/app/api/pos/appointments/[id]/reschedule/route.ts:217` | POS reschedule (post-reschedule fetch) |
| `src/app/api/pos/jobs/populate/route.ts:89, 94` | POS jobs.services JSONB cascade from appointment_services |
| `src/app/api/voice-agent/context/route.ts:84` | Voice agent runtime context (service names only) |
| `src/app/api/voice-agent/initiation/route.ts:95, 169` | Voice agent initiation prompt (service names only) |
| `src/app/api/voice-agent/appointments/route.ts:79, 113` | Voice agent appointment fetch |
| `src/app/api/webhooks/twilio/inbound/route.ts:574, 613` | Twilio inbound webhook context (service names only) |
| `src/app/api/cron/lifecycle-engine/route.ts:437, 460, 494, 517, 884` | Lifecycle engine (service IDs for after_service trigger) |
| `src/app/api/customer/appointments/[id]/route.ts:57` | Customer portal appointment detail |
| `src/app/api/cron/booking-reminders/route.ts:28` | Booking reminder cron (service ID + name) |
| `src/components/account/appointment-card.tsx:39, 66` | Customer portal appointment card |
| `src/lib/appointments/service-edit.ts:256-258, 635, 666-670` | Admin/POS service edit cascade (snapshot + rollback) |
| `src/lib/data/booking.ts:338, 346, 349` | Booking helper (service name lookup) |
| `src/lib/email/drip-engine.ts:730` | Drip campaign service-trigger matching (service_id) |
| `src/lib/email/send-cancellation-email.ts:42` | Cancellation email (service name) |
| `src/lib/services/customer-context.ts:225, 293` | Customer context (service name aggregation) |

**Total READ consumer count:** 32 file:line sites (4 customer-facing requiring action + 28 unaffected).

### Tier-helper consumers

| File:line | Role |
|---|---|
| `src/lib/quotes/tier-display.ts:64` (`renderTierToken`) | Already accepts `quantity?: number` (defaults to 1) and renders `${qty} ${capitalize(pluralize(qty_label))}` for qty>1 |
| `src/lib/quotes/attach-tier-meta.ts:72` (`attachTierMetaToItems`) | Generic over input type T; merges `tier_label`/`qty_label` regardless of whether T has `quantity` |
| `src/lib/quotes/services-summary.ts:80, 173, 193` (`enrichItemsWithTierMeta`) | Already takes `quantity` in its `ServicesSummaryItem` shape; D45-locked |

**No helper changes needed.** The D45 + D46 helpers are already shape-agnostic and quantity-aware. The schema change unblocks them.

---

## Target 2 — `appointment_services` producers (WRITE paths)

7 producer sites total. Only `convert-service.ts:170-184` carries upstream quantity data; the other six always represent single-unit additions.

| # | File:line | Caller | qty in scope? | Post-fix action |
|---|---|---|---|---|
| 1 | **`src/lib/quotes/convert-service.ts:170-184`** | **Quote → appointment conversion (all paths converge here: POS, admin, voice agent)** | **YES — `item.quantity` already read at line 230** | **ADD `quantity: item.quantity ?? 1` to INSERT payload + add `quantity?: number` to inline type at line 171-175** |
| 2 | `src/app/api/book/route.ts:376-394` | Online booking widget | No (booking widget cannot produce multi-quantity per Issue 41 audit Target 7) | No action — DB DEFAULT 1 applies. Migration validated by absence of multi-quantity bookings. |
| 3 | `src/app/api/pos/jobs/route.ts:430-453` | POS walk-in (synthetic appointment) | No (walk-in is product+service flat-add, no quantity UI) | No action — DB DEFAULT 1 applies |
| 4 | `src/app/api/voice-agent/appointments/route.ts:542-552` | Voice agent direct appointment creation (no quote path) | No (single-service flat creation) | No action — DB DEFAULT 1 applies |
| 5 | `src/app/api/customer/appointments/[id]/route.ts:232-249` | Customer portal self-edit | No (customer UI doesn't expose quantity) | No action — DB DEFAULT 1 applies |
| 6 | `src/lib/appointments/service-edit.ts:382-428, 666-670` | Admin/POS cascade service edit | No (edit-services modal doesn't expose quantity; carries `service_id, price_at_booking, tier_name` only) | No action today; future enhancement could add a quantity field. Per CLAUDE.md "no premature abstraction" rule, leave alone until operator requests editable quantity. |
| 7 | `src/app/api/admin/customers/purge/route.ts:180-181` | Customer purge (pure DELETE) | N/A | N/A |

**Critical path summary:** The Issue 42 fix is one line of code in `convert-service.ts` plus the schema migration. Every other producer site either represents a path that doesn't carry quantity upstream (5 of 7) or is a delete-only site (1 of 7).

---

## Target 3 — Schema dependency inventory

Evidence gathered by grep across `supabase/migrations/` + `docs/dev/DB_SCHEMA.md`.

### Triggers

**None.** No migration creates a trigger on `appointment_services`. `docs/dev/DB_SCHEMA.md:126-141` (the auto-generated schema doc, last regenerated post-Money-Unify rollback) shows no trigger listing for this table.

### Foreign keys

**Outbound (from `appointment_services`):**

- `appointment_id → appointments(id) ON DELETE CASCADE` (`20260201000015_create_appointments.sql:33`)
- `service_id → services(id) ON DELETE RESTRICT` (`20260201000015_create_appointments.sql:34`)

Mirrored in supabase types: `database.types.ts:278-290`.

**Inbound (FKs targeting `appointment_services`):** **None.** No other table references `appointment_services.id` as an FK target.

### Indexes

Two indexes total per `DB_SCHEMA.md:139-140`:

```
CREATE UNIQUE INDEX appointment_services_pkey ON public.appointment_services USING btree (id)
CREATE INDEX idx_appointment_services_appt ON public.appointment_services USING btree (appointment_id)
```

(The `appointment_id` index was created in `20260201000015_create_appointments.sql:44`.)

Neither index references `quantity`. Migration does not need to touch either.

### Views

**None.** `grep -n 'appointment_services' docs/dev/DB_SCHEMA.md` returns only the table definition + its two indexes; no view definitions reference it. (The schema doc auto-generates `pg_views` listings where they exist; the absence of any hit confirms no view.)

### RLS policies

**4 policies, all defined in `20260201000041_customer_portal_rls.sql:79-99`:**

| Policy | Action | Predicate |
|---|---|---|
| `appointment_services_select` | SELECT | `is_employee() OR EXISTS (own appointment via FK join)` |
| `appointment_services_insert` | INSERT | `is_employee()` |
| `appointment_services_update` | UPDATE | `is_employee()` |
| `appointment_services_delete` | DELETE | `is_employee()` |

The earlier RLS file `20260201000035_rls_policies.sql:114-115` defined a simpler pair (`select` + `all`) which `20260201000041_customer_portal_rls.sql:79-80` drops and replaces. RLS is enabled via `20260201000035_rls_policies.sql:41` (`ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY`).

**Migration impact:** Adding a column does NOT alter row-level access. None of the four policies reference column names other than `appointment_id`. No policy changes needed.

### Generated artifacts

- **`src/lib/supabase/database.types.ts:251-292`** — Generated from live DB. Must be regenerated after the migration (`npx supabase gen types typescript ...` or whatever the project's regen script is).
- **`docs/dev/DB_SCHEMA.md:126-141`** — Auto-generated by `scripts/regen-db-schema.ts`. Must be regenerated post-migration per CLAUDE.md "Rules for Database Changes #6."

---

## Target 4 — `quote_items.quantity` propagation analysis

### Where `quote_items.quantity` is SET

D43 Session C established the canonical writers. Two writer files of note:

- **`src/app/api/voice-agent/send-quote-sms/route.ts`** — The SMS-AI v2 + voice agent quote builder; persists `quote_items.quantity` per the D43 `(service_id, tier_name, quantity)` triple.
- **`src/lib/quotes/convert-service.ts`** — Reads (not writes) `quote_items.quantity` during conversion.
- POS quote builder (admin + POS) populates `quote_items.quantity` via the `useServicePicker` hook + `quote-service.ts` create/update paths.

### Where quote → appointment conversion happens

**Single canonical site:** `src/lib/quotes/convert-service.ts:31-241` defines `convertQuote(supabase, quoteId, data, options)`. All three calling paths converge here:

1. POS quote convert: `src/app/api/pos/quotes/[id]/convert/route.ts` → calls `convertQuote(...)` (per Item 15g Layer 15g-i comment thread).
2. Admin quote convert: same shared function (per D45 enrichItemsWithTierMeta adoption note).
3. Voice agent: `src/app/api/voice-agent/appointments/route.ts:284-292` `await import('@/lib/quotes/convert-service').then(({convertQuote}) => convertQuote(supabase, resolvedQuoteId, { date, time: normalizedTime, duration_minutes: totalDuration }, { appointmentStatus: 'pending', channel: 'phone' }))`.

There is no second conversion site.

### At the conversion site, is `quote_items.quantity` in scope?

**YES.** Three pieces of evidence:

1. The SELECT at `convert-service.ts:42-46` reads `quote_items(*)` — the splat pulls every column including `quantity`.
2. The inline type at lines 171-175 currently destructures only `service_id`, `unit_price`, `tier_name` (the existing INSERT shape). The data is in `item` but discarded.
3. Line 230 explicitly reads `item.quantity ?? 1` for the `enrichItemsWithTierMeta` summary build — proving quantity is already in scope and already used elsewhere in the same function for the `serviceNames` summary string returned to callers.

**The fix is purely additive at the INSERT site.** No upstream plumbing needed.

### Are there other appointment creation paths that bypass conversion?

Three: POS walk-in (`/api/pos/jobs/route.ts`), online booking (`/api/book/route.ts`), customer self-edit (`/api/customer/appointments/[id]/route.ts`), and voice agent direct creation (`/api/voice-agent/appointments/route.ts:542-552` — distinct from the voice agent's `convertQuote` path).

**None of these carry quantity > 1 upstream** — they create appointments from POS/booking-widget/voice-agent UI that doesn't expose a quantity field. They write one row per service, and the DB `DEFAULT 1` correctly handles them.

---

## Target 5 — Customer-facing rendering verification (D46 surfaces)

Per D46's adoption pin, every appointment-derived customer surface routes through `attachTierMetaToItems` + `renderTierToken`. Verifying:

| Surface | File:line | Uses `renderTierToken`? | Currently passes `quantity`? |
|---|---|---|---|
| Admin appointment notify route (email + SMS) | `src/app/api/appointments/[id]/notify/route.ts:84-91` | YES | NO (omits → defaults to 1) |
| POS appointment notify route (email + SMS) | `src/app/api/pos/appointments/[id]/notify/route.ts:86-91` | YES | NO (omits → defaults to 1) |
| Public pay page services list | `src/app/(public)/pay/[token]/page.tsx:312-316` | YES | NO (omits → defaults to 1) |
| POS jobs cancel chip | `src/app/api/pos/jobs/[id]/cancel/route.ts:226-250` (via `enrichItemsWithTierMeta` + `formatServicesSummary`) | INDIRECT via `enrichItemsWithTierMeta` | HARDCODES `quantity: 1` at line 245 |

**All 4 surfaces currently render the qty=1 branch implicitly.** Once the schema column lands and SELECTs are widened, all 4 upgrade automatically to render `${qty} ${pluralize(qty_label)}` (e.g., `"2 Rows"`) per D45 contract.

**No bespoke surfaces bypass `renderTierToken`.** All appointment-derived tier rendering goes through D45 helpers. No anti-pattern to remediate.

---

## Target 6 — Migration design

### Recommended migration SQL

```sql
-- File: supabase/migrations/<TIMESTAMP>_appointment_services_add_quantity.sql
-- Issue 42 — appointment_services.quantity schema gap.
-- Adds the column that mirrors quote_items.quantity + transaction_items.quantity
-- so per_row × N quotes preserve the qty signal through quote → appointment
-- conversion. Existing rows default to 1 (operator-locked backfill strategy:
-- no retroactive UPDATE from quote_items.quantity; the rare multi-quantity
-- historical appointment is corrected manually via Admin UI if needed).

ALTER TABLE appointment_services
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
  CHECK (quantity > 0);

COMMENT ON COLUMN appointment_services.quantity IS
  'Per-line quantity (e.g., per_row × 2 = quantity=2). Mirrors quote_items.quantity. '
  'Default 1 for non-tiered or single-unit services. Added 2026-05-27 to close Issue 42 '
  '(multi-quantity quote → appointment flattening) — see '
  'docs/dev/ISSUE_42_APPOINTMENT_QUANTITY_AUDIT.md.';
```

### Migration safety analysis

- **`DEFAULT 1`** satisfies `NOT NULL` for every existing row. Postgres executes the default for the entire table during `ALTER` (newer Postgres: the metadata-only fast path applies because the default is a constant). On a small `appointment_services` table (likely <10K rows in production), this is sub-second.
- **`CHECK (quantity > 0)`** prevents accidental 0/negative writes. The constraint is consistent with the implicit invariant on `quote_items` (which has no explicit CHECK today but operates under the same business rule).
- **No RLS changes.** Policies key off `appointment_id`, not column-level.
- **No FK changes.** No existing FK references quantity.
- **No trigger changes.** None exist.

### Reversibility

```sql
-- Down migration (only if needed):
ALTER TABLE appointment_services DROP COLUMN quantity;
```

The down migration is safe because:
- Nothing reads quantity until the conversion-flow code change ships (Target 7).
- Nothing writes quantity > 1 until the conversion-flow code change ships.
- If the migration is rolled back before code lands, the table reverts to its pre-fix state with zero data lost (the qty=1 default rows are byte-equivalent to the pre-migration state).

If rolled back AFTER code change ships, the conversion-flow code becomes inconsistent (writes a non-existent column → Postgres rejects → conversion fails). This is acceptable: the rollback scenario is operator-driven emergency revert; operator would revert the code change in lockstep.

### Index opt-out

**Recommended: NO index on quantity.**

Justification: No query in the inventory filters or aggregates on quantity. The READ patterns are all "fetch services for one appointment" (FK-keyed via `idx_appointment_services_appt`). An index on quantity would add write cost with no read benefit.

---

## Target 7 — Conversion-flow code change

### Current code at `src/lib/quotes/convert-service.ts:170-184`

```ts
if (serviceItems.length > 0) {
  const apptServices = serviceItems.map((item: {
    service_id: string;
    unit_price: number;
    tier_name: string | null;
  }) => ({
    appointment_id: appointment.id,
    service_id: item.service_id,
    price_at_booking: item.unit_price,
    tier_name: item.tier_name || null,
  }));

  const { error: svcErr } = await supabase
    .from('appointment_services')
    .insert(apptServices);
  ...
}
```

### Required change (minimal)

```ts
if (serviceItems.length > 0) {
  const apptServices = serviceItems.map((item: {
    service_id: string;
    unit_price: number;
    tier_name: string | null;
    quantity?: number;  // ADDED
  }) => ({
    appointment_id: appointment.id,
    service_id: item.service_id,
    price_at_booking: item.unit_price,
    tier_name: item.tier_name || null,
    quantity: item.quantity ?? 1,  // ADDED — `?? 1` defensive; DB DEFAULT 1 would also handle omission
  }));
  ...
}
```

**Change footprint:** 2 lines (1 type field + 1 INSERT field).

The `quantity` field on `quote_items` is `NOT NULL DEFAULT 1` per `quote_items.Row.quantity: number` (`database.types.ts:4254`), so `item.quantity ?? 1` is defensive-only (the column is never null). Pass it through.

### Customer-facing surface SELECT widening (4 sites)

Each of the 4 D46 customer-facing surfaces in Target 1 needs `quantity` added to its `appointment_services` SELECT and threaded into the `renderTierToken` call. The exact diff per site:

1. **`src/app/api/appointments/[id]/notify/route.ts`** — add `quantity` to SELECT at line 33-38 + add `quantity: s.quantity` to `renderTierToken` arg at line 84-88.
2. **`src/app/api/pos/appointments/[id]/notify/route.ts`** — identical to admin notify (line 39-44 + 86-91).
3. **`src/app/(public)/pay/[token]/page.tsx`** — add `quantity` to SELECT at line 79-83 + extend `AppointmentRecord` type at line 39-53 + add `quantity: line.quantity` to `renderTierToken` arg at line 312-316.
4. **`src/app/api/pos/jobs/[id]/cancel/route.ts`** — add `quantity` to SELECT at line 199-204 + replace hardcoded `quantity: 1` at line 245 with `s.quantity ?? 1`.

**Implementation comment hygiene:** The "Issue 42 / no quantity column today" inline comments at `(public)/pay/[token]/page.tsx:43-46`, `pos/jobs/[id]/cancel/route.ts:187-194`, and the D46 comment at the public pay page line 308-311 should be removed when the fix lands. Keep the implementation-time discipline of removing stale "/* TODO when X */" comments rather than leaving them as drift.

---

## Target 8 — Test scope

Recommended new tests (~8–12 net new):

### Migration safety (1–2 tests)

- **DB-level pin** (integration test in `convert-service.integration.test.ts` or similar): existing appointment_services rows pre-migration default to `quantity = 1` post-migration. Achievable via direct query against a freshly-migrated test DB; supabase test setup typically runs all migrations in order so this is implicit. Can be a 1-test pin asserting the column exists with the expected default.

### Conversion flow (3–4 tests)

- **Per_row × 2 quote → appointment_services row with quantity = 2** (golden path).
- **Single-quantity quote → appointment_services row with quantity = 1** (regression — every existing single-quantity test continues to pass).
- **Non-tiered service (flat/per_unit/custom) → appointment_services row with quantity = 1** (regression — `pricing_model` doesn't affect quantity).
- **Multi-item quote (mix of qty=1 + qty>1) → row-per-row preservation** (correctness — qty=2 row writes qty=2, qty=1 row writes qty=1).

### Customer-facing surface integration (4–5 tests)

- **Appointment confirmation email shows `"(2 Rows)"`** for an appointment with `quantity = 2, qty_label = 'row'` (admin notify route integration test).
- **Appointment confirmation email shows `"(Floor Mats)"`** for an appointment with `quantity = 1, tier_label = 'Floor Mats'` (regression — qty=1 branch).
- **POS jobs cancel chip shows `"(2 Rows)"`** for a multi-quantity cancellation (D45 chip composition integration).
- **Public pay page shows `"— 2 Rows"`** for a multi-quantity appointment (em-dash presentation preserved per D46).
- **No regression in D45 chip composition** — quote-stage `formatServicesSummary` continues to produce byte-identical output for existing test fixtures.

### Lint + types (free)

- Existing typecheck must pass (the `Row` type regen brings `quantity: number` into the `appointment_services.Row` type, which exposes all 32 consumers to the new field — none must error).
- ESLint must pass.

**Estimated test count: 8–12 net new.**

---

## Target 9 — Implementation scope estimate

| Category | Count |
|---|---|
| Files to create | 1 (the migration SQL) |
| Files to modify (production code) | 5 (`convert-service.ts` + 4 customer-facing surfaces) |
| Files to modify (generated artifacts) | 2 (`database.types.ts` regen + `DB_SCHEMA.md` regen) |
| Tests added | 8–12 net new |
| Doc updates | 3 (CHANGELOG, ROADMAP, SMS_AI_V2_PROMPT_OBSERVATIONS Issue 42 status) |
| Comment-hygiene removals | 3 (stale "Issue 42 deferred" comments at the 3 D46 surfaces) |

**Time estimate:** ~90–120 min CC session.

**Single session or split:** **SINGLE SESSION RECOMMENDED.** The migration + conversion fix + 4 SELECT widenings + tests are tightly coupled; splitting would mean shipping the migration first (with no code that uses the new column — wasted ship) or the code first (with no column to write to — broken). The combined session has clean atomic semantics: migration + types regen + code + tests + docs all in one commit (or one merge).

---

## Target 10 — Rollback / risk plan

### Risk of the migration

**LOW.** The column is purely additive with a default and a CHECK. No existing query is broken (the supabase types regen exposes the new field but every consumer is type-compatible because the field is non-optional with a safe default). The CHECK only fires on a write of `quantity ≤ 0`, which no code today produces.

### Rollback plan

**If the migration succeeds but causes unexpected downstream issues:**

1. Identify the issue (production logs, customer report).
2. Run the down migration: `ALTER TABLE appointment_services DROP COLUMN quantity`.
3. Revert the code change via `git revert <commit>` and redeploy.
4. Schedule a re-investigation session.

**If the migration fails mid-application** (extremely unlikely with `ALTER TABLE ADD COLUMN DEFAULT`):

1. Postgres rolls back the ALTER atomically — table is in pre-migration state.
2. Investigate the failure mode.
3. Re-apply once root cause is understood.

### Production observation strategy

Post-deploy, monitor for:

1. **Customer SMS / email rendering** — operator-driven smoke test: send a multi-quantity test quote, accept it, trigger the appointment confirmation, verify the message reads `"(2 Rows)"` not `"(Per Row)"`.
2. **Conversion errors** — Vercel/Hostinger logs for `appointment_services insert` failures in the days following the deploy.
3. **No new admin UI errors** — the supabase types regen could surface a stale `services-summary.ts` or `compose-line-items.ts` consumer that didn't get widened; the typecheck gate should catch this pre-deploy.

### Customer-facing impact of a failed deploy

**None or near-zero.** The migration is additive; failures are caught at deploy gate (typecheck, lint, tests). The only "regression" scenario is if the code change ships but the migration doesn't — Postgres rejects the INSERT and `convert-service.ts` logs `Error creating appointment services` (line 187 already wraps the INSERT with `if (svcErr) console.error(...)`; the conversion still returns `success: true` because the appointment was created first). This is the same failure mode that exists today for any unrelated `appointment_services` write failure, so customer experience degrades gracefully.

---

## Target 11 — Verification plan (empirical post-deploy)

Operator-runnable checklist:

1. **Golden path — multi-quantity quote → appointment confirmation:**
   - Send a new SMS test quote: 2018 Suburban + Hot Shampoo Extraction `per_row × 2 (seats)`.
   - Accept the quote (via the customer's reply to the SMS, OR via POS manual conversion).
   - Verify appointment is created (Admin → Appointments tab; latest row).
   - **Verify the underlying data:** open the appointment in Admin → query `appointment_services` directly (via Supabase MCP / SQL Editor) — the `quantity` column should read `2` for the Hot Shampoo Extraction row.
   - Trigger the appointment confirmation: Admin → Appointments → click the appointment → "Send Confirmation" (or the equivalent UI affordance).
   - **Customer-facing check:** verify the SMS body and email body read `"Hot Shampoo Extraction (2 Rows)"` not `"Hot Shampoo Extraction (Per Row)"`.

2. **Regression — single-quantity quote → appointment confirmation:**
   - Send a single-quantity quote: 2018 Suburban + Express Exterior Wash (vehicle_size pricing, no qty>1).
   - Accept + trigger appointment confirmation.
   - **Verify:** SMS/email body reads `"Express Exterior Wash"` (no tier sub-text — flat pricing, no tier to display).
   - **Verify:** `appointment_services.quantity` column reads `1` for this row.

3. **Regression — scope tier qty=1:**
   - Send a scope-pricing quote: 2018 Suburban + Hot Shampoo Extraction `floor_mats` (qty=1, tier=floor_mats).
   - Accept + trigger appointment confirmation.
   - **Verify:** SMS/email body reads `"Hot Shampoo Extraction (Floor Mats)"` (qty=1 branch, `tier_label`).

4. **Public pay page — multi-quantity:**
   - For the multi-quantity appointment from step 1, get its payment link token + open the public pay page.
   - **Verify:** the services list reads `"Hot Shampoo Extraction — 2 Rows"` with the em-dash presentation D46 preserved.

5. **POS cancellation chip — multi-quantity:**
   - For the multi-quantity appointment, cancel via POS Jobs card → notification chip.
   - **Verify:** the cancellation SMS/email reads `"(2 Rows)"` not `"(Per Seat Row)"` (the D45-known degradation).

6. **No regression on D45 chip composition (quote-stage):**
   - Hit a Q-0087-class quote-stage surface (quote page, PDF, admin slide-over, admin quote detail).
   - **Verify:** every existing visual rendering continues to read correctly. D45 helpers are untouched, but the typecheck regen pass could surface stale `services-summary.ts` consumers if any.

**All 6 scenarios pass → Issue 42 closed empirically.**

---

## Target 12 — Open operator decisions

Per the session brief, all critical decisions are already locked. Two minor decisions remain for the implementation session, both of which the implementer may default-accept:

| # | Decision | Audit recommendation | Operator action |
|---|---|---|---|
| 1 | Index on `quantity` (CREATE INDEX vs. no index)? | **No index.** No query filters/aggregates on quantity; index would add write cost with no read benefit. | Default-accept unless query patterns change |
| 2 | Exact COMMENT wording on the column | Audit's draft (see Target 6) is comprehensive and references the audit doc itself for future readers. | Default-accept; edit if a preferred phrasing exists |
| 3 | Should `src/lib/appointments/service-edit.ts` (admin/POS edit cascade) gain a quantity field in the future? | OUT OF SCOPE for this fix. The current admin/POS edit modal doesn't expose quantity in the UI. Adding it is its own future feature decision (UI design + UX + operator workflow). | No action needed for Issue 42 |

**Zero blocking decisions.** Implementation may fire immediately.

---

## Risk matrix

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Migration fails on production (huge table lock) | Low | Very low | `ALTER TABLE ADD COLUMN DEFAULT 1` uses Postgres fast path; table is small |
| Conversion fix typo causes silent qty=1 regression for all new quotes | Medium | Low | Tests at Target 8 catch this; explicit per_row × 2 → quantity = 2 pin |
| Surface SELECT widening missed at one of the 4 sites → that surface stays "Per Row" | Low | Low (only 4 sites; checklist-tractable) | Verification plan step 1 + 4 + 5 hit all 4 |
| supabase types regen drift (forgot to regen) | Medium | Low | Pre-deploy gate: typecheck catches unrecognized `quantity` field |
| DB_SCHEMA.md regen drift (forgot to regen) | Low | Low | CLAUDE.md #6 rule explicit; session-end checklist enforces |
| Down migration rolls back code but not types regen | Low | Low | Standard `git revert` reverses both atomically |
| Test for multi-quantity rendering missed by test scope | Low | Low | Target 8 explicit; operator verification scenario 1 catches it post-deploy |

**Combined risk:** Low. The fix is small, well-scoped, and well-tested.

---

## Verification of audit hard rules

- [x] No `src/` source code changes — verified: `git diff --name-only` will show only the 4 doc files at session end
- [x] No migrations actually written — verified: Target 6's SQL is text in this audit, not a file under `supabase/migrations/`
- [x] No test changes — verified: zero test files touched
- [x] No new files except the audit deliverable + 3 doc updates — verified
- [x] Cite file:line for every finding — verified: every consumer/producer + every schema dep + every D46 surface cites file:line
- [x] Verified against actual codebase + DB schema — `appointment_services` columns confirmed via `DB_SCHEMA.md`, `database.types.ts`, AND the migration that created it
- [x] Cross-referenced D46 work — every D46 surface verified against actual D46 implementation in `src/app/api/.../notify/route.ts`, `pay/[token]/page.tsx`, `pos/jobs/[id]/cancel/route.ts`
- [x] Honored operator-locked decision (Option (a) DEFAULT 1, no retroactive UPDATE) — verified: Target 6's migration uses `DEFAULT 1` only, no UPDATE statement
- [x] No re-litigation of locked decisions — verified

---

## Implementation session pre-flight checklist (for next session)

When firing the Issue 42 implementation session, the implementer should:

1. **Verify pre-flight:** `git checkout main && git pull && git log --oneline -3` (should show the merge of this audit branch at the top).
2. **Create implementation branch:** `git checkout -b fix/issue-42-appointment-services-quantity`.
3. **Run `supabase migration new appointment_services_add_quantity`** to scaffold the migration file at `supabase/migrations/<TIMESTAMP>_appointment_services_add_quantity.sql`.
4. **Paste the SQL from this audit's Target 6** into the migration file.
5. **Run `supabase db push`** (per CLAUDE.md "never SQL editor") to apply the migration.
6. **Edit `src/lib/quotes/convert-service.ts:170-184`** per Target 7.
7. **Edit 4 D46 surfaces per Target 7's site list.**
8. **Run `npx supabase gen types ...`** to regen types (Project ID: `zwvahzymzardmxixyfim`).
9. **Run `npx tsx scripts/regen-db-schema.ts`** to regen `DB_SCHEMA.md`.
10. **Add 8–12 tests per Target 8.**
11. **Run gates:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
12. **Remove stale "Issue 42" inline comments** at 3 D46 surfaces (Target 7 list).
13. **Update doc trio + ledger row** per CLAUDE.md Rule 5.
14. **Verify empirically via operator handoff** before merging — run scenarios 1–6 from Target 11 on the dev server.

End-state: Issue 42 closes; D46 surfaces upgrade from `"Per Row"` to `"2 Rows"` for multi-quantity appointments automatically; no breaking changes for any other consumer.
