# Session 27 — Manual QA Checklist

> Exotic/classic vehicle consumer surfaces (POS badge + modal, booking block, SMS pivot, voice agent)

## POS

- [ ] 1. Open POS, add Ferrari 488 customer's vehicle to a ticket. Verify amber "EXOTIC" badge is visible on vehicle card.
- [ ] 2. Tap any service. Verify custom price modal opens with catalog price shown as reference. If that service has `exotic_floor_price` set, verify it's pre-filled. If not, verify input is empty.
- [ ] 3. Enter a price above catalog. Submit. Verify no below-catalog warning. Verify service added to cart at the custom price. Verify reason is NOT printed on receipt (check thermal + HTML + email + public web receipts).
- [ ] 4. Tap another service. Enter a price below catalog. Submit. Verify below-catalog warning appears. Confirm it. Verify service added.
- [ ] 5. Tap another service. Select a reason from dropdown. Submit. Verify the reason is saved to line item notes (check DB after).
- [ ] 6. Add a 1969 Ford Mustang (classic) to a separate ticket. Verify blue-gray "CLASSIC" badge.
- [ ] 7. Add a 1972 Ferrari Dino 246. Verify both badges stacked (amber EXOTIC on top, blue-gray CLASSIC below).
- [ ] 8. **Verify ALL add-to-ticket entry points trigger the modal (gate is at TicketProvider level — transparent to all consumers):**
  - [ ] pos-workspace direct add (tap service when only one tier)
  - [ ] register-tab add (favorites quick-add)
  - [ ] catalog-browser card tap
  - [ ] catalog-panel direct add (single-tier / per-unit quick add)
  - [ ] service-detail-dialog "Add to Ticket" button
  - [ ] quote-builder add (QuoteProvider has same gate)
- [ ] 9. Add a 2023 Honda Civic (normal vehicle). Verify no badge, no modal, services add at catalog price as before.
- [ ] 10. Switch vehicle mid-ticket (normal → exotic). Verify existing items keep catalog prices, new additions trigger modal.
- [ ] 11. Cancel the modal. Verify no line item added and modal can be re-triggered.

## Booking

- [ ] 12. Open public booking flow. Enter "Ferrari 488" as vehicle (exotic). Advance past vehicle step. Verify block page appears with phone CTA from getBusinessInfo().phone.
- [ ] 13. Enter "1967 Camaro" (classic). Verify block page uses classic-specific copy ("classic vehicle").
- [ ] 14. Enter "2023 Honda Civic" (normal). Verify booking proceeds normally to Step 2.
- [ ] 15. On block page, tap phone CTA — verify tel: link works (mobile).
- [ ] 16. On block page, fill out callback form and submit. Verify:
  - [ ] Staff notification SMS fires to owner
  - [ ] Audit log entry created with event "booking_blocked_specialty_vehicle"
- [ ] 17. On block page, tap "Edit my vehicle" link — verify returns to vehicle entry form.

## SMS

- [ ] 18. Send "Hi, how much for an interior detail?" from a test phone associated with a Ferrari customer. Verify AI replies with the custom-quote pivot, NOT a catalog price.
- [ ] 19. Verify staff_notification SMS fires to owner with the message context.
- [ ] 20. Verify `conversations.is_ai_enabled` set to false for this thread (check DB).
- [ ] 21. Send a follow-up message on the same thread. Verify AI doesn't auto-reply (because is_ai_enabled = false).
- [ ] 22. Send from a normal (non-exotic) customer. Verify AI quotes normally from catalog (is_ai_enabled remains true).

## Voice (owner action — not CC-verifiable in code)

- [ ] 23. Owner calls voice agent. States vehicle as "Ferrari 488". Verifies:
  - [ ] Agent does NOT quote from catalog
  - [ ] Agent says something about custom quote and collects callback info
  - [ ] If agent quotes catalog pricing, owner edits prompt in ElevenLabs dashboard

## Admin

- [ ] 24. Open Admin > Catalog > Services > [any service]. Verify "Exotic Starting Price" and "Classic Starting Price" fields appear near pricing section.
- [ ] 25. Enter values, save. Verify they persist on page reload.
- [ ] 26. Clear values (empty), save. Verify NULL stored in DB.

## Badge placements

- [ ] 27. Verify badge appears in: POS ticket vehicle card, POS vehicle selector dialog, admin customer detail vehicles tab, admin appointment detail dialog.
- [ ] 28. Verify badge does NOT appear on: public quote page, SMS receipt, email receipt, thermal receipt, HTML copier receipt, booking confirmation.
