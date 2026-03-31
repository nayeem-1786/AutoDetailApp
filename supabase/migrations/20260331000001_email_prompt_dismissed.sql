-- Track when a phone-only customer dismisses the "add your email" onboarding prompt.
-- NULL = prompt not yet dismissed. Timestamp = dismissed at that time.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_prompt_dismissed_at TIMESTAMPTZ DEFAULT NULL;
