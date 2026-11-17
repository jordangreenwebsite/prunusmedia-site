-- Isolated website sales records. Never process unrelated Stripe objects.
CREATE TABLE IF NOT EXISTS website_sales_prospects (
 token TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL CHECK(brand IN ('uk-trades','prunus')),
 preview_url TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS website_sales_offers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL CHECK(brand IN ('all','uk-trades','prunus')),
 plan TEXT NOT NULL CHECK(plan IN ('starter','growth','seo')), kind TEXT NOT NULL CHECK(kind IN ('fixed','percent','price')),
 value INTEGER NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
 created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS website_sales_offers_window ON website_sales_offers(plan,active,start_ms,end_ms);
CREATE TABLE IF NOT EXISTS website_sales_orders (
 id TEXT PRIMARY KEY, prospect_token TEXT NOT NULL REFERENCES website_sales_prospects(token),
 plan TEXT NOT NULL, quote_json TEXT NOT NULL, status TEXT NOT NULL, customer_email TEXT NOT NULL,
 session_id TEXT UNIQUE, checkout_url TEXT, customer_id TEXT, subscription_id TEXT UNIQUE,
 created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS website_sales_one_open_order ON website_sales_orders(prospect_token) WHERE status NOT IN ('expired','cancelled');
CREATE TABLE IF NOT EXISTS website_sales_events (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES website_sales_orders(id), event_type TEXT NOT NULL, created_ms INTEGER NOT NULL
);
