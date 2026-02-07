-- Allow saving draft quotes without a customer assigned
ALTER TABLE quotes ALTER COLUMN customer_id DROP NOT NULL;
