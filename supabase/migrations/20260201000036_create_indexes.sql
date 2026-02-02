-- Additional composite and performance indexes

-- Transactions date range queries
CREATE INDEX idx_transactions_date_status ON transactions(transaction_date, status);
CREATE INDEX idx_transactions_customer_date ON transactions(customer_id, transaction_date DESC);

-- Appointments scheduling queries
CREATE INDEX idx_appointments_schedule ON appointments(scheduled_date, scheduled_start_time);
CREATE INDEX idx_appointments_employee_date ON appointments(employee_id, scheduled_date);

-- Products stock queries
CREATE INDEX idx_products_low_stock ON products(quantity_on_hand, reorder_threshold) WHERE is_active = true;

-- Customer search
CREATE INDEX idx_customers_loyalty ON customers(loyalty_points_balance DESC);
CREATE INDEX idx_customers_last_visit ON customers(last_visit_date DESC);
CREATE INDEX idx_customers_lifetime_spend ON customers(lifetime_spend DESC);

-- Full-text search on products
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(sku, '')));

-- Full-text search on customers
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')));

-- Full-text search on services
CREATE INDEX idx_services_search ON services USING gin(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));
