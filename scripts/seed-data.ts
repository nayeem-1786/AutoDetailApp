// Seed script: Insert all seed data via Supabase JS client (service role)
// Run with: npx tsx scripts/seed-data.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  // 1. Feature Flags
  console.log('Seeding feature flags...');
  const { error: ffErr } = await supabase.from('feature_flags').upsert([
    { key: 'loyalty_rewards', name: 'Loyalty & Rewards', description: 'Customer points system (1pt per $1 eligible spend)', enabled: true },
    { key: 'recurring_services', name: 'Recurring/Subscription Services', description: 'Monthly wash membership and maintenance plans', enabled: false },
    { key: 'online_booking_payment', name: 'Online Booking Requires Payment', description: 'Full prepayment via Stripe at booking', enabled: true },
    { key: 'sms_marketing', name: 'SMS Marketing', description: 'Twilio campaigns and transactional SMS', enabled: true },
    { key: 'email_marketing', name: 'Email Marketing', description: 'Mailgun campaigns and transactional email', enabled: true },
    { key: 'google_review_requests', name: 'Google Review Requests', description: 'Post-service automation with direct link', enabled: true },
    { key: 'two_way_sms', name: 'Two-Way SMS', description: 'Inbound routed to Telegram, reply back as SMS', enabled: true },
    { key: 'waitlist', name: 'Waitlist', description: 'Customers join when fully booked', enabled: true },
    { key: 'photo_documentation', name: 'Photo Documentation', description: 'Before/after/damage photo capture', enabled: false },
    { key: 'cancellation_fee', name: 'Cancellation Fee Enforcement', description: 'Less than 24hr cancellation fee', enabled: true },
    { key: 'referral_program', name: 'Referral Program', description: 'Unique codes, track referrals, reward referrer', enabled: false },
    { key: 'mobile_service', name: 'Mobile Service', description: 'Mobile detailing with zone-based surcharges', enabled: true },
  ], { onConflict: 'key' });
  if (ffErr) console.error('  Feature flags error:', ffErr.message);
  else console.log('  12 feature flags inserted');

  // 2. Mobile Zones
  console.log('Seeding mobile zones...');
  const { error: mzErr } = await supabase.from('mobile_zones').insert([
    { name: 'Zone 1 (0-5 miles)', min_distance_miles: 0, max_distance_miles: 5.0, surcharge: 40.00, is_available: true, display_order: 1 },
    { name: 'Zone 2 (5-10 miles)', min_distance_miles: 5.0, max_distance_miles: 10.0, surcharge: 80.00, is_available: true, display_order: 2 },
  ]);
  if (mzErr) console.error('  Mobile zones error:', mzErr.message);
  else console.log('  2 mobile zones inserted');

  // 3. Product Categories
  console.log('Seeding product categories...');
  const { error: pcErr } = await supabase.from('product_categories').upsert([
    { name: 'Accessories', slug: 'accessories', display_order: 1 },
    { name: 'Paint Correction', slug: 'paint-correction', display_order: 2 },
    { name: 'Brushes', slug: 'brushes', display_order: 3 },
    { name: 'Microfibers', slug: 'microfibers', display_order: 4 },
    { name: 'Paint Protection', slug: 'paint-protection', display_order: 5 },
    { name: 'Cleaners', slug: 'cleaners', display_order: 6 },
    { name: 'Tires & Trims', slug: 'tires-trims', display_order: 7 },
    { name: 'Interior Care', slug: 'interior-care', display_order: 8 },
    { name: 'Scents & Deodorizers', slug: 'scents-deodorizers', display_order: 9 },
    { name: 'Soaps & Shampoos', slug: 'soaps-shampoos', display_order: 10 },
    { name: 'Tools', slug: 'tools', display_order: 11 },
    { name: 'Water', slug: 'water', display_order: 12 },
    { name: 'Uncategorized', slug: 'uncategorized', display_order: 13 },
  ], { onConflict: 'slug' });
  if (pcErr) console.error('  Product categories error:', pcErr.message);
  else console.log('  13 product categories inserted');

  // 4. Service Categories
  console.log('Seeding service categories...');
  const { error: scErr } = await supabase.from('service_categories').upsert([
    { name: 'Precision Express', slug: 'precision-express', display_order: 1 },
    { name: 'Signature Detail', slug: 'signature-detail', display_order: 2 },
    { name: 'Paint Correction & Restoration', slug: 'paint-correction-restoration', display_order: 3 },
    { name: 'Ceramic Coatings', slug: 'ceramic-coatings', display_order: 4 },
    { name: 'Exterior Enhancements', slug: 'exterior-enhancements', display_order: 5 },
    { name: 'Interior Enhancements', slug: 'interior-enhancements', display_order: 6 },
    { name: 'Specialty Vehicles', slug: 'specialty-vehicles', display_order: 7 },
  ], { onConflict: 'slug' });
  if (scErr) console.error('  Service categories error:', scErr.message);
  else console.log('  7 service categories inserted');

  // 5. Permissions (~80 role permissions)
  console.log('Seeding permissions...');
  const permRows: { permission_key: string; role: string; granted: boolean }[] = [];

  const permDefs: Record<string, Record<string, boolean>> = {
    'pos.open_close_register': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.create_tickets': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.add_items': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.apply_coupons': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.apply_loyalty': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.process_card': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.process_cash': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.process_split': { super_admin: true, admin: true, cashier: true, detailer: false },
    'pos.issue_refunds': { super_admin: true, admin: true, cashier: false, detailer: false },
    'pos.void_transactions': { super_admin: true, admin: false, cashier: false, detailer: false },
    'pos.manual_discounts': { super_admin: true, admin: true, cashier: false, detailer: false },
    'pos.override_pricing': { super_admin: true, admin: false, cashier: false, detailer: false },
    'pos.end_of_day': { super_admin: true, admin: true, cashier: true, detailer: false },
    'customers.view': { super_admin: true, admin: true, cashier: true, detailer: true },
    'customers.create': { super_admin: true, admin: true, cashier: true, detailer: false },
    'customers.edit': { super_admin: true, admin: true, cashier: false, detailer: false },
    'customers.delete': { super_admin: true, admin: false, cashier: false, detailer: false },
    'customers.view_history': { super_admin: true, admin: true, cashier: true, detailer: false },
    'customers.view_loyalty': { super_admin: true, admin: true, cashier: true, detailer: false },
    'customers.adjust_loyalty': { super_admin: true, admin: true, cashier: false, detailer: false },
    'customers.export': { super_admin: true, admin: false, cashier: false, detailer: false },
    'appointments.view_today': { super_admin: true, admin: true, cashier: true, detailer: true },
    'appointments.view_calendar': { super_admin: true, admin: true, cashier: true, detailer: false },
    'appointments.create': { super_admin: true, admin: true, cashier: true, detailer: false },
    'appointments.reschedule': { super_admin: true, admin: true, cashier: true, detailer: false },
    'appointments.cancel': { super_admin: true, admin: true, cashier: false, detailer: false },
    'appointments.waive_fee': { super_admin: true, admin: true, cashier: false, detailer: false },
    'appointments.update_status': { super_admin: true, admin: true, cashier: true, detailer: true },
    'appointments.add_notes': { super_admin: true, admin: true, cashier: true, detailer: true },
    'appointments.manage_schedule': { super_admin: true, admin: true, cashier: false, detailer: false },
    'products.view': { super_admin: true, admin: true, cashier: true, detailer: true },
    'products.edit': { super_admin: true, admin: true, cashier: false, detailer: false },
    'products.delete': { super_admin: true, admin: false, cashier: false, detailer: false },
    'inventory.view_stock': { super_admin: true, admin: true, cashier: true, detailer: false },
    'inventory.adjust_stock': { super_admin: true, admin: true, cashier: false, detailer: false },
    'inventory.manage_po': { super_admin: true, admin: true, cashier: false, detailer: false },
    'inventory.receive': { super_admin: true, admin: true, cashier: true, detailer: false },
    'inventory.view_costs': { super_admin: true, admin: true, cashier: false, detailer: false },
    'inventory.manage_vendors': { super_admin: true, admin: true, cashier: false, detailer: false },
    'services.view': { super_admin: true, admin: true, cashier: true, detailer: true },
    'services.edit': { super_admin: true, admin: true, cashier: false, detailer: false },
    'services.delete': { super_admin: true, admin: false, cashier: false, detailer: false },
    'services.manage_addons': { super_admin: true, admin: true, cashier: false, detailer: false },
    'services.set_pricing': { super_admin: true, admin: true, cashier: false, detailer: false },
    'marketing.campaigns': { super_admin: true, admin: true, cashier: false, detailer: false },
    'marketing.coupons': { super_admin: true, admin: true, cashier: false, detailer: false },
    'marketing.analytics': { super_admin: true, admin: true, cashier: false, detailer: false },
    'marketing.lifecycle_rules': { super_admin: true, admin: true, cashier: false, detailer: false },
    'marketing.two_way_sms': { super_admin: true, admin: true, cashier: false, detailer: false },
    'quotes.create': { super_admin: true, admin: true, cashier: true, detailer: false },
    'quotes.send': { super_admin: true, admin: true, cashier: true, detailer: false },
    'quotes.convert': { super_admin: true, admin: true, cashier: true, detailer: false },
    'photos.upload': { super_admin: true, admin: true, cashier: true, detailer: true },
    'photos.view': { super_admin: true, admin: true, cashier: true, detailer: true },
    'photos.delete': { super_admin: true, admin: true, cashier: false, detailer: false },
    'photos.approve_marketing': { super_admin: true, admin: true, cashier: false, detailer: false },
    'reports.revenue': { super_admin: true, admin: true, cashier: false, detailer: false },
    'reports.financial_detail': { super_admin: true, admin: false, cashier: false, detailer: false },
    'reports.cost_margin': { super_admin: true, admin: false, cashier: false, detailer: false },
    'reports.employee_tips': { super_admin: true, admin: false, cashier: false, detailer: false },
    'reports.own_tips': { super_admin: true, admin: true, cashier: true, detailer: true },
    'reports.export': { super_admin: true, admin: false, cashier: false, detailer: false },
    'reports.quickbooks_status': { super_admin: true, admin: false, cashier: false, detailer: false },
    'staff.clock_self': { super_admin: true, admin: true, cashier: true, detailer: true },
    'staff.view_own_hours': { super_admin: true, admin: true, cashier: true, detailer: true },
    'staff.view_all_hours': { super_admin: true, admin: true, cashier: false, detailer: false },
    'staff.edit_time': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.feature_toggles': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.tax_payment': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.manage_users': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.roles_permissions': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.business_hours': { super_admin: true, admin: true, cashier: false, detailer: false },
    'settings.audit_log': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.api_keys': { super_admin: true, admin: false, cashier: false, detailer: false },
    'settings.backup_export': { super_admin: true, admin: false, cashier: false, detailer: false },
  };

  for (const [key, roles] of Object.entries(permDefs)) {
    for (const [role, granted] of Object.entries(roles)) {
      permRows.push({ permission_key: key, role, granted });
    }
  }

  // Insert in batches of 50
  for (let i = 0; i < permRows.length; i += 50) {
    const batch = permRows.slice(i, i + 50);
    const { error } = await supabase.from('permissions').insert(batch);
    if (error) {
      console.error(`  Permissions batch ${i} error:`, error.message);
      break;
    }
  }
  console.log(`  ${permRows.length} permission rows inserted`);

  // 6. Business Settings
  console.log('Seeding business settings...');
  const { error: bsErr } = await supabase.from('business_settings').upsert([
    { key: 'business_name', value: '"Smart Detail Auto Spa & Supplies"', description: 'Business display name' },
    { key: 'business_address', value: '{"line1": "2021 Lomita Blvd", "city": "Lomita", "state": "CA", "zip": "90717"}', description: 'Business address' },
    { key: 'business_phone', value: '"+13109990000"', description: 'Business phone number' },
    { key: 'business_hours', value: '{"tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}, "saturday": {"open": "09:00", "close": "17:00"}}', description: 'Store operating hours' },
    { key: 'tax_rate', value: '0.1025', description: 'CA sales tax rate (10.25%)' },
    { key: 'tax_products_only', value: 'true', description: 'Only charge tax on products, not services' },
    { key: 'tip_presets', value: '[15, 20, 25]', description: 'Tip percentage presets for POS' },
    { key: 'cc_fee_rate', value: '0.05', description: 'Credit card fee rate deducted from tips (5%)' },
    { key: 'loyalty_earn_rate', value: '1', description: 'Points earned per $1 spent' },
    { key: 'loyalty_redeem_rate', value: '0.05', description: 'Dollar value per point ($5 per 100 points = $0.05/point)' },
    { key: 'loyalty_redeem_minimum', value: '100', description: 'Minimum points to redeem' },
    { key: 'appointment_buffer_minutes', value: '30', description: 'Buffer time between appointments' },
    { key: 'mobile_travel_buffer_minutes', value: '30', description: 'Travel buffer for mobile appointments' },
    { key: 'cancellation_window_hours', value: '24', description: 'Free cancellation window in hours' },
    { key: 'receipt_email_enabled', value: 'true', description: 'Send receipts via email' },
    { key: 'receipt_sms_enabled', value: 'true', description: 'Send receipts via SMS' },
    { key: 'water_sku', value: '"0000001"', description: 'SKU for water product (excluded from loyalty)' },
  ], { onConflict: 'key' });
  if (bsErr) console.error('  Business settings error:', bsErr.message);
  else console.log('  17 business settings inserted');

  console.log('\nSeed data complete!');
}

seed().catch(console.error);
