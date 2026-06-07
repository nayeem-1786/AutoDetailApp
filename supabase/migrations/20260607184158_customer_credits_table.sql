-- Phase 3 Theme E.1 — customer_credits schema (AC-15 foundation).
--
-- Per QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md v1.4 (AC-15, lock 2026-06-06):
-- customer credits are stored in a dedicated table (operator-locked: NOT a
-- per-customer JSONB column). Greenfield work — refund/credit/cancellation-fee
-- audit `3e633156` confirmed no `customer_credits` table or `customers.credit_balance`
-- column exists in production. This is the schema foundation for Themes E.2
-- (credit application logic) and E.3 (operator UI).
--
-- Money convention: all amounts are integer cents per Rule #20 (Money-Unify).
-- Per-row partial-application: applied_amount_cents tracks consumption against
-- amount_cents; full audit trail of issuance + application preserved even when
-- source/target entities are deleted (ON DELETE SET NULL on FKs except customer_id).

-- Reasons for credit issuance. Order matches expected first-pass volume:
-- cancellation_refund is the primary driver (AC-9 Pathway B at cancel-time);
-- the others are tail-case / future use.
CREATE TYPE customer_credit_reason AS ENUM (
  'cancellation_refund',    -- credit from cancel-with-credit (Pathway B per AC-9)
  'manual_adjustment',      -- operator-initiated adjustment
  'goodwill',               -- service recovery credit
  'promotional',            -- marketing credit (future)
  'refund_as_credit'        -- partial refund issued as credit instead of cash
);

CREATE TABLE customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer the credit belongs to. ON DELETE RESTRICT protects the audit
  -- trail: a customer with credit history cannot be hard-deleted. (Soft-delete
  -- via customers.deleted_at is unaffected — that's an application-layer flag.)
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,

  -- Amount issued, in integer cents (Rule #20). Always > 0 — zero or negative
  -- credits are nonsensical at the issuance layer.
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),

  reason customer_credit_reason NOT NULL,
  reason_note TEXT,  -- operator-supplied free text (optional)

  -- Source entities (which event created this credit?). ON DELETE SET NULL
  -- preserves the credit row when a source appointment/transaction is removed.
  source_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  source_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  -- Application tracking. NULL until applied; E.2 (credit application) writes
  -- these. Partial-application supported via applied_amount_cents < amount_cents.
  applied_at TIMESTAMPTZ,
  applied_to_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  applied_to_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  applied_amount_cents INTEGER CHECK (applied_amount_cents IS NULL OR applied_amount_cents > 0),

  -- NULL = never expires. Otherwise, credit is invalid for application
  -- after this timestamp. Per-credit policy (no global default at the
  -- schema layer; E.3 may surface an operator-configurable default).
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Issuing operator. employees(id) (not staff — verified against DB_SCHEMA.md).
  -- ON DELETE SET NULL preserves the credit's audit row if the employee record
  -- is removed later.
  created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Applied-state coherence:
  --   unapplied: applied_at IS NULL AND applied_amount_cents IS NULL AND both targets NULL
  --   applied:   applied_at IS NOT NULL AND applied_amount_cents > 0 AND <= amount_cents
  -- Application targets (appointment / transaction) are individually optional in
  -- the applied state — credits may be applied against either, both, or neither
  -- depending on how E.2 wires up; the invariant only enforces consistency of
  -- the applied/unapplied dichotomy + the partial-application cap.
  CONSTRAINT customer_credits_applied_consistency CHECK (
    (applied_at IS NULL AND applied_to_appointment_id IS NULL AND applied_to_transaction_id IS NULL AND applied_amount_cents IS NULL)
    OR
    (applied_at IS NOT NULL AND applied_amount_cents IS NOT NULL AND applied_amount_cents <= amount_cents)
  )
);

-- Index strategy:
--   customer_id          — every balance query starts here
--   source_appointment_id — partial, for cancel-flow lookups (Theme D / E.2)
--   applied_at           — partial, for "show me all applied credits" reports
--   unapplied composite  — partial (customer_id, expires_at) WHERE applied_at IS NULL
--                          — the hot path for E.2's balance-fetch + expiry sort
CREATE INDEX customer_credits_customer_id_idx ON customer_credits(customer_id);
CREATE INDEX customer_credits_source_appointment_id_idx ON customer_credits(source_appointment_id) WHERE source_appointment_id IS NOT NULL;
CREATE INDEX customer_credits_applied_at_idx ON customer_credits(applied_at) WHERE applied_at IS NOT NULL;
CREATE INDEX customer_credits_unapplied_idx ON customer_credits(customer_id, expires_at) WHERE applied_at IS NULL;

COMMENT ON TABLE customer_credits IS
  'Customer credit ledger. Each row represents one credit issuance; partial '
  'application supported via applied_amount_cents. Full audit trail of '
  'issuance + application — ON DELETE SET NULL on FKs (except customer_id, '
  'which is RESTRICT) preserves credit history even if source/target entities '
  'are deleted. AC-15 foundation; see docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md.';

COMMENT ON COLUMN customer_credits.amount_cents IS
  'Total credit issued, in integer cents. > 0. Never changes after insertion.';
COMMENT ON COLUMN customer_credits.applied_amount_cents IS
  'How much of this credit has been consumed, in integer cents. NULL = unapplied. '
  '> 0 AND <= amount_cents when applied. Partial application supported (e.g., '
  '$30 of a $50 credit).';
COMMENT ON COLUMN customer_credits.expires_at IS
  'NULL = never expires. Otherwise, credit is invalid for application after this timestamp.';
COMMENT ON COLUMN customer_credits.created_by_employee_id IS
  'Issuing employee. Nullable: system-issued credits (future automation) may have no operator. ON DELETE SET NULL preserves the audit row.';

-- updated_at trigger (canonical pattern matches employees/customers triggers).
CREATE OR REPLACE FUNCTION customer_credits_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_credits_updated_at_before_update
BEFORE UPDATE ON customer_credits
FOR EACH ROW EXECUTE FUNCTION customer_credits_updated_at_trigger();
