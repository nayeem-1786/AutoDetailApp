-- Mobile fee fix Phase D2 Part A — extend transaction_item_type enum with 'mobile_fee'.
--
-- Postgres requires ALTER TYPE ... ADD VALUE to execute outside the
-- transaction that uses it. Keeping this in its own migration file makes
-- the enum value visible before the column + CHECK migration runs.
-- Supabase db push applies migrations in alphabetical order, so this
-- file's timestamp precedes 20260511000002_add_mobile_zone_snapshot_and_quote_mobile.sql.

ALTER TYPE transaction_item_type ADD VALUE IF NOT EXISTS 'mobile_fee';
