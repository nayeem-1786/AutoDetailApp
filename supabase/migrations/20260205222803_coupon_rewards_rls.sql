-- Fix RLS for coupon_rewards table
-- This table was created in 20260203000007_enhance_coupons.sql but RLS was never configured

-- Enable RLS on coupon_rewards (if not already enabled)
ALTER TABLE coupon_rewards ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read coupon_rewards (needed for nested selects)
CREATE POLICY coupon_rewards_select ON coupon_rewards
  FOR SELECT TO authenticated
  USING (true);

-- Allow all operations for authenticated users (admin operations)
CREATE POLICY coupon_rewards_all ON coupon_rewards
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also allow anon users to read coupons and coupon_rewards (for public booking flow)
-- This ensures the booking flow can access coupon data without authentication
CREATE POLICY coupons_anon_select ON coupons
  FOR SELECT TO anon
  USING (status = 'active');

CREATE POLICY coupon_rewards_anon_select ON coupon_rewards
  FOR SELECT TO anon
  USING (true);
