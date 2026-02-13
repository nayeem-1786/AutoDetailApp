-- Add coupon_code column to quotes table so coupon info carries through
-- from quote → job → checkout via the quote_id bridge.
ALTER TABLE quotes ADD COLUMN coupon_code TEXT;
