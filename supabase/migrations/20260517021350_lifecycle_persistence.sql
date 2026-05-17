-- Item 15g Layer 15g-ii — Lifecycle persistence schema
--
-- Adds the missing modifier columns so that loyalty redemption, manual
-- discount, and a coupon-discount snapshot can ride the full Quote →
-- Appointment → Job → Transaction chain. Pre-migration, these modifiers
-- silently zeroed at every conversion boundary (audit:
-- docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md §6.2).
--
-- All columns are additive. Existing rows get safe defaults (0 / NULL) so
-- the migration is non-breaking — pre-existing analytics, receipts, and
-- the booking wizard's `internal_notes` plaintext loyalty stop-gap all
-- continue to work unchanged. The new dedicated columns are written by
-- the endpoint changes that ship in this same layer; the plaintext
-- fallback in `appointments.internal_notes` is left intact for the
-- separate Layer 15g-iv migration of historical booking-wizard data.
--
-- NOT NULL DEFAULT 0 for INTEGER / NUMERIC counter-style columns mirrors
-- the existing convention on appointments.discount_amount (line 167 of
-- the pre-migration schema) and transactions.loyalty_points_redeemed /
-- loyalty_discount. Nullable for snapshot-style columns (quotes.*) so
-- "modifier not set" is distinguishable from "modifier was zero."

-- ---------------------------------------------------------------------------
-- appointments — loyalty + manual discount provenance
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments
  ADD COLUMN loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN loyalty_discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN manual_discount_value NUMERIC(10,2),
  ADD COLUMN manual_discount_label TEXT;

COMMENT ON COLUMN public.appointments.loyalty_points_redeemed IS
  'Planned loyalty points redemption snapshot — quote-time intent. The actual ledger row is written at transaction commit (loyalty_ledger), not here. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.appointments.loyalty_discount IS
  'Dollar value of the planned loyalty redemption (points * LOYALTY.REDEEM_RATE). Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.appointments.manual_discount_value IS
  'Cashier-applied manual discount amount (dollars). NULL when no manual discount was applied. Used together with manual_discount_label to provide provenance on the receipt + admin dialog. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.appointments.manual_discount_label IS
  'Free-text label for the manual discount (e.g., "First-time customer", "Friend discount"). NULL when manual_discount_value is NULL. Item 15g Layer 15g-ii.';

-- ---------------------------------------------------------------------------
-- quotes — modifier snapshot columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.quotes
  ADD COLUMN coupon_discount NUMERIC(10,2),
  ADD COLUMN loyalty_points_to_redeem INTEGER,
  ADD COLUMN loyalty_discount NUMERIC(10,2),
  ADD COLUMN manual_discount_type TEXT,
  ADD COLUMN manual_discount_value NUMERIC(10,2),
  ADD COLUMN manual_discount_label TEXT;

COMMENT ON COLUMN public.quotes.coupon_discount IS
  'Persisted snapshot of the coupon discount in dollars. Pre-Layer-15g-ii this was re-derived on every quote load via /api/pos/coupons/validate; now persisted so conversion to appointment can carry the value without revalidation. NULL when no coupon applied. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.quotes.loyalty_points_to_redeem IS
  'Cashier-side intent: how many loyalty points the customer plans to redeem on this quote. Snapshotted at quote save; converted to a loyalty_ledger row only at transaction commit. NULL when no redemption planned. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.quotes.loyalty_discount IS
  'Dollar value paired with loyalty_points_to_redeem (points * LOYALTY.REDEEM_RATE at quote-save time). NULL when no redemption planned. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.quotes.manual_discount_type IS
  '"dollar" | "percent" — discriminator for manual_discount_value. NULL when no manual discount applied. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.quotes.manual_discount_value IS
  'Manual discount magnitude — dollars or percent depending on manual_discount_type. NULL when no manual discount applied. Item 15g Layer 15g-ii.';

COMMENT ON COLUMN public.quotes.manual_discount_label IS
  'Free-text label for the manual discount applied at the Quote phase. NULL when no manual discount. Item 15g Layer 15g-ii.';

-- ---------------------------------------------------------------------------
-- CHECK constraints to keep manual-discount type / value coherent
-- ---------------------------------------------------------------------------

-- A manual discount must either be fully present (type + value) or fully
-- absent (both NULL). Mismatched state would silently mis-render on the
-- receipt and Admin dialog.

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_manual_discount_coherent CHECK (
    (manual_discount_type IS NULL AND manual_discount_value IS NULL)
    OR
    (
      manual_discount_type IN ('dollar', 'percent')
      AND manual_discount_value IS NOT NULL
      AND manual_discount_value > 0
      AND (manual_discount_type <> 'percent' OR manual_discount_value <= 100)
    )
  );

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_manual_discount_coherent CHECK (
    (manual_discount_value IS NULL AND manual_discount_label IS NULL)
    OR
    (manual_discount_value IS NOT NULL AND manual_discount_value > 0)
  );

-- Loyalty redemption must be coherent: points + dollar value present together
-- or both absent. Allows 0 points (no redemption) when both columns are 0
-- without forcing a label.

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_loyalty_coherent CHECK (
    (loyalty_points_to_redeem IS NULL AND loyalty_discount IS NULL)
    OR
    (loyalty_points_to_redeem IS NOT NULL AND loyalty_discount IS NOT NULL AND loyalty_points_to_redeem >= 0 AND loyalty_discount >= 0)
  );
