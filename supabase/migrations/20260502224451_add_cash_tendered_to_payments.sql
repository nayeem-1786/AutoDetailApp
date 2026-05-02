-- Persist cash tendered + change given on payments rows so receipts can show
-- the customer how much they handed over and how much change they got back.
--
-- Both columns are NULLABLE on purpose:
--   - Card / check / split rows: cash_tendered + change_given are always NULL.
--     Validation enforced at the app layer (api/pos/transactions/route.ts) —
--     a non-cash payment with non-NULL values returns 422.
--   - Historical cash rows (every payments row created before this migration):
--     both columns are NULL. Receipt renderers fall through to the existing
--     no-tender display path; nothing breaks.
--
-- amount stays the source of truth for what the customer was charged.
-- cash_tendered is what they handed over (>= amount), and change_given is
-- the difference (>= 0). Server recomputes change_given from cash_tendered
-- and amount on insert; the client value is informational only.
--
-- No CHECK constraint, no triggers, no defaults beyond NULL — the validation
-- lives in code so it can produce useful 422 messages instead of cryptic
-- constraint-violation errors.

ALTER TABLE payments
  ADD COLUMN cash_tendered NUMERIC(10,2),
  ADD COLUMN change_given NUMERIC(10,2);
