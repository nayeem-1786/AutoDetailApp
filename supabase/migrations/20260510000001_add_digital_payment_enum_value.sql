-- Phase 1A.5 Part A — extend payment_method enum with 'digital'.
--
-- Postgres requires ALTER TYPE ... ADD VALUE to execute outside the
-- transaction that uses it. Keeping this in its own migration file makes
-- the enum value visible before the column + CHECK migration runs.
-- Supabase db push applies migrations in alphabetical order, so this
-- file's timestamp precedes 20260510000002_add_digital_platform_column.sql.

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'digital';
