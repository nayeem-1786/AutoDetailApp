-- Session 29 Phase 1a: Extend vehicle_size_class ENUM with 'exotic' and 'classic'.
--
-- Postgres requires new ENUM values to be COMMITTED before they can be
-- referenced in UPDATE/INSERT statements. This migration contains ONLY the
-- ADD VALUE statements so that the enum additions are committed in their own
-- transaction, independent of the backfill migration (20260418000003).
--
-- Run this file first via Supabase SQL Editor, then run 20260418000003.

ALTER TYPE vehicle_size_class ADD VALUE IF NOT EXISTS 'exotic';
ALTER TYPE vehicle_size_class ADD VALUE IF NOT EXISTS 'classic';
