-- Customer Portal RLS: scoped reads for customers, full access for employees
-- Customers see only their own data; employees continue to see everything.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid circular RLS)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_customer_id()
RETURNS UUID AS $$
  SELECT id FROM customers WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(SELECT 1 FROM employees WHERE auth_user_id = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- Index for fast customer lookup by auth_user_id (runs on every RLS eval)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers(auth_user_id);

-- ---------------------------------------------------------------------------
-- Replace overly-permissive SELECT policies with customer-scoped versions
-- ---------------------------------------------------------------------------

-- CUSTOMERS: own row only (or employee sees all)
DROP POLICY IF EXISTS customers_select ON customers;
DROP POLICY IF EXISTS customers_all ON customers;

CREATE POLICY customers_select ON customers FOR SELECT TO authenticated
  USING (is_employee() OR id = get_current_customer_id());

-- Employee writes go through admin client; customer can update own profile
CREATE POLICY customers_insert ON customers FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY customers_update ON customers FOR UPDATE TO authenticated
  USING (is_employee() OR id = get_current_customer_id())
  WITH CHECK (is_employee() OR id = get_current_customer_id());

CREATE POLICY customers_delete ON customers FOR DELETE TO authenticated
  USING (is_employee());

-- VEHICLES: own vehicles only (or employee sees all)
DROP POLICY IF EXISTS vehicles_select ON vehicles;
DROP POLICY IF EXISTS vehicles_all ON vehicles;

CREATE POLICY vehicles_select ON vehicles FOR SELECT TO authenticated
  USING (is_employee() OR customer_id = get_current_customer_id());

CREATE POLICY vehicles_insert ON vehicles FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY vehicles_update ON vehicles FOR UPDATE TO authenticated
  USING (is_employee());

CREATE POLICY vehicles_delete ON vehicles FOR DELETE TO authenticated
  USING (is_employee());

-- APPOINTMENTS: own appointments only (or employee sees all)
DROP POLICY IF EXISTS appointments_select ON appointments;
DROP POLICY IF EXISTS appointments_all ON appointments;

CREATE POLICY appointments_select ON appointments FOR SELECT TO authenticated
  USING (is_employee() OR customer_id = get_current_customer_id());

CREATE POLICY appointments_insert ON appointments FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY appointments_update ON appointments FOR UPDATE TO authenticated
  USING (is_employee());

CREATE POLICY appointments_delete ON appointments FOR DELETE TO authenticated
  USING (is_employee());

-- APPOINTMENT_SERVICES: own (via appointment join) or employee
DROP POLICY IF EXISTS appointment_services_select ON appointment_services;
DROP POLICY IF EXISTS appointment_services_all ON appointment_services;

CREATE POLICY appointment_services_select ON appointment_services FOR SELECT TO authenticated
  USING (
    is_employee()
    OR EXISTS(
      SELECT 1 FROM appointments
      WHERE appointments.id = appointment_services.appointment_id
        AND appointments.customer_id = get_current_customer_id()
    )
  );

CREATE POLICY appointment_services_insert ON appointment_services FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY appointment_services_update ON appointment_services FOR UPDATE TO authenticated
  USING (is_employee());

CREATE POLICY appointment_services_delete ON appointment_services FOR DELETE TO authenticated
  USING (is_employee());

-- LOYALTY_LEDGER: own entries or employee
DROP POLICY IF EXISTS loyalty_select ON loyalty_ledger;
DROP POLICY IF EXISTS loyalty_all ON loyalty_ledger;

CREATE POLICY loyalty_select ON loyalty_ledger FOR SELECT TO authenticated
  USING (is_employee() OR customer_id = get_current_customer_id());

CREATE POLICY loyalty_insert ON loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY loyalty_update ON loyalty_ledger FOR UPDATE TO authenticated
  USING (is_employee());

CREATE POLICY loyalty_delete ON loyalty_ledger FOR DELETE TO authenticated
  USING (is_employee());

-- PHOTOS: own photos or employee
DROP POLICY IF EXISTS photos_select ON photos;
DROP POLICY IF EXISTS photos_all ON photos;

CREATE POLICY photos_select ON photos FOR SELECT TO authenticated
  USING (is_employee() OR customer_id = get_current_customer_id());

CREATE POLICY photos_insert ON photos FOR INSERT TO authenticated
  WITH CHECK (is_employee());

CREATE POLICY photos_update ON photos FOR UPDATE TO authenticated
  USING (is_employee());

CREATE POLICY photos_delete ON photos FOR DELETE TO authenticated
  USING (is_employee());

-- ---------------------------------------------------------------------------
-- Employee-only tables: replace open SELECT with is_employee() guard
-- (Customers should not see these at all)
-- ---------------------------------------------------------------------------

-- EMPLOYEES
DROP POLICY IF EXISTS employees_select ON employees;
CREATE POLICY employees_select ON employees FOR SELECT TO authenticated
  USING (is_employee());

-- VENDORS
DROP POLICY IF EXISTS vendors_select ON vendors;
DROP POLICY IF EXISTS vendors_all ON vendors;
CREATE POLICY vendors_select ON vendors FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY vendors_write ON vendors FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- TRANSACTIONS
DROP POLICY IF EXISTS transactions_select ON transactions;
DROP POLICY IF EXISTS transactions_all ON transactions;
CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY transactions_write ON transactions FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- TRANSACTION_ITEMS
DROP POLICY IF EXISTS transaction_items_select ON transaction_items;
DROP POLICY IF EXISTS transaction_items_all ON transaction_items;
CREATE POLICY transaction_items_select ON transaction_items FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY transaction_items_write ON transaction_items FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PAYMENTS
DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS payments_all ON payments;
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY payments_write ON payments FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- REFUNDS
DROP POLICY IF EXISTS refunds_select ON refunds;
DROP POLICY IF EXISTS refunds_all ON refunds;
CREATE POLICY refunds_select ON refunds FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY refunds_write ON refunds FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- REFUND_ITEMS
DROP POLICY IF EXISTS refund_items_select ON refund_items;
DROP POLICY IF EXISTS refund_items_all ON refund_items;
CREATE POLICY refund_items_select ON refund_items FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY refund_items_write ON refund_items FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- COUPONS
DROP POLICY IF EXISTS coupons_select ON coupons;
DROP POLICY IF EXISTS coupons_all ON coupons;
CREATE POLICY coupons_select ON coupons FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY coupons_write ON coupons FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- CAMPAIGNS
DROP POLICY IF EXISTS campaigns_select ON campaigns;
DROP POLICY IF EXISTS campaigns_all ON campaigns;
CREATE POLICY campaigns_select ON campaigns FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY campaigns_write ON campaigns FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- LIFECYCLE_RULES
DROP POLICY IF EXISTS lifecycle_select ON lifecycle_rules;
DROP POLICY IF EXISTS lifecycle_all ON lifecycle_rules;
CREATE POLICY lifecycle_select ON lifecycle_rules FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY lifecycle_write ON lifecycle_rules FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- MARKETING_CONSENT_LOG
DROP POLICY IF EXISTS consent_log_select ON marketing_consent_log;
DROP POLICY IF EXISTS consent_log_all ON marketing_consent_log;
CREATE POLICY consent_log_select ON marketing_consent_log FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY consent_log_write ON marketing_consent_log FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- SMS_CONVERSATIONS
DROP POLICY IF EXISTS sms_select ON sms_conversations;
DROP POLICY IF EXISTS sms_all ON sms_conversations;
CREATE POLICY sms_select ON sms_conversations FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY sms_write ON sms_conversations FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- QUOTES
DROP POLICY IF EXISTS quotes_select ON quotes;
DROP POLICY IF EXISTS quotes_all ON quotes;
CREATE POLICY quotes_select ON quotes FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY quotes_write ON quotes FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- QUOTE_ITEMS
DROP POLICY IF EXISTS quote_items_select ON quote_items;
DROP POLICY IF EXISTS quote_items_all ON quote_items;
CREATE POLICY quote_items_select ON quote_items FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY quote_items_write ON quote_items FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PURCHASE_ORDERS
DROP POLICY IF EXISTS po_select ON purchase_orders;
DROP POLICY IF EXISTS po_all ON purchase_orders;
CREATE POLICY po_select ON purchase_orders FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY po_write ON purchase_orders FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PO_ITEMS
DROP POLICY IF EXISTS po_items_select ON po_items;
DROP POLICY IF EXISTS po_items_all ON po_items;
CREATE POLICY po_items_select ON po_items FOR SELECT TO authenticated
  USING (is_employee());
CREATE POLICY po_items_write ON po_items FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- ---------------------------------------------------------------------------
-- Catalog / public data: everyone can read (both customers and employees)
-- These keep USING (true) for SELECT.
-- Write policies restricted to employees.
-- ---------------------------------------------------------------------------

-- SERVICES (keep existing select open for all, restrict writes)
DROP POLICY IF EXISTS services_all ON services;
CREATE POLICY services_write ON services FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- SERVICE_CATEGORIES
DROP POLICY IF EXISTS service_categories_all ON service_categories;
CREATE POLICY service_categories_write ON service_categories FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- SERVICE_PRICING
DROP POLICY IF EXISTS service_pricing_all ON service_pricing;
CREATE POLICY service_pricing_write ON service_pricing FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- SERVICE_ADDON_SUGGESTIONS
DROP POLICY IF EXISTS addon_suggestions_all ON service_addon_suggestions;
CREATE POLICY addon_suggestions_write ON service_addon_suggestions FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- SERVICE_PREREQUISITES
DROP POLICY IF EXISTS prerequisites_all ON service_prerequisites;
CREATE POLICY prerequisites_write ON service_prerequisites FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- MOBILE_ZONES
DROP POLICY IF EXISTS mobile_zones_all ON mobile_zones;
CREATE POLICY mobile_zones_write ON mobile_zones FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PRODUCTS
DROP POLICY IF EXISTS products_all ON products;
CREATE POLICY products_write ON products FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PRODUCT_CATEGORIES
DROP POLICY IF EXISTS product_categories_all ON product_categories;
CREATE POLICY product_categories_write ON product_categories FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PACKAGES
DROP POLICY IF EXISTS packages_all ON packages;
CREATE POLICY packages_write ON packages FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- PACKAGE_SERVICES
DROP POLICY IF EXISTS package_services_all ON package_services;
CREATE POLICY package_services_write ON package_services FOR ALL TO authenticated
  USING (is_employee()) WITH CHECK (is_employee());

-- BUSINESS_SETTINGS (keep existing read for all, super_admin writes unchanged)
-- No changes needed — settings_select and settings_write already handle this.

-- FEATURE_FLAGS (keep existing — all read, super_admin write)
-- No changes needed.

-- PERMISSIONS (keep existing — all read, super_admin write)
-- No changes needed.

-- TIME_RECORDS (keep existing employee-scoped select)
-- No changes needed — already employee-scoped.

-- AUDIT_LOG (keep existing — admin+ read)
-- No changes needed.
