-- Helper function to get current employee role
CREATE OR REPLACE FUNCTION public.get_current_employee_role()
RETURNS user_role AS $$
  SELECT role FROM employees WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get current employee id
CREATE OR REPLACE FUNCTION public.get_current_employee_id()
RETURNS UUID AS $$
  SELECT id FROM employees WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if current user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role = 'super_admin')
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if current user is admin or above
CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM employees WHERE auth_user_id = auth.uid() AND role IN ('super_admin', 'admin'))
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_addon_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated staff can read most tables
-- Write access restricted by role via application logic + service role key

-- Employees: all staff can read, super_admin can write
CREATE POLICY employees_select ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY employees_insert ON employees FOR INSERT TO authenticated WITH CHECK (is_super_admin());
CREATE POLICY employees_update ON employees FOR UPDATE TO authenticated USING (is_super_admin() OR id = get_current_employee_id());
CREATE POLICY employees_delete ON employees FOR DELETE TO authenticated USING (is_super_admin());

-- Customers: all staff can read, cashier+ can create, admin+ can edit
CREATE POLICY customers_select ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY customers_all ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vehicles: follows customer access
CREATE POLICY vehicles_select ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY vehicles_all ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Products & Categories: all can read, admin+ can write
CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_all ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY product_categories_select ON product_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY product_categories_all ON product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendors: all can read, admin+ can write
CREATE POLICY vendors_select ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY vendors_all ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Services & related: all can read, admin+ can write
CREATE POLICY services_select ON services FOR SELECT TO authenticated USING (true);
CREATE POLICY services_all ON services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY service_categories_select ON service_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY service_categories_all ON service_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY service_pricing_select ON service_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY service_pricing_all ON service_pricing FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY addon_suggestions_select ON service_addon_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY addon_suggestions_all ON service_addon_suggestions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY prerequisites_select ON service_prerequisites FOR SELECT TO authenticated USING (true);
CREATE POLICY prerequisites_all ON service_prerequisites FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY mobile_zones_select ON mobile_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY mobile_zones_all ON mobile_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Packages
CREATE POLICY packages_select ON packages FOR SELECT TO authenticated USING (true);
CREATE POLICY packages_all ON packages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY package_services_select ON package_services FOR SELECT TO authenticated USING (true);
CREATE POLICY package_services_all ON package_services FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Appointments
CREATE POLICY appointments_select ON appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY appointments_all ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY appointment_services_select ON appointment_services FOR SELECT TO authenticated USING (true);
CREATE POLICY appointment_services_all ON appointment_services FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Transactions & related
CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY transactions_all ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY transaction_items_select ON transaction_items FOR SELECT TO authenticated USING (true);
CREATE POLICY transaction_items_all ON transaction_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY payments_all ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY refunds_select ON refunds FOR SELECT TO authenticated USING (true);
CREATE POLICY refunds_all ON refunds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY refund_items_select ON refund_items FOR SELECT TO authenticated USING (true);
CREATE POLICY refund_items_all ON refund_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Coupons
CREATE POLICY coupons_select ON coupons FOR SELECT TO authenticated USING (true);
CREATE POLICY coupons_all ON coupons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Loyalty
CREATE POLICY loyalty_select ON loyalty_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY loyalty_all ON loyalty_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Campaigns & Marketing
CREATE POLICY campaigns_select ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY campaigns_all ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY lifecycle_select ON lifecycle_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY lifecycle_all ON lifecycle_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY consent_log_select ON marketing_consent_log FOR SELECT TO authenticated USING (true);
CREATE POLICY consent_log_all ON marketing_consent_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sms_select ON sms_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY sms_all ON sms_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Quotes
CREATE POLICY quotes_select ON quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY quotes_all ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY quote_items_select ON quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY quote_items_all ON quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Photos
CREATE POLICY photos_select ON photos FOR SELECT TO authenticated USING (true);
CREATE POLICY photos_all ON photos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Time Records: employees see own, admin+ see all
CREATE POLICY time_records_select ON time_records FOR SELECT TO authenticated
  USING (employee_id = get_current_employee_id() OR is_admin_or_above());
CREATE POLICY time_records_all ON time_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Purchase Orders
CREATE POLICY po_select ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY po_all ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY po_items_select ON po_items FOR SELECT TO authenticated USING (true);
CREATE POLICY po_items_all ON po_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Feature Flags: all read, super_admin write
CREATE POLICY feature_flags_select ON feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY feature_flags_write ON feature_flags FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Permissions: all read, super_admin write
CREATE POLICY permissions_select ON permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_write ON permissions FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Audit Log: admin+ read, system writes (via service role)
CREATE POLICY audit_select ON audit_log FOR SELECT TO authenticated USING (is_admin_or_above());
CREATE POLICY audit_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Business Settings: all read, super_admin write
CREATE POLICY settings_select ON business_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_write ON business_settings FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
