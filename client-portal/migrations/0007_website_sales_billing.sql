ALTER TABLE website_sales_orders ADD COLUMN first_paid_ms INTEGER;
ALTER TABLE website_sales_orders ADD COLUMN handover_invoice_id TEXT;
ALTER TABLE website_sales_orders ADD COLUMN invoice_url TEXT;
ALTER TABLE website_sales_orders ADD COLUMN billing_issue TEXT;
CREATE TABLE IF NOT EXISTS website_sales_paid_invoices (invoice_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES website_sales_orders(id), amount INTEGER NOT NULL, paid_ms INTEGER NOT NULL, billing_reason TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS website_sales_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Never enable automatically on deploy. Owner activation requires a verified webhook and catalogue.
INSERT OR IGNORE INTO website_sales_settings(key,value) VALUES('enabled','false');
CREATE UNIQUE INDEX IF NOT EXISTS website_sales_unique_preview ON website_sales_prospects(preview_url);
