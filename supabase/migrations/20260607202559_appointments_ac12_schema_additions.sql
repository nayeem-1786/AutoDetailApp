-- Phase 3 Theme C.1 — AC-12 schema additions for customer-accept auto-conversion.
--
-- Per locked architecture decisions in QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md
-- v1.4 and Phase 3.0.3 audit (`54aa996a`):
--
--   - G.1 LOCKED as option ζ (line 615) — keep `scheduled_date` / `scheduled_*_time`
--     NOT NULL; add a boolean placeholder flag instead of migrating to nullable.
--     Theme C.2 picks the placeholder VALUE strategy (α / β / γ / δ from audit
--     Target B.3.a); this migration only adds the FLAG column.
--
--   - G.5 LOCKED (line 620) — `staff_acknowledged_at TIMESTAMPTZ` nullable for
--     SLA acknowledgment tracking distinct from `updated_at`. The SLA query
--     filters on `staff_acknowledged_at IS NULL`; the partial index supports
--     that hot path.
--
--   - Race-protection LOCKED requirement (line 618) — at least one of three
--     mechanisms must exist; this migration implements mechanism (iii) "UNIQUE
--     on `appointments.<quote-FK>`" by ADDING the FK column (it does not
--     pre-exist; the existing link is the reverse `quotes.converted_appointment_id`
--     which cannot enforce one-appointment-per-quote because it constrains
--     values across DIFFERENT quote rows, not within a single quote's update
--     history). The new `appointments.quote_id` column mirrors the existing
--     `jobs.quote_id` pattern (`supabase/migrations/20260212000009_jobs_add_quote_id.sql`)
--     and complements Theme F's application-level F.7 guard in
--     `src/lib/quotes/convert-service.ts` — F.7 catches the optimistic-concurrency
--     case, the UNIQUE catches any path that bypasses F.7 (defense in depth).
--     `ON DELETE SET NULL` mirrors `quotes.converted_appointment_id`'s symmetry.
--
-- This migration is fully forward-only: no existing reader is broken by the
-- new columns (defaults populate) and the backfill is exact (every existing
-- `quotes.converted_appointment_id` value maps to an `appointments.id`).
--
-- The single-migration grouping (3 columns + backfill + 2 indexes + comments)
-- is intentional: all five statements describe one logical schema-shape change,
-- and the data-integrity pre-check (lines below) MUST run before the UNIQUE
-- index is created so that any cross-quote conflicts surface as a clean
-- migration abort rather than a partially-applied schema with a failing
-- index creation.

-- ────────────────────────────────────────────────────────────────────────────
-- Pre-check: surface any data drift before adding the UNIQUE constraint.
-- If any APPOINTMENT is referenced by MORE THAN ONE quote.converted_appointment_id,
-- the backfill below would write only ONE quote_id to the appointment (losing
-- the back-link to the other quotes) AND the UNIQUE constraint would still pass
-- (each appointment.quote_id is distinct after backfill). However, the
-- pre-existing data shape — multiple quotes pointing at one appointment — is
-- itself an inconsistency that should be surfaced rather than silently masked.
-- This DO block fails the migration if such drift exists, forcing operator
-- intervention before the column lands.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM (
    SELECT converted_appointment_id
    FROM quotes
    WHERE converted_appointment_id IS NOT NULL
    GROUP BY converted_appointment_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF violation_count > 0 THEN
    RAISE EXCEPTION 'Theme C.1 pre-check: % appointment(s) are referenced by more than one quotes.converted_appointment_id. Resolve the cross-quote inconsistency before applying this migration — the backfill would lose back-links to all but one quote.', violation_count;
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Column additions
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN staff_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN scheduled_date_placeholder BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill: populate appointments.quote_id from the reverse link
-- quotes.converted_appointment_id. Every converted quote that points at an
-- existing appointment gets the back-pointer populated. Walk-in quotes
-- pre-Theme-F (`status='converted'` with `converted_appointment_id` IS NULL
-- per the historical artifact noted in `convert-service.ts` comments) are
-- not touched by this UPDATE and their appointments stay with quote_id NULL —
-- which is correct: there is no canonical signal to recover the link for
-- those rows, and surfacing the gap loudly is better than guessing.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE appointments a
SET quote_id = q.id
FROM quotes q
WHERE q.converted_appointment_id = a.id;

-- ────────────────────────────────────────────────────────────────────────────
-- UNIQUE index: race protection for AC-12 customer-accept auto-conversion.
-- Mechanism (iii) from the locked architecture (v1.4 line 618). Complements
-- Theme F's F.7 application-level idempotency guard in `convertQuote()`.
-- WHERE quote_id IS NOT NULL keeps the index sparse — walk-in and direct
-- bookings without a source quote are not constrained.
-- ────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX appointments_quote_id_uniq
  ON appointments(quote_id)
  WHERE quote_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Partial index on staff_acknowledged_at: supports the SLA cron query path
-- "WHERE staff_acknowledged_at IS NULL AND ..." which Theme C.2 implements.
-- Partial keeps the index small — only pending-ack rows are indexed; once a
-- row is acknowledged the index entry drops.
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX appointments_staff_acknowledged_at_idx
  ON appointments(staff_acknowledged_at)
  WHERE staff_acknowledged_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Column / index comments — operator-facing documentation for the AC-12
-- semantic contract that Theme C.2 will wire into the customer-accept handler.
-- ────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN appointments.staff_acknowledged_at IS
  'Timestamp when a staff member first acknowledged this appointment. Used by AC-12 (customer-accept auto-conversion) SLA alerting: appointments with channel=''customer_accept'' AND status=''pending'' AND staff_acknowledged_at IS NULL past the threshold (initial: 4 business hours) trigger a staff-side `pending_appointment_sla_alert` SMS. Theme C.2 defines the exact set of operator-side first-touch events that set this column (e.g., opening the appointment detail dialog, first PATCH, explicit Acknowledge button). NULL on the new appointment row at create time.';

COMMENT ON COLUMN appointments.scheduled_date_placeholder IS
  'TRUE when scheduled_date, scheduled_start_time, scheduled_end_time are placeholder values written at customer-accept time pending staff confirmation. AC-12 forces a placeholder because the customer accepts BEFORE picking a slot; the appointments table requires those three columns NOT NULL (G.1 locked as option ζ — keep NOT NULL + flag column rather than migrate nullable). Staff confirmation transitions this to FALSE when the actual scheduled fields are populated. Readers that drive scheduling (calendar views, detailer assignment, SMS reminders) should gate on this flag — placeholder rows are not real schedule slots.';

COMMENT ON COLUMN appointments.quote_id IS
  'Source-quote back-link, populated when this appointment was created via quote-to-appointment conversion (any path: operator POS convert, voice-agent convert, customer-accept auto-conversion). NULL for walk-in and direct-booking appointments that have no source quote. Symmetric with quotes.converted_appointment_id (the forward link, ON DELETE SET NULL). The UNIQUE partial index `appointments_quote_id_uniq` enforces at most one appointment per quote — the AC-12 race-protection requirement (locked mechanism iii in architecture v1.4) — complementing Theme F''s application-level idempotency guard in convertQuote(). Backfilled at column-add time from quotes.converted_appointment_id; new appointments must set this column when applicable.';

COMMENT ON INDEX appointments_quote_id_uniq IS
  'Race protection for AC-12 customer-accept auto-conversion: at most one appointment per quote. The customer-accept path and the operator-convert path (both wrap convertQuote() in src/lib/quotes/convert-service.ts) cannot create duplicate appointment rows under contention — the second INSERT raises a UNIQUE violation that the application-side F.7 guard catches and re-resolves to the race-winner''s row. Defense-in-depth: F.7''s optimistic-concurrency on quotes.converted_appointment_id covers the same race at the application layer; this index covers any path that ever bypasses F.7.';
