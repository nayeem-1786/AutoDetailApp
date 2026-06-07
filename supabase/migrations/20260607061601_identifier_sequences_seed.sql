-- Phase 3 Theme A — AC-10. Migration 2 of 6: seed identifier_sequences rows.
--
-- Per AC-10 v1.4: all five identifiers use pad_width = 5; seed values
-- chosen so that the FIRST next_identifier(entity_type) call returns the
-- locked starting value (post-increment semantic — see next_identifier docs).
--
-- Seed strategy per entity type:
--
--   Quote    — GREATEST(10000, MAX numeric portion of existing Q-XXXX rows)
--   Appointment — initial 10000; Migration 4 backfills + reseeds to MAX assigned
--   Receipt  — MAX numeric portion of existing SD-XXXXX rows (continues sequence)
--   Work order — GREATEST(10000, MAX numeric portion of existing WO-XXXXX rows)
--   Purchase order — GREATEST(10000, MAX numeric portion of existing PO-XXXXXX rows)
--
-- The GREATEST() guards (quote, work_order, purchase_order) preserve the
-- spec's intent ("first new value > all legacy values, in the 5-digit
-- namespace starting at 10001 if no legacy rows exceed that") while
-- guaranteeing no UNIQUE-constraint collision with legacy rows whose
-- numeric portion happens to exceed 10000. Verified against production
-- data 2026-06-07: WO max = WO-10002 (legacy γ generator started at 10001
-- per Phase 3.0.1 audit) — without GREATEST, the literal seed of 10000
-- would produce WO-10001 on first call and collide. Q max = Q-0124 (no
-- collision); PO max = PO-000002 (no collision). The defensive pattern
-- handles future data drift in all three namespaces.

-- Quote (legacy 4-digit Q-XXXX rows preserved as-is)
INSERT INTO identifier_sequences (entity_type, prefix, pad_width, current_value)
SELECT 'quote', 'Q-', 5,
       GREATEST(
         10000,
         COALESCE(
           (SELECT MAX(CAST(SUBSTRING(quote_number FROM 3) AS BIGINT))
              FROM quotes
             WHERE quote_number ~ '^Q-\d+$'),
           0
         )
       );

-- Appointment (Migration 4 backfills then RESEEDS this row; this initial value
-- is overwritten before any caller can use it because Migrations 3 and 4 run
-- after this one and Migration 4 calculates the post-backfill value).
INSERT INTO identifier_sequences (entity_type, prefix, pad_width, current_value)
VALUES ('appointment', 'A-', 5, 10000);

-- Receipt — continue from existing MAX. Per AC-10 v1.4, the SD backfill
-- (Migration 5) is purely a width contraction (SD-00XXXX → SD-XXXXX); the
-- numeric value is preserved, so seeding from the current MAX before backfill
-- yields the same value as seeding after, and we read MAX up-front.
INSERT INTO identifier_sequences (entity_type, prefix, pad_width, current_value)
SELECT 'receipt', 'SD-', 5,
       COALESCE(
         (SELECT MAX(CAST(SUBSTRING(receipt_number FROM 4) AS BIGINT))
            FROM transactions
           WHERE receipt_number ~ '^SD-\d+$'),
         10000
       );

-- Work order (legacy 5-digit WO-XXXXX rows preserved as-is; legacy γ generator
-- started at 10001 per Phase 3.0.1 audit, so production data already exceeds
-- the literal spec seed of 10000)
INSERT INTO identifier_sequences (entity_type, prefix, pad_width, current_value)
SELECT 'work_order', 'WO-', 5,
       GREATEST(
         10000,
         COALESCE(
           (SELECT MAX(CAST(SUBSTRING(order_number FROM 4) AS BIGINT))
              FROM orders
             WHERE order_number ~ '^WO-\d+$'),
           0
         )
       );

-- Purchase order (2 legacy PO-00000X records preserved as-is)
INSERT INTO identifier_sequences (entity_type, prefix, pad_width, current_value)
SELECT 'purchase_order', 'PO-', 5,
       GREATEST(
         10000,
         COALESCE(
           (SELECT MAX(CAST(SUBSTRING(po_number FROM 4) AS BIGINT))
              FROM purchase_orders
             WHERE po_number ~ '^PO-\d+$'),
           0
         )
       );
