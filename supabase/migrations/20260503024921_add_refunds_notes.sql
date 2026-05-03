-- Multi-source close-out refund support (Pay-Link Session 5c): when a refund
-- spans more than one source transaction, the refunds row references the
-- close-out target via transaction_id but the actual money may have moved
-- across N source transactions. Persist a JSON breakdown in `notes` so the
-- audit trail is readable without an out-of-band lookup.
--
-- Single-source refunds (the existing flow) leave it NULL — no behavior
-- change. Reason still goes in the existing `reason` column.

ALTER TABLE refunds ADD COLUMN notes TEXT;
