-- Business-specific customer directory; lead contact details remain in leads.
CREATE TABLE IF NOT EXISTS lead_customers (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_customers_client ON lead_customers(client_id,created_at DESC);
