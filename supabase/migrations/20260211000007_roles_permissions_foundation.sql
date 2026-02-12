-- =============================================================================
-- Migration: Roles & Permissions Foundation
-- Creates roles table, permission_definitions table, cleans/re-seeds permissions,
-- and adds role_id FK to employees and permissions tables.
-- =============================================================================

-- 1. Create roles table
-- =============================================================================

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_super BOOLEAN NOT NULL DEFAULT false,
  can_access_pos BOOLEAN NOT NULL DEFAULT false,
  can_access_admin BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_select ON roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY roles_insert ON roles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY roles_update ON roles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY roles_delete ON roles
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'super_admin')
  );

-- Seed 4 system roles
INSERT INTO roles (name, display_name, description, is_system, is_super, can_access_pos, can_access_admin) VALUES
  ('super_admin', 'Super Admin', 'Full system access. Cannot be restricted by permissions.', true, true, true, true),
  ('admin', 'Admin', 'Business management with broad access to dashboard and POS.', true, false, true, true),
  ('cashier', 'Cashier', 'POS operator with customer-facing dashboard access.', true, false, true, true),
  ('detailer', 'Detailer', 'Service technician with schedule and messaging access.', true, false, false, true);


-- 2. Create permission_definitions table
-- =============================================================================

CREATE TABLE permission_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE permission_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permission_definitions_select ON permission_definitions
  FOR SELECT TO authenticated USING (true);

-- Seed all 80 permission definitions
INSERT INTO permission_definitions (key, name, description, category, sort_order) VALUES
  -- POS Operations (100-112)
  ('pos.open_close_register', 'Open/Close Register', 'Open and close the cash register for daily operations', 'POS Operations', 100),
  ('pos.create_tickets', 'Create Tickets', 'Start new sales transactions in the POS', 'POS Operations', 101),
  ('pos.add_items', 'Add Items', 'Add products and services to a ticket', 'POS Operations', 102),
  ('pos.apply_coupons', 'Apply Coupons', 'Apply coupon codes to transactions', 'POS Operations', 103),
  ('pos.apply_loyalty', 'Apply Loyalty', 'Apply loyalty point redemptions', 'POS Operations', 104),
  ('pos.process_card', 'Process Card Payments', 'Accept card payments via terminal', 'POS Operations', 105),
  ('pos.process_cash', 'Process Cash Payments', 'Accept cash payments', 'POS Operations', 106),
  ('pos.process_split', 'Process Split Payments', 'Split payments between multiple methods', 'POS Operations', 107),
  ('pos.manual_discounts', 'Manual Discounts', 'Apply manual discounts without coupon codes', 'POS Operations', 108),
  ('pos.override_pricing', 'Override Pricing', 'Change item prices during checkout', 'POS Operations', 109),
  ('pos.issue_refunds', 'Issue Refunds', 'Process refunds on completed transactions', 'POS Operations', 110),
  ('pos.void_transactions', 'Void Transactions', 'Void entire transactions', 'POS Operations', 111),
  ('pos.end_of_day', 'End of Day', 'Perform end-of-day cash count and reconciliation', 'POS Operations', 112),

  -- Customer Management (200-207)
  ('customers.view', 'View Customers', 'Access customer list and profiles', 'Customer Management', 200),
  ('customers.create', 'Create Customers', 'Add new customer records', 'Customer Management', 201),
  ('customers.edit', 'Edit Customers', 'Modify customer information', 'Customer Management', 202),
  ('customers.delete', 'Delete Customers', 'Remove customer records', 'Customer Management', 203),
  ('customers.view_history', 'View Transaction History', 'See customer purchase history', 'Customer Management', 204),
  ('customers.view_loyalty', 'View Loyalty', 'See customer loyalty points and history', 'Customer Management', 205),
  ('customers.adjust_loyalty', 'Adjust Loyalty Points', 'Manually add or remove loyalty points', 'Customer Management', 206),
  ('customers.export', 'Export Customer Data', 'Download customer data as CSV/Excel', 'Customer Management', 207),

  -- Appointments & Scheduling (300-308)
  ('appointments.view_today', 'View Today''s Schedule', 'See today''s appointments', 'Appointments & Scheduling', 300),
  ('appointments.view_calendar', 'View Full Calendar', 'Access the full appointment calendar', 'Appointments & Scheduling', 301),
  ('appointments.create', 'Create Appointments', 'Book new appointments', 'Appointments & Scheduling', 302),
  ('appointments.reschedule', 'Reschedule Appointments', 'Change appointment date/time', 'Appointments & Scheduling', 303),
  ('appointments.cancel', 'Cancel Appointments', 'Cancel existing appointments', 'Appointments & Scheduling', 304),
  ('appointments.waive_fee', 'Waive Cancellation Fee', 'Override cancellation fee', 'Appointments & Scheduling', 305),
  ('appointments.update_status', 'Update Status', 'Change appointment status (confirm, start, complete)', 'Appointments & Scheduling', 306),
  ('appointments.add_notes', 'Add Notes', 'Add notes to appointments', 'Appointments & Scheduling', 307),
  ('appointments.manage_schedule', 'Manage Staff Schedules', 'Edit employee weekly schedules and blocked dates', 'Appointments & Scheduling', 308),

  -- Catalog (400-407)
  ('products.view', 'View Products', 'Browse products in catalog', 'Catalog', 400),
  ('products.edit', 'Edit Products', 'Create and modify products', 'Catalog', 401),
  ('products.delete', 'Delete Products', 'Remove products from catalog', 'Catalog', 402),
  ('services.view', 'View Services', 'Browse services in catalog', 'Catalog', 403),
  ('services.edit', 'Edit Services', 'Create and modify services', 'Catalog', 404),
  ('services.delete', 'Delete Services', 'Remove services from catalog', 'Catalog', 405),
  ('services.manage_addons', 'Manage Add-ons', 'Configure service add-on options', 'Catalog', 406),
  ('services.set_pricing', 'Set Service Pricing', 'Modify service pricing tiers', 'Catalog', 407),

  -- Inventory (500-506)
  ('inventory.view_stock', 'View Stock Levels', 'See current inventory quantities', 'Inventory', 500),
  ('inventory.adjust_stock', 'Adjust Stock', 'Make manual stock adjustments', 'Inventory', 501),
  ('inventory.manage_po', 'Manage Purchase Orders', 'Create and manage purchase orders', 'Inventory', 502),
  ('inventory.receive', 'Receive Inventory', 'Receive stock against purchase orders', 'Inventory', 503),
  ('inventory.view_costs', 'View Cost Prices', 'See product cost and margin data', 'Inventory', 504),
  ('inventory.view_cost_data', 'View Cost Data (Legacy)', 'Legacy key — same as view_costs, kept for backward compat', 'Inventory', 505),
  ('inventory.manage_vendors', 'Manage Vendors', 'Add and edit vendor information', 'Inventory', 506),

  -- Marketing (600-604)
  ('marketing.campaigns', 'Manage Campaigns', 'Create and send marketing campaigns', 'Marketing', 600),
  ('marketing.coupons', 'Manage Coupons', 'Create and edit coupon codes', 'Marketing', 601),
  ('marketing.analytics', 'View Analytics', 'Access marketing analytics dashboard', 'Marketing', 602),
  ('marketing.lifecycle_rules', 'Manage Automations', 'Configure lifecycle automation rules', 'Marketing', 603),
  ('marketing.two_way_sms', 'Messaging Inbox', 'Access the two-way SMS messaging inbox', 'Marketing', 604),

  -- Quotes (700-702)
  ('quotes.create', 'Create Quotes', 'Create new quotes for customers', 'Quotes', 700),
  ('quotes.send', 'Send Quotes', 'Send quotes via SMS or email', 'Quotes', 701),
  ('quotes.convert', 'Convert Quotes', 'Convert accepted quotes to transactions', 'Quotes', 702),

  -- Photos (800-803)
  ('photos.upload', 'Upload Photos', 'Take and upload job photos', 'Photos', 800),
  ('photos.view', 'View Photos', 'View photo documentation', 'Photos', 801),
  ('photos.delete', 'Delete Photos', 'Remove uploaded photos', 'Photos', 802),
  ('photos.approve_marketing', 'Approve for Marketing', 'Approve photos for marketing use', 'Photos', 803),

  -- Reports (900-906)
  ('reports.revenue', 'View Revenue Reports', 'Access revenue and sales reports', 'Reports', 900),
  ('reports.financial_detail', 'Financial Details', 'View detailed financial breakdowns', 'Reports', 901),
  ('reports.cost_margin', 'Cost & Margin Reports', 'View cost and margin analysis', 'Reports', 902),
  ('reports.employee_tips', 'All Employee Tips', 'View tip reports for all employees', 'Reports', 903),
  ('reports.own_tips', 'Own Tips', 'View your own tip summary', 'Reports', 904),
  ('reports.export', 'Export Reports', 'Download reports as files', 'Reports', 905),
  ('reports.quickbooks_status', 'QuickBooks Status', 'View QBO sync status and logs', 'Reports', 906),

  -- Staff Management (1000-1003)
  ('staff.clock_self', 'Clock In/Out', 'Clock in and out for shifts', 'Staff Management', 1000),
  ('staff.view_own_hours', 'View Own Hours', 'See your own timesheet', 'Staff Management', 1001),
  ('staff.view_all_hours', 'View All Hours', 'See all employee timesheets', 'Staff Management', 1002),
  ('staff.edit_time', 'Edit Timesheets', 'Modify timesheet entries', 'Staff Management', 1003),

  -- Settings (1100-1107)
  ('settings.feature_toggles', 'Feature Toggles', 'Enable/disable system features', 'Settings', 1100),
  ('settings.tax_payment', 'Tax & Payment Settings', 'Configure tax rates and payment methods', 'Settings', 1101),
  ('settings.manage_users', 'Manage Users', 'Create, edit, and deactivate staff accounts', 'Settings', 1102),
  ('settings.roles_permissions', 'Roles & Permissions', 'Manage role definitions and permission defaults', 'Settings', 1103),
  ('settings.business_hours', 'Business Hours', 'Set business operating hours', 'Settings', 1104),
  ('settings.audit_log', 'View Audit Log', 'Access the system audit log', 'Settings', 1105),
  ('settings.api_keys', 'API Keys', 'Manage API keys and integrations', 'Settings', 1106),
  ('settings.backup_export', 'Backup & Export', 'Create system backups and data exports', 'Settings', 1107);


-- 3. Clean and re-seed permissions table
-- =============================================================================

-- Delete ALL existing permission rows (both role defaults and user overrides are mismatched)
DELETE FROM permissions;

-- Re-insert 320 role default rows (80 keys x 4 roles)
-- Using the exact matrix from seed.sql / PERMISSIONS_AUDIT.md Section 4

INSERT INTO permissions (permission_key, role, granted) VALUES
  -- POS Operations
  ('pos.open_close_register', 'super_admin', true),
  ('pos.open_close_register', 'admin', true),
  ('pos.open_close_register', 'cashier', true),
  ('pos.open_close_register', 'detailer', false),
  ('pos.create_tickets', 'super_admin', true),
  ('pos.create_tickets', 'admin', true),
  ('pos.create_tickets', 'cashier', true),
  ('pos.create_tickets', 'detailer', false),
  ('pos.add_items', 'super_admin', true),
  ('pos.add_items', 'admin', true),
  ('pos.add_items', 'cashier', true),
  ('pos.add_items', 'detailer', false),
  ('pos.apply_coupons', 'super_admin', true),
  ('pos.apply_coupons', 'admin', true),
  ('pos.apply_coupons', 'cashier', true),
  ('pos.apply_coupons', 'detailer', false),
  ('pos.apply_loyalty', 'super_admin', true),
  ('pos.apply_loyalty', 'admin', true),
  ('pos.apply_loyalty', 'cashier', true),
  ('pos.apply_loyalty', 'detailer', false),
  ('pos.process_card', 'super_admin', true),
  ('pos.process_card', 'admin', true),
  ('pos.process_card', 'cashier', true),
  ('pos.process_card', 'detailer', false),
  ('pos.process_cash', 'super_admin', true),
  ('pos.process_cash', 'admin', true),
  ('pos.process_cash', 'cashier', true),
  ('pos.process_cash', 'detailer', false),
  ('pos.process_split', 'super_admin', true),
  ('pos.process_split', 'admin', true),
  ('pos.process_split', 'cashier', true),
  ('pos.process_split', 'detailer', false),
  ('pos.issue_refunds', 'super_admin', true),
  ('pos.issue_refunds', 'admin', true),
  ('pos.issue_refunds', 'cashier', false),
  ('pos.issue_refunds', 'detailer', false),
  ('pos.void_transactions', 'super_admin', true),
  ('pos.void_transactions', 'admin', false),
  ('pos.void_transactions', 'cashier', false),
  ('pos.void_transactions', 'detailer', false),
  ('pos.manual_discounts', 'super_admin', true),
  ('pos.manual_discounts', 'admin', true),
  ('pos.manual_discounts', 'cashier', false),
  ('pos.manual_discounts', 'detailer', false),
  ('pos.override_pricing', 'super_admin', true),
  ('pos.override_pricing', 'admin', false),
  ('pos.override_pricing', 'cashier', false),
  ('pos.override_pricing', 'detailer', false),
  ('pos.end_of_day', 'super_admin', true),
  ('pos.end_of_day', 'admin', true),
  ('pos.end_of_day', 'cashier', true),
  ('pos.end_of_day', 'detailer', false),

  -- Customer Management
  ('customers.view', 'super_admin', true),
  ('customers.view', 'admin', true),
  ('customers.view', 'cashier', true),
  ('customers.view', 'detailer', true),
  ('customers.create', 'super_admin', true),
  ('customers.create', 'admin', true),
  ('customers.create', 'cashier', true),
  ('customers.create', 'detailer', false),
  ('customers.edit', 'super_admin', true),
  ('customers.edit', 'admin', true),
  ('customers.edit', 'cashier', false),
  ('customers.edit', 'detailer', false),
  ('customers.delete', 'super_admin', true),
  ('customers.delete', 'admin', false),
  ('customers.delete', 'cashier', false),
  ('customers.delete', 'detailer', false),
  ('customers.view_history', 'super_admin', true),
  ('customers.view_history', 'admin', true),
  ('customers.view_history', 'cashier', true),
  ('customers.view_history', 'detailer', false),
  ('customers.view_loyalty', 'super_admin', true),
  ('customers.view_loyalty', 'admin', true),
  ('customers.view_loyalty', 'cashier', true),
  ('customers.view_loyalty', 'detailer', false),
  ('customers.adjust_loyalty', 'super_admin', true),
  ('customers.adjust_loyalty', 'admin', true),
  ('customers.adjust_loyalty', 'cashier', false),
  ('customers.adjust_loyalty', 'detailer', false),
  ('customers.export', 'super_admin', true),
  ('customers.export', 'admin', false),
  ('customers.export', 'cashier', false),
  ('customers.export', 'detailer', false),

  -- Appointments & Scheduling
  ('appointments.view_today', 'super_admin', true),
  ('appointments.view_today', 'admin', true),
  ('appointments.view_today', 'cashier', true),
  ('appointments.view_today', 'detailer', true),
  ('appointments.view_calendar', 'super_admin', true),
  ('appointments.view_calendar', 'admin', true),
  ('appointments.view_calendar', 'cashier', true),
  ('appointments.view_calendar', 'detailer', false),
  ('appointments.create', 'super_admin', true),
  ('appointments.create', 'admin', true),
  ('appointments.create', 'cashier', true),
  ('appointments.create', 'detailer', false),
  ('appointments.reschedule', 'super_admin', true),
  ('appointments.reschedule', 'admin', true),
  ('appointments.reschedule', 'cashier', true),
  ('appointments.reschedule', 'detailer', false),
  ('appointments.cancel', 'super_admin', true),
  ('appointments.cancel', 'admin', true),
  ('appointments.cancel', 'cashier', false),
  ('appointments.cancel', 'detailer', false),
  ('appointments.waive_fee', 'super_admin', true),
  ('appointments.waive_fee', 'admin', true),
  ('appointments.waive_fee', 'cashier', false),
  ('appointments.waive_fee', 'detailer', false),
  ('appointments.update_status', 'super_admin', true),
  ('appointments.update_status', 'admin', true),
  ('appointments.update_status', 'cashier', true),
  ('appointments.update_status', 'detailer', true),
  ('appointments.add_notes', 'super_admin', true),
  ('appointments.add_notes', 'admin', true),
  ('appointments.add_notes', 'cashier', true),
  ('appointments.add_notes', 'detailer', true),
  ('appointments.manage_schedule', 'super_admin', true),
  ('appointments.manage_schedule', 'admin', true),
  ('appointments.manage_schedule', 'cashier', false),
  ('appointments.manage_schedule', 'detailer', false),

  -- Catalog: Products
  ('products.view', 'super_admin', true),
  ('products.view', 'admin', true),
  ('products.view', 'cashier', true),
  ('products.view', 'detailer', true),
  ('products.edit', 'super_admin', true),
  ('products.edit', 'admin', true),
  ('products.edit', 'cashier', false),
  ('products.edit', 'detailer', false),
  ('products.delete', 'super_admin', true),
  ('products.delete', 'admin', false),
  ('products.delete', 'cashier', false),
  ('products.delete', 'detailer', false),

  -- Catalog: Services
  ('services.view', 'super_admin', true),
  ('services.view', 'admin', true),
  ('services.view', 'cashier', true),
  ('services.view', 'detailer', true),
  ('services.edit', 'super_admin', true),
  ('services.edit', 'admin', true),
  ('services.edit', 'cashier', false),
  ('services.edit', 'detailer', false),
  ('services.delete', 'super_admin', true),
  ('services.delete', 'admin', false),
  ('services.delete', 'cashier', false),
  ('services.delete', 'detailer', false),
  ('services.manage_addons', 'super_admin', true),
  ('services.manage_addons', 'admin', true),
  ('services.manage_addons', 'cashier', false),
  ('services.manage_addons', 'detailer', false),
  ('services.set_pricing', 'super_admin', true),
  ('services.set_pricing', 'admin', true),
  ('services.set_pricing', 'cashier', false),
  ('services.set_pricing', 'detailer', false),

  -- Inventory
  ('inventory.view_stock', 'super_admin', true),
  ('inventory.view_stock', 'admin', true),
  ('inventory.view_stock', 'cashier', true),
  ('inventory.view_stock', 'detailer', false),
  ('inventory.adjust_stock', 'super_admin', true),
  ('inventory.adjust_stock', 'admin', true),
  ('inventory.adjust_stock', 'cashier', false),
  ('inventory.adjust_stock', 'detailer', false),
  ('inventory.manage_po', 'super_admin', true),
  ('inventory.manage_po', 'admin', true),
  ('inventory.manage_po', 'cashier', false),
  ('inventory.manage_po', 'detailer', false),
  ('inventory.receive', 'super_admin', true),
  ('inventory.receive', 'admin', true),
  ('inventory.receive', 'cashier', true),
  ('inventory.receive', 'detailer', false),
  ('inventory.view_costs', 'super_admin', true),
  ('inventory.view_costs', 'admin', true),
  ('inventory.view_costs', 'cashier', false),
  ('inventory.view_costs', 'detailer', false),
  ('inventory.view_cost_data', 'super_admin', true),
  ('inventory.view_cost_data', 'admin', true),
  ('inventory.view_cost_data', 'cashier', false),
  ('inventory.view_cost_data', 'detailer', false),
  ('inventory.manage_vendors', 'super_admin', true),
  ('inventory.manage_vendors', 'admin', true),
  ('inventory.manage_vendors', 'cashier', false),
  ('inventory.manage_vendors', 'detailer', false),

  -- Marketing
  ('marketing.campaigns', 'super_admin', true),
  ('marketing.campaigns', 'admin', true),
  ('marketing.campaigns', 'cashier', false),
  ('marketing.campaigns', 'detailer', false),
  ('marketing.coupons', 'super_admin', true),
  ('marketing.coupons', 'admin', true),
  ('marketing.coupons', 'cashier', false),
  ('marketing.coupons', 'detailer', false),
  ('marketing.analytics', 'super_admin', true),
  ('marketing.analytics', 'admin', true),
  ('marketing.analytics', 'cashier', false),
  ('marketing.analytics', 'detailer', false),
  ('marketing.lifecycle_rules', 'super_admin', true),
  ('marketing.lifecycle_rules', 'admin', true),
  ('marketing.lifecycle_rules', 'cashier', false),
  ('marketing.lifecycle_rules', 'detailer', false),
  ('marketing.two_way_sms', 'super_admin', true),
  ('marketing.two_way_sms', 'admin', true),
  ('marketing.two_way_sms', 'cashier', false),
  ('marketing.two_way_sms', 'detailer', false),

  -- Quotes
  ('quotes.create', 'super_admin', true),
  ('quotes.create', 'admin', true),
  ('quotes.create', 'cashier', true),
  ('quotes.create', 'detailer', false),
  ('quotes.send', 'super_admin', true),
  ('quotes.send', 'admin', true),
  ('quotes.send', 'cashier', true),
  ('quotes.send', 'detailer', false),
  ('quotes.convert', 'super_admin', true),
  ('quotes.convert', 'admin', true),
  ('quotes.convert', 'cashier', true),
  ('quotes.convert', 'detailer', false),

  -- Photos
  ('photos.upload', 'super_admin', true),
  ('photos.upload', 'admin', true),
  ('photos.upload', 'cashier', true),
  ('photos.upload', 'detailer', true),
  ('photos.view', 'super_admin', true),
  ('photos.view', 'admin', true),
  ('photos.view', 'cashier', true),
  ('photos.view', 'detailer', true),
  ('photos.delete', 'super_admin', true),
  ('photos.delete', 'admin', true),
  ('photos.delete', 'cashier', false),
  ('photos.delete', 'detailer', false),
  ('photos.approve_marketing', 'super_admin', true),
  ('photos.approve_marketing', 'admin', true),
  ('photos.approve_marketing', 'cashier', false),
  ('photos.approve_marketing', 'detailer', false),

  -- Reports
  ('reports.revenue', 'super_admin', true),
  ('reports.revenue', 'admin', true),
  ('reports.revenue', 'cashier', false),
  ('reports.revenue', 'detailer', false),
  ('reports.financial_detail', 'super_admin', true),
  ('reports.financial_detail', 'admin', false),
  ('reports.financial_detail', 'cashier', false),
  ('reports.financial_detail', 'detailer', false),
  ('reports.cost_margin', 'super_admin', true),
  ('reports.cost_margin', 'admin', false),
  ('reports.cost_margin', 'cashier', false),
  ('reports.cost_margin', 'detailer', false),
  ('reports.employee_tips', 'super_admin', true),
  ('reports.employee_tips', 'admin', false),
  ('reports.employee_tips', 'cashier', false),
  ('reports.employee_tips', 'detailer', false),
  ('reports.own_tips', 'super_admin', true),
  ('reports.own_tips', 'admin', true),
  ('reports.own_tips', 'cashier', true),
  ('reports.own_tips', 'detailer', true),
  ('reports.export', 'super_admin', true),
  ('reports.export', 'admin', false),
  ('reports.export', 'cashier', false),
  ('reports.export', 'detailer', false),
  ('reports.quickbooks_status', 'super_admin', true),
  ('reports.quickbooks_status', 'admin', false),
  ('reports.quickbooks_status', 'cashier', false),
  ('reports.quickbooks_status', 'detailer', false),

  -- Staff Management
  ('staff.clock_self', 'super_admin', true),
  ('staff.clock_self', 'admin', true),
  ('staff.clock_self', 'cashier', true),
  ('staff.clock_self', 'detailer', true),
  ('staff.view_own_hours', 'super_admin', true),
  ('staff.view_own_hours', 'admin', true),
  ('staff.view_own_hours', 'cashier', true),
  ('staff.view_own_hours', 'detailer', true),
  ('staff.view_all_hours', 'super_admin', true),
  ('staff.view_all_hours', 'admin', true),
  ('staff.view_all_hours', 'cashier', false),
  ('staff.view_all_hours', 'detailer', false),
  ('staff.edit_time', 'super_admin', true),
  ('staff.edit_time', 'admin', false),
  ('staff.edit_time', 'cashier', false),
  ('staff.edit_time', 'detailer', false),

  -- Settings
  ('settings.feature_toggles', 'super_admin', true),
  ('settings.feature_toggles', 'admin', false),
  ('settings.feature_toggles', 'cashier', false),
  ('settings.feature_toggles', 'detailer', false),
  ('settings.tax_payment', 'super_admin', true),
  ('settings.tax_payment', 'admin', false),
  ('settings.tax_payment', 'cashier', false),
  ('settings.tax_payment', 'detailer', false),
  ('settings.manage_users', 'super_admin', true),
  ('settings.manage_users', 'admin', false),
  ('settings.manage_users', 'cashier', false),
  ('settings.manage_users', 'detailer', false),
  ('settings.roles_permissions', 'super_admin', true),
  ('settings.roles_permissions', 'admin', false),
  ('settings.roles_permissions', 'cashier', false),
  ('settings.roles_permissions', 'detailer', false),
  ('settings.business_hours', 'super_admin', true),
  ('settings.business_hours', 'admin', true),
  ('settings.business_hours', 'cashier', false),
  ('settings.business_hours', 'detailer', false),
  ('settings.audit_log', 'super_admin', true),
  ('settings.audit_log', 'admin', false),
  ('settings.audit_log', 'cashier', false),
  ('settings.audit_log', 'detailer', false),
  ('settings.api_keys', 'super_admin', true),
  ('settings.api_keys', 'admin', false),
  ('settings.api_keys', 'cashier', false),
  ('settings.api_keys', 'detailer', false),
  ('settings.backup_export', 'super_admin', true),
  ('settings.backup_export', 'admin', false),
  ('settings.backup_export', 'cashier', false),
  ('settings.backup_export', 'detailer', false);


-- 4. Add role_id column to employees table
-- =============================================================================

ALTER TABLE employees ADD COLUMN role_id UUID REFERENCES roles(id);

-- Backfill from existing role enum
UPDATE employees e SET role_id = r.id FROM roles r WHERE r.name = e.role::text;

-- Make NOT NULL after backfill
ALTER TABLE employees ALTER COLUMN role_id SET NOT NULL;

-- Index for lookups
CREATE INDEX idx_employees_role_id ON employees(role_id);


-- 5. Add role_id column to permissions table
-- =============================================================================

ALTER TABLE permissions ADD COLUMN role_id UUID REFERENCES roles(id);

-- Backfill existing role-level rows
UPDATE permissions p SET role_id = r.id FROM roles r WHERE r.name = p.role::text AND p.role IS NOT NULL;

-- Add unique constraint for new column
ALTER TABLE permissions ADD CONSTRAINT permissions_key_role_id_unique UNIQUE(permission_key, role_id);
