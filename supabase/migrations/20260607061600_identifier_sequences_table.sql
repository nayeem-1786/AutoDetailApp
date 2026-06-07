-- Phase 3 Theme A — AC-10 (5-digit, 5-system identifier unification).
-- Migration 1 of 6: create the shared identifier_sequences table + the
-- atomic next_identifier(entity_type) function with row-level locking.
--
-- Per QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md v1.4 (AC-10, audit option Z3):
-- one row per identifier system, holds prefix + pad_width + current_value;
-- a single SELECT ... FOR UPDATE serializes concurrent generators.
--
-- Race-safety stance: SELECT ... FOR UPDATE inside next_identifier serializes
-- concurrent callers. Gaps are tolerated (value-not-reused > value-never-skipped,
-- consistent with the SQL-sequence philosophy). The counter advances regardless
-- of whether the surrounding entity INSERT commits, so a rolled-back INSERT
-- leaves a gap but never causes number reuse — this closes the existing
-- Quote γ items-error cleanup REUSE window (quote-service.ts:218-228, per
-- Phase 3.0.1 audit, file: docs/dev/NUMBERING_STRATEGY_AUDIT.md).

CREATE TABLE identifier_sequences (
  entity_type   TEXT PRIMARY KEY,
  prefix        TEXT NOT NULL,
  pad_width     INT NOT NULL,
  current_value BIGINT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT identifier_sequences_pad_width_positive CHECK (pad_width >= 1),
  CONSTRAINT identifier_sequences_current_value_nonneg CHECK (current_value >= 0)
);

COMMENT ON TABLE identifier_sequences IS
  'Single source of truth for human-readable identifier generation. One row '
  'per entity_type (quote, appointment, receipt, work_order, purchase_order). '
  'next_identifier(entity_type) returns the next formatted value atomically '
  'via SELECT ... FOR UPDATE row-level lock. See AC-10 (v1.4) in '
  'docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md.';

COMMENT ON COLUMN identifier_sequences.entity_type IS
  'Discriminator: ''quote'' | ''appointment'' | ''receipt'' | ''work_order'' | ''purchase_order''.';
COMMENT ON COLUMN identifier_sequences.prefix IS
  'Display prefix incl. dash: Q-, A-, SD-, WO-, PO-.';
COMMENT ON COLUMN identifier_sequences.pad_width IS
  'Zero-pad width for the numeric portion. Locked at 5 across all five entity_types per AC-10 v1.4.';
COMMENT ON COLUMN identifier_sequences.current_value IS
  'Last issued counter value. next_identifier increments-then-formats: post-increment value is returned.';

-- next_identifier(entity_type) — atomic counter advance + format.
-- Semantics: row-level lock via SELECT ... FOR UPDATE → increment
-- current_value → format as `prefix || LPAD(current_value::TEXT, pad_width, '0')`.
-- A seed of current_value=10000 means the first call returns the value with
-- numeric portion 10001 (post-increment).
CREATE OR REPLACE FUNCTION next_identifier(p_entity_type TEXT)
RETURNS TEXT AS $$
DECLARE
  v_prefix    TEXT;
  v_pad_width INT;
  v_value     BIGINT;
BEGIN
  -- Acquire row-level lock; serializes concurrent callers for this entity_type.
  SELECT prefix, pad_width, current_value
    INTO v_prefix, v_pad_width, v_value
    FROM identifier_sequences
   WHERE entity_type = p_entity_type
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'next_identifier: unknown entity_type %', p_entity_type;
  END IF;

  -- Increment-then-return: the value we hand back is the new current_value.
  v_value := v_value + 1;

  UPDATE identifier_sequences
     SET current_value = v_value,
         updated_at    = NOW()
   WHERE entity_type = p_entity_type;

  RETURN v_prefix || LPAD(v_value::TEXT, v_pad_width, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION next_identifier(TEXT) IS
  'Atomic identifier generation with SELECT ... FOR UPDATE row-level lock. '
  'Increments current_value then returns the formatted display string '
  '(e.g., ''Q-10001''). Raises EXCEPTION on unknown entity_type. Must be '
  'called inside a transaction for atomicity with the entity INSERT. Gaps on '
  'rollback are accepted by design (value-not-reused stance, AC-10 v1.4).';
