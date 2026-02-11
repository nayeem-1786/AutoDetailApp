-- Migration: Add category column, remove dead flags, add new flags, update all descriptions
-- Session 4 of Feature Toggle Audit remediation

-- 1. Add category column
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Remove dead flag: referral_program (no code exists, not on roadmap)
DELETE FROM feature_flags WHERE key = 'referral_program';

-- 3. Add new flags
INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'online_store',
  'Online Store',
  'Shopping cart, checkout, and order management. Phase 9 — reserved for future use.',
  'Future',
  false
) ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, name, description, category, enabled)
VALUES (
  'inventory_management',
  'Inventory Management',
  'Stock tracking, vendor management, and purchase orders. Hides inventory section from admin navigation when disabled.',
  'Operations',
  true
) ON CONFLICT (key) DO NOTHING;

-- 4. Update all labels, descriptions, and categories
UPDATE feature_flags SET
  name = 'Loyalty Rewards Program',
  description = 'Award points on purchases and allow redemption for discounts. Disabling hides loyalty from POS and portal, stops accumulation, and blocks redemption. Existing points are preserved.',
  category = 'Core POS'
WHERE key = 'loyalty_rewards';

UPDATE feature_flags SET
  name = 'Cancellation Fees',
  description = 'Charge a fee when appointments are cancelled. Disabling removes the fee option from cancellation dialogs.',
  category = 'Core POS'
WHERE key = 'cancellation_fee';

UPDATE feature_flags SET
  name = 'SMS Marketing Campaigns',
  description = 'Send SMS campaigns and lifecycle automations. Disabling stops all outbound marketing SMS. Transactional messages (reminders, confirmations) are not affected.',
  category = 'Marketing'
WHERE key = 'sms_marketing';

UPDATE feature_flags SET
  name = 'Email Marketing Campaigns',
  description = 'Send email campaigns to customers. Disabling stops all outbound marketing emails. Transactional emails (confirmations, resets) are not affected.',
  category = 'Marketing'
WHERE key = 'email_marketing';

UPDATE feature_flags SET
  name = 'Google Review Requests',
  description = 'Automatically request Google/Yelp reviews after service completion via lifecycle automations.',
  category = 'Marketing'
WHERE key = 'google_review_requests';

UPDATE feature_flags SET
  name = 'Two-Way SMS Messaging',
  description = 'Team inbox for customer SMS conversations, AI auto-responder, and auto-quotes. STOP/START compliance processing always remains active. Configure AI settings in Settings > Messaging.',
  category = 'Communication'
WHERE key = 'two_way_sms';

UPDATE feature_flags SET
  name = 'Online Booking Payment',
  description = 'Collect payment via Stripe during the online booking flow. Disabling allows booking without upfront payment.',
  category = 'Booking'
WHERE key = 'online_booking_payment';

UPDATE feature_flags SET
  name = 'Waitlist',
  description = 'Allow customers to join a waitlist when slots are full. Sends notifications when spots open.',
  category = 'Booking'
WHERE key = 'waitlist';

UPDATE feature_flags SET
  name = 'Mobile/On-Location Service',
  description = 'Offer on-location detailing with travel zones and fees. Disabling hides the mobile option from booking. Configure zones in Settings > Mobile Zones.',
  category = 'Booking'
WHERE key = 'mobile_service';

UPDATE feature_flags SET
  name = 'QuickBooks Online Integration',
  description = 'Sync transactions, customers, and catalog to QuickBooks Online for accounting. Configure connection in Settings > Integrations > QuickBooks.',
  category = 'Integrations'
WHERE key = 'qbo_enabled';

UPDATE feature_flags SET
  name = 'Recurring Services',
  description = 'Subscription-based recurring service plans. Phase 10 — reserved for future use.',
  category = 'Future'
WHERE key = 'recurring_services';

UPDATE feature_flags SET
  name = 'Photo Documentation',
  description = 'Before/after photo capture for service documentation. Phase 8 — reserved for future use.',
  category = 'Future'
WHERE key = 'photo_documentation';
