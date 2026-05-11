-- Mobile fee fix Phase D2 Part B — snapshot zone name + extend quotes with mobile fields.
--
-- Why:
--   * appointments.mobile_zone_id is FK ON DELETE SET NULL — if an admin deletes
--     a zone after a booking, the historical receipt would lose its zone label.
--     The snapshot column survives zone deletion + rename. Receipts read the
--     snapshot, never resolve the FK.
--   * quotes table had zero mobile awareness; quote → appointment conversion
--     was hardcoded is_mobile=false in src/lib/quotes/convert-service.ts.
--     These columns let the quote builder capture mobile state once, and
--     the converter propagate it to the appointment.
--
-- CHECK constraints enforce the invariant that mobile + surcharge>0 are
-- both set or both unset. Verified at write time: 0 existing rows violate
-- this on either table.

-- 1. Snapshot zone name on appointments
ALTER TABLE appointments
  ADD COLUMN mobile_zone_name_snapshot TEXT NULL;

-- 2. Extend quotes with mobile fields
ALTER TABLE quotes
  ADD COLUMN is_mobile BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN mobile_zone_id UUID NULL REFERENCES mobile_zones(id) ON DELETE SET NULL,
  ADD COLUMN mobile_address TEXT NULL,
  ADD COLUMN mobile_surcharge NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN mobile_zone_name_snapshot TEXT NULL;

-- 3. Consistency CHECKs — is_mobile and surcharge must agree.
-- NULL mobile_surcharge falls through CHECK (Postgres NULL semantics) — fine,
-- existing rows have NOT NULL DEFAULT 0 on appointments per the column def,
-- and new quotes default to 0 too.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_mobile_consistency CHECK (
    (is_mobile = false AND mobile_surcharge = 0)
    OR (is_mobile = true AND mobile_surcharge > 0)
  );

ALTER TABLE quotes
  ADD CONSTRAINT quotes_mobile_consistency CHECK (
    (is_mobile = false AND mobile_surcharge = 0)
    OR (is_mobile = true AND mobile_surcharge > 0)
  );
