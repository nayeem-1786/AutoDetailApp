-- Mobile fee fix — manual backfill for SD-006253 + SD-006278 (Option D2)
--
-- Why: prior to the D2 fix the booking + close-out paths never wrote a
-- transaction_items row for the Zone-1 mobile fee. Staff worked around
-- this by adding a "Pet hair clean up" $40 custom row to the close-out
-- transaction (SD-006278). The audit found exactly one affected appointment
-- in production. This script:
--   1. Inserts the missing mobile_fee row on the booking deposit (SD-006253)
--   2. Relabels + retypes the staff workaround row on the close-out (SD-006278)
--   3. Populates mobile_zone_name_snapshot for every is_mobile=true appointment
--   4. Appends the mobile entry to jobs.services JSONB for the affected job
--
-- Architectural decision: this backfill reads mobile_zones.name AT BACKFILL
-- TIME (operator-controlled deploy moment) and snapshots that value into:
--   * appointments.mobile_zone_name_snapshot
--   * transaction_items.item_name (on the inserted mobile_fee row)
--   * transaction_items.item_name (on the relabeled close-out row)
--   * jobs.services JSONB entry name
--
-- HISTORICAL DRIFT NOTE:
-- SD-006253's mobile zone may have been renamed and/or re-ranged between
-- the original 5/6/26 booking and the deploy of this fix. The backfill
-- uses the CURRENT zone name — operator's deliberate choice consistent
-- with Option α architecture (snapshot on write). The original receipt
-- emailed/sent to the customer at booking time may have shown a different
-- zone label. For all FUTURE bookings, the snapshot freezes the zone name
-- at booking time and never drifts. This script's "freeze point" is the
-- backfill run itself; subsequent zone renames don't affect SD-006253's
-- snapshot once this script commits.
--
-- Run manually in the Supabase SQL Editor AFTER migrations are pushed and
-- the app is deployed. Each step is paired with verification queries.
--
-- IDs (verified during audit session):
--   appointment        3311ee70-f88e-4ba1-bc09-eb4f26fff374
--   deposit tx         94773134-7b3f-460f-ab97-d5fd4f710a0f  (SD-006253)
--   close-out tx       565de2ac-6be6-4be4-b139-b88032ac481a  (SD-006278)
--   linked job         2aec1389-d78f-4a3b-bb55-0290201ef31e
--   zone               ccdd8b20-a0ad-4851-9a3e-0fff99b97a22  (whatever its
--                      current name is at backfill time)

-- =====================================================================
-- STEP 1 — VERIFY current state (read-only). Run before applying STEP 2.
-- Expected output:
--   * deposit_items_count = 2 (Express Interior Clean, Pet Hair)
--   * closeout_items has 3 rows including a custom "Pet hair clean up" $40
--   * appt.mobile_zone_name_snapshot is NULL (pre-backfill)
--   * job.services has 2 entries, no is_mobile_fee marker
--   * mobile_zones row for ccdd8b20… shows the CURRENT zone name (whatever
--     it was renamed to since the original booking)
-- =====================================================================

SELECT 'deposit tx items (SD-006253) — should be 2 service rows' AS check_name;
SELECT id, item_type, item_name, total_price
FROM transaction_items
WHERE transaction_id = '94773134-7b3f-460f-ab97-d5fd4f710a0f'
ORDER BY created_at;

SELECT 'close-out tx items (SD-006278) — should include "Pet hair clean up" $40 custom' AS check_name;
SELECT id, item_type, item_name, total_price
FROM transaction_items
WHERE transaction_id = '565de2ac-6be6-4be4-b139-b88032ac481a'
ORDER BY created_at;

SELECT 'appointment mobile snapshot — expect NULL pre-backfill, mobile_zone_id should match a current row' AS check_name;
SELECT id, is_mobile, mobile_surcharge, mobile_zone_id, mobile_zone_name_snapshot
FROM appointments
WHERE id = '3311ee70-f88e-4ba1-bc09-eb4f26fff374';

SELECT 'current zone name + surcharge for the appointment''s zone_id' AS check_name;
SELECT id, name, min_distance_miles, max_distance_miles, surcharge
FROM mobile_zones
WHERE id = (
  SELECT mobile_zone_id
  FROM appointments
  WHERE id = '3311ee70-f88e-4ba1-bc09-eb4f26fff374'
);

SELECT 'job services JSONB — expect 2 entries, no is_mobile_fee flag' AS check_name;
SELECT id, services
FROM jobs
WHERE id = '2aec1389-d78f-4a3b-bb55-0290201ef31e';


-- =====================================================================
-- STEP 2 — APPLY fixes. Uncomment the BEGIN/COMMIT block below to run.
-- Wrap in a transaction so a partial failure rolls back cleanly.
-- Every UPDATE/INSERT pulls the live zone name from mobile_zones at the
-- moment this script commits — no hardcoded label.
-- =====================================================================

-- BEGIN;
--
-- -- 2a. Insert missing mobile_fee row on the deposit transaction (SD-006253).
-- --     item_type uses the new 'mobile_fee' enum value (migration
-- --     20260511000001). is_taxable=false per CDTFA Pub 100.
-- --     item_name + standard_price + total_price pulled from mobile_zones.
-- INSERT INTO transaction_items (
--   transaction_id, item_type, product_id, service_id, package_id,
--   item_name, quantity, unit_price, total_price, tax_amount, is_taxable,
--   tier_name, vehicle_size_class, notes, standard_price, pricing_type,
--   is_addon, prerequisite_note
-- )
-- SELECT
--   '94773134-7b3f-460f-ab97-d5fd4f710a0f',
--   'mobile_fee',
--   NULL, NULL, NULL,
--   mz.name,            -- CURRENT zone label
--   1,
--   a.mobile_surcharge, -- snapshot of charged surcharge
--   a.mobile_surcharge,
--   0,
--   false,
--   NULL, NULL, NULL,
--   a.mobile_surcharge,
--   'standard',
--   false, NULL
-- FROM appointments a
-- JOIN mobile_zones mz ON mz.id = a.mobile_zone_id
-- WHERE a.id = '3311ee70-f88e-4ba1-bc09-eb4f26fff374';
--
-- -- 2b. Relabel + retype the manual workaround row on the close-out (SD-006278).
-- --     "Pet hair clean up" custom item_type → mobile_fee with the CURRENT
-- --     zone label. Constrained by amount + item_name so we never touch an
-- --     unrelated row.
-- UPDATE transaction_items ti
-- SET item_type = 'mobile_fee',
--     item_name = mz.name,
--     standard_price = ti.total_price
-- FROM appointments a
-- JOIN mobile_zones mz ON mz.id = a.mobile_zone_id
-- WHERE ti.transaction_id = '565de2ac-6be6-4be4-b139-b88032ac481a'
--   AND ti.item_name = 'Pet hair clean up'
--   AND ti.total_price = 40.00
--   AND ti.item_type = 'custom'
--   AND a.id = '3311ee70-f88e-4ba1-bc09-eb4f26fff374';
--
-- -- 2c. Populate mobile_zone_name_snapshot for every is_mobile=true row.
-- --     Single row in production today (SD-006253's appointment). Future-proof
-- --     by writing for any other is_mobile=true row that lacks the snapshot.
-- --     Reads the CURRENT name; future bookings populate this column inline at
-- --     write time via the application servers.
-- UPDATE appointments AS a
-- SET mobile_zone_name_snapshot = mz.name
-- FROM mobile_zones mz
-- WHERE a.mobile_zone_id = mz.id
--   AND a.is_mobile = true
--   AND a.mobile_zone_name_snapshot IS NULL;
--
-- -- 2d. Append mobile entry to jobs.services JSONB for the affected job.
-- --     The is_mobile_fee flag distinguishes the synthetic entry from real
-- --     catalog services in downstream renderers. Name pulled from the live
-- --     zone row.
-- UPDATE jobs j
-- SET services = j.services || jsonb_build_array(jsonb_build_object(
--   'id', NULL,
--   'name', mz.name,
--   'price', a.mobile_surcharge,
--   'is_mobile_fee', true
-- ))
-- FROM appointments a
-- JOIN mobile_zones mz ON mz.id = a.mobile_zone_id
-- WHERE j.id = '2aec1389-d78f-4a3b-bb55-0290201ef31e'
--   AND a.id = '3311ee70-f88e-4ba1-bc09-eb4f26fff374'
--   AND NOT EXISTS (
--     SELECT 1
--     FROM jsonb_array_elements(j.services) AS svc
--     WHERE (svc->>'is_mobile_fee')::boolean IS TRUE
--   );
--
-- COMMIT;


-- =====================================================================
-- STEP 3 — VERIFY post-fix. Re-run STEP 1 queries and confirm:
--   * deposit_items now has 3 rows including a mobile_fee row whose
--     item_name matches the current mobile_zones.name for the appointment's
--     zone_id (e.g. "Mobile Service (0-3 miles)" or whatever it's named now)
--   * close-out items has 3 rows, the $40 row is now item_type='mobile_fee'
--     with item_name = (current zone name)
--   * appt.mobile_zone_name_snapshot = (current zone name)
--   * job.services has 3 entries, one with is_mobile_fee=true and the
--     current zone name
-- =====================================================================
