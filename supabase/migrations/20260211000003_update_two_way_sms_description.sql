-- Update two_way_sms feature flag description to clarify what gets disabled
UPDATE feature_flags SET
  description = 'Receive and respond to customer SMS messages. Includes team inbox, AI auto-responder, and auto-quotes. Disabling hides the messaging inbox and stops AI responses. STOP/START opt-out processing always remains active for compliance.',
  updated_at = now()
WHERE key = 'two_way_sms';
