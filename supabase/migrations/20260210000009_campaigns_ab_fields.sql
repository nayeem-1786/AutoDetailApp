-- Add A/B testing fields to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_select_winner BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS auto_select_after_hours INTEGER;
