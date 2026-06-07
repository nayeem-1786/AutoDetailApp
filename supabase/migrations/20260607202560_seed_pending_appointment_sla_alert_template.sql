-- Phase 3 Theme C.1 — AC-12 foundation: seed `pending_appointment_sla_alert`
-- SMS template for the staff-facing SLA alert dispatched by the lifecycle
-- engine when a customer-accepted appointment goes unacknowledged past the
-- threshold.
--
-- Per locked architecture (QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md v1.4) and
-- Phase 3.0.3 audit (`54aa996a`, Target D.4 / F.3). Theme C.2 wires the
-- lifecycle-engine query that selects pending unacknowledged appointments
-- and dispatches this template; this migration only seeds the template row.
--
-- Body chips (all 4 exist in the palette before this migration; no codegen
-- regen required for them — only the new slug entry triggers a regen):
--   - quote_number          (existing, required) — the source quote identifier
--   - customer_name         (existing, required) — full name for operator readability
--   - services              (existing, required) — comma-joined service list
--                                                  (used in place of the prompt's
--                                                  proposed `service_summary`,
--                                                  which is not in the palette)
--   - accepted_at_human     (NEW, required)     — humanized "time since accept"
--                                                  string, computed by Theme C.2's
--                                                  cron caller (e.g. "12 minutes ago",
--                                                  "Today at 3:45 PM")
--
-- All four are REQUIRED — none of the operator-actionable detail is dispensable
-- when the alert fires (a staff member receiving the SMS needs to identify the
-- specific quote, customer, services, and time-since-accept to triage). This
-- diverges from the customer-facing "prefer optional + prose fallback" guidance
-- in CLAUDE.md Rule #9; staff alerts hard-skip on missing chips because a
-- mis-rendered staff SMS is loud-fail-safe (operator notices the gap, fixes
-- the caller).
--
-- recipient_type='staff' + recipient_phones populated from business_settings:
-- the dispatch path is staff-broadcast (mirrors `booking_staff_notify_quote_request`
-- and the post-Session-#139 self-send-safe pattern). The empty `recipient_phones`
-- here means the dispatcher must resolve recipients per-call from configured
-- staff phones (likely via the `STAFF_SLUG_BY_REQUEST_TYPE`-style map that
-- Theme C.2 wires); a NULL value would mean the SMS dispatcher silently drops
-- with `console.warn` per the Session #139 pattern (intentional — better than
-- self-sending to TWILIO_PHONE_NUMBER).
--
-- category='system' — the post-Session-2A category constants allow:
-- booking / quote / transactional / reminder / system. SLA alerts are
-- operational system notifications (not customer-facing transactional, not
-- a reminder for an action), so 'system' is the correct bucket.
--
-- can_silence=true — operator may want to silence this in the future once
-- SLA alerting is dialed in; mirrors `staff_notification`. (Customer-facing
-- transactional templates are can_silence=false; staff-facing operational
-- alerts are can_silence=true.)
--
-- Idempotent via ON CONFLICT (slug) DO NOTHING — re-running is a no-op once
-- seeded. The same pattern as the recent `waitlist_slot_available` seed
-- (`20260606105901_seed_waitlist_slot_available_sms_template.sql`).
--
-- After this migration applies, regenerate the typed SMS contracts:
--   npx tsx scripts/regen-sms-contracts.ts
-- The source file `src/lib/sms/sms-contracts.source.ts` is hand-edited in
-- the same commit as this migration (adds the new `accepted_at_human` chip
-- + `pending_appointment_sla_alert` slug entry); the two generated files
-- (palette.ts + generated-contracts.ts) are codegen output.

INSERT INTO sms_templates (
  slug,
  name,
  category,
  body_template,
  default_body,
  required_variables,
  optional_variables,
  is_active,
  can_silence,
  recipient_type,
  recipient_phones
) VALUES (
  'pending_appointment_sla_alert',
  'Staff: Pending Appointment SLA Alert',
  'system',
  E'⏰ Customer-accepted quote awaiting confirmation.\nQuote {quote_number} from {customer_name} for {services}.\nAccepted {accepted_at_human}.\nPlease confirm or follow up.',
  E'⏰ Customer-accepted quote awaiting confirmation.\nQuote {quote_number} from {customer_name} for {services}.\nAccepted {accepted_at_human}.\nPlease confirm or follow up.',
  '["quote_number","customer_name","services","accepted_at_human"]'::jsonb,
  '[]'::jsonb,
  true,
  true,
  'staff',
  -- recipient_phones NULL — Theme C.2's dispatcher resolves per-call from
  -- configured staff phones; empty here so the post-Session-#139 self-send-safe
  -- pattern drops cleanly with console.warn when no staff phones are configured
  -- rather than self-sending to TWILIO_PHONE_NUMBER. Operator sets the array
  -- via admin UI when ready.
  NULL
)
ON CONFLICT (slug) DO NOTHING;
