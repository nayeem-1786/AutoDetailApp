# Session 28 — Manual QA Checklist

> Exotic/classic pricing tier promotion + badge restyle

## Admin

- [ ] 1. Admin > Catalog > Services > [service] > Service Details tab: verify NO "Exotic Starting Price" / "Classic Starting Price" fields
- [ ] 2. Same service > Pricing tab: Vehicle Size Pricing card shows 5 rows: Sedan, Truck/SUV (2-Row), SUV (3-Row)/Van, Exotic, Classic — each with standard + sale columns
- [ ] 3. Enter Exotic standard: $500. Save. Verify DB: `service_pricing` row exists with `tier_name='exotic'`, `price=500`, `sale_price=NULL`, `display_order=3`
- [ ] 4. Enter Exotic sale: $450. Save. Verify row now has `sale_price=450`
- [ ] 5. Clear Exotic standard (empty). Save. Verify `service_pricing` row for `tier_name='exotic'` is DELETED (not left with price: 0)
- [ ] 6. Same test for Classic (`display_order=4`)
- [ ] 7. Set Exotic on multiple services. Verify each persists independently
- [ ] 8. Reload service edit page after saving exotic/classic prices. Verify values populate from DB (not blank)

## POS — Single-flag exotic

- [ ] 9. Ferrari 488 ticket. Service with exotic tier $500 populated → NO modal. Service adds at $500. Badge visible.
- [ ] 10. Ferrari 488 ticket. Service with NO exotic tier → MODAL OPENS. Reference shows sedan price. Input empty.
- [ ] 11. Ferrari 488 ticket. Service with exotic tier + active sale → NO modal, adds at sale price.
- [ ] 12. Ferrari 488 ticket. Open service-pricing-picker. Verify "Exotic" button visible, "Classic" button NOT visible.

## POS — Single-flag classic

- [ ] 13. 1969 Mustang ticket. Service with classic tier $350 populated → NO modal, adds at $350
- [ ] 14. 1969 Mustang ticket. No classic tier → MODAL OPENS
- [ ] 15. Picker: "Classic" visible, "Exotic" NOT visible

## POS — Dual-flag

- [ ] 16. 1972 Ferrari Dino 246. Service with BOTH tiers populated → MODAL OPENS ANYWAY. Both reference prices shown. Input empty.
- [ ] 17. 1972 Dino. Only exotic tier populated → MODAL OPENS. Reference: "Exotic tier: $X · Classic tier: not set"
- [ ] 18. 1972 Dino. Neither tier populated → MODAL OPENS. Reference shows sedan fallback.
- [ ] 19. Picker: both "Exotic" AND "Classic" buttons visible

## POS — Normal vehicle (regression)

- [ ] 20. 2023 Honda Civic → no badge, no modal, sedan pricing unchanged
- [ ] 21. Picker: sedan/truck/van tiers visible, exotic AND classic buttons NOT visible (even if service has exotic/classic rows in DB)

## Badge visual

- [ ] 22. "Exotic" renders title case, soft orange fill with border, dot indicator. Matches Enthusiast chip shape/font. Dark mode correct.
- [ ] 23. "Classic" renders title case, soft slate fill. Dark mode correct.
- [ ] 24. Dino (dual-flag) → Exotic top, Classic below. Both full-size.
- [ ] 25. Verify NO uppercase/tracking-wider/solid-fill treatment remains

## Customer-facing (regression — MUST be unchanged from Session 27)

- [ ] 26. Booking flow with Ferrari → hard-blocks regardless of admin exotic tier pricing state
- [ ] 27. SMS from Ferrari customer → pivots to "team will call", `is_ai_enabled = false`
- [ ] 28. Voice agent about Ferrari → routes per dashboard prompt

## Leakage check

- [ ] 29. Run: `grep -rn "tier_name.*exotic\|tier_name.*classic" src/app/book/ src/app/api/book/ src/app/api/webhooks/twilio/ src/app/api/voice-agent/ src/lib/services/service-resolver.ts` — Expected: no matches
