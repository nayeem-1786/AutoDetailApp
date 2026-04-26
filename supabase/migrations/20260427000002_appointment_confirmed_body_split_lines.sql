-- ---------------------------------------------------------------------------
-- Session 2B Phase 1A follow-up: appointment_confirmed body line split.
--
-- Sibling migration 20260427000001 demoted service_total from required to
-- optional but its body-rewrite UPDATE was guarded by `body_template =
-- default_body` and skipped — production state showed the operator had
-- already edited body_template away from default_body (single-line layout
-- "at {appointment_time} - {service_total}"). That single-line layout is
-- structurally incompatible with the now-optional service_total contract:
-- the engine's REMOVE_LINE behavior on missing service_total would strip
-- both the time AND the total from that shared line, producing a malformed
-- confirmation SMS for voice-agent ad-hoc bookings (where total_amount is
-- 0 by design and the helper now passes service_total: undefined).
--
-- Override operator-edit guard: the operator's single-line "at TIME - TOTAL"
-- layout is structurally incompatible with the new optional service_total
-- contract (REMOVE_LINE on missing total would strip both time and total).
-- New body preserves all other operator preferences: no first_name greeting,
-- "Need to make a change?" footer, trailing newlines. Only the time/total
-- line is split into two lines for clean degradation.
--
-- Both columns are updated together so they remain in sync; future
-- migrations using the standard `body_template = default_body` guard will
-- re-engage correctly.
--
-- Idempotent: rewriting to the same string is a no-op for content; the
-- updated_at bump is acceptable.
-- ---------------------------------------------------------------------------

UPDATE sms_templates
SET
  body_template = E'{business_name} — Appointment Confirmed:\n\n{service_name}\n{appointment_date}\nat {appointment_time}\n{service_total}\n\nNeed to make a change?\nCall {business_phone}\n\n\n',
  default_body  = E'{business_name} — Appointment Confirmed:\n\n{service_name}\n{appointment_date}\nat {appointment_time}\n{service_total}\n\nNeed to make a change?\nCall {business_phone}\n\n\n',
  updated_at    = now()
WHERE slug = 'appointment_confirmed';
