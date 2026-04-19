# Session 29 — Manual QA Checklist

**Session:** Architecture cleanup — exotic/classic as size_class taxonomy
**Date:** 2026-04-18
**Deployment status:** Migrations applied, code shipped. Run these checks before moving on.

---

## POS

### 1. Ferrari 488 ticket — no badge, exotic pricing flows
- [ ] Open POS, create/select a customer with a Ferrari 488 saved (`size_class = 'exotic'`)
- [ ] Vehicle card shows plain-text vehicle info, **no orange/slate badge**
- [ ] Tap a service that has an `exotic` tier row populated (e.g., "Express Interior Clean"): line item added at the exotic tier price, **no modal opens**
- [ ] Tap a service that has NO exotic tier row: line item added at the service's base `pricing.price` fallback, no modal (pricing-config issue, not a POS gate)

### 2. Ferrari Dino 246 (1972, dual-candidate) — exotic wins
- [ ] Look up this vehicle in DB: `SELECT size_class FROM vehicles WHERE id='7c85fd44-2978-460c-8f72-6e3e0234400f'` → `exotic`
- [ ] Audit log entry exists: `SELECT action, details FROM audit_log WHERE action='dual_flag_backfill_preserved'` → 1 row preserving the original dual-flag state
- [ ] POS treats this vehicle identically to a single-flag exotic

### 3. 1969 Mustang — classic pricing flows
- [ ] Classic tier row exists on at least one service (if you added it via admin)
- [ ] Ticket adds at the classic tier price, no modal

### 4. 2023 Honda Civic — regression check
- [ ] `size_class = 'sedan'`
- [ ] Sedan pricing unchanged, no badge
- [ ] All existing POS flows work as before

### 5. Vehicle selector & customer summary — no badge anywhere
- [ ] POS vehicle selector dropdown shows no badge next to any vehicle
- [ ] POS ticket header `<CustomerVehicleSummary>` shows no badge

### 6. Scope service with `is_vehicle_size_aware` (e.g., Hot Shampoo Extraction Complete Interior)
- [ ] For a Ferrari, picker shows the scope tier; price button reads `vehicle_size_exotic_price` if set, otherwise falls back to the tier's base `price`
- [ ] Same for Mustang (classic)

---

## Admin

### 7. Customer detail > vehicles tab — plain-text display
- [ ] Open any customer with a Ferrari or Mustang
- [ ] Each vehicle row shows `size_class` as plain text (no badge), same treatment as sedan/truck/van

### 8. Admin vehicle edit — 5-value size_class dropdown
- [ ] Click Edit on any automobile vehicle
- [ ] Size Class dropdown shows all 5 values: Sedan / Truck/SUV (2-Row) / SUV (3-Row) / Van / Exotic / Classic
- [ ] Change size_class from "Sedan" to "Truck/SUV (2-Row)" and save
- [ ] Query DB: `SELECT size_class, size_class_manual_override FROM vehicles WHERE id='<that vehicle>'` → size_class is `truck_suv_2row`, `size_class_manual_override = true`

### 9. Override persists across subsequent writes
- [ ] After test 8, trigger any write path that runs `findOrCreateVehicle` on the same customer+vehicle (e.g., POS adds them as the ticket customer)
- [ ] Verify `size_class` stays `truck_suv_2row` (classifier did NOT overwrite)

### 10. Make/model change resets the override
- [ ] After test 8, re-edit the same vehicle, change Make from `Honda` to `Toyota` and save
- [ ] DB shows `size_class_manual_override = false` (auto-reset)
- [ ] Next classifier run will re-resolve size_class fresh

### 11. Admin > Catalog > Services > [scope-model service] > Pricing tab — 5-column extension
- [ ] Open Hot Shampoo Extraction (or equivalent scope-model service)
- [ ] Toggle `is_vehicle_size_aware = true` on a tier
- [ ] Form shows 5 per-size inputs: Sedan, Truck/SUV, SUV 3-Row/Van, **Exotic**, **Classic**
- [ ] Enter `600` in Exotic, save
- [ ] Query DB: `SELECT vehicle_size_exotic_price FROM service_pricing WHERE service_id = <...> AND tier_name = <...>` → 600
- [ ] Clear Exotic input, save → DB shows NULL (not 0)

---

## Customer-facing

### 12. Booking wizard — Ferrari entry triggers block page
- [ ] Open public booking flow
- [ ] Enter make=Ferrari, model=488, year=2023
- [ ] After Step 1 (vehicle), the specialty block page appears (same UX as Session 27), **triggered by `size_class === 'exotic'`**, not by any boolean flag
- [ ] Call-now button, callback form, and "Edit my vehicle" link all work

### 13. Booking wizard — Honda Civic advances normally
- [ ] Enter Honda Civic 2023
- [ ] Flow advances to Step 2 (service selection) — no block page

### 14. SMS AI — Ferrari customer pivot
- [ ] Send an SMS from the phone number of a customer with a Ferrari saved
- [ ] Auto-reply contains the custom-quote pivot language
- [ ] Conversation has `is_ai_enabled = false` after reply
- [ ] Staff notification SMS fires

### 15. Voice agent — vehicle-classify response
- [ ] Invoke `GET /api/voice-agent/vehicle-classify?make=Ferrari&model=488&year=2023`
- [ ] Response body contains `size_class: "exotic"` and `tier_name: "Exotic (Custom Quote)"`
- [ ] Response body does **NOT** contain `is_exotic`, `is_classic`, or `requires_custom_quote`
- [ ] **OWNER ACTION ITEM:** verify ElevenLabs dashboard prompt reads `size_class` or `tier_name` (not the removed fields) — if it still references flags, update the dashboard prompt

---

## Data verification (SQL)

### 16. Enum is 5-value
```sql
SELECT unnest(enum_range(NULL::vehicle_size_class))::text ORDER BY 1;
-- Expected: classic, exotic, sedan, suv_3row_van, truck_suv_2row
```

### 17. All flagged vehicles backfilled
```sql
SELECT size_class::text, COUNT(*)
FROM vehicles
WHERE size_class::text IN ('exotic', 'classic')
GROUP BY size_class::text;
-- Expected: exotic ~7, classic ~3 (per Phase 0 findings)
```

### 18. Legacy columns dropped
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'vehicles'
  AND column_name IN ('is_exotic', 'is_classic', 'requires_custom_quote');
-- Expected: 0 rows
```

### 19. Dual-flag audit preserved
```sql
SELECT action, entity_id, entity_label, details
FROM audit_log
WHERE action = 'dual_flag_backfill_preserved';
-- Expected: 1 row (1972 Ferrari Dino 246, entity_id = 7c85fd44-2978-460c-8f72-6e3e0234400f)
```

### 20. New columns present
```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'service_pricing' AND column_name IN ('vehicle_size_exotic_price', 'vehicle_size_classic_price'))
   OR (table_name = 'vehicles' AND column_name = 'size_class_manual_override')
ORDER BY table_name, column_name;
-- Expected: 3 rows
```

---

## Known post-ship actions (owner)

1. **Populate exotic/classic `service_pricing` rows** across more services. Phase 0 data inventory showed only 1 service (Express Interior Clean) currently has these tier rows. Without them, POS falls back to base `pricing.price` for exotic/classic vehicles — functional but not the intended specialty pricing.
2. **ElevenLabs dashboard prompt review** (see test 15). The voice agent response payload shape changed.
3. **Optional:** Add `vehicle_size_exotic_price` / `vehicle_size_classic_price` values to any `is_vehicle_size_aware` scope tiers (currently only Hot Shampoo Extraction's Complete Interior tier) if specialty vehicle pricing differs from the base tier price.

---

## Out of scope (deferred)

- Add-on pricing size awareness (Decision E1 — future session)
- Rate limiting on `/api/public/specialty-callback`
- Server-side classifier re-authority on `/api/book` POST
