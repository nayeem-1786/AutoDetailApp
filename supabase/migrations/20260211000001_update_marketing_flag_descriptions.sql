-- Update sms_marketing and email_marketing feature flag names and descriptions
-- to clearly communicate what gets disabled when toggled off.

UPDATE feature_flags
SET name = 'SMS Marketing Campaigns',
    description = 'Send SMS campaigns and lifecycle automations to customers. Disabling stops all outbound marketing SMS. Transactional messages (appointment reminders, quote notifications) are not affected.',
    updated_at = now()
WHERE key = 'sms_marketing';

UPDATE feature_flags
SET name = 'Email Marketing Campaigns',
    description = 'Send email campaigns to customers. Disabling stops all outbound marketing emails. Transactional emails (booking confirmations, password resets) are not affected.',
    updated_at = now()
WHERE key = 'email_marketing';
